import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import hardeningSql from '../../supabase/migrations/20261116090000_harden_inventory_rls_and_rpc_auth.sql?raw';
import notesSearchSql from '../../supabase/migrations/20261116100000_add_order_notes_and_admin_search.sql?raw';
import returnApprovalSql from '../../supabase/migrations/20261116110000_add_return_to_approval_rpc.sql?raw';
import routeOrderSql from '../../supabase/migrations/20261116120000_add_driver_route_stop_ordering.sql?raw';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockUpdateUser = vi.fn();
const mockAuthState = {
  user: { id: 'retail-1', email: 'retail@tricore.test' },
  profile: {
    id: 'retail-1',
    role: 'retail',
    full_name: 'Retail Tester',
    contact_number: '555-1000',
    address: '10 Main St',
    city: 'Antioch',
    state: 'CA',
    zip: '94509',
  },
  loading: false,
  authError: null,
  retryAuth: vi.fn(),
  clearSessionToLogin: vi.fn(),
  signOut: vi.fn(),
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from: (...args) => mockFrom(...args),
    auth: {
      updateUser: (...args) => mockUpdateUser(...args),
    },
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel: vi.fn(),
  },
}));

vi.mock('../lib/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@react-google-maps/api', () => ({
  useJsApiLoader: () => ({ isLoaded: false }),
  GoogleMap: ({ children }) => <div data-testid="mock-gmap">{children}</div>,
  DirectionsRenderer: () => null,
  Marker: () => null,
  Polyline: () => null,
}));

vi.mock('react-signature-canvas', () => ({
  default: React.forwardRef(function MockSig(_props, ref) {
    React.useImperativeHandle(ref, () => ({
      isEmpty: () => true,
      clear: () => {},
      getCanvas: () => ({ toDataURL: () => '' }),
    }));
    return <canvas />;
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { RoleProtectedRoute } from '../App';
import Profile from '../pages/Profile';
import Checkout from '../pages/Checkout';
import DriverRoutes from '../pages/DriverRoutes';
import { evaluateReturnToApprovalEligibility } from '../lib/orderApprovalUtils';

function createChainQuery(resolved) {
  const result = () => Promise.resolve(resolved);
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    in: () => chain,
    or: () => chain,
    not: () => chain,
    ilike: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    single: () => result(),
    maybeSingle: () => result(),
    then: (onFulfilled, onRejected) => result().then(onFulfilled, onRejected),
  };
  return chain;
}

function extractFunctionBlock(sql, fnName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${fnName}(`;
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('$$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

describe('Option A Security Hardening — SQL Migration Invariants', () => {
  it('revokes anonymous and PUBLIC table writes and RPC execution privileges', () => {
    expect(hardeningSql).toContain(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;'
    );

    const hardenedActiveRpcs = [
      'public.deactivate_user_account(uuid)',
      'public.save_customer_profile_info(uuid, text, text, text, text, text, uuid)',
      'public.process_warehouse_restock(uuid)',
      'public.substitute_order_item(uuid, uuid, integer)',
      'public.edit_order_item(uuid, integer)',
      'public.add_order_item(uuid, uuid, integer)',
      'public.cancel_order_item(uuid, text, integer)',
      'public.split_order_item(uuid, integer)',
      'public.reject_full_order(uuid, text, text)',
      'public.driver_start_delivery(uuid)',
      'public.driver_complete_delivery(uuid, jsonb, text, text, text)',
      'public.driver_mark_attempted(uuid, text)',
    ];

    for (const sig of hardenedActiveRpcs) {
      expect(hardeningSql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon;`);
      expect(hardeningSql).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated, service_role;`);
    }

    const revokedLegacyRpcs = [
      'public.cancel_order(uuid)',
      'public.cancel_order_item(uuid)',
      'public.cancel_order_item(uuid, text)',
      'public.complete_delivery(uuid, text, text)',
      'public.receive_purchase_order(uuid)',
      'public.deduct_inventory()',
      'public.deduct_inventory(uuid)',
      'public.deduct_inventory_on_checkout()',
      'public.restock_inventory_on_cancel()',
      'public.reject_order_and_restock(uuid, uuid, integer, integer)',
      'public.get_profitability_report(timestamp with time zone, timestamp with time zone, text)',
      'public.process_order_item_inventory()',
      'public.protect_secure_order_columns()',
      'public.protect_secure_profile_columns()',
    ];

    for (const sig of revokedLegacyRpcs) {
      expect(hardeningSql).toContain(
        `REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`
      );
      expect(hardeningSql).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`);
    }
  });

  it('eliminates NULL three-valued logic bypasses and locks down inventory, orders, and order_items RLS', () => {
    expect(hardeningSql).toContain('DROP POLICY IF EXISTS "Everyone can update inventory" ON public.inventory;');
    expect(hardeningSql).toContain('CREATE POLICY "Staff update inventory" ON public.inventory');
    expect(hardeningSql).toContain("COALESCE(public.get_user_role(), '') IN ('admin', 'warehouse')");

    // Customers and drivers must not hold raw direct table UPDATE/INSERT permissions on orders/order_items
    const ordersAndItemsPolicyBlock = hardeningSql.slice(
      hardeningSql.indexOf('CREATE POLICY "Insert orders" ON public.orders'),
      hardeningSql.indexOf('-- Column-level / direct-write guard trigger')
    );

    const updateOrdersBlock = ordersAndItemsPolicyBlock.slice(
      ordersAndItemsPolicyBlock.indexOf('CREATE POLICY "Update orders" ON public.orders'),
      ordersAndItemsPolicyBlock.indexOf('DROP POLICY IF EXISTS "Admins can insert order items"')
    );
    expect(updateOrdersBlock).not.toContain("'driver'");
    expect(updateOrdersBlock).not.toContain("'retail'");
    expect(updateOrdersBlock).not.toContain("'b2b'");
    expect(updateOrdersBlock).not.toContain("'agency_admin'");

    const insertItemsBlock = ordersAndItemsPolicyBlock.slice(
      ordersAndItemsPolicyBlock.indexOf('CREATE POLICY "Insert order items" ON public.order_items'),
      ordersAndItemsPolicyBlock.indexOf('DROP POLICY IF EXISTS "Update order items"')
    );
    expect(insertItemsBlock).not.toContain("'driver'");
    expect(insertItemsBlock).toContain("o.status::text = 'pending'");
    expect(insertItemsBlock).toContain("= 'active'");

    const updateItemsBlock = ordersAndItemsPolicyBlock.slice(
      ordersAndItemsPolicyBlock.indexOf('CREATE POLICY "Update order items" ON public.order_items'),
      ordersAndItemsPolicyBlock.indexOf('DROP POLICY IF EXISTS "Delete order items"')
    );
    expect(updateItemsBlock).not.toContain("'driver'");
    expect(updateItemsBlock).not.toContain("'retail'");
    expect(updateItemsBlock).not.toContain("'b2b'");

    // Direct column/row tamper guard trigger on public.orders
    const orderTriggerFn = extractFunctionBlock(hardeningSql, 'protect_secure_order_columns');
    expect(orderTriggerFn).toContain("COALESCE(v_actor_role, '') IN ('admin', 'warehouse')");
    expect(orderTriggerFn).toContain('app.allow_driver_order_rpc');
    expect(orderTriggerFn).toContain('app.allow_order_notes_write');
    expect(hardeningSql).toContain('CREATE TRIGGER enforce_order_column_security');

    // Driver RPCs must run as SECURITY DEFINER and validate active status + assignment
    for (const driverFn of [
      'reject_full_order',
      'driver_start_delivery',
      'driver_complete_delivery',
      'driver_mark_attempted',
    ]) {
      const block = extractFunctionBlock(hardeningSql, driverFn);
      expect(block).toContain('SECURITY DEFINER');
      expect(block).toContain('assigned_driver_id = v_uid');
      expect(block).toContain("COALESCE(v_driver_status, 'inactive') <> 'active'");
      expect(block).toContain('FOR UPDATE');
    }

    // Account, fulfillment, and driver RPCs must reject v_uid IS NULL and use COALESCE(role, '')
    for (const fn of [
      'deactivate_user_account',
      'save_customer_profile_info',
      'process_warehouse_restock',
      'substitute_order_item',
      'edit_order_item',
      'add_order_item',
      'cancel_order_item',
      'split_order_item',
      'reject_full_order',
      'driver_start_delivery',
      'driver_complete_delivery',
      'driver_mark_attempted',
    ]) {
      const block = extractFunctionBlock(hardeningSql, fn);
      expect(block).toContain('v_uid IS NULL');
      expect(block).toContain("COALESCE(public.get_user_role(), '')");
    }

    // Backorder split inventory deduction fix: skip deduction ONLY via trusted internal GUC
    const invTriggerFn = extractFunctionBlock(hardeningSql, 'process_order_item_inventory');
    expect(invTriggerFn).toContain("current_setting('app.skip_item_inventory_deduct', true)");
    expect(invTriggerFn).toContain("'backordered', 'rejected'");
    expect(invTriggerFn).toContain('Direct insert with status');

    const splitFn = extractFunctionBlock(hardeningSql, 'split_order_item');
    expect(splitFn).toContain('SECURITY DEFINER');
    expect(splitFn).toContain("set_config('app.skip_item_inventory_deduct', 'true', true)");
    expect(splitFn).toContain("set_config('app.skip_item_inventory_deduct', 'false', true)");

    const completeDeliveryFn = extractFunctionBlock(hardeningSql, 'driver_complete_delivery');
    expect(completeDeliveryFn).toContain("set_config('app.skip_item_inventory_deduct', 'true', true)");
    expect(completeDeliveryFn).toContain("set_config('app.skip_item_inventory_deduct', 'false', true)");

    // Restock & cancellation idempotency / terminal-status protections
    const restockFn = extractFunctionBlock(hardeningSql, 'process_warehouse_restock');
    expect(restockFn).toContain('FOR UPDATE');
    expect(restockFn).toContain("v_order.status::text NOT IN ('attempted', 'delivered_partial')");
    expect(restockFn).toContain("v_is_partial AND LOWER(COALESCE(status::text, '')) = 'rejected'");
    expect(restockFn).toContain("NOT IN ('cancelled', 'restocked', 'delivered')");

    const cancelItemFn = extractFunctionBlock(hardeningSql, 'cancel_order_item');
    expect(cancelItemFn).toContain('SECURITY DEFINER');
    expect(cancelItemFn).toContain('FOR UPDATE OF oi');
    expect(cancelItemFn).toContain("IN ('cancelled', 'restocked')");
    expect(cancelItemFn).toContain("= 'delivered'");
    expect(cancelItemFn).toContain("= 'rejected'");

    // Customer pending-only order insert check
    const insertOrdersBlock = ordersAndItemsPolicyBlock.slice(
      ordersAndItemsPolicyBlock.indexOf('CREATE POLICY "Insert orders" ON public.orders'),
      ordersAndItemsPolicyBlock.indexOf('DROP POLICY IF EXISTS "Update orders"')
    );
    expect(insertOrdersBlock).toContain("status::text = 'pending'");
    expect(insertOrdersBlock).toContain("payment_status::text = 'unpaid'");
    expect(insertOrdersBlock).toContain('assigned_driver_id IS NULL');
  });

  it('enforces customer profile ownership and protects role, company_id, and status from self-escalation', () => {
    const triggerFn = extractFunctionBlock(hardeningSql, 'protect_secure_profile_columns');
    expect(triggerFn).toContain("IF COALESCE(v_actor_role, '') <> 'admin' THEN");
    expect(triggerFn).toContain('NEW.role := OLD.role;');
    expect(triggerFn).toContain("IF COALESCE(v_actor_role, '') <> 'warehouse' THEN");
    expect(triggerFn).toContain('NEW.company_id := OLD.company_id;');
    expect(triggerFn).toContain('NEW.status := OLD.status;');

    const saveProfileFn = extractFunctionBlock(hardeningSql, 'save_customer_profile_info');
    expect(saveProfileFn).toContain('v_uid IS DISTINCT FROM p_user_id');
    expect(saveProfileFn).toContain('WHEN v_is_staff THEN COALESCE(p_company_id, company_id)');
    expect(saveProfileFn).toContain('IF v_is_staff AND p_company_id IS NOT NULL THEN');
  });

  it('preserves return-to-approval backorder safeguards, transition guards, and route-ordering authorization', () => {
    expect(notesSearchSql).toContain('SECURITY INVOKER');
    expect(notesSearchSql).toContain("v_role NOT IN ('admin', 'warehouse')");
    expect(notesSearchSql).toContain('REVOKE ALL ON TABLE public.order_audit_logs FROM PUBLIC, anon, authenticated;');
    expect(notesSearchSql).toContain('REVOKE ALL ON FUNCTION public.update_order_notes(uuid, text) FROM PUBLIC, anon;');
    expect(notesSearchSql).toContain('REVOKE ALL ON FUNCTION public.search_admin_orders(text, text, integer, integer) FROM PUBLIC, anon;');

    expect(returnApprovalSql).toContain("'backordered'");
    expect(returnApprovalSql).toContain("'allocated'");
    expect(returnApprovalSql).toContain("'ready_to_pack'");
    expect(returnApprovalSql).toContain('trigger_enforce_order_approval_transition');
    expect(returnApprovalSql).toContain('app.allow_return_to_approval');
    expect(returnApprovalSql).toContain('REVOKE ALL ON FUNCTION public.return_order_to_approval(uuid, text) FROM PUBLIC, anon;');
    expect(returnApprovalSql).toContain('REVOKE ALL ON FUNCTION public.enforce_order_approval_transition_guard() FROM PUBLIC, anon, authenticated;');

    expect(routeOrderSql).toContain('trigger_protect_order_route_columns');
    expect(routeOrderSql).toContain("COALESCE(public.get_user_role(), '') NOT IN ('admin', 'warehouse')");
    expect(routeOrderSql).toContain('REVOKE ALL ON FUNCTION public.save_driver_stop_order(uuid, date, uuid[], jsonb) FROM PUBLIC, anon;');
    expect(routeOrderSql).toContain('REVOKE ALL ON FUNCTION public.protect_order_route_columns() FROM PUBLIC, anon, authenticated;');
    expect(routeOrderSql).toContain('ORDER BY o.id');
    expect(routeOrderSql).toContain('FOR UPDATE');
  });
});

describe('Option A Security Hardening — Application Workflow & Authorization Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockAuthState.user = { id: 'retail-1', email: 'retail@tricore.test' };
    mockAuthState.profile = {
      id: 'retail-1',
      role: 'retail',
      full_name: 'Retail Tester',
      contact_number: '555-1000',
      address: '10 Main St',
      city: 'Antioch',
      state: 'CA',
      zip: '94509',
    };
    if (!globalThis.navigator.geolocation) {
      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() },
        configurable: true,
      });
    }
    globalThis.scrollTo = vi.fn();
  });

  it('blocks non-staff roles from accessing staff routes (AdminOrders, Warehouse, Products, PurchaseOrders)', () => {
    for (const role of ['retail', 'b2b', 'driver']) {
      mockAuthState.profile = { id: `${role}-1`, role, full_name: `${role} User` };
      const { unmount } = render(
        <MemoryRouter initialEntries={['/admin/products']}>
          <Routes>
            <Route
              path="/admin/products"
              element={
                <RoleProtectedRoute allowedRoles={['admin', 'warehouse']}>
                  <div>Restricted Staff Products</div>
                </RoleProtectedRoute>
              }
            />
            <Route path="/dashboard" element={<div>Safe Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      );
      expect(screen.queryByText('Restricted Staff Products')).not.toBeInTheDocument();
      expect(screen.getByText('Safe Dashboard')).toBeInTheDocument();
      unmount();
    }
  });

  it('enforces customer profile ownership on Profile.jsx updates without sending role or company_id fields', async () => {
    const profileUpdates = [];
    mockFrom.mockImplementation((table) => {
      if (table === 'user_profiles') {
        const chain = createChainQuery({ data: null, error: null });
        chain.update = (payload) => {
          profileUpdates.push(payload);
          return chain;
        };
        return chain;
      }
      return createChainQuery({ data: [], error: null });
    });

    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    );

    const saveBtn = screen.getByRole('button', { name: /update profile/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(profileUpdates).toHaveLength(1);
    });
    expect(profileUpdates[0]).not.toHaveProperty('role');
    expect(profileUpdates[0]).not.toHaveProperty('company_id');
    expect(profileUpdates[0]).not.toHaveProperty('status');
    expect(profileUpdates[0]).toMatchObject({
      full_name: 'Retail Tester',
      address: '10 Main St',
      zip: '94509',
    });
  });

  it('preserves Checkout inventory integrity by computing total_base_units from server DB multipliers', async () => {
    localStorage.setItem(
      'tricore_cart_user_retail-1',
      JSON.stringify([
        {
          product_id: 'prod-1',
          variant_id: 'var-case-1',
          name: 'Nitrile Gloves Case',
          unit_price: 50,
          quantity: 3,
          line_total: 150,
        },
      ])
    );

    const insertedOrderItems = [];
    mockFrom.mockImplementation((table) => {
      if (table === 'tax_rates') {
        return createChainQuery({ data: { EstimatedCombinedRate: 0.1 }, error: null });
      }
      if (table === 'orders') {
        const chain = createChainQuery({ data: { id: 'ord-new-1' }, error: null });
        chain.insert = () => createChainQuery({ data: { id: 'ord-new-1' }, error: null });
        return chain;
      }
      if (table === 'product_variants') {
        // DB multiplier is 10 per case -> 3 * 10 = 30 base units
        return createChainQuery({ data: [{ id: 'var-case-1', multiplier: 10 }], error: null });
      }
      if (table === 'order_items') {
        const chain = createChainQuery({ data: null, error: null });
        chain.insert = (rows) => {
          insertedOrderItems.push(...rows);
          return createChainQuery({ data: null, error: null });
        };
        return chain;
      }
      return createChainQuery({ data: [], error: null });
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Nitrile Gloves Case');
    const placeOrderBtn = await screen.findByRole('button', { name: /place order/i });
    await waitFor(() => expect(placeOrderBtn).not.toBeDisabled());
    fireEvent.click(placeOrderBtn);

    await waitFor(() => {
      expect(insertedOrderItems).toHaveLength(1);
    });
    expect(insertedOrderItems[0]).toMatchObject({
      order_id: 'ord-new-1',
      product_variant_id: 'var-case-1',
      quantity_variants: 3,
      total_base_units: 30,
    });
  });

  it('preserves Driver-permitted reject_full_order delivery cancellation workflow', async () => {
    mockAuthState.user = { id: 'drv-7', email: 'driver@tricore.test' };
    mockAuthState.profile = {
      id: 'drv-7',
      role: 'driver',
      full_name: 'Carlos Driver',
      license_expiry: '2099-01-01',
    };

    const assignedOrder = {
      id: 'dddddddd-0000-0000-0000-000000000007',
      status: 'out_for_delivery',
      created_at: '2026-11-16T09:00:00Z',
      assigned_driver_id: 'drv-7',
      driver_name: 'Carlos Driver',
      shipping_name: 'Clinic Stop',
      shipping_address: '44 Market St',
      shipping_city: 'Antioch',
      shipping_state: 'CA',
      shipping_zip: '94509',
      total_amount: 80,
      payment_method: 'cod',
      order_items: [
        {
          id: 'oi-7',
          product_variant_id: 'pv-7',
          quantity_variants: 2,
          total_base_units: 20,
          status: 'OUT_FOR_DELIVERY',
          product_variants: { product_id: 'p7', name: 'Box', multiplier: 10, products: { name: 'Syringes' } },
        },
      ],
    };

    mockFrom.mockImplementation((table) => {
      if (table === 'orders') {
        return createChainQuery({ data: [assignedOrder], error: null });
      }
      return createChainQuery({ data: [], error: null });
    });
    mockRpc.mockResolvedValue({ data: null, error: null });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DriverRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Clinic Stop');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    const reasonInput = await screen.findByPlaceholderText(/duplicate order, requested by dispatcher/i);
    fireEvent.change(reasonInput, { target: { value: 'Facility closed before arrival' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm cancel/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('reject_full_order', {
        p_order_id: assignedOrder.id,
        p_reason: 'Facility closed before arrival',
        p_target_status: 'cancelled',
      });
    });
  });

  it('routes DriverRoutes start route, full/partial POD completion, and failed attempts through assignment-checked RPCs without raw table writes', async () => {
    mockAuthState.user = { id: 'drv-7', email: 'driver@tricore.test' };
    mockAuthState.profile = {
      id: 'drv-7',
      role: 'driver',
      full_name: 'Carlos Driver',
      license_expiry: '2099-01-01',
    };

    const rawOrderMutations = [];
    const rawItemMutations = [];
    const assignedOrder = {
      id: 'dddddddd-0000-0000-0000-000000000008',
      status: 'shipped',
      created_at: '2026-11-16T09:00:00Z',
      assigned_driver_id: 'drv-7',
      driver_name: 'Carlos Driver',
      shipping_name: 'Clinic Route Test',
      shipping_address: '44 Market St',
      shipping_city: 'Antioch',
      shipping_state: 'CA',
      shipping_zip: '94509',
      subtotal: 100,
      tax_amount: 10,
      shipping_amount: 15,
      total_amount: 125,
      payment_method: 'net_30',
      order_items: [
        {
          id: 'oi-8a',
          product_variant_id: 'pv-8a',
          quantity_variants: 4,
          total_base_units: 20,
          unit_price: 25,
          line_total: 100,
          status: 'READY_TO_PACK',
          product_variants: { product_id: 'p8', name: 'Case', multiplier: 5, products: { name: 'Gloves' } },
        },
      ],
    };

    mockFrom.mockImplementation((table) => {
      const chain = createChainQuery({
        data: table === 'orders' ? [assignedOrder] : [],
        error: null,
      });
      chain.update = (payload) => {
        if (table === 'orders') rawOrderMutations.push(payload);
        if (table === 'order_items') rawItemMutations.push(payload);
        return chain;
      };
      chain.insert = (payload) => {
        if (table === 'order_items') rawItemMutations.push(payload);
        return chain;
      };
      return chain;
    });
    mockRpc.mockResolvedValue({ data: { success: true, is_total_rejection: false }, error: null });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DriverRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Clinic Route Test');

    // 1. Start Route -> driver_start_delivery RPC
    fireEvent.click(screen.getByRole('button', { name: /start route/i }));
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('driver_start_delivery', {
        p_order_id: assignedOrder.id,
      });
    });

    // 2. Partial delivery completion -> driver_complete_delivery RPC (no client price tampering fields sent)
    fireEvent.click(await screen.findByRole('button', { name: /complete pod/i }));
    fireEvent.click(await screen.findByLabelText(/decrease delivered quantity for gloves/i));
    const receivedByInput = await screen.findByPlaceholderText(/optional — enter recipient name/i);
    fireEvent.change(receivedByInput, { target: { value: 'Front Desk Nurse' } });
    fireEvent.click(screen.getByRole('button', { name: /submit delivery/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('driver_complete_delivery', {
        p_order_id: assignedOrder.id,
        p_delivered_items: [{ item_id: 'oi-8a', delivered_qty: 3 }],
        p_received_by: 'Front Desk Nurse',
        p_signature_url: null,
        p_photo_url: null,
      });
    });

    expect(rawOrderMutations).toEqual([]);
    expect(rawItemMutations).toEqual([]);
  });

  it('routes DriverRoutes failed attempt and backorder cancellation through driver_mark_attempted RPC without raw writes', async () => {
    mockAuthState.user = { id: 'drv-7', email: 'driver@tricore.test' };
    mockAuthState.profile = {
      id: 'drv-7',
      role: 'driver',
      full_name: 'Carlos Driver',
      license_expiry: '2099-01-01',
    };

    const rawOrderMutations = [];
    const rawItemMutations = [];
    const backorderRunOrder = {
      id: 'dddddddd-0000-0000-0000-000000000009',
      status: 'delivered_partial',
      created_at: '2026-11-16T09:00:00Z',
      assigned_driver_id: 'drv-7',
      driver_name: 'Carlos Driver',
      shipping_name: 'Backorder Clinic',
      shipping_address: '99 Pine St',
      shipping_city: 'Antioch',
      shipping_state: 'CA',
      shipping_zip: '94509',
      subtotal: 100,
      tax_amount: 10,
      shipping_amount: 15,
      total_amount: 125,
      payment_method: 'cod',
      order_items: [
        {
          id: 'oi-9a',
          product_variant_id: 'pv-9a',
          quantity_variants: 2,
          total_base_units: 10,
          unit_price: 25,
          line_total: 50,
          status: 'SHIPPED',
          product_variants: { product_id: 'p9', name: 'Case', multiplier: 5, products: { name: 'Masks' } },
        },
        {
          id: 'oi-9b',
          product_variant_id: 'pv-9b',
          quantity_variants: 2,
          total_base_units: 10,
          unit_price: 25,
          line_total: 50,
          status: 'DELIVERED',
          product_variants: { product_id: 'p9b', name: 'Box', multiplier: 5, products: { name: 'Wipes' } },
        },
      ],
    };

    mockFrom.mockImplementation((table) => {
      const chain = createChainQuery({
        data: table === 'orders' ? [backorderRunOrder] : [],
        error: null,
      });
      chain.update = (payload) => {
        if (table === 'orders') rawOrderMutations.push(payload);
        if (table === 'order_items') rawItemMutations.push(payload);
        return chain;
      };
      chain.insert = (payload) => {
        if (table === 'order_items') rawItemMutations.push(payload);
        return chain;
      };
      return chain;
    });
    mockRpc.mockResolvedValue({ data: { success: true, is_backorder_run: true }, error: null });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DriverRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Backorder Clinic');
    fireEvent.click(screen.getByRole('button', { name: /attempt/i }));
    const attemptReasonInput = await screen.findByPlaceholderText(/customer not home/i);
    fireEvent.change(attemptReasonInput, { target: { value: 'Gate locked on arrival' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('driver_mark_attempted', {
        p_order_id: backorderRunOrder.id,
        p_reason: 'Gate locked on arrival',
      });
    });

    expect(rawOrderMutations).toEqual([]);
    expect(rawItemMutations).toEqual([]);
  });

  it('keeps Backorder, Allocated, Ready-to-Pack, Shipped, and Restocked orders blocked from Return to Approval', () => {
    expect(
      evaluateReturnToApprovalEligibility({
        id: 'ord-normal-packed',
        status: 'ready_for_delivery',
        order_items: [{ id: 'i1', status: 'active' }],
      }).eligible
    ).toBe(true);

    for (const blockedStatus of ['BACKORDERED', 'ALLOCATED', 'READY_TO_PACK', 'SHIPPED', 'RESTocked']) {
      const res = evaluateReturnToApprovalEligibility({
        id: `ord-${blockedStatus}`,
        status: 'processing',
        order_items: [{ id: 'i1', status: blockedStatus }],
      });
      expect(res.eligible).toBe(false);
    }
  });
});

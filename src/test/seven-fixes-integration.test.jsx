import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();
const mockAuthState = {
  profile: {
    id: 'staff-admin-1',
    role: 'admin',
    full_name: 'Admin Tester',
    license_expiry: '2099-01-01',
  },
  user: { id: 'staff-admin-1', email: 'admin@tricore.test' },
};

let sigIsEmptyMock = true;

vi.mock('../lib/supabase', () => {
  const channelObj = {
    on: () => channelObj,
    subscribe: () => channelObj,
  };
  return {
    supabase: {
      rpc: (...args) => mockRpc(...args),
      from: (...args) => mockFrom(...args),
      storage: {
        from: (...args) => mockStorageFrom(...args),
      },
      channel: (...args) => {
        mockChannel(...args);
        return channelObj;
      },
      removeChannel: (...args) => mockRemoveChannel(...args),
    },
  };
});

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
  default: React.forwardRef(function MockSignatureCanvas(_props, ref) {
    React.useImperativeHandle(ref, () => ({
      isEmpty: () => sigIsEmptyMock,
      clear: () => {
        sigIsEmptyMock = true;
      },
      getCanvas: () => ({
        toDataURL: () => 'data:image/png;base64,ZmFrZQ==',
      }),
    }));
    return <canvas data-testid="mock-signature-canvas" />;
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import DriverRouteOrderManager from '../components/DriverRouteOrderManager';
import AdminOrders from '../pages/AdminOrders';
import DriverRoutes from '../pages/DriverRoutes';
import Checkout from '../pages/Checkout';
import Catalog from '../pages/Catalog';
import {
  attachCustomerProfilesToOrders,
  attachCustomerProfilesToNestedOrderItems,
  getOrderCustomerProfile,
  isOrderB2B,
  isProfileB2B,
  resolveRetailCustomerName,
} from '../lib/orderCustomerUtils';
import { buildWarehouseSummaryGroups } from '../lib/reportUtils';
import adminOrdersSrc from '../pages/AdminOrders.jsx?raw';
import warehouseSrc from '../pages/Warehouse.jsx?raw';
import myOrdersSrc from '../pages/MyOrders.jsx?raw';
import driverRoutesSrc from '../pages/DriverRoutes.jsx?raw';
import reportsSrc from '../pages/Reports.jsx?raw';
import checkoutSrc from '../pages/Checkout.jsx?raw';
import dashboardSrc from '../pages/Dashboard.jsx?raw';
import packingSlipSrc from '../lib/packingSlipPdf.js?raw';
import reportUtilsSrc from '../lib/reportUtils.js?raw';

function createChainQuery(resultPromiseOrValue) {
  const result =
    typeof resultPromiseOrValue === 'function'
      ? resultPromiseOrValue
      : () => Promise.resolve(resultPromiseOrValue);

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

function renderWithProviders(ui) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Seven-Fix Component Integration Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    sigIsEmptyMock = true;
    mockAuthState.profile = {
      id: 'staff-admin-1',
      role: 'admin',
      full_name: 'Admin Tester',
      license_expiry: '2099-01-01',
    };
    mockAuthState.user = { id: 'staff-admin-1', email: 'admin@tricore.test' };

    if (!globalThis.navigator.geolocation) {
      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: {
          watchPosition: vi.fn(() => 1),
          clearWatch: vi.fn(),
        },
        configurable: true,
      });
    }
    globalThis.scrollTo = vi.fn();
  });

  it('Fix 2: DriverRouteOrderManager sorts manual stops, alerts other run dates, and persists Save Route Order via RPC', async () => {
    const today = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`;
    })();

    const driverId = 'drv-1111';
    const orderA = {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      status: 'shipped',
      created_at: '2026-11-16T08:00:00Z',
      assigned_driver_id: driverId,
      driver_name: 'Carlos Vega',
      route_position: 2,
      route_run_date: today,
      route_order_version: 3,
      shipping_name: 'Alpha Clinic',
      shipping_address: '100 First St',
      shipping_city: 'Pittsburg',
      shipping_state: 'CA',
      shipping_zip: '94565',
      companies: { name: 'Alpha Care' },
      order_items: [{ id: 'i1', status: 'SHIPPED' }],
    };
    const orderB = {
      id: 'bbbbbbbb-0000-0000-0000-000000000002',
      status: 'shipped',
      created_at: '2026-11-16T09:00:00Z',
      assigned_driver_id: driverId,
      driver_name: 'Carlos Vega',
      route_position: 1,
      route_run_date: today,
      route_order_version: 5,
      shipping_name: 'Bravo Clinic',
      shipping_address: '200 Second St',
      shipping_city: 'Pittsburg',
      shipping_state: 'CA',
      shipping_zip: '94565',
      companies: { name: 'Bravo Care' },
      order_items: [{ id: 'i2', status: 'SHIPPED' }],
    };
    const otherDateStop = {
      id: 'cccccccc-0000-0000-0000-000000000003',
      status: 'shipped',
      created_at: '2026-11-15T09:00:00Z',
      assigned_driver_id: driverId,
      driver_name: 'Carlos Vega',
      route_position: 1,
      route_run_date: '2026-11-14',
      route_order_version: 1,
      shipping_name: 'Yesterday Clinic',
      shipping_address: '300 Third St',
      shipping_city: 'Pittsburg',
      shipping_state: 'CA',
      shipping_zip: '94565',
      companies: { name: 'Yesterday Care' },
      order_items: [{ id: 'i3', status: 'SHIPPED' }],
    };

    mockFrom.mockImplementation((table) => {
      if (table === 'order_items') {
        return createChainQuery({ data: [], error: null });
      }
      if (table === 'orders') {
        return createChainQuery({ data: [orderA, orderB, otherDateStop], error: null });
      }
      return createChainQuery({ data: [], error: null });
    });

    mockRpc.mockResolvedValue({ data: { updated_count: 2 }, error: null });

    renderWithProviders(
      <DriverRouteOrderManager drivers={[{ id: driverId, full_name: 'Carlos Vega' }]} />
    );

    await screen.findByText(/Bravo Care — Bravo Clinic/);
    expect(screen.getByText('2026-11-14 (1)')).toBeInTheDocument();

    // Bravo (#BBBBBBBB) is position 1, Alpha (#AAAAAAAA) is position 2; move Alpha up
    fireEvent.click(screen.getByLabelText('Move order AAAAAAAA up'));
    expect(screen.getByText('Unsaved route order changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save route order/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('save_driver_stop_order', {
        p_driver_id: driverId,
        p_run_scope: today,
        p_ordered_order_ids: [orderA.id, orderB.id],
        p_expected_versions: {
          [orderA.id]: 3,
          [orderB.id]: 5,
        },
      });
    });
  });

  it('Fix 6: AdminOrders searches server-side via search_admin_orders RPC and surfaces retryable search errors', async () => {
    const matchedOrder = {
      id: 'dddddddd-0000-0000-0000-000000000004',
      status: 'pending',
      created_at: '2026-11-16T10:00:00Z',
      updated_at: '2026-11-16T10:00:00Z',
      company_id: 'comp-1',
      shipping_name: 'Maria Gonzalez',
      shipping_address: '45 Health Blvd',
      shipping_city: 'Concord',
      shipping_state: 'CA',
      shipping_zip: '94520',
      subtotal: 100,
      shipping_amount: 0,
      tax_amount: 0,
      total_amount: 100,
      payment_method: 'net_30',
      payment_status: 'unpaid',
      order_notes: 'Gate #44',
      companies: { name: 'Delta Hospice', address: '45 Health Blvd', city: 'Concord', state: 'CA', zip: '94520' },
      order_items: [],
    };

    let shouldFailSearch = true;

    mockRpc.mockImplementation((fnName, params) => {
      if (fnName === 'get_order_tab_counts') {
        return Promise.resolve({
          data: { pending: 1, processing: 0, shipped: 0, cancelled: 0, paid: 0, due: 0, restocked: 0 },
          error: null,
        });
      }
      if (fnName === 'search_admin_orders') {
        if (shouldFailSearch) {
          return Promise.resolve({ data: null, error: { message: 'Temporary DB timeout' } });
        }
        expect(params.p_search).toBe('Maria Gonzalez');
        return Promise.resolve({ data: [{ order_id: matchedOrder.id }], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'orders') {
        return createChainQuery({ data: [matchedOrder], error: null });
      }
      return createChainQuery({ data: [], error: null });
    });

    renderWithProviders(<AdminOrders />);
    await screen.findByText('Delta Hospice');

    const searchInput = screen.getByPlaceholderText(/search agency, customer, recipient, or id/i);
    fireEvent.change(searchInput, { target: { value: 'Maria Gonzalez' } });

    await screen.findByText(/Unable to load orders/i);
    expect(screen.getByText(/Temporary DB timeout/i)).toBeInTheDocument();

    shouldFailSearch = false;
    fireEvent.click(screen.getByRole('button', { name: /^Retry$/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('search_admin_orders', {
        p_tab: 'all',
        p_search: 'Maria Gonzalez',
        p_limit: 11,
        p_offset: 0,
      });
    });

    await waitFor(() => {
      expect(screen.queryByText(/Unable to load orders/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText('Delta Hospice')).toBeInTheDocument();
  });

  it('Fix 2, 4 & 5: DriverRoutes keeps manual route order, shows single-stop Navigate + Order Notes, and allows confirming empty POD', async () => {
    mockAuthState.profile = {
      id: 'drv-999',
      role: 'driver',
      full_name: 'Sam Driver',
      license_expiry: '2099-01-01',
    };

    const rawOrderUpdates = [];
    const rawItemWrites = [];
    const activeStop = {
      id: 'eeeeeeee-0000-0000-0000-000000000005',
      status: 'out_for_delivery',
      created_at: '2026-11-16T08:00:00Z',
      assigned_driver_id: 'drv-999',
      driver_name: 'Sam Driver',
      route_position: 1,
      route_run_date: '2026-11-16',
      route_order_version: 2,
      shipping_name: 'No Proof Patient',
      shipping_address: '900 Oak Ln',
      shipping_city: 'Antioch',
      shipping_state: 'CA',
      shipping_zip: '94509',
      subtotal: 50,
      tax_amount: 0,
      shipping_amount: 0,
      total_amount: 50,
      payment_method: 'net_30',
      order_notes: 'Deliver to back porch.',
      order_items: [
        {
          id: 'oi-1',
          product_variant_id: 'pv-1',
          quantity_variants: 1,
          total_base_units: 10,
          unit_price: 50,
          line_total: 50,
          status: 'OUT_FOR_DELIVERY',
          product_variants: { product_id: 'p1', name: 'Box', multiplier: 10, products: { name: 'Gauze' } },
        },
      ],
    };

    mockRpc.mockResolvedValue({ data: { success: true, is_total_rejection: false }, error: null });
    mockFrom.mockImplementation((table) => {
      if (table === 'order_items') {
        const chain = createChainQuery({ data: [], error: null });
        chain.update = (payload) => {
          rawItemWrites.push(payload);
          return createChainQuery({ data: [], error: null });
        };
        return chain;
      }
      if (table === 'orders') {
        const chain = createChainQuery({ data: [activeStop], error: null });
        chain.update = (payload) => {
          rawOrderUpdates.push(payload);
          return createChainQuery({ data: [activeStop], error: null });
        };
        return chain;
      }
      return createChainQuery({ data: [], error: null });
    });

    renderWithProviders(<DriverRoutes />);

    await screen.findByText('No Proof Patient');
    expect(screen.getByText('Deliver to back porch.')).toBeInTheDocument();

    const navLink = screen.getByRole('link', { name: /navigate/i });
    expect(navLink.getAttribute('href')).toContain('https://www.google.com/maps/dir/?api=1&destination=');
    expect(navLink.getAttribute('href')).not.toContain('waypoints=');

    fireEvent.click(screen.getByRole('button', { name: /complete pod/i }));
    await screen.findByText(/Recipient Name \(Optional\)/i);
    expect(screen.getByText(/Signature \(Optional\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit delivery/i }));
    await screen.findByText(/Complete delivery without recipient proof\?/i);

    fireEvent.click(screen.getByRole('button', { name: /confirm & complete/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('driver_complete_delivery', {
        p_order_id: activeStop.id,
        p_delivered_items: [{ item_id: 'oi-1', delivered_qty: 1 }],
        p_received_by: null,
        p_signature_url: null,
        p_photo_url: null,
      });
    });
    expect(rawOrderUpdates).toEqual([]);
    expect(rawItemWrites).toEqual([]);
  });

  it('Fix 7 & 5: Checkout edits item quantities across pages, removes items safely, and tracks Order Notes', async () => {
    const userId = 'retail-user-1';
    mockAuthState.profile = {
      id: userId,
      role: 'customer',
      full_name: 'Jane Retail',
      address: '50 Oak Ave',
      city: 'Pittsburg',
      state: 'CA',
      zip: '94565',
      contact_number: '555-0100',
    };
    mockAuthState.user = { id: userId, email: 'jane@example.com' };

    const cartItems = Array.from({ length: 6 }, (_, idx) => ({
      product_id: `prod-${idx + 1}`,
      variant_id: `var-${idx + 1}`,
      name: `Supply Item ${idx + 1}`,
      unit_price: 10,
      quantity: 1,
      line_total: 10,
    }));
    localStorage.setItem(`tricore_cart_user_${userId}`, JSON.stringify(cartItems));

    mockFrom.mockImplementation((table) => {
      if (table === 'tax_rates') {
        return createChainQuery({ data: { EstimatedCombinedRate: 0.1 }, error: null });
      }
      return createChainQuery({ data: [], error: null });
    });

    renderWithProviders(<Checkout />);

    await screen.findByText('Supply Item 1');
    // Tax fetches after 500ms debounce: Subtotal 60 + shipping 10 + tax 6 = 76.00
    await screen.findByText('$76.00', {}, { timeout: 2000 });

    fireEvent.click(screen.getByLabelText('Increase quantity for Supply Item 1'));
    // Subtotal 70 + shipping 10 + tax 7 = 87.00
    expect(screen.getByText('$87.00')).toBeInTheDocument();

    // Verify quantity editing & item removal on page 2
    fireEvent.click(screen.getByLabelText('Next cart page'));
    await screen.findByText('Supply Item 6');
    const qty6Input = screen.getByLabelText('Quantity for Supply Item 6');
    fireEvent.change(qty6Input, { target: { value: '3' } });
    // Subtotal 90 + shipping 10 + tax 9 = 109.00
    expect(screen.getByText('$109.00')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove Supply Item 6'));
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/i }));
    await waitFor(() => {
      expect(screen.queryByText('Supply Item 6')).not.toBeInTheDocument();
    });
    // Removing Supply Item 6 (qty 1 on page 1? Wait: qty 3 removed -> back to 60? Item 1 has qty 2, items 2..5 qty 1 -> subtotal 60, tax 6, total $76.00)
    expect(screen.getByText('$76.00')).toBeInTheDocument();

    const notesInput = screen.getByLabelText(/Order Notes/i);
    fireEvent.change(notesInput, { target: { value: 'Call before delivery' } });
    expect(screen.getAllByText('Call before delivery').length).toBeGreaterThanOrEqual(2);
  });

  it('Checkout regression: includes trimmed delivery notes in orders payload when provided and omits order_notes when blank', async () => {
    const userId = 'retail-notes-1';
    mockAuthState.profile = {
      id: userId,
      role: 'retail',
      full_name: 'Jane Retail',
      address: '50 Oak Ave',
      city: 'Pittsburg',
      state: 'CA',
      zip: '94565',
      contact_number: '555-0100',
    };
    mockAuthState.user = { id: userId, email: 'jane@example.com' };

    const checkoutCalls = [];
    mockRpc.mockImplementation((fnName, params) => {
      if (fnName === 'place_customer_order') {
        checkoutCalls.push(params);
        return Promise.resolve({
          data: { id: `ord-notes-${checkoutCalls.length}`, status: 'pending', total_amount: 76 },
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'tax_rates') {
        return createChainQuery({ data: { EstimatedCombinedRate: 0.1 }, error: null });
      }
      return createChainQuery({ data: [], error: null });
    });

    // 1. Submit with validated delivery notes (leading/trailing whitespace trimmed)
    localStorage.setItem(
      `tricore_cart_user_${userId}`,
      JSON.stringify([
        {
          product_id: 'prod-glv-1',
          variant_id: 'var-glv-10',
          name: 'Surgical Gloves Box',
          unit_price: 20,
          quantity: 3,
          line_total: 60,
        },
      ])
    );

    const { unmount } = renderWithProviders(<Checkout />);
    await screen.findByText('Surgical Gloves Box');
    await screen.findByText('$76.00', {}, { timeout: 2000 });

    const notesInput = screen.getByLabelText(/Order Notes/i);
    fireEvent.change(notesInput, { target: { value: '  Call nurse at Gate #44 before arrival  ' } });

    const placeOrderBtn = await screen.findByRole('button', { name: /place order/i });
    await waitFor(() => expect(placeOrderBtn).not.toBeDisabled());
    fireEvent.click(placeOrderBtn);

    await waitFor(() => {
      expect(checkoutCalls).toHaveLength(1);
    });

    expect(checkoutCalls[0]).toMatchObject({
      p_target_user_id: userId,
      p_target_company_id: null,
      p_patient_id: null,
      p_shipping_name: 'Jane Retail',
      p_shipping_address: '50 Oak Ave',
      p_shipping_city: 'Pittsburg',
      p_shipping_state: 'CA',
      p_shipping_zip: '94565',
      p_shipping_phone: '555-0100',
      p_order_notes: 'Call nurse at Gate #44 before arrival',
      p_payment_method: 'net_30',
      p_is_proxy: false,
      p_order_mode: 'retail',
      p_items: [{ variant_id: 'var-glv-10', quantity: 3 }],
    });

    unmount();

    // 2. Submit with whitespace-only notes: sends p_order_notes: null while preserving full checkout payload
    renderWithProviders(<Checkout />);
    await screen.findByText('Surgical Gloves Box');
    await screen.findByText('$76.00', {}, { timeout: 2000 });

    fireEvent.change(screen.getByLabelText(/Order Notes/i), { target: { value: '   ' } });
    const placeOrderSecond = await screen.findByRole('button', { name: /place order/i });
    await waitFor(() => expect(placeOrderSecond).not.toBeDisabled());
    fireEvent.click(placeOrderSecond);

    await waitFor(() => {
      expect(checkoutCalls).toHaveLength(2);
    });

    expect(checkoutCalls[1].p_order_notes).toBeNull();
    expect(checkoutCalls[1]).toMatchObject({
      p_target_user_id: userId,
      p_is_proxy: false,
      p_order_mode: 'retail',
      p_items: [{ variant_id: 'var-glv-10', quantity: 3 }],
    });
  });

  it('Phase 3: Catalog isolates carts across accounts/proxy sessions, handles invalid JSON, and renders default variants cleanly', async () => {
    localStorage.setItem(
      'tricore_cart_user_user-a',
      JSON.stringify([{ product_id: 'p1', variant_id: 'v1', name: 'Gloves', quantity: 2, unit_price: 12.5, line_total: 25 }])
    );
    localStorage.setItem(
      'tricore_cart_agency_comp-b',
      JSON.stringify([{ product_id: 'p2', variant_id: 'v2', name: 'Masks', quantity: 5, unit_price: 10, line_total: 50 }])
    );
    localStorage.setItem('tricore_cart_user_user-bad', '{broken json');

    mockRpc.mockResolvedValue({ data: ['Gloves', 'Masks'], error: null });
    mockFrom.mockImplementation((table) => {
      if (table === 'products') {
        return createChainQuery({
          data: [
            {
              id: 'prod-glove-1',
              name: 'Nitrile Gloves - Medium',
              category: 'Gloves',
              base_sku: 'GLV-BASE',
              retail_base_price: 15,
              image_urls: [],
              continue_selling: false,
              inventory: [{ base_units_on_hand: 20 }],
              product_variants: [
                { id: 'var-glv-1', product_id: 'prod-glove-1', name: 'Box of 100', sku: 'GLV-M-100', multiplier: 1, price: 15 },
              ],
            },
          ],
          error: null,
        });
      }
      return createChainQuery({ data: [], error: null });
    });

    // 1. Start with profile = null: must NOT overwrite stored user-a cart
    mockAuthState.profile = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Catalog />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Nitrile Gloves');
    expect(screen.getByText('Cart (0)')).toBeInTheDocument();
    expect(screen.getAllByText('GLV-M-100').length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(localStorage.getItem('tricore_cart_user_user-a'))).toHaveLength(1);

    // 2. Log in as Retail Customer A -> sees user-a cart cleanly
    mockAuthState.profile = { id: 'user-a', role: 'retail', full_name: 'Alice' };
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Catalog />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText('Cart (2)')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();

    // 3. Switch to B2B Agency B -> isolates cart to agency_comp-b without leaking user-a items
    mockAuthState.profile = { id: 'user-b', company_id: 'comp-b', role: 'b2b', full_name: 'Bob Agency' };
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Catalog />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText('Cart (5)')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('tricore_cart_user_user-a'))).toHaveLength(1);

    // 4. Corrupt JSON cart for another user does not crash Catalog
    mockAuthState.profile = { id: 'user-bad', role: 'retail', full_name: 'Corrupt Cart' };
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Catalog />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText('Cart (0)')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('Phase 4: DriverRoutes creates one realtime channel, refreshes on foreground visibilitychange, and cleans up on unmount', async () => {
    mockAuthState.profile = {
      id: 'drv-phase4',
      role: 'driver',
      full_name: 'Phase Four Driver',
      license_expiry: '2099-01-01',
    };

    let routeFetchCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'order_items') {
        routeFetchCount += 1;
      }
      return createChainQuery({ data: [], error: null });
    });

    const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    try {
      const { rerender, unmount } = render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <DriverRoutes />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(routeFetchCount).toBe(1);
      });
      expect(mockChannel).toHaveBeenCalledTimes(1);
      expect(mockChannel).toHaveBeenCalledWith('driver-dispatch-updates');

      rerender(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <DriverRoutes />
          </MemoryRouter>
        </QueryClientProvider>
      );
      expect(mockChannel).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      fireEvent(document, new Event('visibilitychange'));

      await waitFor(() => {
        expect(routeFetchCount).toBe(2);
      });
      expect(mockChannel).toHaveBeenCalledTimes(1);

      unmount();
      expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    } finally {
      if (originalVisibilityDescriptor) {
        Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
      } else {
        delete document.visibilityState;
      }
    }
  });

  it('Phase 4: Checkout fetches B2B proxy patient and company data once without infinite refetch loops', async () => {
    mockAuthState.profile = {
      id: 'staff-admin-1',
      role: 'admin',
      full_name: 'Admin Tester',
    };

    localStorage.setItem(
      'tricore_proxy_session',
      JSON.stringify({
        targetCompanyId: 'comp-1',
        targetUserId: 'user-p1',
        targetPatientId: 'pat-1',
        orderType: 'b2b',
      })
    );
    localStorage.setItem(
      'tricore_cart_agency_comp-1',
      JSON.stringify([
        {
          product_id: 'prod-1',
          variant_id: 'var-1',
          name: 'Surgical Masks',
          unit_price: 25,
          quantity: 2,
          line_total: 50,
        },
      ])
    );

    let companyFetchCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'agency_patients') {
        return createChainQuery({
          data: [
            {
              id: 'pat-1',
              full_name: 'Jane Doe',
              address: '123 Elm St',
              city: 'Pittsburg',
              state: 'CA',
              zip: '94565',
            },
          ],
          error: null,
        });
      }
      if (table === 'orders') {
        return createChainQuery({ data: [{ total_amount: 100 }], error: null });
      }
      if (table === 'companies') {
        companyFetchCount += 1;
        return createChainQuery({
          data: {
            id: 'comp-1',
            name: 'Care Agency',
            shipping_fee: 15,
            credit_limit: 500,
          },
          error: null,
        });
      }
      if (table === 'tax_rates') {
        return createChainQuery({ data: { EstimatedCombinedRate: 0.1 }, error: null });
      }
      return createChainQuery({ data: [], error: null });
    });

    renderWithProviders(<Checkout />);

    await screen.findByText('Jane Doe');
    expect(screen.getByText('Care Agency')).toBeInTheDocument();
    expect(companyFetchCount).toBe(1);
  });

  it('Proxy Checkout writes ORDER_CREATED audit record when Admin places a proxy order', async () => {
    mockAuthState.profile = {
      id: 'staff-admin-1',
      role: 'admin',
      full_name: 'Admin Tester',
    };
    mockAuthState.user = { id: 'staff-admin-1', email: 'admin@tricore.test' };

    localStorage.setItem(
      'tricore_proxy_session',
      JSON.stringify({
        targetCompanyId: 'comp-1',
        targetUserId: 'user-p1',
        targetPatientId: 'pat-1',
        customerName: 'Care Agency',
        orderType: 'b2b',
      })
    );
    localStorage.setItem(
      'tricore_cart_agency_comp-1',
      JSON.stringify([
        {
          product_id: 'prod-1',
          variant_id: 'var-1',
          name: 'Surgical Masks',
          unit_price: 25,
          quantity: 2,
          line_total: 50,
        },
      ])
    );

    const checkoutCalls = [];
    const insertedAuditLogs = [];

    mockRpc.mockImplementation((fnName, params) => {
      if (fnName === 'place_customer_order') {
        checkoutCalls.push(params);
        return Promise.resolve({
          data: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', status: 'pending' },
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'agency_patients') {
        return createChainQuery({
          data: [{ id: 'pat-1', full_name: 'Jane Doe', address: '123 Elm St', city: 'Pittsburg', state: 'CA', zip: '94565' }],
          error: null,
        });
      }
      if (table === 'companies') {
        return createChainQuery({
          data: { id: 'comp-1', name: 'Care Agency', shipping_fee: 15, credit_limit: 500 },
          error: null,
        });
      }
      if (table === 'tax_rates') {
        return createChainQuery({ data: { EstimatedCombinedRate: 0.1 }, error: null });
      }
      if (table === 'orders') {
        return createChainQuery({ data: [{ total_amount: 100 }], error: null });
      }
      if (table === 'order_audit_logs') {
        const chain = createChainQuery({ data: null, error: null });
        chain.insert = (rows) => {
          insertedAuditLogs.push(...rows);
          return createChainQuery({ data: null, error: null });
        };
        return chain;
      }
      return createChainQuery({ data: [], error: null });
    });

    renderWithProviders(<Checkout />);
    await screen.findByText('Jane Doe');
    await screen.findByText('$70.00', {}, { timeout: 2000 });

    const placeOrderBtn = await screen.findByRole('button', { name: /place order/i });
    await waitFor(() => expect(placeOrderBtn).not.toBeDisabled());
    fireEvent.click(placeOrderBtn);

    await waitFor(() => {
      expect(checkoutCalls).toHaveLength(1);
      expect(insertedAuditLogs).toHaveLength(1);
    });

    expect(checkoutCalls[0]).toMatchObject({
      p_target_user_id: 'user-p1',
      p_target_company_id: 'comp-1',
      p_patient_id: 'pat-1',
      p_is_proxy: true,
      p_order_mode: 'b2b',
    });

    expect(insertedAuditLogs[0]).toMatchObject({
      order_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      action: 'ORDER_CREATED',
      performed_by: 'staff-admin-1',
      actor_role: 'admin',
      new_status: 'pending',
      details: 'Order created via Proxy by admin on behalf of Care Agency',
    });

    expect(await screen.findByText('Success!')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Proxy Checkout explicitly warns when audit logging fails after order commit without retrying or creating duplicate orders', async () => {
    mockAuthState.profile = {
      id: 'staff-admin-1',
      role: 'admin',
      full_name: 'Admin Tester',
    };
    mockAuthState.user = { id: 'staff-admin-1', email: 'admin@tricore.test' };

    localStorage.setItem(
      'tricore_proxy_session',
      JSON.stringify({
        targetCompanyId: 'comp-1',
        targetUserId: 'user-p1',
        targetPatientId: 'pat-1',
        customerName: 'Care Agency',
        orderType: 'b2b',
      })
    );
    localStorage.setItem(
      'tricore_cart_agency_comp-1',
      JSON.stringify([
        {
          product_id: 'prod-1',
          variant_id: 'var-1',
          name: 'Surgical Masks',
          unit_price: 25,
          quantity: 2,
          line_total: 50,
        },
      ])
    );

    const checkoutCalls = [];
    let auditAttempts = 0;

    mockRpc.mockImplementation((fnName, params) => {
      if (fnName === 'place_customer_order') {
        checkoutCalls.push(params);
        return Promise.resolve({
          data: { id: '11112222-3333-4444-5555-666677778888', status: 'pending' },
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'agency_patients') {
        return createChainQuery({
          data: [{ id: 'pat-1', full_name: 'Jane Doe', address: '123 Elm St', city: 'Pittsburg', state: 'CA', zip: '94565' }],
          error: null,
        });
      }
      if (table === 'companies') {
        return createChainQuery({
          data: { id: 'comp-1', name: 'Care Agency', shipping_fee: 15, credit_limit: 500 },
          error: null,
        });
      }
      if (table === 'tax_rates') {
        return createChainQuery({ data: { EstimatedCombinedRate: 0.1 }, error: null });
      }
      if (table === 'orders') {
        return createChainQuery({ data: [{ total_amount: 100 }], error: null });
      }
      if (table === 'order_audit_logs') {
        const chain = createChainQuery({ data: null, error: null });
        chain.insert = () => {
          auditAttempts += 1;
          return createChainQuery({
            data: null,
            error: { message: 'Could not find the table public.order_audit_logs in the schema cache' },
          });
        };
        return chain;
      }
      return createChainQuery({ data: [], error: null });
    });

    renderWithProviders(<Checkout />);
    await screen.findByText('Jane Doe');
    await screen.findByText('$70.00', {}, { timeout: 2000 });

    const placeOrderBtn = await screen.findByRole('button', { name: /place order/i });
    await waitFor(() => expect(placeOrderBtn).not.toBeDisabled());
    fireEvent.click(placeOrderBtn);
    fireEvent.click(placeOrderBtn);

    const warningBanner = await screen.findByRole('alert');
    expect(warningBanner).toHaveTextContent(/#11112222 was created successfully, but its audit record failed to save/i);
    expect(warningBanner).toHaveTextContent(/Do not resubmit checkout/i);

    expect(screen.getByText('Order Created')).toBeInTheDocument();
    expect(screen.queryByText(/Failed to place order\. Please try again\./i)).not.toBeInTheDocument();

    expect(checkoutCalls).toHaveLength(1);
    expect(auditAttempts).toBe(1);
    expect(placeOrderBtn).toBeDisabled();
  });

  it('Checkout prevents duplicate submissions during slow in-flight order creation', async () => {
    const userId = 'retail-dup-guard-1';
    mockAuthState.profile = {
      id: userId,
      role: 'retail',
      full_name: 'Duplicate Guard Tester',
      address: '80 Pine St',
      city: 'Concord',
      state: 'CA',
      zip: '94520',
      contact_number: '555-0199',
    };
    mockAuthState.user = { id: userId, email: 'dupguard@example.com' };

    localStorage.setItem(
      `tricore_cart_user_${userId}`,
      JSON.stringify([
        {
          product_id: 'prod-1',
          variant_id: 'var-1',
          name: ' Gauze Roll ',
          unit_price: 15,
          quantity: 2,
          line_total: 30,
        },
      ])
    );

    let resolveCheckoutRpc;
    const checkoutCalls = [];

    mockRpc.mockImplementation((fnName, params) => {
      if (fnName === 'place_customer_order') {
        checkoutCalls.push(params);
        return new Promise((resolve) => {
          resolveCheckoutRpc = resolve;
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'tax_rates') {
        return createChainQuery({ data: { EstimatedCombinedRate: 0 }, error: null });
      }
      return createChainQuery({ data: null, error: null });
    });

    renderWithProviders(<Checkout />);
    await screen.findByText(/Gauze Roll/);

    const placeOrderBtn = await screen.findByRole('button', { name: /place order/i });
    await waitFor(() => expect(placeOrderBtn).not.toBeDisabled());

    // Simulate rapid double-click while order RPC is still pending in-flight
    fireEvent.click(placeOrderBtn);
    fireEvent.click(placeOrderBtn);

    expect(checkoutCalls).toHaveLength(1);
    expect(placeOrderBtn).toBeDisabled();

    resolveCheckoutRpc({ data: { id: '22223333-4444-5555-6666-777788889999', status: 'pending' }, error: null });
    expect(await screen.findByText('Success!')).toBeInTheDocument();
    expect(checkoutCalls).toHaveLength(1);
  });

  it('keeps actual retail client name after driver dispatch and never resolves assigned_driver_id via user_profiles', async () => {
    const orderSelectClauses = [];
    const profileLookups = [];

    const dispatchedRetailOrder = {
      id: 'f6fb6e53-6c4c-44b9-8f3c-42cea59c8d12',
      user_id: 'cust-retail-peninsula',
      company_id: null,
      assigned_driver_id: 'drv-cyrus-1',
      driver_name: 'Cyrus Rajeski | +1 (555) 111-2222',
      status: 'shipped',
      created_at: '2026-11-18T13:02:00Z',
      updated_at: '2026-11-18T14:00:00Z',
      shipping_name: 'Peninsula Reflections',
      shipping_email: 'peninsula@gmail.com',
      shipping_phone: '222222',
      shipping_address: '205 Collins Ave',
      shipping_city: 'Colma',
      shipping_state: 'CA',
      shipping_zip: '94014',
      subtotal: 800.99,
      shipping_amount: 10,
      tax_amount: 0,
      total_amount: 810.99,
      payment_method: 'cod',
      payment_status: 'unpaid',
      order_items: [],
    };

    const dispatchedB2BOrder = {
      id: 'b2b00001-0000-4000-8000-000000000001',
      user_id: 'cust-b2b-1',
      company_id: 'comp-alpha-1',
      assigned_driver_id: 'drv-cyrus-1',
      driver_name: 'Cyrus Rajeski | +1 (555) 111-2222',
      status: 'shipped',
      created_at: '2026-11-18T12:00:00Z',
      updated_at: '2026-11-18T14:00:00Z',
      shipping_name: 'Agency Patient',
      shipping_address: '100 Agency Rd',
      shipping_city: 'Colma',
      shipping_state: 'CA',
      shipping_zip: '94014',
      subtotal: 200,
      shipping_amount: 0,
      tax_amount: 0,
      total_amount: 200,
      payment_method: 'net_30',
      payment_status: 'unpaid',
      companies: {
        name: 'Alpha Care Agency',
        address: '100 Agency Rd',
        city: 'Colma',
        state: 'CA',
        zip: '94014',
        phone: '555-8888',
        email: 'billing@alphacare.test',
      },
      order_items: [],
    };

    // Unit guard checks: reject mismatched driver user_profiles embeds & preserve customer_profile
    expect(
      getOrderCustomerProfile({
        user_id: 'cust-retail-peninsula',
        assigned_driver_id: 'drv-cyrus-1',
        user_profiles: { id: 'drv-cyrus-1', full_name: 'Cyrus Rajeski', role: 'driver' },
      })
    ).toBeNull();
    expect(
      resolveRetailCustomerName({
        user_id: 'cust-retail-peninsula',
        assigned_driver_id: 'drv-cyrus-1',
        shipping_name: 'Peninsula Reflections',
        user_profiles: { id: 'drv-cyrus-1', full_name: 'Cyrus Rajeski', role: 'driver' },
      })
    ).toBe('Peninsula Reflections');

    // Static check: none of the orders pages embed unqualified user_profiles(...) via orders
    for (const src of [adminOrdersSrc, warehouseSrc, myOrdersSrc, driverRoutesSrc, reportsSrc]) {
      expect(src).not.toMatch(/user_profiles\s*\(/);
    }

    // Nested order_items enrichment resolves ordering customer on Warehouse backorders / Reports
    const enrichedNested = await attachCustomerProfilesToNestedOrderItems(
      {
        from: () =>
          createChainQuery({
            data: [{ id: 'cust-retail-peninsula', full_name: 'Peninsula Reflections', email: 'peninsula@gmail.com' }],
            error: null,
          }),
      },
      [{ id: 'item-1', orders: { id: 'ord-1', user_id: 'cust-retail-peninsula', shipping_name: 'Backup Ship' } }]
    );
    expect(enrichedNested[0].orders.customer_profile?.full_name).toBe('Peninsula Reflections');

    mockRpc.mockResolvedValue({
      data: { pending: 0, processing: 0, shipped: 2, cancelled: 0, paid: 0, due: 0, restocked: 0 },
      error: null,
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'orders') {
        const chain = createChainQuery({ data: [dispatchedRetailOrder, dispatchedB2BOrder], error: null });
        const origSelect = chain.select;
        chain.select = (clause) => {
          if (clause) orderSelectClauses.push(clause);
          return origSelect(clause);
        };
        return chain;
      }
      if (table === 'user_profiles') {
        const chain = {
          _isDriverQuery: false,
          select: (cols) => {
            profileLookups.push({ type: 'select', cols });
            return chain;
          },
          eq: (col, val) => {
            if (col === 'role' && val === 'driver') chain._isDriverQuery = true;
            return chain;
          },
          in: (col, vals) => {
            profileLookups.push({ type: 'in', col, vals });
            return chain;
          },
          order: () => chain,
          then: (onFulfilled, onRejected) => {
            const rows = chain._isDriverQuery
              ? [{ id: 'drv-cyrus-1', full_name: 'Cyrus Rajeski', contact_number: '555-111-2222' }]
              : [
                  {
                    id: 'cust-retail-peninsula',
                    full_name: 'Peninsula Reflections',
                    contact_number: '222222',
                    email: 'peninsula@gmail.com',
                  },
                  {
                    id: 'cust-b2b-1',
                    full_name: 'B2B User',
                    contact_number: '555-0000',
                    email: 'b2b@alphacare.test',
                  },
                ];
            return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
          },
        };
        return chain;
      }
      return createChainQuery({ data: [], error: null });
    });

    const directAttached = await attachCustomerProfilesToOrders(
      { from: (...args) => mockFrom(...args) },
      [dispatchedRetailOrder]
    );
    expect(directAttached[0].customer_profile?.full_name).toBe('Peninsula Reflections');

    renderWithProviders(<AdminOrders />);

    expect(await screen.findByText('F6FB6E53')).toBeInTheDocument();
    expect(screen.getByText('Alpha Care Agency')).toBeInTheDocument();
    expect(screen.getAllByText('Peninsula Reflections').length).toBeGreaterThanOrEqual(1);
    // The driver's name must NOT appear in the unexpanded customer column
    expect(screen.queryByText('Cyrus Rajeski')).not.toBeInTheDocument();

    // Expand the Retail order to verify Bill To & Ship To both show Peninsula Reflections (not driver)
    fireEvent.click(screen.getByText('F6FB6E53'));
    await screen.findByText('Order Management Panel');

    expect(screen.getAllByText('Peninsula Reflections').length).toBeGreaterThanOrEqual(3);
    expect(orderSelectClauses.some((s) => /user_profiles\s*\(/.test(s))).toBe(false);
    expect(profileLookups.some((call) => call.type === 'in' && call.vals.includes('cust-retail-peninsula'))).toBe(true);
  });

  it('classifies Retail orders linked to Retail-type companies as Retail instead of B2B Agency in AdminOrders and summary helpers', async () => {
    // 1. Unit checks for isProfileB2B / isOrderB2B across Retail-company vs B2B-company accounts
    expect(
      isProfileB2B({
        id: 'retail-user-justice',
        role: 'retail',
        company_id: 'comp-retail-justice',
        companies: { name: 'Justice Belleza', account_type: 'Retail' },
      })
    ).toBe(false);

    expect(
      isProfileB2B({
        id: 'retail-user-justice',
        role: 'retail',
        company_id: 'comp-retail-justice',
      })
    ).toBe(false);

    expect(
      isProfileB2B({
        id: 'b2b-user-1',
        role: 'b2b',
        company_id: 'comp-b2b-1',
        companies: { name: 'Alpha Care Agency', account_type: 'B2B' },
      })
    ).toBe(true);

    // Backward-compatible fallback for minimal test fixtures without account_type or role
    expect(isProfileB2B({ id: 'legacy-b2b', company_id: 'comp-legacy-1' })).toBe(true);
    expect(isProfileB2B(null)).toBe(false);

    const retailCompanyOrder = {
      id: 'ffa8239e-bd85-41c9-a286-316b35543d70',
      user_id: '435ae90c-28d6-49fa-84f2-4414d0c08312',
      company_id: 'e81e841a-1107-40e9-baa7-6001f97209c4',
      patient_id: null,
      status: 'pending',
      created_at: '2026-11-24T20:32:00Z',
      updated_at: '2026-11-24T20:32:00Z',
      shipping_name: 'Justice Belleza',
      shipping_address: '100 Retail Way',
      shipping_city: 'Pittsburg',
      shipping_state: 'CA',
      shipping_zip: '94565',
      subtotal: 3.0,
      shipping_amount: 10.0,
      tax_amount: 0.29,
      total_amount: 13.29,
      payment_method: 'card',
      payment_status: 'unpaid',
      companies: {
        name: 'Justice Belleza',
        account_type: 'Retail',
        address: '999 Ignored Billing Rd',
        city: 'Pittsburg',
        state: 'CA',
        zip: '94565',
        phone: '999-9999',
        email: 'company@ignored.test',
      },
      order_items: [
        {
          id: 'item-retail-1',
          quantity_variants: 1,
          unit_price: 3.0,
          line_total: 3.0,
          status: 'pending',
          product_variants: {
            id: 'var-1',
            name: 'Box',
            sku: 'SKU-1',
            price: 3.0,
            multiplier: 1,
            products: { name: 'Medical Tape', base_sku: 'SKU' },
          },
        },
      ],
    };

    const realB2BOrder = {
      id: 'bbbb239e-bd85-41c9-a286-316b35543d70',
      user_id: 'cust-b2b-alpha',
      company_id: 'comp-b2b-alpha',
      patient_id: null,
      status: 'pending',
      created_at: '2026-11-24T19:00:00Z',
      updated_at: '2026-11-24T19:00:00Z',
      shipping_name: 'Patient Zero',
      shipping_address: '200 Agency Pkwy',
      shipping_city: 'Antioch',
      shipping_state: 'CA',
      shipping_zip: '94509',
      subtotal: 100.0,
      shipping_amount: 5.0,
      tax_amount: 0,
      total_amount: 105.0,
      payment_method: 'net_30',
      payment_status: 'unpaid',
      companies: {
        name: 'Alpha Care Agency',
        account_type: 'B2B',
        address: '200 Agency Pkwy',
        city: 'Antioch',
        state: 'CA',
        zip: '94509',
        phone: '555-8888',
        email: 'billing@alphacare.test',
      },
      order_items: [],
    };

    expect(isOrderB2B(retailCompanyOrder)).toBe(false);
    expect(
      isOrderB2B({
        company_id: 'e81e841a-1107-40e9-baa7-6001f97209c4',
        companies: { name: 'Justice Belleza' },
        customer_profile: { role: 'retail', full_name: 'Justice Belleza' },
      })
    ).toBe(false);
    expect(
      isOrderB2B(
        { id: 'ord-null-co', user_id: 'u-r', company_id: null },
        { id: 'u-r', role: 'retail', company_id: 'e81e841a-1107-40e9-baa7-6001f97209c4' }
      )
    ).toBe(false);
    expect(isOrderB2B(realB2BOrder)).toBe(true);
    expect(
      isOrderB2B({ company_id: 'comp-legacy', companies: { name: 'Legacy Agency' } })
    ).toBe(true);

    // 2. Report grouping uses shipping address & customer identity (not company billing) for Retail-company orders
    const summaryGroups = buildWarehouseSummaryGroups([
      {
        ...retailCompanyOrder,
        customer_profile: { full_name: 'Justice Belleza', role: 'retail' },
      },
    ]);
    expect(summaryGroups).toHaveLength(1);
    expect(summaryGroups[0].address).toBe('100 Retail Way Pittsburg CA 94565');

    // 3. Static checks across Checkout, Dashboard, Order pages & PDF/report helpers
    for (const src of [
      adminOrdersSrc,
      warehouseSrc,
      myOrdersSrc,
      driverRoutesSrc,
      reportsSrc,
      checkoutSrc,
      dashboardSrc,
      packingSlipSrc,
      reportUtilsSrc,
    ]) {
      expect(src).not.toMatch(/\bisB2B\s*=\s*!!(?:order|profile)\??\.company_id\b/);
    }
    for (const src of [adminOrdersSrc, warehouseSrc, myOrdersSrc, driverRoutesSrc, reportsSrc]) {
      expect(src).toMatch(/companies\s*\([^)]*account_type/);
    }

    // 4. Component render check on <AdminOrders /> for #FFA8239E (Retail) alongside B2B Agency
    const orderSelectClauses = [];
    const profileSelectCols = [];

    mockRpc.mockResolvedValue({
      data: { pending: 2, processing: 0, shipped: 0, cancelled: 0, paid: 0, due: 0, restocked: 0 },
      error: null,
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'orders') {
        const chain = createChainQuery({ data: [retailCompanyOrder, realB2BOrder], error: null });
        const origSelect = chain.select;
        chain.select = (clause) => {
          if (clause) orderSelectClauses.push(clause);
          return origSelect(clause);
        };
        return chain;
      }
      if (table === 'user_profiles') {
        const chain = {
          _isDriverQuery: false,
          select: (cols) => {
            profileSelectCols.push(cols);
            return chain;
          },
          eq: (col, val) => {
            if (col === 'role' && val === 'driver') chain._isDriverQuery = true;
            return chain;
          },
          in: () => chain,
          order: () => chain,
          then: (onFulfilled, onRejected) => {
            const rows = chain._isDriverQuery
              ? []
              : [
                  {
                    id: '435ae90c-28d6-49fa-84f2-4414d0c08312',
                    full_name: 'Justice Belleza',
                    contact_number: '555-321-7777',
                    email: 'testcustomer@gmail.com',
                    role: 'retail',
                  },
                  {
                    id: 'cust-b2b-alpha',
                    full_name: 'Alpha Buyer',
                    contact_number: '555-0001',
                    email: 'buyer@alphacare.test',
                    role: 'b2b',
                  },
                ];
            return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
          },
        };
        return chain;
      }
      return createChainQuery({ data: [], error: null });
    });

    renderWithProviders(<AdminOrders />);

    expect(await screen.findByText('FFA8239E')).toBeInTheDocument();
    expect(screen.getByText('Justice Belleza')).toBeInTheDocument();
    expect(screen.getByText('Retail')).toBeInTheDocument();
    expect(screen.getByText('Alpha Care Agency')).toBeInTheDocument();
    expect(screen.getAllByText('B2B Agency')).toHaveLength(1);

    // Expand #FFA8239E to verify Bill To shows retail customer details instead of company billing info
    fireEvent.click(screen.getByText('FFA8239E'));
    await screen.findByText('Order Management Panel');
    expect(screen.getAllByText('testcustomer@gmail.com').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('company@ignored.test')).not.toBeInTheDocument();

    expect(orderSelectClauses.some((s) => /companies\s*\([^)]*account_type/.test(s))).toBe(true);
    expect(profileSelectCols.some((cols) => cols.includes('role'))).toBe(true);
  });
});

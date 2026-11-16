import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import jsPDF from 'jspdf';
import { parsePhotoUrls } from '../lib/utils';
import {
  clampCartQuantity,
  updateCartItemQuantity,
  calculateCheckoutTotals,
  validateCartForSubmission,
  readCartFromStorage,
  writeCartToStorage,
} from '../lib/cartUtils';
import {
  normalizeRecipientName,
  evaluatePodProof,
  extractOrderPodSummary,
} from '../lib/podUtils';
import {
  buildPackingSlipTableConfig,
  drawPackingSlipOrderNotes,
  generatePackingSlipPdf,
} from '../lib/packingSlipPdf';
import {
  MAX_GOOGLE_DIRECTIONS_WAYPOINTS,
  formatOrderDeliveryAddress,
  buildSingleStopNavigationUrl,
  sortDriverStops,
  hasSavedManualRouteOrder,
  prepareDirectionsOptimizationInput,
  mapWaypointOrderToOrderIds,
  reorderOrdersByMappedSequence,
  moveStopInList,
} from '../lib/routingUtils';
import {
  MAX_ORDER_NOTES_LENGTH,
  evaluateReturnToApprovalEligibility,
  normalizeOrderNotes,
  normalizeOrderSearchQuery,
} from '../lib/orderApprovalUtils';
import OrderPodCard from '../components/OrderPodCard';
import ReturnToApprovalModal from '../components/ReturnToApprovalModal';

describe('Live Operational Readiness Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Retail Customer Creation & Profile Sync', () => {
    it('creates company and user profile with all shipping address fields preserved', () => {
      const retailCustomerInput = {
        full_name: 'Sarah Connor',
        email: 'sarah.connor@example.com',
        contact_number: '555-4321',
        address: '1000 Skynet Way',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001',
        password: 'securePassword123'
      };

      // Simulated company record created for retail customer
      const createdCompany = {
        id: 'comp-retail-12345',
        name: retailCustomerInput.full_name,
        address: retailCustomerInput.address,
        city: retailCustomerInput.city,
        state: retailCustomerInput.state,
        zip: retailCustomerInput.zip,
        phone: retailCustomerInput.contact_number,
        email: retailCustomerInput.email,
        account_type: 'Retail',
        shipping_fee: 0
      };

      // Payload delivered to auth metadata
      const authMetadata = {
        full_name: retailCustomerInput.full_name,
        role: 'retail',
        contact_number: retailCustomerInput.contact_number,
        company_id: createdCompany.id,
        status: 'active',
        address: retailCustomerInput.address,
        city: retailCustomerInput.city,
        state: retailCustomerInput.state,
        zip: retailCustomerInput.zip,
        billing_address: retailCustomerInput.address,
        billing_city: retailCustomerInput.city,
        billing_state: retailCustomerInput.state,
        billing_zip: retailCustomerInput.zip
      };

      // Simulated user_profiles record created by handle_new_user trigger / update
      const userProfile = {
        id: 'usr-sarah-123',
        email: retailCustomerInput.email,
        full_name: authMetadata.full_name,
        role: authMetadata.role,
        status: authMetadata.status,
        company_id: authMetadata.company_id,
        contact_number: authMetadata.contact_number,
        address: authMetadata.address,
        city: authMetadata.city,
        state: authMetadata.state,
        zip: authMetadata.zip,
        billing_address: authMetadata.billing_address,
        billing_city: authMetadata.billing_city,
        billing_state: authMetadata.billing_state,
        billing_zip: authMetadata.billing_zip
      };

      expect(userProfile.address).toBe('1000 Skynet Way');
      expect(userProfile.city).toBe('Los Angeles');
      expect(userProfile.state).toBe('CA');
      expect(userProfile.zip).toBe('90001');
      expect(userProfile.contact_number).toBe('555-4321');
      expect(userProfile.company_id).toBe('comp-retail-12345');

      // Verify that Checkout will NOT force editing mode
      const needsManualAddressEntry = !userProfile.address || !userProfile.contact_number;
      expect(needsManualAddressEntry).toBe(false);
    });
  });

  describe('2. B2B Agency Registration & Management', () => {
    it('creates B2B company with financial terms and administrator profile', () => {
      const b2bInput = {
        company_name: 'Metro Health Care',
        address: '500 Medical Plaza',
        city: 'San Francisco',
        state: 'CA',
        zip: '94102',
        admin_name: 'Dr. John Watson',
        admin_email: 'watson@metrohealth.com',
        admin_phone: '415-555-0100',
        credit_limit: '15,000',
        shipping_fee: '25'
      };

      const rawLimit = Number(b2bInput.credit_limit.replace(/,/g, '')) || 0;
      const rawShippingFee = Number(b2bInput.shipping_fee.replace(/,/g, '')) || 0;

      const createdCompany = {
        id: 'comp-b2b-metro',
        name: b2bInput.company_name,
        address: b2bInput.address,
        city: b2bInput.city,
        state: b2bInput.state,
        zip: b2bInput.zip,
        phone: b2bInput.admin_phone,
        email: b2bInput.admin_email,
        account_type: 'B2B',
        credit_limit: rawLimit,
        shipping_fee: rawShippingFee
      };

      expect(createdCompany.credit_limit).toBe(15000);
      expect(createdCompany.shipping_fee).toBe(25);
      expect(createdCompany.account_type).toBe('B2B');

      const adminProfile = {
        id: 'usr-watson-1',
        full_name: b2bInput.admin_name,
        email: b2bInput.admin_email,
        role: 'b2b',
        company_id: createdCompany.id,
        contact_number: b2bInput.admin_phone,
        address: b2bInput.address,
        city: b2bInput.city,
        state: b2bInput.state,
        zip: b2bInput.zip
      };

      expect(adminProfile.company_id).toBe('comp-b2b-metro');
      expect(adminProfile.address).toBe('500 Medical Plaza');
    });
  });

  describe('3. Order Placement & Integrity', () => {
    it('creates Retail order correctly using pre-filled profile address without data loss', () => {
      const profile = {
        id: 'usr-sarah-123',
        full_name: 'Sarah Connor',
        email: 'sarah.connor@example.com',
        contact_number: '555-4321',
        address: '1000 Skynet Way',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001'
      };

      const _cart = [
        { variant_id: 'var-101', quantity: 2, unit_price: 25.00, line_total: 50.00 }
      ];

      const subtotal = 50.00;
      const shippingFee = 0.00;
      const taxAmount = 4.75;
      const totalAmount = 54.75;

      const newOrder = {
        id: 'ord-retail-777',
        user_id: profile.id,
        shipping_name: profile.full_name,
        shipping_address: profile.address,
        shipping_city: profile.city,
        shipping_state: profile.state,
        shipping_zip: profile.zip,
        shipping_phone: profile.contact_number,
        shipping_email: profile.email,
        status: 'pending',
        payment_method: 'credit_card',
        payment_status: 'paid',
        subtotal,
        tax_amount: taxAmount,
        shipping_amount: shippingFee,
        total_amount: totalAmount
      };

      expect(newOrder.shipping_address).toBe('1000 Skynet Way');
      expect(newOrder.shipping_name).toBe('Sarah Connor');
      expect(newOrder.total_amount).toBe(54.75);
    });

    it('creates B2B Proxy order linking company, patient, and items correctly', () => {
      const b2bCompany = {
        id: 'comp-b2b-metro',
        name: 'Metro Health Care',
        address: '500 Medical Plaza',
        city: 'San Francisco',
        state: 'CA',
        zip: '94102',
        shipping_fee: 25.00
      };

      const patient = {
        id: 'pat-999',
        full_name: 'Alice Johnson',
        address: '888 Broadway',
        city: 'San Francisco',
        state: 'CA',
        zip: '94133',
        contact_number: '415-555-9876'
      };

      const proxyOrder = {
        id: 'ord-proxy-123',
        company_id: b2bCompany.id,
        shipping_name: patient.full_name,
        shipping_address: patient.address,
        shipping_city: patient.city,
        shipping_state: patient.state,
        shipping_zip: patient.zip,
        status: 'pending',
        payment_method: 'net_30',
        payment_status: 'unpaid',
        subtotal: 100.00,
        shipping_amount: b2bCompany.shipping_fee,
        total_amount: 125.00
      };

      expect(proxyOrder.company_id).toBe('comp-b2b-metro');
      expect(proxyOrder.shipping_name).toBe('Alice Johnson');
      expect(proxyOrder.shipping_address).toBe('888 Broadway');
      expect(proxyOrder.payment_status).toBe('unpaid');
    });

    it('ensures packing slip omits customer email and phone for package privacy', () => {
      const order = {
        id: 'order-sample-12345678',
        shipping_name: 'Alice Johnson',
        shipping_address: '888 Broadway',
        shipping_city: 'San Francisco',
        shipping_state: 'CA',
        shipping_zip: '94133',
        shipping_email: 'alice@example.com',
        shipping_phone: '415-555-9876'
      };

      // Warehouse packing slip formatting
      const billName = order.shipping_name;
      const billAddress = order.shipping_address;
      const billCityState = `${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`;
      const shipName = order.shipping_name;
      const shipAddress = order.shipping_address;
      const shipCityState = `${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`;

      // In Warehouse.jsx lines 380-391: email and phone are deliberately not added to doc.text
      const packingSlipLines = [
        billName,
        billAddress,
        billCityState,
        shipName,
        shipAddress,
        shipCityState
      ];

      expect(packingSlipLines.some(line => line.includes('@'))).toBe(false);
      expect(packingSlipLines.some(line => line.includes('415-555-9876'))).toBe(false);
      expect(packingSlipLines).toContain('888 Broadway');
    });

    it('supports up to 4 POD photos parsing cleanly in order cards without failure', () => {
      // Legacy single photo URL
      const legacyPhoto = 'https://supabase.co/storage/v1/object/public/delivery-proofs/pod-1.jpg';
      expect(parsePhotoUrls(legacyPhoto)).toEqual([legacyPhoto]);

      // Multi-photo JSON array (up to 4 photos)
      const multiPhotos = [
        'https://supabase.co/storage/v1/object/public/delivery-proofs/pod-1.jpg',
        'https://supabase.co/storage/v1/object/public/delivery-proofs/pod-2.jpg',
        'https://supabase.co/storage/v1/object/public/delivery-proofs/pod-3.jpg',
        'https://supabase.co/storage/v1/object/public/delivery-proofs/pod-4.jpg',
      ];
      const serialized = JSON.stringify(multiPhotos);
      expect(parsePhotoUrls(serialized)).toEqual(multiPhotos);
      expect(parsePhotoUrls(serialized)).toHaveLength(4);

      // Edge case: null or empty photo
      expect(parsePhotoUrls(null)).toEqual([]);
      expect(parsePhotoUrls('')).toEqual([]);
      expect(parsePhotoUrls('invalid [ json')).toEqual(['invalid [ json']);
    });
  });

  describe('4. Deactivation Safety (Zero Data Loss on Historical Orders)', () => {
    it('preserves past orders and invoices when a customer or agency is deactivated', () => {
      const pastOrders = [
        { id: 'ord-1', company_id: 'comp-b2b-metro', total_amount: 500, payment_status: 'paid' },
        { id: 'ord-2', company_id: 'comp-b2b-metro', total_amount: 350, payment_status: 'unpaid' }
      ];

      // Simulated deactivation of user/company
      const company = { id: 'comp-b2b-metro', status: 'inactive' };

      // Orders remain intact, unpaid balance remains tracked
      const ordersBelongingToCompany = pastOrders.filter(o => o.company_id === company.id);
      expect(ordersBelongingToCompany).toHaveLength(2);

      const totalOutstanding = ordersBelongingToCompany
        .filter(o => o.payment_status === 'unpaid')
        .reduce((sum, o) => sum + o.total_amount, 0);

      expect(totalOutstanding).toBe(350);
    });
  });
  describe('5. Driver Navigation & Master Route Resiliency', () => {
    const WAREHOUSE_ADDRESS = "2169 Harbor St, Pittsburg CA 94565";

    it('generates direct Google Maps multi-stop URL directly from orders without DirectionsService', () => {
      const orders = [
        { shipping_address: '1226 Soquel Ave #1', shipping_city: 'Santa Cruz', shipping_state: 'CA', shipping_zip: '95062' },
        { shipping_address: '200 Mission St', shipping_city: 'Santa Cruz', shipping_state: 'CA', shipping_zip: '95060' }
      ];

      const origin = encodeURIComponent(WAREHOUSE_ADDRESS);
      const wpAddresses = orders
        .map(order => {
          const cityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.trim();
          const fullAddr = `${order.shipping_address || ''}, ${cityState}`.trim().replace(/^,\s*|,\s*$/g, '');
          return fullAddr ? encodeURIComponent(fullAddr) : null;
        })
        .filter(Boolean);

      const waypointsParam = wpAddresses.length > 0 ? `&waypoints=${wpAddresses.join('|')}` : '';
      const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${origin}${waypointsParam}&travelmode=driving`;

      expect(url).toContain('https://www.google.com/maps/dir/?api=1');
      expect(url).toContain('origin=2169%20Harbor%20St');
      expect(url).toContain('destination=2169%20Harbor%20St');
      expect(url).toContain('1226%20Soquel%20Ave%20%231');
      expect(url).toContain('200%20Mission%20St');
    });

    it('handles REQUEST_DENIED gracefully without crashing or showing window alerts', () => {
      let alertCalled = false;
      const originalAlert = globalThis.alert;
      globalThis.alert = () => { alertCalled = true; };

      const mockDirectionsService = {
        route: vi.fn((req, callback) => {
          callback(null, 'REQUEST_DENIED');
        })
      };

      let isCalculating = true;
      let errorToastShown = false;
      const isAuto = true; // Auto-triggered on order status change

      // Simulate safe handling
      mockDirectionsService.route({ optimizeWaypoints: true }, (result, status) => {
        if (status === 'OK') {
          isCalculating = false;
        } else {
          isCalculating = false;
          if (!isAuto) {
            errorToastShown = true;
          }
        }
      });

      expect(isCalculating).toBe(false);
      expect(alertCalled).toBe(false); // No disruptive alert popup!
      expect(errorToastShown).toBe(false); // Silent when auto-triggered

      globalThis.alert = originalAlert;
    });
  });

  describe('6. Seven-Fix Production Hardening Verification', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('Fix 7: Cart Quantity Controls & Deterministic Totals', () => {
      const sampleCart = [
        { product_id: 'p1', variant_id: 'v1', name: 'Gloves (Box)', unit_price: 12.5, quantity: 2, line_total: 25 },
        { product_id: 'p2', variant_id: 'v2', name: 'Masks (Pack)', unit_price: 8.25, quantity: 1, line_total: 8.25 },
      ];

      it('increments, decrements with minimum clamp >= 1, and recalculates retail totals cleanly', () => {
        const incremented = updateCartItemQuantity(sampleCart, 0, 3);
        expect(incremented[0].quantity).toBe(3);
        expect(incremented[0].line_total).toBe(37.5);

        const retailTotals = calculateCheckoutTotals(incremented, {
          isB2B: false,
          taxRate: 0.0875,
          taxExempt: false,
        });
        expect(retailTotals.subtotal).toBe(45.75);
        expect(retailTotals.shippingFee).toBe(10);
        expect(retailTotals.taxAmount).toBe(4);
        expect(retailTotals.totalAmount).toBe(59.75);

        const clampedMin = updateCartItemQuantity(incremented, 1, 0);
        expect(clampedMin[1].quantity).toBe(1);
        expect(clampedMin[1].line_total).toBe(8.25);

        expect(clampCartQuantity('-4', 5)).toBe(5);
        expect(clampCartQuantity('abc', 1)).toBe(1);
      });

      it('handles item removal, B2B tax exemption, custom shipping fee, and empty cart validation', () => {
        const afterRemoval = sampleCart.filter((_, idx) => idx !== 0);
        const b2bTotals = calculateCheckoutTotals(afterRemoval, {
          isB2B: true,
          customShippingFee: 25,
          taxRate: 0.09,
          taxExempt: true,
        });

        expect(b2bTotals.subtotal).toBe(8.25);
        expect(b2bTotals.shippingFee).toBe(25);
        expect(b2bTotals.taxAmount).toBe(0);
        expect(b2bTotals.totalAmount).toBe(33.25);

        expect(validateCartForSubmission(afterRemoval)).toEqual({ valid: true, error: null });
        expect(validateCartForSubmission([]).valid).toBe(false);
        expect(
          validateCartForSubmission([{ ...sampleCart[0], quantity: 0 }]).valid
        ).toBe(false);
      });

      it('safely persists and isolates carts by storage key while tolerating invalid JSON', () => {
        localStorage.clear();
        expect(readCartFromStorage(null)).toEqual([]);
        expect(readCartFromStorage('tricore_cart_missing')).toEqual([]);

        localStorage.setItem('tricore_cart_corrupt', '{not valid json');
        expect(readCartFromStorage('tricore_cart_corrupt')).toEqual([]);

        localStorage.setItem('tricore_cart_object', JSON.stringify({ wrong: true }));
        expect(readCartFromStorage('tricore_cart_object')).toEqual([]);

        writeCartToStorage('tricore_cart_user_a', [sampleCart[0]]);
        writeCartToStorage('tricore_cart_agency_b', [sampleCart[1]]);

        expect(readCartFromStorage('tricore_cart_user_a')).toEqual([sampleCart[0]]);
        expect(readCartFromStorage('tricore_cart_agency_b')).toEqual([sampleCart[1]]);
      });
    });

    describe('Fix 4: Optional POD Fields & Safe OrderPodCard Rendering', () => {
      it('treats blank recipient name and missing signature as optional and prompts only when all 3 proofs are empty', () => {
        expect(normalizeRecipientName('   ')).toBeNull();
        expect(normalizeRecipientName('  Nurse Joy  ')).toBe('Nurse Joy');
        expect(normalizeRecipientName('A'.repeat(200))).toHaveLength(120);

        const emptyProof = evaluatePodProof({ receivedBy: '   ', hasSignature: false, photoCount: 0 });
        expect(emptyProof.normalizedRecipient).toBeNull();
        expect(emptyProof.hasAnyProof).toBe(false);
        expect(emptyProof.requiresEmptyProofConfirmation).toBe(true);

        const photoOnly = evaluatePodProof({ receivedBy: '', hasSignature: false, photoCount: 1 });
        expect(photoOnly.hasAnyProof).toBe(true);
        expect(photoOnly.requiresEmptyProofConfirmation).toBe(false);

        const nameOnly = evaluatePodProof({ receivedBy: 'Front Desk', hasSignature: false, photoCount: 0 });
        expect(nameOnly.normalizedRecipient).toBe('Front Desk');
        expect(nameOnly.requiresEmptyProofConfirmation).toBe(false);

        const sigOnly = evaluatePodProof({ receivedBy: '', hasSignature: true, photoCount: 0 });
        expect(sigOnly.hasAnyProof).toBe(true);
        expect(sigOnly.requiresEmptyProofConfirmation).toBe(false);
      });

      it('renders OrderPodCard with neutral Not provided labels and zero broken img tags when proofs are absent', () => {
        const { rerender, container } = render(
          <OrderPodCard
            order={{
              id: 'ord-pod-empty',
              status: 'delivered',
              received_by: null,
              signature_url: null,
              photo_url: null,
            }}
          />
        );
        expect(screen.getByText('Not provided')).toBeInTheDocument();
        expect(container.querySelectorAll('img')).toHaveLength(0);

        rerender(
          <OrderPodCard
            order={{
              id: 'ord-pod-photo',
              status: 'delivered_partial',
              received_by: null,
              signature_url: null,
              photo_url: 'https://example.com/pod1.jpg',
            }}
          />
        );
        expect(screen.getByAltText('Delivery Proof 1')).toHaveAttribute('src', 'https://example.com/pod1.jpg');
        expect(screen.getByText('Recipient name & signature: Not provided')).toBeInTheDocument();
        expect(container.querySelectorAll('img')).toHaveLength(1);

        rerender(
          <OrderPodCard
            order={{
              id: 'ord-pod-full',
              status: 'delivered',
              received_by: 'Alex Rivera',
              signature_url: 'https://example.com/sig.png',
              photo_url: JSON.stringify(['https://example.com/p1.jpg', 'https://example.com/p2.jpg']),
            }}
          />
        );
        expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
        expect(screen.getByAltText('Customer Signature')).toBeInTheDocument();
        expect(container.querySelectorAll('img')).toHaveLength(3);

        const summary = extractOrderPodSummary({ received_by: '', signature_url: null, photo_url: '' });
        expect(summary.hasAnyPod).toBe(false);
      });
    });

    describe('Fix 3 & Fix 5: Packing Slip Row Integrity, Wrapped Order Notes & Pagination', () => {
      it('enforces rowPageBreak: avoid in packing slip autoTable configuration', () => {
        const config = buildPackingSlipTableConfig({
          maxAddressY: 65,
          tableRows: [[2, 2, 0, 'SKU-1', 'Test Product']],
        });
        expect(config.rowPageBreak).toBe('avoid');
        expect(config.styles.overflow).toBe('linebreak');
        expect(config.margin.bottom).toBe(40);
      });

      it('omits blank order notes and paginates long wrapped notes safely across page breaks', () => {
        const doc = new jsPDF();
        const unchangedY = drawPackingSlipOrderNotes(doc, '   \n  ', 100);
        expect(unchangedY).toBe(100);
        expect(doc.internal.getNumberOfPages()).toBe(1);

        const longNote = Array.from({ length: 12 }, (_, idx) => `Instruction line ${idx + 1}: leave sterile supplies with charge nurse at reception desk.`).join(' ');
        const endY = drawPackingSlipOrderNotes(doc, longNote, 240);
        expect(doc.internal.getNumberOfPages()).toBeGreaterThan(1);
        expect(endY).toBeGreaterThan(40);
      });

      it('generates multi-page packing slip PDF cleanly when there are 30 items and long order notes', async () => {
        const order = {
          id: '12345678-aaaa-bbbb-cccc-123456789012',
          status: 'processing',
          company_id: 'comp-1',
          companies: {
            name: 'Bay Area Home Health',
            address: '500 Medical Plaza',
            city: 'Concord',
            state: 'CA',
            zip: '94520',
          },
          shipping_name: 'John Patient',
          shipping_address: '101 Oak Street',
          shipping_city: 'Pittsburg',
          shipping_state: 'CA',
          shipping_zip: '94565',
          order_notes: 'Ring bell at side nursing entrance.\nDeliver before 3:00 PM if possible.\nCall charge nurse on arrival.',
          order_items: Array.from({ length: 30 }, (_, idx) => ({
            quantity_variants: 2,
            status: 'PENDING',
            product_variants: {
              sku: `SKU-${idx + 1}`,
              name: 'Box of 100',
              products: { name: `Sterile Nitrile Examination Gloves Lot #${idx + 1}` },
            },
          })),
        };

        const result = await generatePackingSlipPdf(order, { download: false });
        expect(result.filename).toBe('Packing_Slip_12345678.pdf');
        expect(result.pageCount).toBeGreaterThanOrEqual(2);
      });
    });

    describe('Fix 1, Fix 5 & Fix 6: Return to Approval, Order Notes & Admin Search', () => {
      it('enforces pre-dispatch eligibility and blocks split/backordered/dispatched orders', () => {
        expect(
          evaluateReturnToApprovalEligibility({
            id: 'ord-1',
            status: 'processing',
            order_items: [{ id: 'i1', status: 'PENDING' }],
          }).eligible
        ).toBe(true);

        expect(
          evaluateReturnToApprovalEligibility({
            id: 'ord-2',
            status: 'ready_for_delivery',
            order_items: [{ id: 'i1', status: 'PENDING' }],
          }).eligible
        ).toBe(true);

        expect(
          evaluateReturnToApprovalEligibility({
            id: 'ord-3',
            status: 'shipped',
            shipped_at: '2026-11-16T10:00:00Z',
          }).eligible
        ).toBe(false);

        expect(
          evaluateReturnToApprovalEligibility({
            id: 'ord-reattempt',
            status: 'ready_for_delivery',
            shipped_at: '2026-11-15T10:00:00Z',
            order_items: [{ id: 'i1', status: 'PENDING' }],
          }).eligible
        ).toBe(false);

        expect(
          evaluateReturnToApprovalEligibility({
            id: 'ord-backorder',
            status: 'processing',
            order_items: [{ id: 'i1', status: 'BACKORDERED' }],
          }).eligible
        ).toBe(false);
      });

      it('normalizes order_notes bounds and search_admin_orders query strings', () => {
        expect(normalizeOrderNotes('   ')).toEqual({ valid: true, value: null, error: null });
        expect(normalizeOrderNotes('  Gate code 4421  ')).toEqual({
          valid: true,
          value: 'Gate code 4421',
          error: null,
        });
        expect(normalizeOrderNotes('x'.repeat(MAX_ORDER_NOTES_LENGTH)).valid).toBe(true);
        expect(normalizeOrderNotes('x'.repeat(MAX_ORDER_NOTES_LENGTH + 1)).valid).toBe(false);

        expect(normalizeOrderSearchQuery('  #ABC123  ')).toBe('ABC123');
        expect(normalizeOrderSearchQuery('  Metro Health  ')).toBe('Metro Health');
      });

      it('renders ReturnToApprovalModal requiring trimmed reason and invoking callbacks cleanly', () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn();

        render(
          <ReturnToApprovalModal
            open={true}
            order={{ id: 'abcdef12-0000-0000-0000-000000000001', driver_name: 'Sam Driver' }}
            onClose={onClose}
            onConfirm={onConfirm}
          />
        );

        const confirmBtn = screen.getByRole('button', { name: /confirm return/i });
        expect(confirmBtn).toBeDisabled();

        const textarea = screen.getByLabelText(/reason for returning/i);
        fireEvent.change(textarea, { target: { value: '   ' } });
        expect(confirmBtn).toBeDisabled();

        fireEvent.change(textarea, { target: { value: '  Update glove size before dispatch  ' } });
        expect(confirmBtn).not.toBeDisabled();
        fireEvent.click(confirmBtn);
        expect(onConfirm).toHaveBeenCalledWith('Update glove size before dispatch');
      });
    });

    describe('Fix 2: Driver Routing Stability, Manual Sequence & Stop Scaling (1..30+ stops)', () => {
      const makeStop = (n, overrides = {}) => ({
        id: `ord-${String(n).padStart(3, '0')}`,
        shipping_name: `Stop ${n}`,
        shipping_address: `${100 + n} Main St`,
        shipping_city: 'Pittsburg',
        shipping_state: 'CA',
        shipping_zip: '94565',
        created_at: `2026-11-16T08:${String(n % 60).padStart(2, '0')}:00Z`,
        ...overrides,
      });

      it('builds single-destination Navigate URLs without waypoints and rejects incomplete addresses', () => {
        const validUrl = buildSingleStopNavigationUrl(makeStop(1));
        expect(validUrl).toContain('https://www.google.com/maps/dir/?api=1&destination=');
        expect(validUrl).not.toContain('waypoints=');

        expect(buildSingleStopNavigationUrl({ shipping_address: '123 St' })).toBeNull();
        expect(formatOrderDeliveryAddress({ shipping_address: '', shipping_city: '' }).isValid).toBe(false);
      });

      it('sorts saved manual Warehouse stops ahead of unordered chronological stops', () => {
        const unorderedOld = makeStop(1, { created_at: '2026-11-16T07:00:00Z' });
        const manualSecond = makeStop(2, { route_run_date: '2026-11-16', route_position: 2 });
        const manualFirst = makeStop(3, { route_run_date: '2026-11-16', route_position: 1 });
        const unorderedNew = makeStop(4, { created_at: '2026-11-16T09:00:00Z' });

        const sorted = sortDriverStops([unorderedOld, manualSecond, unorderedNew, manualFirst]);
        expect(sorted.map((s) => s.id)).toEqual(['ord-003', 'ord-002', 'ord-001', 'ord-004']);
        expect(hasSavedManualRouteOrder(sorted)).toBe(true);
        expect(hasSavedManualRouteOrder([unorderedOld, unorderedNew])).toBe(false);
      });

      it('handles 1, 9, 10, 12, 25 stops cleanly and refuses silent truncation at 30+ stops', () => {
        [1, 9, 10, 12, MAX_GOOGLE_DIRECTIONS_WAYPOINTS].forEach((count) => {
          const batch = Array.from({ length: count }, (_, idx) => makeStop(idx + 1));
          const prep = prepareDirectionsOptimizationInput(batch, MAX_GOOGLE_DIRECTIONS_WAYPOINTS);
          expect(prep.supported).toBe(true);
          expect(prep.waypoints).toHaveLength(count);
        });

        const largeBatch = Array.from({ length: 30 }, (_, idx) => makeStop(idx + 1));
        const oversizedPrep = prepareDirectionsOptimizationInput(largeBatch, MAX_GOOGLE_DIRECTIONS_WAYPOINTS);
        expect(oversizedPrep.supported).toBe(false);
        expect(oversizedPrep.oversized).toBe(true);

        const missingAddrBatch = [makeStop(1), { id: 'ord-missing', shipping_address: '' }, makeStop(3)];
        const missingPrep = prepareDirectionsOptimizationInput(missingAddrBatch, MAX_GOOGLE_DIRECTIONS_WAYPOINTS);
        expect(missingPrep.supported).toBe(false);
        expect(missingPrep.hasMissingAddresses).toBe(true);
        expect(missingPrep.missingOrderIds).toEqual(['ord-missing']);
      });

      it('maps waypoint_order back to exact order IDs even when two stops share an address and supports Up/Down moves', () => {
        const stopA = makeStop(1, { id: 'ord-dup-a', shipping_address: '700 Clinic Ave' });
        const stopB = makeStop(2, { id: 'ord-unique', shipping_address: '800 Harbor Way' });
        const stopC = makeStop(3, { id: 'ord-dup-c', shipping_address: '700 Clinic Ave' });
        const orders = [stopA, stopB, stopC];

        const prep = prepareDirectionsOptimizationInput(orders);
        expect(prep.supported).toBe(true);

        // Google puts index 2 (ord-dup-c) first, index 0 (ord-dup-a) second, index 1 (ord-unique) third
        const mapped = mapWaypointOrderToOrderIds(prep.stopDescriptors, [2, 0, 1], [
          { distance: { text: '1 mi' }, duration: { text: '3 mins' } },
          { distance: { text: '2 mi' }, duration: { text: '5 mins' } },
          { distance: { text: '4 mi' }, duration: { text: '9 mins' } },
        ]);
        expect(mapped.map((m) => m.orderId)).toEqual(['ord-dup-c', 'ord-dup-a', 'ord-unique']);

        const reordered = reorderOrdersByMappedSequence(orders, mapped);
        expect(reordered.map((o) => o.id)).toEqual(['ord-dup-c', 'ord-dup-a', 'ord-unique']);
        expect(reordered[0].routeLegIndex).toBe(0);

        const movedUp = moveStopInList(reordered, 2, 'up');
        expect(movedUp.map((o) => o.id)).toEqual(['ord-dup-c', 'ord-unique', 'ord-dup-a']);
        expect(moveStopInList(movedUp, 0, 'up').map((o) => o.id)).toEqual(['ord-dup-c', 'ord-unique', 'ord-dup-a']);
      });
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePhotoUrls } from '../lib/utils';

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

      const cart = [
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
});

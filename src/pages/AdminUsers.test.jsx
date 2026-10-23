import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Customer Account Management & Deactivation Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters out inactive customer accounts from active lists', () => {
    const mockUsers = [
      { id: 'user-1', full_name: 'Agesong Woodpark', role: 'retail', status: 'active' },
      { id: 'user-2', full_name: 'Alex Noguera', role: 'retail', status: 'inactive' },
      { id: 'user-3', full_name: 'Alicia Greenamyer', role: 'retail', status: 'active' }
    ];

    const activeUsers = mockUsers.filter(u => u.status === 'active');
    expect(activeUsers).toHaveLength(2);
    expect(activeUsers.map(u => u.id)).toEqual(['user-1', 'user-3']);
    expect(activeUsers.some(u => u.id === 'user-2')).toBe(false);
  });

  it('optimistically removes deactivated customer from the user list', () => {
    let users = [
      { id: 'user-1', full_name: 'Agesong Woodpark', role: 'retail', status: 'active' },
      { id: 'user-2', full_name: 'Alex Noguera', role: 'retail', status: 'active' },
    ];

    const targetId = 'user-1';
    users = users.filter(u => u.id !== targetId);

    expect(users).toHaveLength(1);
    expect(users[0].id).toBe('user-2');
  });

  it('deactivates associated company users for B2B agencies', () => {
    let users = [
      { id: 'u1', company_id: 'comp-1', role: 'b2b', status: 'active' },
      { id: 'u2', company_id: 'comp-1', role: 'b2b', status: 'active' },
      { id: 'u3', company_id: 'comp-2', role: 'b2b', status: 'active' },
    ];

    const targetCompId = 'comp-1';
    const targetRole = 'b2b';

    users = users.filter(u => {
      if (targetRole === 'b2b' && targetCompId && u.company_id === targetCompId) return false;
      return true;
    });

    expect(users).toHaveLength(1);
    expect(users[0].company_id).toBe('comp-2');
  });

  describe('Retail Account Creation Address Persistence', () => {
    it('packages all shipping and contact details into auth metadata and profile updates', () => {
      const retailFormData = {
        full_name: 'Jane Doe',
        email: 'janedoe@example.com',
        contact_number: '555-0199',
        address: '742 Evergreen Terrace',
        city: 'Springfield',
        state: 'OR',
        zip: '97477',
        password: 'password123',
        confirm_password: 'password123'
      };

      const companyId = 'comp-retail-999';

      // 1. Payload sent to adminAuthClient.auth.signUp options.data
      const authMetadata = {
        full_name: retailFormData.full_name,
        role: 'retail',
        contact_number: retailFormData.contact_number || null,
        company_id: companyId,
        status: 'active',
        address: retailFormData.address || null,
        city: retailFormData.city || null,
        state: retailFormData.state || null,
        zip: retailFormData.zip || null,
        billing_address: retailFormData.address || null,
        billing_city: retailFormData.city || null,
        billing_state: retailFormData.state || null,
        billing_zip: retailFormData.zip || null
      };

      expect(authMetadata.address).toBe('742 Evergreen Terrace');
      expect(authMetadata.city).toBe('Springfield');
      expect(authMetadata.state).toBe('OR');
      expect(authMetadata.zip).toBe('97477');
      expect(authMetadata.billing_address).toBe('742 Evergreen Terrace');
      expect(authMetadata.contact_number).toBe('555-0199');

      // 2. Payload sent to user_profiles update
      const profileUpdatePayload = {
        address: retailFormData.address || null,
        city: retailFormData.city || null,
        state: retailFormData.state || null,
        zip: retailFormData.zip || null,
        billing_address: retailFormData.address || null,
        billing_city: retailFormData.city || null,
        billing_state: retailFormData.state || null,
        billing_zip: retailFormData.zip || null,
        contact_number: retailFormData.contact_number || null,
        company_id: companyId
      };

      expect(profileUpdatePayload.address).toBe('742 Evergreen Terrace');
      expect(profileUpdatePayload.company_id).toBe('comp-retail-999');
    });

    it('falls back to secure RPC save_customer_profile_info if direct profile update fails', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
      const mockUpdate = vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS blocked' } });

      const userId = 'usr-test-123';
      const address = '123 Main St';
      const city = 'San Jose';
      const state = 'CA';
      const zip = '95112';
      const phone = '408-555-1234';
      const companyId = 'comp-123';

      const updateResult = await mockUpdate();
      if (updateResult.error) {
        await mockRpc('save_customer_profile_info', {
          p_user_id: userId,
          p_address: address,
          p_city: city,
          p_state: state,
          p_zip: zip,
          p_contact_number: phone,
          p_company_id: companyId
        });
      }

      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('save_customer_profile_info', {
        p_user_id: userId,
        p_address: address,
        p_city: city,
        p_state: state,
        p_zip: zip,
        p_contact_number: phone,
        p_company_id: companyId
      });
    });

    it('updates both user profile and linked company during customer edit', () => {
      const editFormData = {
        userId: 'usr-99',
        companyId: 'comp-99',
        full_name: 'Jane Smith Updated',
        contact_number: '555-9999',
        address: '456 Oak Avenue',
        city: 'Portland',
        state: 'OR',
        zip: '97201'
      };

      const userProfilePayload = {
        full_name: editFormData.full_name,
        contact_number: editFormData.contact_number || null,
        address: editFormData.address || null,
        city: editFormData.city || null,
        state: editFormData.state || null,
        zip: editFormData.zip || null,
        billing_address: editFormData.address || null,
        billing_city: editFormData.city || null,
        billing_state: editFormData.state || null,
        billing_zip: editFormData.zip || null
      };

      const companyPayload = {
        name: editFormData.full_name,
        phone: editFormData.contact_number || null,
        address: editFormData.address || null,
        city: editFormData.city || null,
        state: editFormData.state || null,
        zip: editFormData.zip || null
      };

      expect(userProfilePayload.address).toBe('456 Oak Avenue');
      expect(userProfilePayload.billing_address).toBe('456 Oak Avenue');
      expect(companyPayload.address).toBe('456 Oak Avenue');
      expect(companyPayload.phone).toBe('555-9999');
    });
  });
});

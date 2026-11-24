/**
 * Shared helpers for resolving the actual ordering customer (`orders.user_id`)
 * from `public.user_profiles`.
 *
 * Important schema invariant:
 * In PostgreSQL, `orders.assigned_driver_id` holds a foreign key to `public.user_profiles(id)`
 * (`orders_assigned_driver_id_fkey`), while `orders.user_id` references `auth.users(id)`.
 * Unqualified PostgREST embeds like `user_profiles (...)` on `orders` therefore join via
 * `assigned_driver_id` instead of `user_id` and surface the dispatched driver's profile on
 * Retail orders. Always omit unqualified `user_profiles(...)` embeds on `orders` queries and
 * attach customer profiles explicitly via `order.user_id`.
 */

export async function fetchCustomerProfilesMap(
  supabase,
  userIds,
  { includeRole = false } = {}
) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  if (uniqueIds.length === 0 || !supabase || typeof supabase.from !== 'function') {
    return new Map();
  }

  const columns = includeRole
    ? 'id, full_name, contact_number, email, role'
    : 'id, full_name, contact_number, email';

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(columns)
      .in('id', uniqueIds);

    if (error || !Array.isArray(data)) {
      return new Map();
    }

    return new Map(data.filter((row) => row?.id).map((row) => [row.id, row]));
  } catch {
    return new Map();
  }
}

export async function attachCustomerProfilesToOrders(supabase, orders, options = {}) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return orders || [];
  }

  const profileMap = await fetchCustomerProfilesMap(
    supabase,
    orders.map((order) => order?.user_id),
    options
  );

  return orders.map((order) => {
    if (!order?.user_id) return order;
    const customerProfile = profileMap.get(order.user_id) || null;
    if (!customerProfile) return order;
    return {
      ...order,
      customer_profile: customerProfile,
    };
  });
}

export async function attachCustomerProfilesToNestedOrderItems(supabase, rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows || [];
  }

  const profileMap = await fetchCustomerProfilesMap(
    supabase,
    rows.map((row) => row?.orders?.user_id),
    options
  );

  return rows.map((row) => {
    const order = row?.orders;
    if (!order?.user_id) return row;
    const customerProfile = profileMap.get(order.user_id) || null;
    if (!customerProfile) return row;
    return {
      ...row,
      orders: {
        ...order,
        customer_profile: customerProfile,
      },
    };
  });
}

/**
 * Resolve the customer profile attached to an order, rejecting any mismatched
 * driver profile object if an old `user_profiles` embed is present.
 */
export function getOrderCustomerProfile(order) {
  if (!order) return null;
  if (order.customer_profile) return order.customer_profile;

  const raw = Array.isArray(order.user_profiles)
    ? order.user_profiles[0]
    : order.user_profiles;

  if (!raw) return null;
  if (raw.id && order.user_id && raw.id !== order.user_id) return null;
  if (
    !raw.id &&
    order.assigned_driver_id &&
    order.assigned_driver_id !== order.user_id &&
    raw.role?.toLowerCase() === 'driver'
  ) {
    return null;
  }

  return raw;
}

export function resolveRetailCustomerName(order, fallbackProfile = null) {
  const customerProfile = getOrderCustomerProfile(order);
  const matchingFallback =
    fallbackProfile &&
    (!order?.user_id || !fallbackProfile.id || fallbackProfile.id === order.user_id)
      ? fallbackProfile
      : null;

  return (
    customerProfile?.full_name ||
    matchingFallback?.full_name ||
    order?.shipping_name ||
    order?.customer_name ||
    'Retail Customer'
  );
}

/**
 * Determine whether a user profile belongs to a B2B agency rather than a Retail
 * customer. Retail users may still have a `company_id` referencing an
 * `account_type = 'Retail'` row in `companies` for custom pricing/shipping rules.
 */
export function isProfileB2B(profile) {
  if (!profile) return false;

  const company = Array.isArray(profile.companies)
    ? profile.companies[0]
    : profile.companies;
  const accountType = company?.account_type?.trim?.().toLowerCase?.();

  if (accountType === 'b2b') return true;
  if (accountType === 'retail') return false;

  const role = profile.role?.trim?.().toLowerCase?.();
  if (role === 'b2b' || role === 'agency_admin') return true;
  if (role === 'retail' || role === 'user') return false;

  return Boolean(profile.company_id);
}

/**
 * Determine whether an order is a B2B Agency order vs. a Retail order.
 * Retail customer accounts can carry a `company_id` pointing to a `Retail`
 * row in `companies`, so `companies.account_type` and the customer's role take
 * precedence over raw `company_id` presence.
 */
export function isOrderB2B(order, fallbackProfile = null) {
  if (!order) return false;

  const company = Array.isArray(order.companies)
    ? order.companies[0]
    : order.companies;
  const accountType = company?.account_type?.trim?.().toLowerCase?.();

  if (accountType === 'b2b') return true;
  if (accountType === 'retail') return false;

  if (order.patient_id) return true;

  const customerProfile = getOrderCustomerProfile(order);
  const matchingFallback =
    fallbackProfile &&
    (!order.user_id || !fallbackProfile.id || fallbackProfile.id === order.user_id)
      ? fallbackProfile
      : null;

  const profileRole = (customerProfile?.role || matchingFallback?.role)
    ?.trim?.()
    .toLowerCase?.();

  if (profileRole === 'retail' || profileRole === 'user') return false;
  if (profileRole === 'b2b' || profileRole === 'agency_admin') return true;

  return Boolean(order.company_id || company?.name);
}

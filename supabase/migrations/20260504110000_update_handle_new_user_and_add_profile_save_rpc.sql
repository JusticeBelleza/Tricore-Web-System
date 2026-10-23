-- Migration: Ensure customer address and info is saved upon account creation

-- 1. Update handle_new_user() trigger to save address and all metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    full_name,
    role,
    status,
    contact_number,
    company_id,
    address,
    city,
    state,
    zip,
    billing_address,
    billing_city,
    billing_state,
    billing_zip
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'retail'),
    COALESCE(NEW.raw_user_meta_data->>'status', 'active'),
    COALESCE(NEW.raw_user_meta_data->>'contact_number', NEW.raw_user_meta_data->>'phone', NULL),
    CASE 
      WHEN NEW.raw_user_meta_data->>'company_id' IS NOT NULL AND NEW.raw_user_meta_data->>'company_id' ~ '^[0-9a-fA-F-]{36}$'
      THEN (NEW.raw_user_meta_data->>'company_id')::uuid
      ELSE NULL
    END,
    COALESCE(NEW.raw_user_meta_data->>'address', NULL),
    COALESCE(NEW.raw_user_meta_data->>'city', NULL),
    COALESCE(NEW.raw_user_meta_data->>'state', NULL),
    COALESCE(NEW.raw_user_meta_data->>'zip', NULL),
    COALESCE(NEW.raw_user_meta_data->>'billing_address', NEW.raw_user_meta_data->>'address', NULL),
    COALESCE(NEW.raw_user_meta_data->>'billing_city', NEW.raw_user_meta_data->>'city', NULL),
    COALESCE(NEW.raw_user_meta_data->>'billing_state', NEW.raw_user_meta_data->>'state', NULL),
    COALESCE(NEW.raw_user_meta_data->>'billing_zip', NEW.raw_user_meta_data->>'zip', NULL)
  )
  ON CONFLICT (id) DO UPDATE 
  SET 
    role = COALESCE(EXCLUDED.role, public.user_profiles.role, 'retail'),
    full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
    contact_number = COALESCE(EXCLUDED.contact_number, public.user_profiles.contact_number),
    company_id = COALESCE(EXCLUDED.company_id, public.user_profiles.company_id),
    address = COALESCE(EXCLUDED.address, public.user_profiles.address),
    city = COALESCE(EXCLUDED.city, public.user_profiles.city),
    state = COALESCE(EXCLUDED.state, public.user_profiles.state),
    zip = COALESCE(EXCLUDED.zip, public.user_profiles.zip),
    billing_address = COALESCE(EXCLUDED.billing_address, public.user_profiles.billing_address),
    billing_city = COALESCE(EXCLUDED.billing_city, public.user_profiles.billing_city),
    billing_state = COALESCE(EXCLUDED.billing_state, public.user_profiles.billing_state),
    billing_zip = COALESCE(EXCLUDED.billing_zip, public.user_profiles.billing_zip)
  WHERE public.user_profiles.id = EXCLUDED.id;
  
  RETURN NEW;
END;
$$;

-- 2. Dedicated RPC to reliably save all customer profile info (address, phone, company)
CREATE OR REPLACE FUNCTION public.save_customer_profile_info(
  p_user_id uuid,
  p_address text,
  p_city text,
  p_state text,
  p_zip text,
  p_contact_number text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_user_role() NOT IN ('admin', 'warehouse') AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Not authorized to update customer profile.';
  END IF;

  UPDATE public.user_profiles
  SET 
    address = COALESCE(p_address, address),
    city = COALESCE(p_city, city),
    state = COALESCE(p_state, state),
    zip = COALESCE(p_zip, zip),
    billing_address = COALESCE(billing_address, p_address, address),
    billing_city = COALESCE(billing_city, p_city, city),
    billing_state = COALESCE(billing_state, p_state, state),
    billing_zip = COALESCE(billing_zip, p_zip, zip),
    contact_number = COALESCE(p_contact_number, contact_number),
    company_id = COALESCE(p_company_id, company_id)
  WHERE id = p_user_id;

  -- Also update linked company if present
  IF p_company_id IS NOT NULL THEN
    UPDATE public.companies
    SET
      address = COALESCE(p_address, address),
      city = COALESCE(p_city, city),
      state = COALESCE(p_state, state),
      zip = COALESCE(p_zip, zip),
      phone = COALESCE(p_contact_number, phone)
    WHERE id = p_company_id;
  END IF;

  RETURN json_build_object('success', true, 'id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_customer_profile_info(uuid, text, text, text, text, text, uuid) TO authenticated;

-- 3. Backfill any existing retail customers whose profile address is missing but company address exists
UPDATE public.user_profiles u
SET 
  address = COALESCE(u.address, c.address),
  city = COALESCE(u.city, c.city),
  state = COALESCE(u.state, c.state),
  zip = COALESCE(u.zip, c.zip),
  billing_address = COALESCE(u.billing_address, c.address),
  billing_city = COALESCE(u.billing_city, c.city),
  billing_state = COALESCE(u.billing_state, c.state),
  billing_zip = COALESCE(u.billing_zip, c.zip),
  contact_number = COALESCE(u.contact_number, c.phone)
FROM public.companies c
WHERE u.company_id = c.id
  AND u.role IN ('retail', 'user')
  AND (u.address IS NULL OR u.address = '')
  AND c.address IS NOT NULL;

-- Migration: Allow warehouse staff to update user profiles and add secure deactivation RPC

-- 1. Grant execute on protect_secure_profile_columns to authenticated so triggers can run
GRANT EXECUTE ON FUNCTION "public"."protect_secure_profile_columns"() TO "authenticated";

-- 2. Update RLS policy to allow warehouse staff to update user profiles
DROP POLICY IF EXISTS "Update user profiles" ON "public"."user_profiles";

CREATE POLICY "Update user profiles" ON "public"."user_profiles"
FOR UPDATE TO "authenticated"
USING (
  ((id = (SELECT auth.uid() AS uid))
   OR (get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text]))
   OR ((get_user_role() = 'agency_admin'::text) AND (company_id = get_my_company_id())))
)
WITH CHECK (
  ((id = (SELECT auth.uid() AS uid))
   OR (get_user_role() = ANY (ARRAY['admin'::text, 'warehouse'::text]))
   OR ((get_user_role() = 'agency_admin'::text) AND (company_id = get_my_company_id())))
);

-- 3. Dedicated Security Definer RPC for deactivating customer / user accounts
CREATE OR REPLACE FUNCTION public.deactivate_user_account(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
BEGIN
  IF get_user_role() NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to deactivate accounts.';
  END IF;

  SELECT role, company_id INTO v_role, v_company_id
  FROM public.user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- Deactivate the target user
  UPDATE public.user_profiles
  SET status = 'inactive'
  WHERE id = p_user_id;

  -- If it's a B2B agency or has linked profiles under the company, also deactivate those profiles
  IF v_role = 'b2b' AND v_company_id IS NOT NULL THEN
    UPDATE public.user_profiles
    SET status = 'inactive'
    WHERE company_id = v_company_id;
  END IF;

  RETURN json_build_object('success', true, 'id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_user_account(uuid) TO authenticated;

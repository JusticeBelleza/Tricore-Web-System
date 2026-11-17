-- Finalize Strict RPC-Only Security Lockdown After PR #14 Frontend Is Live on Vercel
-- Purpose:
--   Removes the temporary legacy 8e9025f direct-table compatibility policies & trigger once
--   www.tricoremedicalsupply.com is verified serving updated PR #14 frontend (Checkout.jsx
--   calling place_customer_order and DriverRoutes.jsx calling driver_* RPCs).

DROP POLICY IF EXISTS "Legacy compat customer insert pending orders" ON public.orders;
DROP POLICY IF EXISTS "Legacy compat customer insert pending order items" ON public.order_items;
DROP POLICY IF EXISTS "Legacy compat driver update assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Legacy compat driver update assigned order items" ON public.order_items;
DROP POLICY IF EXISTS "Legacy compat driver insert rejected split items" ON public.order_items;

DROP TRIGGER IF EXISTS enforce_compat_order_item_security ON public.order_items;
DROP FUNCTION IF EXISTS public.enforce_compat_order_item_security();

CREATE OR REPLACE FUNCTION public.protect_secure_order_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(current_setting('app.allow_driver_order_rpc', true), '') = 'true'
     OR COALESCE(current_setting('app.allow_order_notes_write', true), '') = 'true'
     OR COALESCE(current_setting('app.allow_return_to_approval', true), '') = 'true'
     OR COALESCE(current_setting('app.allow_route_order_write', true), '') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT LOWER(COALESCE(role, '')) INTO v_actor_role
  FROM public.user_profiles
  WHERE id = v_uid;

  IF COALESCE(v_actor_role, '') IN ('admin', 'warehouse') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Direct updates on orders are restricted; use authorized delivery or order RPCs.';
END;
$$;

REVOKE ALL ON FUNCTION public.protect_secure_order_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_secure_order_columns() TO service_role;

-- Migration: Harden inventory/order/order_items RLS, table write privileges,
-- driver delivery RPC workflows, and backorder/restock inventory accounting.
-- Forward-only, additive-safe security & correctness fix verified against lnuiyrrqrgjcmqflgbbz.
-- Preserves all authorized Customer, B2B, Admin, Warehouse, and Driver workflows while closing
-- anonymous RPC execution, customer/driver direct inventory/order/item tampering, NULL role-check
-- bypasses, and split/backorder inventory double-deduction or double-restock bugs.

-- ============================================================================
-- 1. Defense-in-depth: remove direct anonymous SQL write/trigger privileges on tables
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
REVOKE REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;

-- ============================================================================
-- 2. Restrict inventory UPDATE RLS strictly to Admin and Warehouse staff
--    (Checkout deducts via process_order_item_inventory() SECURITY DEFINER trigger;
--     Driver full-order door rejection uses hardened reject_full_order() below.)
-- ============================================================================
DROP POLICY IF EXISTS "Everyone can update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Staff update inventory" ON public.inventory;

CREATE POLICY "Staff update inventory" ON public.inventory
FOR UPDATE TO authenticated
USING (COALESCE(public.get_user_role(), '') IN ('admin', 'warehouse'))
WITH CHECK (COALESCE(public.get_user_role(), '') IN ('admin', 'warehouse'));

-- ============================================================================
-- 3. Restrict direct table INSERT/UPDATE on public.orders & public.order_items
--    & add idempotency_key for atomic Checkout deduplication
--    - Customers place orders exclusively via atomic, server-priced
--      place_customer_order() SECURITY DEFINER RPC (below).
--    - Direct INSERT/UPDATE/DELETE on public.orders and public.order_items are
--      restricted strictly to Admin and Warehouse staff; direct non-staff
--      mutations on orders are additionally blocked by protect_secure_order_columns().
--    - Drivers perform all valid delivery transitions and POD quantity splits via
--      assignment-checked transactional SECURITY DEFINER RPCs below.
-- ============================================================================
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
ON public.orders (idempotency_key)
WHERE idempotency_key IS NOT NULL;

DROP POLICY IF EXISTS "Admins can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Insert orders" ON public.orders;

CREATE POLICY "Insert orders" ON public.orders
FOR INSERT TO authenticated
WITH CHECK (LOWER(COALESCE(public.get_user_role(), '')) IN ('admin', 'warehouse'));

DROP POLICY IF EXISTS "Update orders" ON public.orders;

CREATE POLICY "Update orders" ON public.orders
FOR UPDATE TO authenticated
USING (LOWER(COALESCE(public.get_user_role(), '')) IN ('admin', 'warehouse'))
WITH CHECK (LOWER(COALESCE(public.get_user_role(), '')) IN ('admin', 'warehouse'));

DROP POLICY IF EXISTS "Admins can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Insert order items" ON public.order_items;

CREATE POLICY "Insert order items" ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (LOWER(COALESCE(public.get_user_role(), '')) IN ('admin', 'warehouse'));

DROP POLICY IF EXISTS "Update order items" ON public.order_items;

CREATE POLICY "Update order items" ON public.order_items
FOR UPDATE TO authenticated
USING (LOWER(COALESCE(public.get_user_role(), '')) IN ('admin', 'warehouse'))
WITH CHECK (LOWER(COALESCE(public.get_user_role(), '')) IN ('admin', 'warehouse'));

DROP POLICY IF EXISTS "Delete order items" ON public.order_items;

CREATE POLICY "Delete order items" ON public.order_items
FOR DELETE TO authenticated
USING (LOWER(COALESCE(public.get_user_role(), '')) IN ('admin', 'warehouse'));

-- Column-level / direct-write guard trigger on public.orders:
-- blocks drivers and customers from directly altering payment, monetary, identity,
-- assignment, or delivery fields outside trusted SECURITY DEFINER RPCs.
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

DROP TRIGGER IF EXISTS enforce_order_column_security ON public.orders;
CREATE TRIGGER enforce_order_column_security
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.protect_secure_order_columns();

REVOKE ALL ON FUNCTION public.protect_secure_order_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_secure_order_columns() TO service_role;

-- ============================================================================
-- 4. Harden user_profiles column-protection trigger against non-staff elevation
--    (Preserves service_role/SQL Editor writes when auth.uid() IS NULL,
--     Admin full control, Warehouse company/deactivation operations in AdminUsers,
--     and self-service contact/address/GPS updates while locking role/company/status.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_secure_profile_columns()
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

  SELECT role INTO v_actor_role
  FROM public.user_profiles
  WHERE id = v_uid;

  IF COALESCE(v_actor_role, '') <> 'admin' THEN
    NEW.role := OLD.role;
    IF COALESCE(v_actor_role, '') <> 'warehouse' THEN
      NEW.company_id := OLD.company_id;
      NEW.status := OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_secure_profile_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_secure_profile_columns() TO service_role;

-- ============================================================================
-- 5. Fix NULL three-valued logic bypasses & revoke anon/PUBLIC on account RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.deactivate_user_account(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role text := COALESCE(public.get_user_role(), '');
  v_company_id uuid;
  v_role text;
BEGIN
  IF v_uid IS NULL OR v_actor_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to deactivate accounts.';
  END IF;

  SELECT role, company_id INTO v_role, v_company_id
  FROM public.user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  UPDATE public.user_profiles
  SET status = 'inactive'
  WHERE id = p_user_id;

  IF v_role = 'b2b' AND v_company_id IS NOT NULL THEN
    UPDATE public.user_profiles
    SET status = 'inactive'
    WHERE company_id = v_company_id;
  END IF;

  RETURN json_build_object('success', true, 'id', p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_user_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_user_account(uuid) TO authenticated, service_role;

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
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role text := COALESCE(public.get_user_role(), '');
  v_is_staff boolean := v_actor_role IN ('admin', 'warehouse');
BEGIN
  IF v_uid IS NULL OR (NOT v_is_staff AND v_uid IS DISTINCT FROM p_user_id) THEN
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
    company_id = CASE
      WHEN v_is_staff THEN COALESCE(p_company_id, company_id)
      ELSE company_id
    END
  WHERE id = p_user_id;

  IF v_is_staff AND p_company_id IS NOT NULL THEN
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

REVOKE ALL ON FUNCTION public.save_customer_profile_info(uuid, text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_customer_profile_info(uuid, text, text, text, text, text, uuid) TO authenticated, service_role;

-- ============================================================================
-- 5b. Atomic, Idempotent, Server-Priced Customer / B2B / Proxy Checkout RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.place_customer_order(
  p_idempotency_key uuid,
  p_target_user_id uuid DEFAULT NULL,
  p_target_company_id uuid DEFAULT NULL,
  p_patient_id uuid DEFAULT NULL,
  p_shipping_name text DEFAULT NULL,
  p_shipping_address text DEFAULT NULL,
  p_shipping_city text DEFAULT NULL,
  p_shipping_state text DEFAULT NULL,
  p_shipping_zip text DEFAULT NULL,
  p_shipping_email text DEFAULT NULL,
  p_shipping_phone text DEFAULT NULL,
  p_order_notes text DEFAULT NULL,
  p_payment_method text DEFAULT 'net_30',
  p_is_proxy boolean DEFAULT false,
  p_order_mode text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_caller_status text;
  v_caller_company_id uuid;
  v_is_staff boolean;
  v_effective_user_id uuid;
  v_effective_company_id uuid;
  v_is_b2b boolean;
  v_payment_method text;
  v_clean_notes text;
  v_existing_order public.orders%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_shipping_amount numeric := 10.00;
  v_tax_rate numeric := 0;
  v_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_total_amount numeric := 0;
  v_outstanding numeric := 0;
  v_elem jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_qty_text text;
  v_pv record;
  v_variant_retail numeric;
  v_unit_price numeric;
  v_line_total numeric;
  v_rule record;
  v_item_payload jsonb := '[]'::jsonb;
  v_created_order public.orders%ROWTYPE;
  v_zip5 text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required to place orders.';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Order idempotency key is required.';
  END IF;

  SELECT LOWER(COALESCE(role, '')), COALESCE(status, 'active'), company_id
  INTO v_caller_role, v_caller_status, v_caller_company_id
  FROM public.user_profiles
  WHERE id = v_uid;

  IF NOT FOUND OR v_caller_status <> 'active' THEN
    RAISE EXCEPTION 'Active user account required to place orders.';
  END IF;

  v_is_staff := v_caller_role IN ('admin', 'warehouse');

  IF NOT v_is_staff THEN
    IF v_caller_role NOT IN ('retail', 'user', 'b2b', 'agency_admin') THEN
      RAISE EXCEPTION 'Not authorized to submit customer checkout.';
    END IF;

    IF p_target_user_id IS NOT NULL AND p_target_user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Not authorized to place orders on behalf of another user.';
    END IF;

    IF p_target_company_id IS NOT NULL AND p_target_company_id IS DISTINCT FROM v_caller_company_id THEN
      RAISE EXCEPTION 'Not authorized to use another company pricing or credit account.';
    END IF;

    v_effective_user_id := v_uid;
    v_effective_company_id := v_caller_company_id;
    v_is_b2b := (v_effective_company_id IS NOT NULL);
  ELSE
    v_effective_user_id := p_target_user_id;
    v_effective_company_id := p_target_company_id;

    IF COALESCE(p_is_proxy, false) THEN
      IF COALESCE(LOWER(p_order_mode), 'retail') = 'b2b' THEN
        IF v_effective_company_id IS NULL THEN
          RAISE EXCEPTION 'Target agency company is required for B2B proxy checkout.';
        END IF;
        v_is_b2b := true;
      ELSE
        IF v_effective_user_id IS NULL THEN
          RAISE EXCEPTION 'Target customer user is required for retail proxy checkout.';
        END IF;
        v_is_b2b := false;
      END IF;
    ELSE
      IF v_effective_user_id IS NOT NULL AND v_effective_user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Non-proxy checkout must target the signed-in account.';
      END IF;
      v_effective_user_id := v_uid;
      v_effective_company_id := v_caller_company_id;
      v_is_b2b := (v_effective_company_id IS NOT NULL);
    END IF;
  END IF;

  IF v_effective_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE id = v_effective_user_id
  ) THEN
    RAISE EXCEPTION 'Target customer user profile not found.';
  END IF;

  IF v_effective_company_id IS NOT NULL THEN
    SELECT * INTO v_company
    FROM public.companies
    WHERE id = v_effective_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target company account not found.';
    END IF;
  END IF;

  IF p_patient_id IS NOT NULL THEN
    IF v_effective_company_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.agency_patients WHERE id = p_patient_id AND agency_id = v_effective_company_id
    ) THEN
      RAISE EXCEPTION 'Selected patient does not belong to the target agency.';
    END IF;
  END IF;

  -- Idempotency replay guard: safely return existing order if already committed
  SELECT * INTO v_existing_order
  FROM public.orders
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF NOT v_is_staff
       AND v_existing_order.user_id IS DISTINCT FROM v_uid
       AND (v_caller_company_id IS NULL OR v_existing_order.company_id IS DISTINCT FROM v_caller_company_id) THEN
      RAISE EXCEPTION 'Idempotency key conflict.';
    END IF;

    RETURN jsonb_build_object(
      'id', v_existing_order.id,
      'status', v_existing_order.status::text,
      'subtotal', v_existing_order.subtotal,
      'tax_amount', v_existing_order.tax_amount,
      'shipping_amount', v_existing_order.shipping_amount,
      'total_amount', v_existing_order.total_amount,
      'idempotent_replay', true
    );
  END IF;

  v_payment_method := LOWER(COALESCE(btrim(p_payment_method), 'net_30'));
  IF v_payment_method NOT IN ('net_30', 'cod') THEN
    RAISE EXCEPTION 'Invalid payment method "%".', p_payment_method;
  END IF;

  v_clean_notes := NULLIF(btrim(COALESCE(p_order_notes, '')), '');
  IF v_clean_notes IS NOT NULL AND char_length(v_clean_notes) > 1000 THEN
    RAISE EXCEPTION 'Order notes cannot exceed 1000 characters.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty.';
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR COALESCE(v_elem->>'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Invalid cart item payload.';
    END IF;

    v_variant_id := (v_elem->>'variant_id')::uuid;
    v_qty_text := v_elem->>'quantity';
    IF v_qty_text IS NULL OR v_qty_text !~ '^\d+$' OR v_qty_text::integer <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for variant %.', v_variant_id;
    END IF;
    v_qty := v_qty_text::integer;

    SELECT pv.id, pv.product_id, pv.price, COALESCE(pv.multiplier, 1) AS multiplier, p.retail_base_price
    INTO v_pv
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_variant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product variant % not found.', v_variant_id;
    END IF;

    v_variant_retail := CASE
      WHEN COALESCE(v_pv.price, 0) > 0 THEN v_pv.price
      ELSE COALESCE(v_pv.retail_base_price, 0) * GREATEST(COALESCE(v_pv.multiplier, 1), 1)
    END;

    v_unit_price := v_variant_retail;

    IF v_effective_company_id IS NOT NULL THEN
      SELECT rule_type::text AS rule_type, value
      INTO v_rule
      FROM public.pricing_rules
      WHERE company_id = v_effective_company_id
        AND variant_id = v_pv.id
      ORDER BY created_at DESC
      LIMIT 1;

      IF FOUND THEN
        IF v_rule.rule_type = 'percentage' THEN
          v_unit_price := v_variant_retail * (1.0 - (COALESCE(v_rule.value, 0) / 100.0));
        ELSIF v_rule.rule_type = 'fixed' THEN
          v_unit_price := COALESCE(v_rule.value, v_variant_retail);
        END IF;
      END IF;
    END IF;

    v_unit_price := ROUND(GREATEST(COALESCE(v_unit_price, 0), 0), 2);
    v_line_total := ROUND(v_unit_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line_total;

    v_item_payload := v_item_payload || jsonb_build_array(
      jsonb_build_object(
        'variant_id', v_pv.id,
        'quantity', v_qty,
        'multiplier', GREATEST(COALESCE(v_pv.multiplier, 1), 1),
        'unit_price', v_unit_price,
        'line_total', v_line_total
      )
    );
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);

  IF v_is_b2b THEN
    v_shipping_amount := ROUND(GREATEST(COALESCE(v_company.shipping_fee, 0), 0), 2);
  ELSE
    v_shipping_amount := 10.00;
  END IF;

  IF v_is_b2b AND COALESCE(v_company.tax_exempt, false) THEN
    v_tax_rate := 0;
  ELSE
    v_zip5 := LEFT(btrim(COALESCE(p_shipping_zip, '')), 5);
    IF char_length(v_zip5) = 5 THEN
      SELECT GREATEST(COALESCE("EstimatedCombinedRate", 0), 0)
      INTO v_tax_rate
      FROM public.tax_rates
      WHERE "ZipCode" = v_zip5
      LIMIT 1;
      v_tax_rate := COALESCE(v_tax_rate, 0);
    ELSE
      v_tax_rate := 0;
    END IF;
  END IF;

  v_tax_amount := ROUND(v_subtotal * v_tax_rate, 2);
  v_total_amount := ROUND(v_subtotal + v_shipping_amount + v_tax_amount, 2);

  IF v_is_b2b AND v_payment_method = 'net_30' THEN
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_outstanding
    FROM public.orders
    WHERE company_id = v_effective_company_id
      AND payment_status = 'unpaid'::public.payment_status;

    IF v_total_amount > (COALESCE(v_company.credit_limit, 0) - v_outstanding) THEN
      RAISE EXCEPTION 'Insufficient agency credit limit for Net 30 order.';
    END IF;
  END IF;

  PERFORM set_config('app.allow_customer_checkout_rpc', 'true', true);

  INSERT INTO public.orders (
    user_id,
    company_id,
    patient_id,
    shipping_name,
    shipping_address,
    shipping_city,
    shipping_state,
    shipping_zip,
    shipping_email,
    shipping_phone,
    order_notes,
    status,
    payment_method,
    payment_status,
    subtotal,
    tax_amount,
    shipping_amount,
    total_amount,
    idempotency_key
  ) VALUES (
    v_effective_user_id,
    v_effective_company_id,
    p_patient_id,
    NULLIF(btrim(COALESCE(p_shipping_name, '')), ''),
    NULLIF(btrim(COALESCE(p_shipping_address, '')), ''),
    NULLIF(btrim(COALESCE(p_shipping_city, '')), ''),
    NULLIF(btrim(COALESCE(p_shipping_state, '')), ''),
    NULLIF(btrim(COALESCE(p_shipping_zip, '')), ''),
    NULLIF(btrim(COALESCE(p_shipping_email, '')), ''),
    NULLIF(btrim(COALESCE(p_shipping_phone, '')), ''),
    v_clean_notes,
    'pending'::public.order_status,
    v_payment_method::public.payment_method,
    'unpaid'::public.payment_status,
    v_subtotal,
    v_tax_amount,
    v_shipping_amount,
    v_total_amount,
    p_idempotency_key
  )
  RETURNING * INTO v_created_order;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_item_payload)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_variant_id,
      quantity_variants,
      total_base_units,
      unit_price,
      line_total,
      status
    ) VALUES (
      v_created_order.id,
      (v_elem->>'variant_id')::uuid,
      (v_elem->>'quantity')::integer,
      (v_elem->>'quantity')::integer * (v_elem->>'multiplier')::integer,
      (v_elem->>'unit_price')::numeric,
      (v_elem->>'line_total')::numeric,
      'active'
    );
  END LOOP;

  PERFORM set_config('app.allow_customer_checkout_rpc', 'false', true);

  RETURN jsonb_build_object(
    'id', v_created_order.id,
    'status', v_created_order.status::text,
    'subtotal', v_subtotal,
    'tax_amount', v_tax_amount,
    'shipping_amount', v_shipping_amount,
    'total_amount', v_total_amount,
    'idempotent_replay', false
  );
EXCEPTION
  WHEN unique_violation THEN
    PERFORM set_config('app.allow_customer_checkout_rpc', 'false', true);
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND AND (
      v_is_staff
      OR v_existing_order.user_id = v_uid
      OR (v_caller_company_id IS NOT NULL AND v_existing_order.company_id = v_caller_company_id)
    ) THEN
      RETURN jsonb_build_object(
        'id', v_existing_order.id,
        'status', v_existing_order.status::text,
        'subtotal', v_existing_order.subtotal,
        'tax_amount', v_existing_order.tax_amount,
        'shipping_amount', v_existing_order.shipping_amount,
        'total_amount', v_existing_order.total_amount,
        'idempotent_replay', true
      );
    END IF;
    RAISE;
  WHEN OTHERS THEN
    PERFORM set_config('app.allow_customer_checkout_rpc', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.place_customer_order(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_customer_order(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, text, jsonb) TO authenticated, service_role;

-- ============================================================================
-- 6. Fix insert trigger backorder double-deduction + harden Staff order RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_order_item_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product_id UUID;
  v_multiplier INT;
BEGIN
  IF NEW.quantity_variants IS NULL OR NEW.quantity_variants <= 0 THEN
    RAISE EXCEPTION 'Order item quantity must be greater than 0.';
  END IF;

  IF NEW.unit_price IS NULL OR NEW.unit_price < 0 OR NEW.line_total IS NULL OR NEW.line_total < 0 THEN
    RAISE EXCEPTION 'Order item pricing cannot be negative or null.';
  END IF;

  SELECT product_id, COALESCE(multiplier, 1)
  INTO v_product_id, v_multiplier
  FROM public.product_variants
  WHERE id = NEW.product_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product variant not found.';
  END IF;

  NEW.total_base_units := NEW.quantity_variants * v_multiplier;

  -- Split inserts from trusted internal SECURITY DEFINER RPCs (split_order_item /
  -- driver_complete_delivery) inherit already-deducted stock from the parent line.
  IF COALESCE(current_setting('app.skip_item_inventory_deduct', true), '') = 'true'
     AND LOWER(COALESCE(NEW.status, '')) IN ('backordered', 'rejected') THEN
    PERFORM set_config('app.skip_item_inventory_deduct', 'false', true);
    RETURN NEW;
  END IF;

  -- Reject untrusted direct inserts trying to bypass stock deduction via status spoofing.
  IF LOWER(COALESCE(NEW.status, 'active')) IN ('backordered', 'rejected', 'cancelled', 'restocked', 'delivered') THEN
    RAISE EXCEPTION 'Direct insert with status "%" is not allowed.', NEW.status;
  END IF;

  UPDATE public.inventory
  SET base_units_on_hand = base_units_on_hand - NEW.total_base_units
  WHERE product_id = v_product_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_deduct_inventory_on_insert ON public.order_items;
CREATE TRIGGER trigger_deduct_inventory_on_insert
BEFORE INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.process_order_item_inventory();

REVOKE ALL ON FUNCTION public.process_order_item_inventory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_item_inventory() TO service_role;

CREATE OR REPLACE FUNCTION public.process_warehouse_restock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_order public.orders%ROWTYPE;
  v_item RECORD;
  v_product_id UUID;
  v_multiplier INT;
  v_restock_units INT;
  v_is_partial BOOLEAN;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to process warehouse restock.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.status::text = 'restocked' THEN
    RETURN;
  END IF;

  IF v_order.status::text NOT IN ('attempted', 'delivered_partial') THEN
    RAISE EXCEPTION 'Only attempted or partially delivered orders can be restocked.';
  END IF;

  v_is_partial := (v_order.status::text = 'delivered_partial');

  IF NOT v_is_partial AND COALESCE(v_order.is_restocked, false) THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT id, total_base_units, quantity_variants, product_variant_id, status
    FROM public.order_items
    WHERE order_id = p_order_id
      AND (
        (v_is_partial AND LOWER(COALESCE(status::text, '')) = 'rejected') OR
        (NOT v_is_partial AND LOWER(COALESCE(status::text, '')) NOT IN ('cancelled', 'restocked', 'delivered'))
      )
    ORDER BY id
    FOR UPDATE
  LOOP
    SELECT product_id, COALESCE(multiplier, 1)
    INTO v_product_id, v_multiplier
    FROM public.product_variants
    WHERE id = v_item.product_variant_id;

    v_restock_units := COALESCE(v_item.total_base_units, COALESCE(v_item.quantity_variants, 0) * COALESCE(v_multiplier, 1));

    UPDATE public.inventory
    SET base_units_on_hand = base_units_on_hand + COALESCE(v_restock_units, 0)
    WHERE product_id = v_product_id;

    UPDATE public.order_items
    SET status = 'restocked'
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.orders
  SET is_restocked = true,
      status = (CASE WHEN v_is_partial THEN 'delivered_partial' ELSE 'restocked' END)::order_status,
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_warehouse_restock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_warehouse_restock(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.substitute_order_item(
  p_item_id uuid,
  p_new_variant_id uuid,
  p_new_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_item_status text;
  v_old_qty integer;
  v_old_base_units integer;
  v_old_mult integer;
  v_old_prod_id uuid;
  v_new_mult integer;
  v_new_price numeric;
  v_new_prod_id uuid;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to substitute order items.';
  END IF;

  IF p_new_qty IS NULL OR p_new_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0.';
  END IF;

  SELECT oi.status, oi.quantity_variants, oi.total_base_units, COALESCE(pv.multiplier, 1), pv.product_id
  INTO v_item_status, v_old_qty, v_old_base_units, v_old_mult, v_old_prod_id
  FROM public.order_items oi
  JOIN public.product_variants pv ON pv.id = oi.product_variant_id
  WHERE oi.id = p_item_id
  FOR UPDATE OF oi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found.';
  END IF;

  IF LOWER(COALESCE(v_item_status, 'active')) IN ('cancelled', 'rejected', 'restocked', 'delivered') THEN
    RAISE EXCEPTION 'Cannot substitute a cancelled, rejected, restocked, or delivered item.';
  END IF;

  SELECT COALESCE(pv.multiplier, 1),
         CASE
           WHEN COALESCE(pv.price, 0) > 0 THEN pv.price
           ELSE COALESCE(p.retail_base_price, 0) * GREATEST(COALESCE(pv.multiplier, 1), 1)
         END,
         pv.product_id
  INTO v_new_mult, v_new_price, v_new_prod_id
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = p_new_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement variant not found.';
  END IF;

  UPDATE public.inventory
  SET base_units_on_hand = base_units_on_hand + COALESCE(v_old_base_units, v_old_qty * v_old_mult)
  WHERE product_id = v_old_prod_id;

  UPDATE public.inventory
  SET base_units_on_hand = base_units_on_hand - (p_new_qty * v_new_mult)
  WHERE product_id = v_new_prod_id;

  UPDATE public.order_items
  SET product_variant_id = p_new_variant_id,
      quantity_variants = p_new_qty,
      total_base_units = p_new_qty * v_new_mult,
      unit_price = v_new_price,
      line_total = p_new_qty * v_new_price
  WHERE id = p_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.substitute_order_item(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.substitute_order_item(uuid, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.edit_order_item(p_item_id uuid, p_new_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_item_status text;
  v_old_qty integer;
  v_multiplier integer;
  v_diff_base integer;
  v_product_id uuid;
  v_unit_price numeric;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to edit order items.';
  END IF;

  IF p_new_qty IS NULL OR p_new_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0.';
  END IF;

  SELECT oi.status, oi.quantity_variants, oi.unit_price, COALESCE(pv.multiplier, 1), pv.product_id
  INTO v_item_status, v_old_qty, v_unit_price, v_multiplier, v_product_id
  FROM public.order_items oi
  JOIN public.product_variants pv ON pv.id = oi.product_variant_id
  WHERE oi.id = p_item_id
  FOR UPDATE OF oi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found.';
  END IF;

  IF LOWER(COALESCE(v_item_status, 'active')) IN ('cancelled', 'rejected', 'restocked', 'delivered') THEN
    RAISE EXCEPTION 'Cannot edit a cancelled, rejected, restocked, or delivered order item.';
  END IF;

  v_diff_base := (p_new_qty - v_old_qty) * v_multiplier;

  UPDATE public.order_items
  SET quantity_variants = p_new_qty,
      total_base_units = p_new_qty * v_multiplier,
      line_total = p_new_qty * v_unit_price
  WHERE id = p_item_id;

  UPDATE public.inventory
  SET base_units_on_hand = base_units_on_hand - v_diff_base
  WHERE product_id = v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.edit_order_item(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_order_item(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_order_item(
  p_order_id uuid,
  p_variant_id uuid,
  p_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_order_status text;
  v_existing_item_id UUID;
  v_unit_price NUMERIC;
  v_product_id UUID;
  v_multiplier INTEGER;
  v_old_subtotal NUMERIC;
  v_old_tax NUMERIC;
  v_shipping NUMERIC;
  v_new_subtotal NUMERIC;
  v_tax_rate NUMERIC;
  v_new_tax NUMERIC;
  v_current_qty INTEGER;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to add order items.';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0.';
  END IF;

  SELECT status::text INTO v_order_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order_status IN ('cancelled', 'restocked') THEN
    RAISE EXCEPTION 'Cannot add items to a cancelled or restocked order.';
  END IF;

  SELECT id, quantity_variants INTO v_existing_item_id, v_current_qty
  FROM public.order_items
  WHERE order_id = p_order_id
    AND product_variant_id = p_variant_id
    AND LOWER(COALESCE(status, 'active')) IN ('active', 'allocated')
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  IF v_existing_item_id IS NOT NULL THEN
    PERFORM public.edit_order_item(v_existing_item_id, v_current_qty + p_qty);
    RETURN;
  END IF;

  SELECT CASE
           WHEN COALESCE(pv.price, 0) > 0 THEN pv.price
           ELSE COALESCE(p.retail_base_price, 0) * GREATEST(COALESCE(pv.multiplier, 1), 1)
         END,
         pv.product_id,
         COALESCE(pv.multiplier, 1)
  INTO v_unit_price, v_product_id, v_multiplier
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = p_variant_id;

  IF v_unit_price IS NULL THEN
    RAISE EXCEPTION 'Variant not found.';
  END IF;

  INSERT INTO public.order_items (
    order_id, product_variant_id, quantity_variants, total_base_units, unit_price, line_total, status
  ) VALUES (
    p_order_id, p_variant_id, p_qty, p_qty * v_multiplier, v_unit_price, p_qty * v_unit_price, 'active'
  );

  SELECT subtotal, tax_amount, shipping_amount
  INTO v_old_subtotal, v_old_tax, v_shipping
  FROM public.orders
  WHERE id = p_order_id;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_new_subtotal
  FROM public.order_items
  WHERE order_id = p_order_id
    AND LOWER(COALESCE(status, 'active')) NOT IN ('cancelled', 'rejected', 'restocked');

  IF COALESCE(v_old_subtotal, 0) > 0 THEN
    v_tax_rate := COALESCE(v_old_tax, 0) / v_old_subtotal;
  ELSE
    v_tax_rate := 0;
  END IF;
  v_new_tax := ROUND(v_new_subtotal * v_tax_rate, 2);

  UPDATE public.orders
  SET subtotal = v_new_subtotal,
      tax_amount = v_new_tax,
      total_amount = v_new_subtotal + COALESCE(v_shipping, 0) + v_new_tax,
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_order_item(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_order_item(uuid, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_order_item(
  p_item_id uuid,
  p_reason text,
  p_restock_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_product_id UUID;
  v_saved_base_units INT;
  v_qty_variants INT;
  v_multiplier INT;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to cancel order items.';
  END IF;

  SELECT oi.status, oi.total_base_units, oi.quantity_variants, COALESCE(pv.multiplier, 1), pv.product_id
  INTO v_status, v_saved_base_units, v_qty_variants, v_multiplier, v_product_id
  FROM public.order_items oi
  JOIN public.product_variants pv ON pv.id = oi.product_variant_id
  WHERE oi.id = p_item_id
  FOR UPDATE OF oi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found.';
  END IF;

  IF LOWER(COALESCE(v_status, '')) IN ('cancelled', 'restocked') THEN
    RETURN;
  END IF;

  IF LOWER(COALESCE(v_status, '')) = 'delivered' THEN
    RAISE EXCEPTION 'Cannot cancel an already delivered order item.';
  END IF;

  IF LOWER(COALESCE(v_status, '')) = 'rejected' THEN
    RAISE EXCEPTION 'Rejected items must be restocked through warehouse returns.';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled', cancellation_reason = p_reason
  WHERE id = p_item_id;

  UPDATE public.inventory
  SET base_units_on_hand = base_units_on_hand + COALESCE(v_saved_base_units, COALESCE(v_qty_variants, 0) * v_multiplier)
  WHERE product_id = v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order_item(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_item(uuid, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.split_order_item(p_item_id uuid, p_pack_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_original_qty INT;
  v_backorder_qty INT;
  v_item public.order_items%ROWTYPE;
  v_order_status text;
  v_base_unit_multiplier INT;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to split order items.';
  END IF;

  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  SELECT status::text INTO v_order_status
  FROM public.orders
  WHERE id = v_item.order_id
  FOR UPDATE;

  IF v_order_status IN ('cancelled', 'restocked') THEN
    RAISE EXCEPTION 'Cannot split items on a cancelled or restocked order.';
  END IF;

  IF LOWER(COALESCE(v_item.status, 'active')) IN (
    'backordered', 'cancelled', 'rejected', 'restocked', 'delivered', 'shipped', 'out_for_delivery'
  ) THEN
    RAISE EXCEPTION 'Cannot split order item in status "%".', v_item.status;
  END IF;

  v_original_qty := v_item.quantity_variants;
  v_backorder_qty := v_original_qty - p_pack_qty;

  IF p_pack_qty IS NULL OR p_pack_qty <= 0 OR v_backorder_qty <= 0 THEN
    RAISE EXCEPTION 'Invalid split quantities. Pack qty must be greater than 0 and less than original qty.';
  END IF;

  SELECT COALESCE(multiplier, 1)
  INTO v_base_unit_multiplier
  FROM public.product_variants
  WHERE id = v_item.product_variant_id;

  v_base_unit_multiplier := COALESCE(v_base_unit_multiplier, 1);

  UPDATE public.order_items
  SET quantity_variants = p_pack_qty,
      total_base_units = p_pack_qty * v_base_unit_multiplier,
      line_total = ROUND(p_pack_qty * v_item.unit_price, 2)
  WHERE id = p_item_id;

  -- Skip deduction in BEFORE INSERT trigger: all v_original_qty * multiplier base units
  -- were already deducted once when the original order line was inserted.
  PERFORM set_config('app.skip_item_inventory_deduct', 'true', true);

  INSERT INTO public.order_items (
    order_id,
    product_variant_id,
    quantity_variants,
    status,
    unit_price,
    total_base_units,
    line_total
  ) VALUES (
    v_item.order_id,
    v_item.product_variant_id,
    v_backorder_qty,
    'BACKORDERED',
    v_item.unit_price,
    v_backorder_qty * v_base_unit_multiplier,
    ROUND(v_backorder_qty * v_item.unit_price, 2)
  );

  PERFORM set_config('app.skip_item_inventory_deduct', 'false', true);
END;
$$;

REVOKE ALL ON FUNCTION public.split_order_item(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_order_item(uuid, integer) TO authenticated, service_role;

-- ============================================================================
-- 7. Harden reject_full_order & add assignment-checked Driver Delivery RPCs
--    (All Driver state changes run in locked SECURITY DEFINER transactions
--     so Drivers never hold raw table UPDATE/INSERT permissions on order_items
--     or unrestricted column access on orders.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reject_full_order(
  p_order_id uuid,
  p_reason text,
  p_target_status text DEFAULT 'cancelled'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_order public.orders%ROWTYPE;
  v_driver_name text;
  v_driver_status text;
  v_item RECORD;
  v_product_id UUID;
  v_multiplier INT;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse', 'driver') THEN
    RAISE EXCEPTION 'Not authorized to reject orders.';
  END IF;

  IF COALESCE(p_target_status, 'cancelled') NOT IN ('cancelled', 'restocked') THEN
    RAISE EXCEPTION 'Invalid target status "%".', p_target_status;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.status::text IN ('cancelled', 'restocked') THEN
    RETURN;
  END IF;

  IF v_role = 'driver' THEN
    SELECT full_name, COALESCE(status, 'active')
    INTO v_driver_name, v_driver_status
    FROM public.user_profiles
    WHERE id = v_uid;

    IF COALESCE(v_driver_status, 'inactive') <> 'active' THEN
      RAISE EXCEPTION 'Inactive driver accounts cannot reject deliveries.';
    END IF;

    IF v_order.status::text NOT IN ('ready_for_delivery', 'shipped', 'out_for_delivery') THEN
      RAISE EXCEPTION 'Drivers can only reject orders that are ready for delivery or in transit.';
    END IF;

    IF NOT (
      v_order.assigned_driver_id = v_uid
      OR (
        v_order.assigned_driver_id IS NULL
        AND NULLIF(btrim(v_driver_name), '') IS NOT NULL
        AND v_order.driver_name IS NOT NULL
        AND v_order.driver_name ILIKE btrim(v_driver_name) || '%'
      )
    ) THEN
      RAISE EXCEPTION 'Not authorized to reject an order not assigned to you.';
    END IF;
  END IF;

  FOR v_item IN
    SELECT id, total_base_units, quantity_variants, product_variant_id
    FROM public.order_items
    WHERE order_id = p_order_id
      AND LOWER(COALESCE(status::text, 'active')) NOT IN ('cancelled', 'rejected', 'restocked', 'delivered')
    ORDER BY id
    FOR UPDATE
  LOOP
    SELECT product_id, COALESCE(multiplier, 1)
    INTO v_product_id, v_multiplier
    FROM public.product_variants
    WHERE id = v_item.product_variant_id;

    UPDATE public.inventory
    SET base_units_on_hand = base_units_on_hand + COALESCE(v_item.total_base_units, COALESCE(v_item.quantity_variants, 0) * COALESCE(v_multiplier, 1))
    WHERE product_id = v_product_id;

    UPDATE public.order_items
    SET status = p_target_status,
        cancellation_reason = p_reason
    WHERE id = v_item.id;
  END LOOP;

  PERFORM set_config('app.allow_driver_order_rpc', 'true', true);

  UPDATE public.orders
  SET status = p_target_status::order_status,
      cancellation_reason = p_reason,
      is_restocked = (p_target_status = 'restocked'),
      updated_at = NOW()
  WHERE id = p_order_id;

  PERFORM set_config('app.allow_driver_order_rpc', 'false', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_full_order(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_full_order(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.driver_start_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := LOWER(COALESCE(public.get_user_role(), ''));
  v_order public.orders%ROWTYPE;
  v_driver_name text;
  v_driver_status text;
  v_is_backorder boolean;
  v_shipped_count integer := 0;
  v_out_count integer := 0;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse', 'driver') THEN
    RAISE EXCEPTION 'Not authorized to start deliveries.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_role = 'driver' THEN
    SELECT full_name, COALESCE(status, 'active')
    INTO v_driver_name, v_driver_status
    FROM public.user_profiles
    WHERE id = v_uid;

    IF COALESCE(v_driver_status, 'inactive') <> 'active' THEN
      RAISE EXCEPTION 'Inactive driver accounts cannot start deliveries.';
    END IF;

    IF NOT (
      v_order.assigned_driver_id = v_uid
      OR (
        v_order.assigned_driver_id IS NULL
        AND NULLIF(btrim(v_driver_name), '') IS NOT NULL
        AND v_order.driver_name IS NOT NULL
        AND v_order.driver_name ILIKE btrim(v_driver_name) || '%'
      )
    ) THEN
      RAISE EXCEPTION 'Not authorized to start delivery for an order not assigned to you.';
    END IF;
  END IF;

  v_is_backorder := v_order.status::text IN ('delivered_partial', 'delivered');

  PERFORM set_config('app.allow_driver_order_rpc', 'true', true);

  IF v_is_backorder THEN
    PERFORM id FROM public.order_items WHERE order_id = p_order_id FOR UPDATE;

    SELECT
      COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) = 'SHIPPED'),
      COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) = 'OUT_FOR_DELIVERY')
    INTO v_shipped_count, v_out_count
    FROM public.order_items
    WHERE order_id = p_order_id;

    IF v_shipped_count = 0 AND v_out_count = 0 THEN
      PERFORM set_config('app.allow_driver_order_rpc', 'false', true);
      RAISE EXCEPTION 'Order has no shipped backorder items to start delivery.';
    END IF;

    UPDATE public.order_items
    SET status = 'OUT_FOR_DELIVERY'
    WHERE order_id = p_order_id
      AND UPPER(COALESCE(status, '')) = 'SHIPPED';

    UPDATE public.orders
    SET updated_at = NOW()
    WHERE id = p_order_id;

    PERFORM set_config('app.allow_driver_order_rpc', 'false', true);
    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'status', v_order.status::text,
      'is_backorder_run', true
    );
  END IF;

  IF v_order.status::text = 'out_for_delivery' THEN
    PERFORM set_config('app.allow_driver_order_rpc', 'false', true);
    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'status', 'out_for_delivery',
      'is_backorder_run', false,
      'already_started', true
    );
  END IF;

  IF v_order.status::text NOT IN ('ready_for_delivery', 'shipped') THEN
    PERFORM set_config('app.allow_driver_order_rpc', 'false', true);
    RAISE EXCEPTION 'Order in status "%" cannot be started for delivery.', v_order.status::text;
  END IF;

  UPDATE public.orders
  SET status = 'out_for_delivery'::order_status,
      updated_at = NOW()
  WHERE id = p_order_id;

  PERFORM set_config('app.allow_driver_order_rpc', 'false', true);
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'out_for_delivery',
    'is_backorder_run', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.driver_start_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_start_delivery(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.driver_complete_delivery(
  p_order_id uuid,
  p_delivered_items jsonb,
  p_received_by text DEFAULT NULL,
  p_signature_url text DEFAULT NULL,
  p_photo_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := LOWER(COALESCE(public.get_user_role(), ''));
  v_order public.orders%ROWTYPE;
  v_driver_name text;
  v_driver_status text;
  v_is_backorder boolean;
  v_active_ids uuid[];
  v_elem jsonb;
  v_elem_item_id uuid;
  v_qty_text text;
  v_del_qty integer;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_qty_map jsonb := '{}'::jsonb;
  v_item record;
  v_multiplier integer;
  v_unit_price numeric;
  v_rej_qty integer;
  v_total_delivered_qty integer := 0;
  v_total_original_qty integer := 0;
  v_rejected_subtotal numeric := 0;
  v_orig_sub numeric;
  v_tax_rate numeric;
  v_final_subtotal numeric;
  v_final_tax numeric;
  v_final_total numeric;
  v_final_status text;
  v_cancellation_reason text;
  v_still_has_backorders boolean := false;
  v_is_total_rejection boolean;
  v_is_partial_rejection boolean;
  v_had_rejections boolean := false;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse', 'driver') THEN
    RAISE EXCEPTION 'Not authorized to complete deliveries.';
  END IF;

  IF p_delivered_items IS NULL OR jsonb_typeof(p_delivered_items) <> 'array' THEN
    RAISE EXCEPTION 'Delivered items list must be a JSON array.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_role = 'driver' THEN
    SELECT full_name, COALESCE(status, 'active')
    INTO v_driver_name, v_driver_status
    FROM public.user_profiles
    WHERE id = v_uid;

    IF COALESCE(v_driver_status, 'inactive') <> 'active' THEN
      RAISE EXCEPTION 'Inactive driver accounts cannot complete deliveries.';
    END IF;

    IF NOT (
      v_order.assigned_driver_id = v_uid
      OR (
        v_order.assigned_driver_id IS NULL
        AND NULLIF(btrim(v_driver_name), '') IS NOT NULL
        AND v_order.driver_name IS NOT NULL
        AND v_order.driver_name ILIKE btrim(v_driver_name) || '%'
      )
    ) THEN
      RAISE EXCEPTION 'Not authorized to complete delivery for an order not assigned to you.';
    END IF;
  END IF;

  IF v_order.status::text NOT IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered_partial', 'delivered') THEN
    RAISE EXCEPTION 'Order in status "%" cannot be completed for delivery.', v_order.status::text;
  END IF;

  v_is_backorder := v_order.status::text IN ('delivered_partial', 'delivered');

  -- Lock all rows on this order deterministically before evaluating active items
  PERFORM id FROM public.order_items WHERE order_id = p_order_id ORDER BY id FOR UPDATE;

  IF v_is_backorder THEN
    SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
    INTO v_active_ids
    FROM public.order_items
    WHERE order_id = p_order_id
      AND UPPER(COALESCE(status, '')) IN ('SHIPPED', 'OUT_FOR_DELIVERY');
  ELSE
    SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
    INTO v_active_ids
    FROM public.order_items
    WHERE order_id = p_order_id
      AND LOWER(COALESCE(status, 'active')) NOT IN ('backordered', 'cancelled', 'rejected', 'restocked', 'delivered');
  END IF;

  IF COALESCE(array_length(v_active_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'This delivery has already been completed or has no active items.';
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_delivered_items)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR COALESCE(v_elem->>'item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Invalid delivered item payload entry.';
    END IF;

    v_elem_item_id := (v_elem->>'item_id')::uuid;
    IF NOT (v_elem_item_id = ANY (v_active_ids)) THEN
      RAISE EXCEPTION 'Item % is not an active delivery item for order %.', v_elem_item_id, p_order_id;
    END IF;

    IF v_elem_item_id = ANY (v_seen_ids) THEN
      RAISE EXCEPTION 'Duplicate item_id % in delivery payload.', v_elem_item_id;
    END IF;

    v_qty_text := v_elem->>'delivered_qty';
    IF v_qty_text IS NULL OR v_qty_text !~ '^\d+$' THEN
      RAISE EXCEPTION 'Invalid delivered quantity for item %.', v_elem_item_id;
    END IF;

    v_seen_ids := array_append(v_seen_ids, v_elem_item_id);
    v_qty_map := jsonb_set(v_qty_map, ARRAY[v_elem_item_id::text], to_jsonb(v_qty_text::integer));
  END LOOP;

  IF array_length(v_seen_ids, 1) IS DISTINCT FROM array_length(v_active_ids, 1) THEN
    RAISE EXCEPTION 'All active delivery items must be included in delivery completion.';
  END IF;

  PERFORM set_config('app.allow_driver_order_rpc', 'true', true);

  FOR v_item IN
    SELECT oi.*, COALESCE(pv.multiplier, 1) AS variant_multiplier
    FROM public.order_items oi
    JOIN public.product_variants pv ON pv.id = oi.product_variant_id
    WHERE oi.id = ANY (v_active_ids)
    ORDER BY oi.id
  LOOP
    v_del_qty := (v_qty_map->>v_item.id::text)::integer;
    IF v_del_qty < 0 OR v_del_qty > v_item.quantity_variants THEN
      PERFORM set_config('app.allow_driver_order_rpc', 'false', true);
      RAISE EXCEPTION 'Delivered quantity % out of range [0..%] for item %.', v_del_qty, v_item.quantity_variants, v_item.id;
    END IF;

    v_multiplier := COALESCE(v_item.variant_multiplier, 1);
    v_unit_price := COALESCE(
      v_item.unit_price,
      CASE WHEN v_item.quantity_variants > 0 THEN v_item.line_total / v_item.quantity_variants ELSE 0 END
    );
    v_rej_qty := v_item.quantity_variants - v_del_qty;

    v_total_original_qty := v_total_original_qty + v_item.quantity_variants;
    v_total_delivered_qty := v_total_delivered_qty + v_del_qty;

    IF v_rej_qty = v_item.quantity_variants THEN
      v_rejected_subtotal := v_rejected_subtotal + (v_item.quantity_variants * v_unit_price);
      v_had_rejections := true;
      UPDATE public.order_items
      SET status = 'rejected'
      WHERE id = v_item.id;
    ELSIF v_rej_qty > 0 THEN
      v_rejected_subtotal := v_rejected_subtotal + (v_rej_qty * v_unit_price);
      v_had_rejections := true;

      UPDATE public.order_items
      SET quantity_variants = v_del_qty,
          line_total = ROUND(v_del_qty * v_unit_price, 2),
          total_base_units = v_del_qty * v_multiplier,
          status = 'DELIVERED'
      WHERE id = v_item.id;

      PERFORM set_config('app.skip_item_inventory_deduct', 'true', true);

      INSERT INTO public.order_items (
        order_id,
        product_variant_id,
        quantity_variants,
        status,
        unit_price,
        total_base_units,
        line_total
      ) VALUES (
        p_order_id,
        v_item.product_variant_id,
        v_rej_qty,
        'rejected',
        v_unit_price,
        v_rej_qty * v_multiplier,
        ROUND(v_rej_qty * v_unit_price, 2)
      );

      PERFORM set_config('app.skip_item_inventory_deduct', 'false', true);
    ELSE
      UPDATE public.order_items
      SET status = 'DELIVERED'
      WHERE id = v_item.id;
    END IF;
  END LOOP;

  v_is_total_rejection := (v_total_delivered_qty = 0);
  v_is_partial_rejection := (v_total_delivered_qty > 0 AND v_total_delivered_qty < v_total_original_qty);

  v_orig_sub := COALESCE(v_order.subtotal, 0);
  v_tax_rate := CASE WHEN v_orig_sub > 0 THEN COALESCE(v_order.tax_amount, 0) / v_orig_sub ELSE 0 END;

  IF v_is_total_rejection AND NOT v_is_backorder THEN
    v_final_status := 'attempted';
    v_cancellation_reason := 'Customer rejected all items at the door.';
    v_final_subtotal := v_order.subtotal;
    v_final_tax := v_order.tax_amount;
    v_final_total := v_order.total_amount;
  ELSIF v_is_total_rejection AND v_is_backorder THEN
    v_final_status := 'delivered_partial';
    v_cancellation_reason := 'Customer rejected the backordered items at the door.';
    v_final_subtotal := GREATEST(0, ROUND(v_orig_sub - v_rejected_subtotal, 2));
    v_final_tax := ROUND(v_final_subtotal * v_tax_rate, 2);
    v_final_total := v_final_subtotal + COALESCE(v_order.shipping_amount, 0) + v_final_tax;
  ELSIF v_is_partial_rejection THEN
    v_final_status := 'delivered_partial';
    v_cancellation_reason := 'Customer rejected some items at the door.';
    v_final_subtotal := GREATEST(0, ROUND(v_orig_sub - v_rejected_subtotal, 2));
    v_final_tax := ROUND(v_final_subtotal * v_tax_rate, 2);
    v_final_total := v_final_subtotal + COALESCE(v_order.shipping_amount, 0) + v_final_tax;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.order_items
      WHERE order_id = p_order_id
        AND LOWER(COALESCE(status, '')) IN ('backordered', 'allocated', 'ready_to_pack', 'shipped', 'out_for_delivery')
    ) INTO v_still_has_backorders;

    v_final_status := CASE WHEN v_still_has_backorders THEN 'delivered_partial' ELSE 'delivered' END;
    v_cancellation_reason := v_order.cancellation_reason;
    v_final_subtotal := v_order.subtotal;
    v_final_tax := v_order.tax_amount;
    v_final_total := v_order.total_amount;
  END IF;

  UPDATE public.orders
  SET status = v_final_status::order_status,
      subtotal = v_final_subtotal,
      tax_amount = v_final_tax,
      total_amount = v_final_total,
      photo_url = COALESCE(NULLIF(btrim(COALESCE(p_photo_url, '')), ''), photo_url),
      signature_url = COALESCE(NULLIF(btrim(COALESCE(p_signature_url, '')), ''), signature_url),
      received_by = COALESCE(NULLIF(btrim(COALESCE(p_received_by, '')), ''), received_by),
      cancellation_reason = v_cancellation_reason,
      is_restocked = CASE WHEN v_had_rejections THEN false ELSE is_restocked END,
      delivered_at = CASE
        WHEN v_final_status IN ('delivered', 'delivered_partial') THEN COALESCE(delivered_at, NOW()::timestamp)
        ELSE delivered_at
      END,
      updated_at = NOW()
  WHERE id = p_order_id;

  PERFORM set_config('app.allow_driver_order_rpc', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', v_final_status,
    'is_total_rejection', v_is_total_rejection,
    'subtotal', v_final_subtotal,
    'tax_amount', v_final_tax,
    'total_amount', v_final_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.driver_complete_delivery(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_complete_delivery(uuid, jsonb, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.driver_mark_attempted(
  p_order_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := LOWER(COALESCE(public.get_user_role(), ''));
  v_order public.orders%ROWTYPE;
  v_driver_name text;
  v_driver_status text;
  v_clean_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_is_backorder boolean;
  v_updated_count integer := 0;
  v_next_status text;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse', 'driver') THEN
    RAISE EXCEPTION 'Not authorized to update delivery attempts.';
  END IF;

  IF v_clean_reason IS NULL THEN
    RAISE EXCEPTION 'Please provide a reason for the failed delivery attempt.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_role = 'driver' THEN
    SELECT full_name, COALESCE(status, 'active')
    INTO v_driver_name, v_driver_status
    FROM public.user_profiles
    WHERE id = v_uid;

    IF COALESCE(v_driver_status, 'inactive') <> 'active' THEN
      RAISE EXCEPTION 'Inactive driver accounts cannot update deliveries.';
    END IF;

    IF NOT (
      v_order.assigned_driver_id = v_uid
      OR (
        v_order.assigned_driver_id IS NULL
        AND NULLIF(btrim(v_driver_name), '') IS NOT NULL
        AND v_order.driver_name IS NOT NULL
        AND v_order.driver_name ILIKE btrim(v_driver_name) || '%'
      )
    ) THEN
      RAISE EXCEPTION 'Not authorized to update an order not assigned to you.';
    END IF;
  END IF;

  IF v_order.status::text NOT IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered_partial', 'delivered') THEN
    RAISE EXCEPTION 'Order in status "%" cannot be marked as attempted.', v_order.status::text;
  END IF;

  v_is_backorder := v_order.status::text IN ('delivered_partial', 'delivered');
  PERFORM set_config('app.allow_driver_order_rpc', 'true', true);

  IF v_is_backorder THEN
    PERFORM id FROM public.order_items WHERE order_id = p_order_id ORDER BY id FOR UPDATE;

    UPDATE public.order_items
    SET status = 'rejected',
        cancellation_reason = v_clean_reason
    WHERE order_id = p_order_id
      AND UPPER(COALESCE(status, '')) IN ('SHIPPED', 'OUT_FOR_DELIVERY');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      PERFORM set_config('app.allow_driver_order_rpc', 'false', true);
      RAISE EXCEPTION 'No active backorder items found on this delivery run.';
    END IF;

    v_next_status := 'delivered_partial';
  ELSE
    v_next_status := 'attempted';
  END IF;

  UPDATE public.orders
  SET status = v_next_status::order_status,
      is_restocked = false,
      cancellation_reason = v_clean_reason,
      updated_at = NOW()
  WHERE id = p_order_id;

  PERFORM set_config('app.allow_driver_order_rpc', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', v_next_status,
    'is_backorder_run', v_is_backorder
  );
END;
$$;

REVOKE ALL ON FUNCTION public.driver_mark_attempted(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_mark_attempted(uuid, text) TO authenticated, service_role;

-- ============================================================================
-- 8. Revoke uncalled/superseded legacy routines from PUBLIC, anon, and authenticated
-- ============================================================================
REVOKE ALL ON FUNCTION public.cancel_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_order_item(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_item(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_order_item(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_item(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.complete_delivery(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.deduct_inventory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_inventory() TO service_role;

REVOKE ALL ON FUNCTION public.deduct_inventory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_inventory(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.deduct_inventory_on_checkout() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_inventory_on_checkout() TO service_role;

REVOKE ALL ON FUNCTION public.restock_inventory_on_cancel() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restock_inventory_on_cancel() TO service_role;

REVOKE ALL ON FUNCTION public.reject_order_and_restock(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_order_and_restock(uuid, uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_profitability_report(timestamp with time zone, timestamp with time zone, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profitability_report(timestamp with time zone, timestamp with time zone, text) TO service_role;

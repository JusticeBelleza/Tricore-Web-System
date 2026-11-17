-- Migration: Harden inventory/order RLS, table write privileges, and legacy RPC authorization.
-- Forward-only, additive-safe security fix verified against live production schema on lnuiyrrqrgjcmqflgbbz.
-- Preserves all authorized Customer, B2B, Admin, Warehouse, and Driver workflows while closing
-- anonymous RPC execution, customer direct inventory/order tampering, and NULL role-check bypasses.

-- ============================================================================
-- 1. Defense-in-depth: remove direct anonymous SQL write privileges on tables
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;

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
-- 3. Restrict direct table UPDATE on public.orders to staff and assigned drivers
--    (Customers create pending orders via INSERT RLS and view via SELECT RLS;
--     customers must never directly mutate status, payment_status, or totals.)
-- ============================================================================
DROP POLICY IF EXISTS "Update orders" ON public.orders;

CREATE POLICY "Update orders" ON public.orders
FOR UPDATE TO authenticated
USING (
  COALESCE(public.get_user_role(), '') IN ('admin', 'warehouse')
  OR (
    COALESCE(public.get_user_role(), '') = 'driver'
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'driver'
        AND COALESCE(up.status, 'active') = 'active'
        AND (
          public.orders.assigned_driver_id = up.id
          OR (
            public.orders.assigned_driver_id IS NULL
            AND NULLIF(btrim(up.full_name), '') IS NOT NULL
            AND public.orders.driver_name IS NOT NULL
            AND public.orders.driver_name ILIKE btrim(up.full_name) || '%'
          )
        )
    )
  )
)
WITH CHECK (
  COALESCE(public.get_user_role(), '') IN ('admin', 'warehouse')
  OR (
    COALESCE(public.get_user_role(), '') = 'driver'
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'driver'
        AND COALESCE(up.status, 'active') = 'active'
        AND (
          public.orders.assigned_driver_id = up.id
          OR (
            public.orders.assigned_driver_id IS NULL
            AND NULLIF(btrim(up.full_name), '') IS NOT NULL
            AND public.orders.driver_name IS NOT NULL
            AND public.orders.driver_name ILIKE btrim(up.full_name) || '%'
          )
        )
    )
  )
);

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
-- 6. Protect privileged Staff fulfillment / order-editing RPCs (Admin & Warehouse)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_warehouse_restock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_item RECORD;
  v_product_id UUID;
  v_is_partial BOOLEAN;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to process warehouse restock.';
  END IF;

  SELECT status::text = 'delivered_partial' INTO v_is_partial
  FROM orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  FOR v_item IN
    SELECT id, total_base_units, product_variant_id
    FROM order_items
    WHERE order_id = p_order_id
      AND (
        (v_is_partial AND status::text = 'rejected') OR
        (NOT v_is_partial AND status::text NOT IN ('cancelled', 'restocked'))
      )
  LOOP
    SELECT product_id INTO v_product_id FROM product_variants WHERE id = v_item.product_variant_id;

    UPDATE inventory
    SET base_units_on_hand = base_units_on_hand + COALESCE(v_item.total_base_units, 0)
    WHERE product_id = v_product_id;

    UPDATE order_items
    SET status = 'restocked'::order_status
    WHERE id = v_item.id;
  END LOOP;

  UPDATE orders
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
  v_old_qty integer;
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

  SELECT oi.quantity_variants, COALESCE(pv.multiplier, 1), pv.product_id
  INTO v_old_qty, v_old_mult, v_old_prod_id
  FROM order_items oi
  JOIN product_variants pv ON pv.id = oi.product_variant_id
  WHERE oi.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found.';
  END IF;

  SELECT COALESCE(multiplier, 1), price, product_id
  INTO v_new_mult, v_new_price, v_new_prod_id
  FROM product_variants
  WHERE id = p_new_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement variant not found.';
  END IF;

  UPDATE inventory
  SET base_units_on_hand = base_units_on_hand + (v_old_qty * v_old_mult)
  WHERE product_id = v_old_prod_id;

  UPDATE inventory
  SET base_units_on_hand = base_units_on_hand - (p_new_qty * v_new_mult)
  WHERE product_id = v_new_prod_id;

  UPDATE order_items
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

  SELECT oi.quantity_variants, oi.unit_price, COALESCE(pv.multiplier, 1), pv.product_id
  INTO v_old_qty, v_unit_price, v_multiplier, v_product_id
  FROM order_items oi
  JOIN product_variants pv ON pv.id = oi.product_variant_id
  WHERE oi.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found.';
  END IF;

  v_diff_base := (p_new_qty - v_old_qty) * v_multiplier;

  UPDATE order_items
  SET quantity_variants = p_new_qty,
      total_base_units = p_new_qty * v_multiplier,
      line_total = p_new_qty * v_unit_price
  WHERE id = p_item_id;

  UPDATE inventory
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
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_existing_item_id UUID;
  v_unit_price NUMERIC;
  v_product_id UUID;
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

  SELECT id, quantity_variants INTO v_existing_item_id, v_current_qty
  FROM order_items
  WHERE order_id = p_order_id AND product_variant_id = p_variant_id AND status NOT IN ('cancelled', 'rejected')
  LIMIT 1;

  IF v_existing_item_id IS NOT NULL THEN
    PERFORM public.edit_order_item(v_existing_item_id, v_current_qty + p_qty);
    RETURN;
  END IF;

  SELECT price, product_id INTO v_unit_price, v_product_id FROM product_variants WHERE id = p_variant_id;
  IF v_unit_price IS NULL THEN RAISE EXCEPTION 'Variant not found.'; END IF;

  INSERT INTO order_items (order_id, product_variant_id, quantity_variants, total_base_units, unit_price, line_total, status)
  VALUES (p_order_id, p_variant_id, p_qty, p_qty, v_unit_price, p_qty * v_unit_price, 'active');

  SELECT subtotal, tax_amount, shipping_amount INTO v_old_subtotal, v_old_tax, v_shipping FROM orders WHERE id = p_order_id;
  SELECT COALESCE(SUM(line_total), 0) INTO v_new_subtotal FROM order_items WHERE order_id = p_order_id AND status NOT IN ('cancelled', 'rejected');

  IF v_old_subtotal > 0 THEN v_tax_rate := v_old_tax / v_old_subtotal; ELSE v_tax_rate := 0; END IF;
  v_new_tax := v_new_subtotal * v_tax_rate;

  UPDATE orders
  SET subtotal = v_new_subtotal,
      tax_amount = v_new_tax,
      total_amount = v_new_subtotal + v_shipping + v_new_tax,
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
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_product_id UUID;
  v_saved_base_units INT;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to cancel order items.';
  END IF;

  SELECT total_base_units INTO v_saved_base_units
  FROM order_items
  WHERE id = p_item_id;

  IF EXISTS (SELECT 1 FROM order_items WHERE id = p_item_id AND status = 'cancelled') THEN
    RETURN;
  END IF;

  UPDATE order_items
  SET status = 'cancelled', cancellation_reason = p_reason
  WHERE id = p_item_id;

  SELECT product_id INTO v_product_id
  FROM product_variants
  WHERE id = (SELECT product_variant_id FROM order_items WHERE id = p_item_id);

  UPDATE inventory
  SET base_units_on_hand = base_units_on_hand + COALESCE(v_saved_base_units, 0)
  WHERE product_id = v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order_item(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_item(uuid, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.split_order_item(p_item_id uuid, p_pack_qty integer)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(public.get_user_role(), '');
  v_original_qty INT;
  v_backorder_qty INT;
  v_item RECORD;
  v_base_unit_multiplier INT;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to split order items.';
  END IF;

  SELECT * INTO v_item FROM order_items WHERE id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  v_original_qty := v_item.quantity_variants;
  v_backorder_qty := v_original_qty - p_pack_qty;

  IF p_pack_qty <= 0 OR v_backorder_qty <= 0 THEN
    RAISE EXCEPTION 'Invalid split quantities. Pack qty must be greater than 0 and less than original qty.';
  END IF;

  IF v_original_qty > 0 THEN
    v_base_unit_multiplier := v_item.total_base_units / v_original_qty;
  ELSE
    v_base_unit_multiplier := 1;
  END IF;

  UPDATE order_items
  SET quantity_variants = p_pack_qty,
      total_base_units = p_pack_qty * v_base_unit_multiplier,
      line_total = p_pack_qty * v_item.unit_price
  WHERE id = p_item_id;

  INSERT INTO order_items (
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
    v_backorder_qty * v_item.unit_price
  );
END;
$$;

REVOKE ALL ON FUNCTION public.split_order_item(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_order_item(uuid, integer) TO authenticated, service_role;

-- ============================================================================
-- 7. Harden reject_full_order for DriverRoutes & Staff (SECURITY DEFINER + assignment check)
--    Allows Drivers to continue door-rejection inventory restock cleanly after inventory
--    UPDATE RLS was narrowed to Admin & Warehouse.
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

    IF v_driver_status <> 'active' THEN
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
    SELECT id, total_base_units, product_variant_id
    FROM order_items
    WHERE order_id = p_order_id AND status::text NOT IN ('cancelled', 'rejected', 'restocked')
  LOOP
    SELECT product_id INTO v_product_id FROM product_variants WHERE id = v_item.product_variant_id;

    UPDATE inventory
    SET base_units_on_hand = base_units_on_hand + COALESCE(v_item.total_base_units, 0)
    WHERE product_id = v_product_id;

    UPDATE order_items
    SET status = p_target_status::order_status,
        cancellation_reason = p_reason
    WHERE id = v_item.id;
  END LOOP;

  UPDATE orders
  SET status = p_target_status::order_status,
      cancellation_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_full_order(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_full_order(uuid, text, text) TO authenticated, service_role;

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

-- Trigger function fires automatically via trigger_deduct_inventory_on_insert on public.order_items;
-- strip direct PUBLIC/anon/authenticated execute privileges just like handle_new_user().
REVOKE ALL ON FUNCTION public.process_order_item_inventory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_item_inventory() TO service_role;

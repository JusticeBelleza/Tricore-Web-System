-- ============================================================================
-- TRICORE COMPATIBILITY LAYER FOR LEGACY FRONTEND (8e9025f)
-- Safe to apply:
--   1) BEFORE 20261116090000..120000 during zero-downtime production cutover so
--      active legacy 8e9025f sessions stay protected and uninterrupted while
--      hardened migrations and Vercel deployment roll out; OR
--   2) During emergency rollback to 8e9025f after 20261116090000..120000.
--
-- Non-destructive: preserves new schema columns and audit infrastructure.
-- Disable post-cutover via supabase/rollbacks/disable_legacy_frontend_compat.sql.
-- ============================================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS idempotency_key uuid,
ADD COLUMN IF NOT EXISTS compat_checkout_sealed boolean NOT NULL DEFAULT false;

ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS original_quantity_variants integer;

UPDATE public.order_items
SET original_quantity_variants = quantity_variants
WHERE original_quantity_variants IS NULL;

-- 1. Legacy customer two-step checkout RLS policies (scoped strictly to pending, unsealed orders)
DROP POLICY IF EXISTS "Legacy compat customer insert pending orders" ON public.orders;
CREATE POLICY "Legacy compat customer insert pending orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND COALESCE(up.status, 'inactive') = 'active'
      AND LOWER(COALESCE(up.role, '')) IN ('retail', 'user', 'b2b', 'agency_admin')
      AND up.id = orders.user_id
      AND (orders.company_id IS NOT DISTINCT FROM up.company_id)
  )
  AND status = 'pending'::public.order_status
  AND payment_status = 'unpaid'::public.payment_status
  AND assigned_driver_id IS NULL
  AND COALESCE(is_restocked, false) = false
  AND COALESCE(compat_checkout_sealed, false) = false
  AND idempotency_key IS NULL
);

DROP POLICY IF EXISTS "Legacy compat customer insert pending order items" ON public.order_items;
CREATE POLICY "Legacy compat customer insert pending order items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND COALESCE(up.status, 'inactive') = 'active'
      AND LOWER(COALESCE(up.role, '')) IN ('retail', 'user', 'b2b', 'agency_admin')
  )
  AND LOWER(COALESCE(status, 'active')) = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.user_id = auth.uid()
      AND o.status::text = 'pending'
      AND COALESCE(o.compat_checkout_sealed, false) = false
      AND o.idempotency_key IS NULL
  )
);

-- 2. Legacy DriverRoutes direct delivery RLS policies (assigned active drivers only)
DROP POLICY IF EXISTS "Legacy compat driver update assigned orders" ON public.orders;
CREATE POLICY "Legacy compat driver update assigned orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND COALESCE(up.status, 'inactive') = 'active'
      AND LOWER(COALESCE(up.role, '')) = 'driver'
      AND (
        orders.assigned_driver_id = up.id
        OR (
          orders.assigned_driver_id IS NULL
          AND NULLIF(btrim(up.full_name), '') IS NOT NULL
          AND orders.driver_name IS NOT NULL
          AND orders.driver_name ILIKE btrim(up.full_name) || '%'
        )
      )
  )
  AND orders.status::text IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered_partial', 'delivered')
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND COALESCE(up.status, 'inactive') = 'active'
      AND LOWER(COALESCE(up.role, '')) = 'driver'
  )
  AND orders.status::text IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered', 'delivered_partial', 'attempted', 'cancelled')
);

DROP POLICY IF EXISTS "Legacy compat driver update assigned order items" ON public.order_items;
CREATE POLICY "Legacy compat driver update assigned order items"
ON public.order_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.user_profiles up ON up.id = auth.uid()
    WHERE o.id = order_items.order_id
      AND COALESCE(up.status, 'inactive') = 'active'
      AND LOWER(COALESCE(up.role, '')) = 'driver'
      AND (
        o.assigned_driver_id = up.id
        OR (
          o.assigned_driver_id IS NULL
          AND NULLIF(btrim(up.full_name), '') IS NOT NULL
          AND o.driver_name IS NOT NULL
          AND o.driver_name ILIKE btrim(up.full_name) || '%'
        )
      )
      AND o.status::text IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered_partial', 'delivered')
  )
)
WITH CHECK (
  LOWER(COALESCE(status, '')) IN ('out_for_delivery', 'delivered', 'rejected')
);

DROP POLICY IF EXISTS "Legacy compat driver insert rejected split items" ON public.order_items;
CREATE POLICY "Legacy compat driver insert rejected split items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  LOWER(COALESCE(status, '')) = 'rejected'
  AND quantity_variants > 0
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.user_profiles up ON up.id = auth.uid()
    WHERE o.id = order_items.order_id
      AND COALESCE(up.status, 'inactive') = 'active'
      AND LOWER(COALESCE(up.role, '')) = 'driver'
      AND (
        o.assigned_driver_id = up.id
        OR (
          o.assigned_driver_id IS NULL
          AND NULLIF(btrim(up.full_name), '') IS NOT NULL
          AND o.driver_name IS NOT NULL
          AND o.driver_name ILIKE btrim(up.full_name) || '%'
        )
      )
      AND o.status::text IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered_partial', 'delivered')
  )
);

-- 3. Guarded direct order column protection (shared contract with 20261116090000)
CREATE OR REPLACE FUNCTION public.protect_secure_order_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role text;
  v_actor_status text;
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

  IF COALESCE(current_setting('app.allow_compat_order_totals_sync', true), '') = 'true'
     AND EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'orders'
         AND policyname = 'Legacy compat customer insert pending orders'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT LOWER(COALESCE(role, '')), LOWER(COALESCE(status, 'inactive'))
  INTO v_actor_role, v_actor_status
  FROM public.user_profiles
  WHERE id = v_uid;

  IF COALESCE(v_actor_role, '') IN ('admin', 'warehouse') AND COALESCE(v_actor_status, 'inactive') = 'active' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_actor_role, '') = 'driver'
     AND COALESCE(v_actor_status, 'inactive') = 'active'
     AND EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'orders'
         AND policyname = 'Legacy compat driver update assigned orders'
     ) THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.driver_name IS DISTINCT FROM OLD.driver_name
       OR NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id
       OR NEW.shipping_amount IS DISTINCT FROM OLD.shipping_amount
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.order_notes IS DISTINCT FROM OLD.order_notes
       OR NEW.is_restocked IS DISTINCT FROM OLD.is_restocked
       OR NEW.compat_checkout_sealed IS DISTINCT FROM OLD.compat_checkout_sealed
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'Drivers cannot modify protected order columns.';
    END IF;

    IF COALESCE(NEW.subtotal, 0) < 0
       OR COALESCE(NEW.subtotal, 0) > COALESCE(OLD.subtotal, 0) + 0.01
       OR COALESCE(NEW.tax_amount, 0) < 0
       OR COALESCE(NEW.tax_amount, 0) > COALESCE(OLD.tax_amount, 0) + 0.01
       OR COALESCE(NEW.total_amount, 0) < 0
       OR COALESCE(NEW.total_amount, 0) > COALESCE(OLD.total_amount, 0) + 0.01 THEN
      RAISE EXCEPTION 'Drivers cannot increase order financial totals.';
    END IF;

    IF NEW.subtotal > COALESCE(OLD.subtotal, 0) THEN NEW.subtotal := OLD.subtotal; END IF;
    IF NEW.tax_amount > COALESCE(OLD.tax_amount, 0) THEN NEW.tax_amount := OLD.tax_amount; END IF;
    IF NEW.total_amount > COALESCE(OLD.total_amount, 0) THEN NEW.total_amount := OLD.total_amount; END IF;

    IF NEW.status::text NOT IN (
      'ready_for_delivery',
      'shipped',
      'out_for_delivery',
      'delivered',
      'delivered_partial',
      'attempted',
      'cancelled'
    ) THEN
      RAISE EXCEPTION 'Drivers cannot transition order to status "%".', NEW.status::text;
    END IF;

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

-- 4. Legacy order header normalization BEFORE INSERT on public.orders
-- Strips caller-forged totals/shipping/status and validates agency ownership + credit limit.
CREATE OR REPLACE FUNCTION public.enforce_compat_order_header_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role text;
  v_actor_status text;
  v_caller_company_id uuid;
  v_company public.companies%ROWTYPE;
  v_auth_shipping numeric := 10.00;
  v_outstanding numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(current_setting('app.allow_customer_checkout_rpc', true), '') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT LOWER(COALESCE(role, '')), LOWER(COALESCE(status, 'inactive')), company_id
  INTO v_actor_role, v_actor_status, v_caller_company_id
  FROM public.user_profiles
  WHERE id = v_uid;

  IF NOT FOUND OR COALESCE(v_actor_status, 'inactive') <> 'active' THEN
    RAISE EXCEPTION 'Active user account required to create orders.';
  END IF;

  IF v_actor_role IN ('admin', 'warehouse') THEN
    RETURN NEW;
  END IF;

  IF v_actor_role NOT IN ('retail', 'user', 'b2b', 'agency_admin') THEN
    RAISE EXCEPTION 'Not authorized to insert customer orders.';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Customers may only create orders for their own account.';
  END IF;

  IF NEW.company_id IS DISTINCT FROM v_caller_company_id THEN
    RAISE EXCEPTION 'Customers cannot override their assigned agency account.';
  END IF;

  IF NEW.patient_id IS NOT NULL THEN
    IF NEW.company_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.agency_patients ap
      WHERE ap.id = NEW.patient_id
        AND ap.agency_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'Selected patient does not belong to the customer agency.';
    END IF;
  END IF;

  IF LOWER(COALESCE(NEW.payment_method::text, 'net_30')) NOT IN ('net_30', 'cod') THEN
    RAISE EXCEPTION 'Invalid payment method "%".', NEW.payment_method::text;
  END IF;

  IF NEW.company_id IS NOT NULL THEN
    SELECT * INTO v_company
    FROM public.companies
    WHERE id = NEW.company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assigned agency company not found.';
    END IF;

    v_auth_shipping := ROUND(GREATEST(COALESCE(v_company.shipping_fee, 0), 0), 2);

    IF LOWER(COALESCE(NEW.payment_method::text, 'net_30')) = 'net_30' THEN
      SELECT COALESCE(SUM(total_amount), 0)
      INTO v_outstanding
      FROM public.orders
      WHERE company_id = NEW.company_id
        AND payment_status = 'unpaid'::public.payment_status;

      IF v_auth_shipping > (COALESCE(v_company.credit_limit, 0) - v_outstanding) THEN
        RAISE EXCEPTION 'Insufficient agency credit limit for Net 30 order.';
      END IF;
    END IF;
  ELSE
    v_auth_shipping := 10.00;
  END IF;

  NEW.status := 'pending'::public.order_status;
  NEW.payment_status := 'unpaid'::public.payment_status;
  NEW.assigned_driver_id := NULL;
  NEW.driver_name := NULL;
  NEW.is_restocked := false;
  NEW.compat_checkout_sealed := false;
  NEW.idempotency_key := NULL;

  -- Header always starts with zero item subtotal/tax and server-authoritative shipping;
  -- reconcile_compat_order_totals() computes authoritative item totals on order_items insert.
  NEW.subtotal := 0;
  NEW.tax_amount := 0;
  NEW.shipping_amount := v_auth_shipping;
  NEW.total_amount := v_auth_shipping;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_compat_order_header_security_trg ON public.orders;
CREATE TRIGGER enforce_compat_order_header_security_trg
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_compat_order_header_security();

REVOKE ALL ON FUNCTION public.enforce_compat_order_header_security() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_compat_order_header_security() TO service_role;

-- 5. Legacy compat order_items server-side pricing, split-conservation, and status trigger
-- Alphabetically precedes trigger_deduct_inventory_on_insert ('e' < 't').
CREATE OR REPLACE FUNCTION public.enforce_compat_order_item_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role text;
  v_actor_status text;
  v_driver_name text;
  v_order public.orders%ROWTYPE;
  v_pv record;
  v_variant_retail numeric;
  v_unit_price numeric;
  v_multiplier integer;
  v_rule record;
  v_ref_unit_price numeric;
  v_remaining_rej integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(current_setting('app.allow_customer_checkout_rpc', true), '') = 'true'
     OR COALESCE(current_setting('app.allow_driver_order_rpc', true), '') = 'true' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM set_config('app.skip_item_inventory_deduct', 'false', true);
  END IF;

  SELECT LOWER(COALESCE(role, '')), LOWER(COALESCE(status, 'inactive')), full_name
  INTO v_actor_role, v_actor_status, v_driver_name
  FROM public.user_profiles
  WHERE id = v_uid;

  IF NOT FOUND OR COALESCE(v_actor_status, 'inactive') <> 'active' THEN
    RAISE EXCEPTION 'Active user account required to mutate order items.';
  END IF;

  IF v_actor_role IN ('admin', 'warehouse') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF v_actor_role <> 'driver' THEN
      RAISE EXCEPTION 'Only authorized drivers or staff can update order items.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = OLD.order_id
    FOR UPDATE;

    IF NOT FOUND OR NOT (
      v_order.assigned_driver_id = v_uid
      OR (
        v_order.assigned_driver_id IS NULL
        AND NULLIF(btrim(v_driver_name), '') IS NOT NULL
        AND v_order.driver_name IS NOT NULL
        AND v_order.driver_name ILIKE btrim(v_driver_name) || '%'
      )
    ) THEN
      RAISE EXCEPTION 'Not authorized to update items on an unassigned order.';
    END IF;

    IF v_order.status::text NOT IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered_partial', 'delivered') THEN
      RAISE EXCEPTION 'Order in status "%" cannot be modified by a driver.', v_order.status::text;
    END IF;

    IF LOWER(COALESCE(OLD.status, 'active')) IN ('backordered', 'cancelled', 'rejected', 'restocked', 'delivered') THEN
      RAISE EXCEPTION 'Drivers cannot re-modify finalized or backordered item in status "%".', OLD.status;
    END IF;

    IF NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.product_variant_id IS DISTINCT FROM OLD.product_variant_id
       OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
       OR NEW.original_quantity_variants IS DISTINCT FROM OLD.original_quantity_variants THEN
      RAISE EXCEPTION 'Drivers cannot modify order item identity, unit price, or original quantity.';
    END IF;

    IF LOWER(COALESCE(NEW.status, '')) NOT IN ('out_for_delivery', 'delivered', 'rejected') THEN
      RAISE EXCEPTION 'Drivers cannot set order item status to "%".', NEW.status;
    END IF;

    IF NEW.quantity_variants IS NULL OR NEW.quantity_variants <= 0 OR NEW.quantity_variants > OLD.quantity_variants THEN
      RAISE EXCEPTION 'Driver item quantity % must stay between 1 and %.', NEW.quantity_variants, OLD.quantity_variants;
    END IF;

    IF NEW.quantity_variants < OLD.quantity_variants THEN
      IF LOWER(COALESCE(NEW.status, '')) <> 'delivered' THEN
        RAISE EXCEPTION 'Partial item quantity reduction requires status DELIVERED.';
      END IF;

      SELECT COALESCE(multiplier, 1)
      INTO v_multiplier
      FROM public.product_variants
      WHERE id = OLD.product_variant_id;

      v_multiplier := GREATEST(COALESCE(v_multiplier, 1), 1);
      v_unit_price := COALESCE(
        OLD.unit_price,
        CASE WHEN OLD.quantity_variants > 0 THEN OLD.line_total / OLD.quantity_variants ELSE 0 END
      );

      NEW.line_total := ROUND(NEW.quantity_variants * v_unit_price, 2);
      NEW.total_base_units := NEW.quantity_variants * v_multiplier;
    ELSE
      NEW.line_total := OLD.line_total;
      NEW.total_base_units := OLD.total_base_units;
    END IF;

    RETURN NEW;
  END IF;

  -- TG_OP = 'INSERT'
  IF v_actor_role = 'driver' THEN
    IF NEW.quantity_variants IS NULL OR NEW.quantity_variants <= 0 THEN
      RAISE EXCEPTION 'Rejected split item quantity must be greater than 0.';
    END IF;

    IF LOWER(COALESCE(NEW.status, '')) <> 'rejected' THEN
      RAISE EXCEPTION 'Drivers may only insert rejected split items.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = NEW.order_id
    FOR UPDATE;

    IF NOT FOUND OR NOT (
      v_order.assigned_driver_id = v_uid
      OR (
        v_order.assigned_driver_id IS NULL
        AND NULLIF(btrim(v_driver_name), '') IS NOT NULL
        AND v_order.driver_name IS NOT NULL
        AND v_order.driver_name ILIKE btrim(v_driver_name) || '%'
      )
    ) THEN
      RAISE EXCEPTION 'Not authorized to insert split items on an unassigned order.';
    END IF;

    IF v_order.status::text NOT IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered_partial', 'delivered') THEN
      RAISE EXCEPTION 'Order in status "%" cannot receive driver rejected split items.', v_order.status::text;
    END IF;

    -- Lock all items for this variant on the order before checking split capacity.
    PERFORM id
    FROM public.order_items
    WHERE order_id = NEW.order_id
      AND product_variant_id = NEW.product_variant_id
    ORDER BY id
    FOR UPDATE;

    SELECT COALESCE(unit_price, CASE WHEN quantity_variants > 0 THEN line_total / quantity_variants ELSE 0 END)
    INTO v_ref_unit_price
    FROM public.order_items
    WHERE order_id = NEW.order_id
      AND product_variant_id = NEW.product_variant_id
      AND LOWER(COALESCE(status, '')) = 'delivered'
      AND original_quantity_variants IS NOT NULL
      AND quantity_variants < original_quantity_variants
    ORDER BY id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rejected split row requires an authorized reduced delivered item for this order.';
    END IF;

    SELECT COALESCE(SUM(COALESCE(original_quantity_variants, 0)), 0) - COALESCE(SUM(quantity_variants), 0)
    INTO v_remaining_rej
    FROM public.order_items
    WHERE order_id = NEW.order_id
      AND product_variant_id = NEW.product_variant_id;

    IF NEW.quantity_variants > COALESCE(v_remaining_rej, 0) THEN
      RAISE EXCEPTION 'Rejected split quantity % exceeds remaining authorized quantity %.', NEW.quantity_variants, COALESCE(v_remaining_rej, 0);
    END IF;

    SELECT COALESCE(multiplier, 1)
    INTO v_multiplier
    FROM public.product_variants
    WHERE id = NEW.product_variant_id;

    NEW.status := 'rejected';
    NEW.original_quantity_variants := 0;
    NEW.unit_price := ROUND(GREATEST(COALESCE(v_ref_unit_price, 0), 0), 2);
    NEW.line_total := ROUND(NEW.quantity_variants * NEW.unit_price, 2);
    NEW.total_base_units := NEW.quantity_variants * GREATEST(COALESCE(v_multiplier, 1), 1);
    PERFORM set_config('app.skip_item_inventory_deduct', 'true', true);
    RETURN NEW;
  END IF;

  -- Legacy customer checkout order_items insert
  IF v_actor_role NOT IN ('retail', 'user', 'b2b', 'agency_admin') THEN
    RAISE EXCEPTION 'Not authorized to insert order items directly.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = NEW.order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Customers may only add items to their own pending order.';
  END IF;

  IF v_order.status::text <> 'pending'
     OR COALESCE(v_order.compat_checkout_sealed, false)
     OR v_order.idempotency_key IS NOT NULL THEN
    RAISE EXCEPTION 'Order % is already sealed and cannot accept additional items.', NEW.order_id;
  END IF;

  IF NEW.quantity_variants IS NULL OR NEW.quantity_variants <= 0 THEN
    RAISE EXCEPTION 'Order item quantity must be greater than 0.';
  END IF;

  IF LOWER(COALESCE(NEW.status, 'active')) <> 'active' THEN
    RAISE EXCEPTION 'Customer order items must use active status.';
  END IF;

  SELECT pv.id, pv.price, COALESCE(pv.multiplier, 1) AS multiplier, p.retail_base_price
  INTO v_pv
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = NEW.product_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product variant not found.';
  END IF;

  v_variant_retail := CASE
    WHEN COALESCE(v_pv.price, 0) > 0 THEN v_pv.price
    ELSE COALESCE(v_pv.retail_base_price, 0) * GREATEST(COALESCE(v_pv.multiplier, 1), 1)
  END;

  v_unit_price := v_variant_retail;

  IF v_order.company_id IS NOT NULL THEN
    SELECT rule_type::text AS rule_type, value
    INTO v_rule
    FROM public.pricing_rules
    WHERE company_id = v_order.company_id
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
  v_multiplier := GREATEST(COALESCE(v_pv.multiplier, 1), 1);

  NEW.status := 'active';
  NEW.original_quantity_variants := NEW.quantity_variants;
  NEW.unit_price := v_unit_price;
  NEW.line_total := ROUND(NEW.quantity_variants * v_unit_price, 2);
  NEW.total_base_units := NEW.quantity_variants * v_multiplier;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_compat_order_item_security_trg ON public.order_items;
CREATE TRIGGER enforce_compat_order_item_security_trg
BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_compat_order_item_security();

REVOKE ALL ON FUNCTION public.enforce_compat_order_item_security() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_compat_order_item_security() TO service_role;

-- 6. Statement-level reconciliation + checkout sealing AFTER INSERT on public.order_items
-- Computes authoritative subtotal, shipping, zip5 tax, and total from DB order_items,
-- checks B2B Net 30 credit_limit, and seals compat_checkout_sealed = true against extra inserts.
CREATE OR REPLACE FUNCTION public.reconcile_compat_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role text;
  v_actor_status text;
  v_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_subtotal numeric := 0;
  v_shipping_amount numeric := 10.00;
  v_tax_rate numeric := 0;
  v_tax_amount numeric := 0;
  v_total_amount numeric := 0;
  v_zip5 text;
  v_outstanding numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  IF COALESCE(current_setting('app.allow_customer_checkout_rpc', true), '') = 'true'
     OR COALESCE(current_setting('app.allow_driver_order_rpc', true), '') = 'true' THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM new_rows) THEN
    RETURN NULL;
  END IF;

  SELECT LOWER(COALESCE(role, '')), LOWER(COALESCE(status, 'inactive'))
  INTO v_actor_role, v_actor_status
  FROM public.user_profiles
  WHERE id = v_uid;

  IF NOT FOUND OR COALESCE(v_actor_status, 'inactive') <> 'active' THEN
    RETURN NULL;
  END IF;

  IF v_actor_role IN ('admin', 'warehouse', 'driver') THEN
    RETURN NULL;
  END IF;

  FOR v_order_id IN
    SELECT DISTINCT nr.order_id
    FROM new_rows nr
    ORDER BY nr.order_id
  LOOP
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order % not found during checkout total reconciliation.', v_order_id;
    END IF;

    IF v_order.user_id IS DISTINCT FROM v_uid
       OR v_order.status::text <> 'pending'
       OR COALESCE(v_order.compat_checkout_sealed, false)
       OR v_order.idempotency_key IS NOT NULL THEN
      RAISE EXCEPTION 'Order % cannot be modified after checkout sealing.', v_order_id;
    END IF;

    SELECT ROUND(COALESCE(SUM(oi.line_total), 0), 2)
    INTO v_subtotal
    FROM public.order_items oi
    WHERE oi.order_id = v_order_id
      AND LOWER(COALESCE(oi.status, 'active')) NOT IN ('cancelled', 'rejected', 'restocked');

    IF v_order.company_id IS NOT NULL THEN
      SELECT * INTO v_company
      FROM public.companies
      WHERE id = v_order.company_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Company account not found for order %.', v_order_id;
      END IF;

      v_shipping_amount := ROUND(GREATEST(COALESCE(v_company.shipping_fee, 0), 0), 2);
    ELSE
      v_shipping_amount := 10.00;
    END IF;

    IF v_order.company_id IS NOT NULL AND COALESCE(v_company.tax_exempt, false) THEN
      v_tax_rate := 0;
    ELSE
      v_zip5 := LEFT(btrim(COALESCE(v_order.shipping_zip, '')), 5);
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

    IF v_order.company_id IS NOT NULL AND LOWER(COALESCE(v_order.payment_method::text, 'net_30')) = 'net_30' THEN
      SELECT COALESCE(SUM(total_amount), 0)
      INTO v_outstanding
      FROM public.orders
      WHERE company_id = v_order.company_id
        AND payment_status = 'unpaid'::public.payment_status
        AND id <> v_order_id;

      IF v_total_amount > (COALESCE(v_company.credit_limit, 0) - v_outstanding) THEN
        RAISE EXCEPTION 'Insufficient agency credit limit for Net 30 order.';
      END IF;
    END IF;

    PERFORM set_config('app.allow_compat_order_totals_sync', 'true', true);

    UPDATE public.orders
    SET subtotal = v_subtotal,
        tax_amount = v_tax_amount,
        shipping_amount = v_shipping_amount,
        total_amount = v_total_amount,
        compat_checkout_sealed = true,
        updated_at = NOW()
    WHERE id = v_order_id;

    PERFORM set_config('app.allow_compat_order_totals_sync', 'false', true);
  END LOOP;

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.allow_compat_order_totals_sync', 'false', true);
    RAISE;
END;
$$;

DROP TRIGGER IF EXISTS reconcile_compat_order_totals_trg ON public.order_items;
CREATE TRIGGER reconcile_compat_order_totals_trg
AFTER INSERT ON public.order_items
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.reconcile_compat_order_totals();

REVOKE ALL ON FUNCTION public.reconcile_compat_order_totals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_compat_order_totals() TO service_role;

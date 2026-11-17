-- Compatibility Layer / Non-Destructive DB Compatibility Rollback for Legacy 8e9025f Frontend
-- Purpose:
--   1. During coordinated pre-merge cutover (if live drivers/customers still hold 8e9025f PWA bundles), OR
--   2. Paired with a Vercel frontend rollback to dpl_8pbFJDTtzssNkXdqNi7unH8KEUVs (8e9025f),
--      because legacy 8e9025f DriverRoutes.jsx and Checkout.jsx write directly to orders & order_items
--      instead of calling place_customer_order() / driver_*() RPCs.
-- Security guarantees preserved even while active:
--   - NO anonymous writes (anon/PUBLIC remain revoked).
--   - NO customer direct inventory writes (inventory UPDATE remains admin/warehouse only).
--   - NO cross-driver access (drivers restricted strictly to their own active assigned orders).
--   - NO driver tampering with payment_status, user_id, company_id, assigned_driver_id, shipping_amount, or total increases.
--   - NO direct BACKORDERED double-deduction or client price tampering on Checkout item inserts.

-- A. Scoped customer pending checkout INSERT compatibility (for 8e9025f Checkout.jsx)
DROP POLICY IF EXISTS "Legacy compat customer insert pending orders" ON public.orders;
CREATE POLICY "Legacy compat customer insert pending orders" ON public.orders
FOR INSERT TO authenticated
WITH CHECK (
  public.orders.status::text = 'pending'
  AND public.orders.payment_status::text = 'unpaid'
  AND public.orders.assigned_driver_id IS NULL
  AND COALESCE(public.orders.is_restocked, false) = false
  AND (
    (
      LOWER(COALESCE(public.get_user_role(), '')) IN ('retail', 'user')
      AND public.orders.user_id = (SELECT auth.uid())
    )
    OR (
      LOWER(COALESCE(public.get_user_role(), '')) IN ('b2b', 'agency_admin')
      AND public.orders.user_id = (SELECT auth.uid())
      AND public.orders.company_id IS NOT NULL
      AND public.orders.company_id = public.get_my_company_id()
    )
  )
);

DROP POLICY IF EXISTS "Legacy compat customer insert pending order items" ON public.order_items;
CREATE POLICY "Legacy compat customer insert pending order items" ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (
  LOWER(COALESCE(public.get_user_role(), '')) IN ('retail', 'user', 'b2b', 'agency_admin')
  AND COALESCE(public.order_items.quantity_variants, 0) > 0
  AND LOWER(COALESCE(public.order_items.status, 'active')) = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = public.order_items.order_id
      AND o.status::text = 'pending'
      AND (
        (
          LOWER(COALESCE(public.get_user_role(), '')) IN ('retail', 'user')
          AND o.user_id = (SELECT auth.uid())
        )
        OR (
          LOWER(COALESCE(public.get_user_role(), '')) IN ('b2b', 'agency_admin')
          AND o.company_id IS NOT NULL
          AND o.company_id = public.get_my_company_id()
        )
      )
  )
);

-- B. Scoped driver assigned-delivery UPDATE/INSERT compatibility (for 8e9025f DriverRoutes.jsx)
DROP POLICY IF EXISTS "Legacy compat driver update assigned orders" ON public.orders;
CREATE POLICY "Legacy compat driver update assigned orders" ON public.orders
FOR UPDATE TO authenticated
USING (
  LOWER(COALESCE(public.get_user_role(), '')) = 'driver'
  AND public.orders.status::text IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered_partial', 'delivered')
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
WITH CHECK (
  LOWER(COALESCE(public.get_user_role(), '')) = 'driver'
  AND public.orders.status::text IN ('out_for_delivery', 'delivered', 'delivered_partial', 'attempted')
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
);

DROP POLICY IF EXISTS "Legacy compat driver update assigned order items" ON public.order_items;
CREATE POLICY "Legacy compat driver update assigned order items" ON public.order_items
FOR UPDATE TO authenticated
USING (
  LOWER(COALESCE(public.get_user_role(), '')) = 'driver'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.user_profiles up ON up.id = (SELECT auth.uid())
    WHERE o.id = public.order_items.order_id
      AND up.role = 'driver'
      AND COALESCE(up.status, 'active') = 'active'
      AND o.status::text IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered_partial', 'delivered')
      AND (
        o.assigned_driver_id = up.id
        OR (
          o.assigned_driver_id IS NULL
          AND NULLIF(btrim(up.full_name), '') IS NOT NULL
          AND o.driver_name IS NOT NULL
          AND o.driver_name ILIKE btrim(up.full_name) || '%'
        )
      )
  )
)
WITH CHECK (
  LOWER(COALESCE(public.get_user_role(), '')) = 'driver'
  AND LOWER(COALESCE(public.order_items.status, '')) IN ('out_for_delivery', 'delivered', 'rejected')
);

DROP POLICY IF EXISTS "Legacy compat driver insert rejected split items" ON public.order_items;
CREATE POLICY "Legacy compat driver insert rejected split items" ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (
  LOWER(COALESCE(public.get_user_role(), '')) = 'driver'
  AND LOWER(COALESCE(public.order_items.status, '')) = 'rejected'
  AND COALESCE(public.order_items.quantity_variants, 0) > 0
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.user_profiles up ON up.id = (SELECT auth.uid())
    WHERE o.id = public.order_items.order_id
      AND up.role = 'driver'
      AND COALESCE(up.status, 'active') = 'active'
      AND o.status::text IN ('ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered_partial', 'delivered')
      AND (
        o.assigned_driver_id = up.id
        OR (
          o.assigned_driver_id IS NULL
          AND NULLIF(btrim(up.full_name), '') IS NOT NULL
          AND o.driver_name IS NOT NULL
          AND o.driver_name ILIKE btrim(up.full_name) || '%'
        )
      )
  )
);

-- C. Guard trigger blocking sensitive/financial columns on legacy direct driver orders UPDATE
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

  IF v_actor_role = 'driver' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
       OR NEW.patient_name IS DISTINCT FROM OLD.patient_name
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.shipping_amount IS DISTINCT FROM OLD.shipping_amount
       OR NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id
       OR NEW.driver_name IS DISTINCT FROM OLD.driver_name
       OR NEW.vehicle_name IS DISTINCT FROM OLD.vehicle_name
       OR NEW.vehicle_model IS DISTINCT FROM OLD.vehicle_model
       OR NEW.vehicle_year IS DISTINCT FROM OLD.vehicle_year
       OR NEW.vehicle_vin IS DISTINCT FROM OLD.vehicle_vin
       OR NEW.vehicle_license IS DISTINCT FROM OLD.vehicle_license
       OR NEW.shipping_name IS DISTINCT FROM OLD.shipping_name
       OR NEW.shipping_address IS DISTINCT FROM OLD.shipping_address
       OR NEW.shipping_city IS DISTINCT FROM OLD.shipping_city
       OR NEW.shipping_state IS DISTINCT FROM OLD.shipping_state
       OR NEW.shipping_zip IS DISTINCT FROM OLD.shipping_zip
       OR NEW.shipping_email IS DISTINCT FROM OLD.shipping_email
       OR NEW.shipping_phone IS DISTINCT FROM OLD.shipping_phone
       OR NEW.order_notes IS DISTINCT FROM OLD.order_notes
       OR NEW.is_restocked IS DISTINCT FROM OLD.is_restocked
       OR NEW.processing_at IS DISTINCT FROM OLD.processing_at
       OR NEW.shipped_at IS DISTINCT FROM OLD.shipped_at
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'Drivers cannot modify protected order ownership, payment, assignment, or shipping fields.';
    END IF;

    IF COALESCE(NEW.subtotal, 0) < 0 OR COALESCE(NEW.tax_amount, 0) < 0 OR COALESCE(NEW.total_amount, 0) < 0
       OR COALESCE(NEW.subtotal, 0) > COALESCE(OLD.subtotal, 0)
       OR COALESCE(NEW.tax_amount, 0) > COALESCE(OLD.tax_amount, 0)
       OR COALESCE(NEW.total_amount, 0) > COALESCE(OLD.total_amount, 0) THEN
      RAISE EXCEPTION 'Drivers cannot increase or set negative order monetary totals.';
    END IF;

    IF NEW.status::text NOT IN ('out_for_delivery', 'delivered', 'delivered_partial', 'attempted') THEN
      RAISE EXCEPTION 'Invalid driver order status transition "%".', NEW.status::text;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Direct updates on orders are restricted; use authorized delivery or order RPCs.';
END;
$$;

-- D. Guard trigger on order_items in compat mode:
--    - Enforces server pricing on legacy customer checkout INSERTs
--    - Blocks driver tampering with unit_price / variant / order_id
--    - Permits 8e9025f partial-delivery split 'rejected' INSERT without deducting stock twice
CREATE OR REPLACE FUNCTION public.enforce_compat_order_item_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role text;
  v_company_id uuid;
  v_variant_retail numeric;
  v_auth_price numeric;
  v_multiplier int;
  v_rule record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(current_setting('app.allow_customer_checkout_rpc', true), '') = 'true'
     OR COALESCE(current_setting('app.allow_driver_order_rpc', true), '') = 'true'
     OR COALESCE(current_setting('app.skip_item_inventory_deduct', true), '') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT LOWER(COALESCE(role, '')) INTO v_actor_role
  FROM public.user_profiles
  WHERE id = v_uid;

  IF v_actor_role IN ('admin', 'warehouse') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND v_actor_role = 'driver' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.product_variant_id IS DISTINCT FROM OLD.product_variant_id
       OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
       OR COALESCE(NEW.quantity_variants, 0) <= 0
       OR COALESCE(NEW.quantity_variants, 0) > COALESCE(OLD.quantity_variants, 0)
       OR LOWER(COALESCE(NEW.status, '')) NOT IN ('out_for_delivery', 'delivered', 'rejected') THEN
      RAISE EXCEPTION 'Drivers cannot alter item product, unit_price, or increase quantity.';
    END IF;

    SELECT COALESCE(multiplier, 1) INTO v_multiplier
    FROM public.product_variants WHERE id = OLD.product_variant_id;

    NEW.total_base_units := NEW.quantity_variants * COALESCE(v_multiplier, 1);
    NEW.line_total := ROUND(NEW.quantity_variants * COALESCE(OLD.unit_price, 0), 2);
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND v_actor_role = 'driver' THEN
    IF LOWER(COALESCE(NEW.status, '')) <> 'rejected'
       OR COALESCE(NEW.quantity_variants, 0) <= 0 THEN
      RAISE EXCEPTION 'Drivers may only insert positive rejected split items during partial delivery.';
    END IF;

    -- Require an existing delivered sibling line for the same order + variant and reuse its trusted unit_price
    SELECT oi.unit_price INTO v_auth_price
    FROM public.order_items oi
    WHERE oi.order_id = NEW.order_id
      AND oi.product_variant_id = NEW.product_variant_id
      AND UPPER(COALESCE(oi.status, '')) = 'DELIVERED'
    ORDER BY oi.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rejected split item requires a matching delivered item on the same order.';
    END IF;

    SELECT COALESCE(multiplier, 1) INTO v_multiplier
    FROM public.product_variants WHERE id = NEW.product_variant_id;

    NEW.unit_price := v_auth_price;
    NEW.total_base_units := NEW.quantity_variants * COALESCE(v_multiplier, 1);
    NEW.line_total := ROUND(NEW.quantity_variants * v_auth_price, 2);
    PERFORM set_config('app.skip_item_inventory_deduct', 'true', true);
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND v_actor_role IN ('retail', 'user', 'b2b', 'agency_admin') THEN
    SELECT company_id INTO v_company_id FROM public.orders WHERE id = NEW.order_id;

    SELECT
      CASE WHEN COALESCE(pv.price, 0) > 0 THEN pv.price
           ELSE COALESCE(p.retail_base_price, 0) * GREATEST(COALESCE(pv.multiplier, 1), 1)
      END,
      GREATEST(COALESCE(pv.multiplier, 1), 1)
    INTO v_variant_retail, v_multiplier
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = NEW.product_variant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product variant not found.';
    END IF;

    v_auth_price := v_variant_retail;
    IF v_company_id IS NOT NULL THEN
      SELECT rule_type::text AS rule_type, value INTO v_rule
      FROM public.pricing_rules
      WHERE company_id = v_company_id AND variant_id = NEW.product_variant_id
      ORDER BY created_at DESC LIMIT 1;
      IF FOUND THEN
        IF v_rule.rule_type = 'percentage' THEN
          v_auth_price := v_variant_retail * (1.0 - (COALESCE(v_rule.value, 0) / 100.0));
        ELSIF v_rule.rule_type = 'fixed' THEN
          v_auth_price := COALESCE(v_rule.value, v_variant_retail);
        END IF;
      END IF;
    END IF;

    NEW.unit_price := ROUND(GREATEST(COALESCE(v_auth_price, 0), 0), 2);
    NEW.total_base_units := NEW.quantity_variants * v_multiplier;
    NEW.line_total := ROUND(NEW.quantity_variants * NEW.unit_price, 2);
    NEW.status := 'active';
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_compat_order_item_security ON public.order_items;
CREATE TRIGGER enforce_compat_order_item_security
BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_compat_order_item_security();

REVOKE ALL ON FUNCTION public.enforce_compat_order_item_security() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_compat_order_item_security() TO service_role;

-- Migration: Add persisted manual route stop ordering for drivers and atomic save_driver_stop_order RPC.
-- Preserves existing driver_name compatibility while adding additive route metadata and optimistic concurrency control.

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS route_position integer,
ADD COLUMN IF NOT EXISTS route_run_date date,
ADD COLUMN IF NOT EXISTS route_order_version integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_route_position_positive_chk'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_route_position_positive_chk
    CHECK (route_position IS NULL OR route_position >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_route_ordering
ON public.orders (assigned_driver_id, route_run_date, route_position);

-- Protect route ordering columns from unauthorized updates and clear route metadata if returned to pending
CREATE OR REPLACE FUNCTION public.protect_order_route_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending'::public.order_status THEN
    NEW.route_position := NULL;
    NEW.route_run_date := NULL;
  END IF;

  IF (
    NEW.route_position IS DISTINCT FROM OLD.route_position
    OR NEW.route_run_date IS DISTINCT FROM OLD.route_run_date
    OR NEW.route_order_version IS DISTINCT FROM OLD.route_order_version
  ) THEN
    IF COALESCE(current_setting('app.allow_route_order_write', true), '') <> 'true'
       AND COALESCE(current_setting('app.allow_return_to_approval', true), '') <> 'true' THEN
      IF public.get_user_role() NOT IN ('admin', 'warehouse') THEN
        RAISE EXCEPTION 'Only authorized admin or warehouse staff can modify driver route order.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_order_route_columns ON public.orders;
CREATE TRIGGER trigger_protect_order_route_columns
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.protect_order_route_columns();

-- Atomic RPC for Warehouse/Dispatch to persist manual stop sequence per driver and planned run date
CREATE OR REPLACE FUNCTION public.save_driver_stop_order(
  p_driver_id uuid,
  p_run_scope date,
  p_ordered_order_ids uuid[],
  p_expected_versions jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := public.get_user_role();
  v_driver_name text;
  v_run_date date := COALESCE(p_run_scope, CURRENT_DATE);
  v_total_input integer := COALESCE(array_length(p_ordered_order_ids, 1), 0);
  v_distinct_input integer := 0;
  v_found_count integer := 0;
  v_rec record;
  v_expected_ver integer;
BEGIN
  IF v_user_id IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to update driver route order.';
  END IF;

  SELECT full_name INTO v_driver_name
  FROM public.user_profiles
  WHERE id = p_driver_id
    AND role = 'driver'
    AND COALESCE(status, 'active') = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active driver not found.';
  END IF;

  IF v_total_input = 0 THEN
    RAISE EXCEPTION 'Route stop list cannot be empty.';
  END IF;

  SELECT COUNT(DISTINCT id) INTO v_distinct_input
  FROM unnest(p_ordered_order_ids) AS id;

  IF v_distinct_input <> v_total_input THEN
    RAISE EXCEPTION 'Duplicate order IDs are not allowed in route order.';
  END IF;

  -- Lock candidate rows in deterministic UUID order to prevent deadlocks on concurrent saves.
  FOR v_rec IN
    SELECT o.*
    FROM public.orders o
    WHERE o.id = ANY (p_ordered_order_ids)
    ORDER BY o.id
    FOR UPDATE
  LOOP
    v_found_count := v_found_count + 1;

    -- Verify order belongs to this driver (via stable ID or legacy driver_name prefix)
    IF NOT (
      v_rec.assigned_driver_id = p_driver_id
      OR (
        v_rec.assigned_driver_id IS NULL
        AND v_rec.driver_name IS NOT NULL
        AND v_rec.driver_name ILIKE v_driver_name || '%'
      )
    ) THEN
      RAISE EXCEPTION 'Order % is not assigned to driver %.', v_rec.id, v_driver_name;
    END IF;

    -- Verify eligible active fulfillment state
    IF NOT (
      v_rec.status IN (
        'ready_for_delivery'::public.order_status,
        'shipped'::public.order_status,
        'out_for_delivery'::public.order_status
      )
      OR (
        v_rec.status IN ('delivered_partial'::public.order_status, 'delivered'::public.order_status)
        AND EXISTS (
          SELECT 1
          FROM public.order_items oi
          WHERE oi.order_id = v_rec.id
            AND upper(COALESCE(oi.status, '')) IN ('READY_TO_PACK', 'SHIPPED', 'OUT_FOR_DELIVERY')
        )
      )
    ) THEN
      RAISE EXCEPTION 'Order % in status "%" is no longer eligible for active route ordering.', v_rec.id, v_rec.status;
    END IF;

    -- Prevent accidentally overwriting an existing run from another planned date
    IF v_rec.route_run_date IS NOT NULL AND v_rec.route_run_date <> v_run_date THEN
      RAISE EXCEPTION 'Order % is assigned to run date %. Select that run date or refresh.', v_rec.id, v_rec.route_run_date;
    END IF;

    -- Optimistic concurrency check against expected version map if provided
    IF p_expected_versions IS NOT NULL AND (p_expected_versions ? v_rec.id::text) THEN
      v_expected_ver := (p_expected_versions ->> v_rec.id::text)::integer;
      IF COALESCE(v_rec.route_order_version, 0) <> v_expected_ver THEN
        RAISE EXCEPTION 'Route order was modified by another user. Refresh and try again.';
      END IF;
    END IF;
  END LOOP;

  IF v_found_count <> v_total_input THEN
    RAISE EXCEPTION 'One or more submitted orders could not be found.';
  END IF;

  -- Ensure no active order already scheduled for this driver + run date was silently omitted
  IF EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE (
        o.assigned_driver_id = p_driver_id
        OR (
          o.assigned_driver_id IS NULL
          AND o.driver_name IS NOT NULL
          AND o.driver_name ILIKE v_driver_name || '%'
        )
      )
      AND o.route_run_date = v_run_date
      AND (
        o.status IN (
          'ready_for_delivery'::public.order_status,
          'shipped'::public.order_status,
          'out_for_delivery'::public.order_status
        )
        OR (
          o.status IN ('delivered_partial'::public.order_status, 'delivered'::public.order_status)
          AND EXISTS (
            SELECT 1
            FROM public.order_items oi
            WHERE oi.order_id = o.id
              AND upper(COALESCE(oi.status, '')) IN ('READY_TO_PACK', 'SHIPPED', 'OUT_FOR_DELIVERY')
          )
        )
      )
      AND NOT (o.id = ANY (p_ordered_order_ids))
  ) THEN
    RAISE EXCEPTION 'Active stops for driver % on % changed concurrently. Refresh before saving.', v_driver_name, v_run_date;
  END IF;

  PERFORM set_config('app.allow_route_order_write', 'true', true);

  UPDATE public.orders o
  SET
    route_position = seq.pos::integer,
    route_run_date = v_run_date,
    route_order_version = COALESCE(o.route_order_version, 0) + 1,
    assigned_driver_id = COALESCE(o.assigned_driver_id, p_driver_id),
    updated_at = NOW()
  FROM unnest(p_ordered_order_ids) WITH ORDINALITY AS seq(order_id, pos)
  WHERE o.id = seq.order_id;

  RETURN jsonb_build_object(
    'success', true,
    'driver_id', p_driver_id,
    'run_date', v_run_date,
    'count', v_total_input
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_driver_stop_order(uuid, date, uuid[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_driver_stop_order(uuid, date, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_driver_stop_order(uuid, date, uuid[], jsonb) TO service_role;

-- Migration: Add transactional return_order_to_approval RPC and narrow transition guard trigger.
-- Allows Admin/Warehouse to safely return processing/ready_for_delivery orders to 'pending'
-- before dispatch without touching inventory reservations or recreating order IDs.

CREATE OR REPLACE FUNCTION public.return_order_to_approval(
  p_order_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := public.get_user_role();
  v_clean_reason text := btrim(COALESCE(p_reason, ''));
  v_order public.orders%ROWTYPE;
  v_prev_status text;
  v_metadata jsonb;
BEGIN
  IF v_user_id IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to return orders to approval.';
  END IF;

  IF v_clean_reason = '' THEN
    RAISE EXCEPTION 'A reason is required to return an order to approval.';
  END IF;

  IF char_length(v_clean_reason) > 500 THEN
    RAISE EXCEPTION 'Reason must be 500 characters or fewer.';
  END IF;

  -- Lock the order row first so concurrent dispatch/return calls serialize safely.
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.status NOT IN ('processing'::public.order_status, 'ready_for_delivery'::public.order_status) THEN
    RAISE EXCEPTION 'Order in "%" status cannot be returned to approval.', v_order.status;
  END IF;

  IF v_order.shipped_at IS NOT NULL
     OR v_order.delivered_at IS NOT NULL
     OR v_order.cancelled_at IS NOT NULL
     OR COALESCE(v_order.is_restocked, false) THEN
    RAISE EXCEPTION 'Dispatched, delivered, cancelled, or restocked orders cannot be returned to approval.';
  END IF;

  -- Lock associated items and reject orders already involved in split/backorder or handoff cycles.
  PERFORM 1
  FROM public.order_items
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.order_items
    WHERE order_id = p_order_id
      AND lower(COALESCE(status, 'active')) IN (
        'backordered',
        'allocated',
        'ready_to_pack',
        'shipped',
        'out_for_delivery',
        'delivered',
        'rejected',
        'restocked'
      )
  ) THEN
    RAISE EXCEPTION 'Orders with split, backordered, or fulfillment-staged items cannot be returned to approval automatically.';
  END IF;

  v_prev_status := v_order.status::text;
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'previous_driver_name', v_order.driver_name,
    'previous_assigned_driver_id', v_order.assigned_driver_id,
    'previous_vehicle_name', v_order.vehicle_name,
    'previous_vehicle_license', v_order.vehicle_license,
    'previous_processing_at', v_order.processing_at
  ));

  -- Permit the guard trigger for this transaction only.
  PERFORM set_config('app.allow_return_to_approval', 'true', true);

  UPDATE public.orders
  SET
    status = 'pending'::public.order_status,
    processing_at = NULL,
    driver_name = NULL,
    assigned_driver_id = NULL,
    vehicle_name = NULL,
    vehicle_model = NULL,
    vehicle_year = NULL,
    vehicle_vin = NULL,
    vehicle_license = NULL,
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Atomic audit log entry in the same transaction; rolls back if update or insert fails.
  INSERT INTO public.order_audit_logs (
    order_id,
    action,
    performed_by,
    actor_role,
    previous_status,
    new_status,
    reason,
    details,
    metadata
  ) VALUES (
    p_order_id,
    'RETURNED_FOR_APPROVAL',
    v_user_id,
    v_role,
    v_prev_status,
    'pending',
    v_clean_reason,
    format('Returned for approval (%s -> pending): %s', v_prev_status, v_clean_reason),
    v_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_status', v_prev_status,
    'new_status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.return_order_to_approval(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_order_to_approval(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_order_to_approval(uuid, text) TO service_role;

-- Guard trigger preventing direct table UPDATE bypasses into/out of 'pending'
CREATE OR REPLACE FUNCTION public.enforce_order_approval_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending'::public.order_status AND OLD.status IS DISTINCT FROM 'pending'::public.order_status THEN
    IF COALESCE(current_setting('app.allow_return_to_approval', true), '') <> 'true'
       OR OLD.status NOT IN ('processing'::public.order_status, 'ready_for_delivery'::public.order_status) THEN
      RAISE EXCEPTION 'Orders can only return to pending approval via return_order_to_approval().';
    END IF;
  END IF;

  IF OLD.status = 'pending'::public.order_status AND NEW.status IS DISTINCT FROM 'pending'::public.order_status THEN
    IF NEW.status NOT IN ('processing'::public.order_status, 'cancelled'::public.order_status) THEN
      RAISE EXCEPTION 'Pending orders must be approved to warehouse processing (or cancelled) before dispatch.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_order_approval_transition ON public.orders;
CREATE TRIGGER trigger_enforce_order_approval_transition
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_approval_transition_guard();

-- Migration: Add customer-visible order_notes, create order_audit_logs table,
-- add transactional update_order_notes RPC, and add security-invoker search_admin_orders RPC.
-- Note: Additive and backward-compatible with live workflows; never alters historical records.

-- 1. Nullable customer-visible order notes column on public.orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS order_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_order_notes_length_chk'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_order_notes_length_chk
    CHECK (order_notes IS NULL OR char_length(order_notes) <= 1000);
  END IF;
END $$;

-- 2. Create public.order_audit_logs (expected by Checkout proxy logging and staff audit actions)
CREATE TABLE IF NOT EXISTS public.order_audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  previous_status text,
  new_status text,
  reason text,
  details text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_audit_logs_order_id_created_at
ON public.order_audit_logs (order_id, created_at DESC);

ALTER TABLE public.order_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.order_audit_logs FROM anon;
REVOKE ALL ON TABLE public.order_audit_logs FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.order_audit_logs TO authenticated;
GRANT ALL ON TABLE public.order_audit_logs TO service_role;

DROP POLICY IF EXISTS "Staff view order audit logs" ON public.order_audit_logs;
CREATE POLICY "Staff view order audit logs" ON public.order_audit_logs
FOR SELECT TO authenticated
USING (public.get_user_role() IN ('admin', 'warehouse'));

DROP POLICY IF EXISTS "Staff insert order audit logs" ON public.order_audit_logs;
CREATE POLICY "Staff insert order audit logs" ON public.order_audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.get_user_role() IN ('admin', 'warehouse')
  AND (performed_by IS NULL OR performed_by = (SELECT auth.uid()))
);

-- 3. RPC to edit customer-visible order_notes while an order is still in 'pending' approval
CREATE OR REPLACE FUNCTION public.update_order_notes(
  p_order_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := public.get_user_role();
  v_company_id uuid := public.get_my_company_id();
  v_order public.orders%ROWTYPE;
  v_clean_notes text;
  v_is_owner boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  v_is_owner := (
    (v_role IN ('retail', 'user') AND v_order.user_id = v_user_id)
    OR (v_role IN ('b2b', 'agency_admin') AND v_order.company_id IS NOT NULL AND v_order.company_id = v_company_id)
  );

  IF v_role NOT IN ('admin', 'warehouse') AND NOT v_is_owner THEN
    RAISE EXCEPTION 'Not authorized to update notes for this order.';
  END IF;

  IF v_order.status::text <> 'pending' THEN
    RAISE EXCEPTION 'Order notes can only be edited while the order is Pending approval. Send the order back to approval first.';
  END IF;

  v_clean_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  IF v_clean_notes IS NOT NULL AND char_length(v_clean_notes) > 1000 THEN
    RAISE EXCEPTION 'Order notes cannot exceed 1000 characters.';
  END IF;

  UPDATE public.orders
  SET
    order_notes = v_clean_notes,
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_role IN ('admin', 'warehouse') THEN
    INSERT INTO public.order_audit_logs (
      order_id,
      action,
      performed_by,
      actor_role,
      previous_status,
      new_status,
      details,
      metadata
    ) VALUES (
      p_order_id,
      'ORDER_NOTES_UPDATED',
      v_user_id,
      v_role,
      v_order.status::text,
      v_order.status::text,
      'Updated customer-visible order notes while pending approval',
      jsonb_build_object(
        'had_notes_before', v_order.order_notes IS NOT NULL,
        'has_notes_after', v_clean_notes IS NOT NULL
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_notes', v_clean_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_notes(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_notes(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_notes(uuid, text) TO service_role;

-- 4. Server-side search RPC (SECURITY INVOKER) across orders, agencies, retail profiles, patients, and order IDs
CREATE OR REPLACE FUNCTION public.search_admin_orders(
  p_tab text DEFAULT 'all',
  p_search text DEFAULT '',
  p_limit integer DEFAULT 11,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(order_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_user_role();
  v_clean text := btrim(regexp_replace(COALESCE(p_search, ''), '^#+', ''));
  v_escaped text;
  v_pattern text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 11), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_sort_by_updated boolean := COALESCE(p_tab, 'all') IN (
    'completed', 'partially_delivered', 'cancelled', 'paid', 'attempted', 'restocked'
  );
BEGIN
  IF auth.uid() IS NULL OR v_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Not authorized to search admin orders.';
  END IF;

  v_escaped := replace(replace(replace(v_clean, '\', '\\'), '%', '\%'), '_', '\_');
  v_pattern := '%' || v_escaped || '%';

  RETURN QUERY
  SELECT o.id AS order_id
  FROM public.orders o
  LEFT JOIN public.companies c ON c.id = o.company_id
  LEFT JOIN public.user_profiles up ON up.id = o.user_id
  LEFT JOIN public.agency_patients ap ON ap.id = o.patient_id
  WHERE
    (
      CASE COALESCE(p_tab, 'all')
        WHEN 'pending' THEN o.status = 'pending'::public.order_status
        WHEN 'processing' THEN o.status = 'processing'::public.order_status
        WHEN 'shipped' THEN o.status = 'shipped'::public.order_status
        WHEN 'partially_delivered' THEN o.status = 'delivered_partial'::public.order_status
        WHEN 'completed' THEN o.status = 'delivered'::public.order_status AND o.payment_status = 'unpaid'::public.payment_status
        WHEN 'paid' THEN o.payment_status = 'paid'::public.payment_status
        WHEN 'cancelled' THEN o.status = 'cancelled'::public.order_status
        WHEN 'attempted' THEN o.status = 'attempted'::public.order_status
        WHEN 'restocked' THEN o.is_restocked = true AND o.processing_at IS NOT NULL
        WHEN 'due' THEN o.status IN ('delivered'::public.order_status, 'delivered_partial'::public.order_status)
          AND o.payment_method = 'net_30'::public.payment_method
          AND o.payment_status = 'unpaid'::public.payment_status
          AND o.created_at <= (now() - interval '25 days')
        ELSE true
      END
    )
    AND (
      v_clean = ''
      OR COALESCE(o.shipping_name, '') ILIKE v_pattern ESCAPE '\'
      OR COALESCE(o.customer_name, '') ILIKE v_pattern ESCAPE '\'
      OR COALESCE(o.patient_name, '') ILIKE v_pattern ESCAPE '\'
      OR COALESCE(c.name, '') ILIKE v_pattern ESCAPE '\'
      OR COALESCE(up.full_name, '') ILIKE v_pattern ESCAPE '\'
      OR COALESCE(ap.full_name, '') ILIKE v_pattern ESCAPE '\'
      OR o.id::text ILIKE v_pattern ESCAPE '\'
    )
  ORDER BY
    CASE WHEN v_sort_by_updated THEN COALESCE(o.updated_at, o.created_at) ELSE o.created_at END DESC,
    o.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_admin_orders(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_admin_orders(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_admin_orders(text, text, integer, integer) TO service_role;

-- ============================================================================
-- DISABLE LEGACY FRONTEND COMPATIBILITY LAYER (Run AFTER PR #14 is LIVE)
-- Removes temporary compat RLS policies and compat triggers so direct customer
-- and driver table mutations are blocked in favor of hardened RPCs.
-- Non-destructive: leaves columns intact in case compat must be re-enabled.
-- ============================================================================

DROP TRIGGER IF EXISTS reconcile_compat_order_totals_trg ON public.order_items;
DROP FUNCTION IF EXISTS public.reconcile_compat_order_totals();

DROP TRIGGER IF EXISTS enforce_compat_order_item_security_trg ON public.order_items;
DROP FUNCTION IF EXISTS public.enforce_compat_order_item_security();

DROP TRIGGER IF EXISTS enforce_compat_order_header_security_trg ON public.orders;
DROP FUNCTION IF EXISTS public.enforce_compat_order_header_security();

DROP POLICY IF EXISTS "Legacy compat customer insert pending orders" ON public.orders;
DROP POLICY IF EXISTS "Legacy compat customer insert pending order items" ON public.order_items;
DROP POLICY IF EXISTS "Legacy compat driver update assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Legacy compat driver update assigned order items" ON public.order_items;
DROP POLICY IF EXISTS "Legacy compat driver insert rejected split items" ON public.order_items;

/**
 * Shared order lifecycle, return-to-approval eligibility, and order-note validation helpers.
 * Mirrors server-side invariants in Postgres RPCs so UI gating and unit tests stay aligned.
 */

export const MAX_ORDER_NOTES_LENGTH = 1000;
export const MAX_RETURN_REASON_LENGTH = 500;

export const RETURN_ELIGIBLE_ORDER_STATUSES = new Set(['processing', 'ready_for_delivery']);

// Item statuses indicating a split/backorder or physical dispatch/handoff cycle that must
// never be silently reverted into a fresh pre-approval pending order.
export const BLOCKED_RETURN_ITEM_STATUSES = new Set([
  'backordered',
  'allocated',
  'ready_to_pack',
  'shipped',
  'out_for_delivery',
  'delivered',
  'rejected',
  'restocked',
]);

/**
 * Determine if an order can be safely returned to 'pending' approval before dispatch.
 * Server RPC remains final authority against concurrent dispatch races.
 */
export function evaluateReturnToApprovalEligibility(order) {
  if (!order || !order.id) {
    return { eligible: false, reason: 'Order record is missing.' };
  }

  const normalizedStatus = String(order.status || '').toLowerCase();
  if (!RETURN_ELIGIBLE_ORDER_STATUSES.has(normalizedStatus)) {
    return {
      eligible: false,
      reason: `Orders in "${normalizedStatus.replace(/_/g, ' ')}" status cannot be returned to approval.`,
    };
  }

  if (order.shipped_at || order.delivered_at || order.cancelled_at || order.is_restocked) {
    return {
      eligible: false,
      reason: 'Orders with dispatch, delivery, cancellation, or restock history cannot be returned to approval.',
    };
  }

  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const blockingItem = items.find((item) =>
    BLOCKED_RETURN_ITEM_STATUSES.has(String(item?.status || '').toLowerCase())
  );

  if (blockingItem) {
    return {
      eligible: false,
      reason: `Orders containing ${String(blockingItem.status).toLowerCase()} or split/backordered items cannot be returned to approval automatically.`,
    };
  }

  return { eligible: true, reason: null };
}

/**
 * Normalize and validate customer-visible order notes.
 */
export function normalizeOrderNotes(rawNotes) {
  if (typeof rawNotes !== 'string') return { valid: true, value: null, error: null };
  const trimmed = rawNotes.trim();
  if (!trimmed) return { valid: true, value: null, error: null };
  if (trimmed.length > MAX_ORDER_NOTES_LENGTH) {
    return {
      valid: false,
      value: trimmed,
      error: `Order notes cannot exceed ${MAX_ORDER_NOTES_LENGTH} characters.`,
    };
  }
  return { valid: true, value: trimmed, error: null };
}

/**
 * Trim search query cleanly before invoking server-side search RPC.
 */
export function normalizeOrderSearchQuery(rawQuery) {
  if (typeof rawQuery !== 'string') return '';
  return rawQuery.trim().replace(/^#/, '');
}

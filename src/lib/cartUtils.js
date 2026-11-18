/**
 * Pure cart calculation and quantity normalization helpers for Checkout.
 * Ensures deterministic line totals, minimum quantity bounds (>= 1), and
 * consistent subtotal/tax/shipping/grand-total calculations.
 */

export function roundCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Clamp any candidate quantity input to a safe positive integer >= 1.
 */
export function clampCartQuantity(rawValue, fallback = 1) {
  const parsed = Number.parseInt(String(rawValue ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    const safeFallback = Number.parseInt(String(fallback ?? 1), 10);
    return Number.isFinite(safeFallback) && safeFallback >= 1 ? safeFallback : 1;
  }
  return parsed;
}

/**
 * Return a normalized cart array with clamped quantities and recomputed line_total.
 */
export function normalizeCartItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const quantity = clampCartQuantity(item?.quantity, 1);
    const unitPrice = roundCurrency(item?.unit_price ?? 0);
    return {
      ...item,
      quantity,
      unit_price: unitPrice,
      line_total: roundCurrency(unitPrice * quantity),
    };
  });
}

/**
 * Deterministically update a single cart item's quantity (by index) and recompute line_total.
 */
export function updateCartItemQuantity(cart, targetIndex, rawNextQuantity) {
  if (!Array.isArray(cart)) return [];
  if (targetIndex < 0 || targetIndex >= cart.length) return cart;

  const existing = cart[targetIndex];
  const nextQuantity = clampCartQuantity(rawNextQuantity, existing?.quantity ?? 1);
  const unitPrice = roundCurrency(existing?.unit_price ?? 0);

  return cart.map((item, idx) =>
    idx === targetIndex
      ? {
          ...item,
          quantity: nextQuantity,
          unit_price: unitPrice,
          line_total: roundCurrency(unitPrice * nextQuantity),
        }
      : item
  );
}

/**
 * Deterministically compute checkout totals from unit_price * quantity across all items.
 */
export function calculateCheckoutTotals(
  cart,
  { isB2B = false, customShippingFee = null, taxRate = 0, taxExempt = false } = {}
) {
  const normalized = normalizeCartItems(cart);
  const subtotal = roundCurrency(
    normalized.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  );
  const shippingFee = roundCurrency(
    isB2B ? (customShippingFee !== null && customShippingFee !== undefined ? customShippingFee : 0) : 10.0
  );
  const effectiveTaxRate = isB2B && taxExempt ? 0 : Math.max(0, Number(taxRate) || 0);
  const taxAmount = roundCurrency(subtotal * effectiveTaxRate);
  const totalAmount = roundCurrency(subtotal + shippingFee + taxAmount);

  return {
    normalizedCart: normalized,
    subtotal,
    shippingFee,
    taxRate: effectiveTaxRate,
    taxAmount,
    totalAmount,
  };
}

/**
 * Validate cart items before final order submission.
 */
export function validateCartForSubmission(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return { valid: false, error: 'Your cart is empty.' };
  }
  for (const item of cart) {
    const qty = Number(item?.quantity);
    const price = Number(item?.unit_price);
    if (!item?.variant_id || !Number.isInteger(qty) || qty < 1) {
      return {
        valid: false,
        error: `Invalid quantity for "${item?.name || 'cart item'}". Quantity must be at least 1.`,
      };
    }
    if (!Number.isFinite(price) || price < 0) {
      return {
        valid: false,
        error: `Invalid price for "${item?.name || 'cart item'}".`,
      };
    }
  }
  return { valid: true, error: null };
}

/**
 * Safely read a persisted cart array from localStorage without throwing on invalid JSON.
 */
export function readCartFromStorage(cartKey) {
  if (typeof window === 'undefined' || !cartKey) return [];
  try {
    const savedCart = window.localStorage.getItem(cartKey);
    if (!savedCart) return [];
    const parsed = JSON.parse(savedCart);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Safely persist a cart array to localStorage for an explicit scoped cart key.
 */
export function writeCartToStorage(cartKey, items) {
  if (typeof window === 'undefined' || !cartKey) return;
  try {
    window.localStorage.setItem(cartKey, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {
    // Storage access may be restricted
  }
}

/**
 * Generate a UUIDv4 idempotency key for atomic Checkout RPC submission.
 */
export function generateIdempotencyKey() {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Deterministic fingerprint for a pending checkout payload so network retries reuse the
 * same idempotency_key while cart/form edits generate a fresh key.
 */
export function buildCheckoutRequestSignature(payload) {
  return JSON.stringify(payload ?? {});
}

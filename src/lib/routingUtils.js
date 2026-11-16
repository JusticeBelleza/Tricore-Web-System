/**
 * Pure routing, single-stop Google Maps navigation URL, and ID-safe waypoint
 * mapping helpers for Warehouse/Dispatch route ordering and DriverRoutes.
 */

export const WAREHOUSE_ADDRESS = '2169 Harbor St, Pittsburg CA 94565';

// Google Maps JavaScript DirectionsService supports up to 25 intermediate waypoints.
// Maps URLs support far fewer waypoints (3 on mobile, 9 on desktop), which is why
// driver stop navigation strictly uses single-destination URLs.
export const MAX_GOOGLE_DIRECTIONS_WAYPOINTS = 25;

export function getOptimizationWaypointLimit() {
  const configured = Number.parseInt(
    import.meta?.env?.VITE_MAX_ROUTE_WAYPOINTS ?? '',
    10
  );
  if (Number.isFinite(configured) && configured >= 1) {
    return Math.min(configured, MAX_GOOGLE_DIRECTIONS_WAYPOINTS);
  }
  return MAX_GOOGLE_DIRECTIONS_WAYPOINTS;
}

/**
 * Format and validate a single order's delivery address.
 */
export function formatOrderDeliveryAddress(order) {
  const street = typeof order?.shipping_address === 'string' ? order.shipping_address.trim() : '';
  const city = typeof order?.shipping_city === 'string' ? order.shipping_city.trim() : '';
  const state = typeof order?.shipping_state === 'string' ? order.shipping_state.trim() : '';
  const zip = typeof order?.shipping_zip === 'string' ? order.shipping_zip.trim() : '';

  const stateZip = [state, zip].filter(Boolean).join(' ').trim();
  const cityStateZip = [city, stateZip].filter(Boolean).join(', ').trim();
  const fullAddress = [street, cityStateZip].filter(Boolean).join(', ').trim();

  const hasStreet = street.length >= 3;
  const hasLocality = city.length >= 2 || zip.length >= 5;
  const isValid = hasStreet && hasLocality && fullAddress.length >= 6;

  return {
    street,
    cityStateZip,
    fullAddress,
    isValid,
    missingReason: isValid ? null : 'Missing or incomplete delivery address',
  };
}

/**
 * Build a one-stop Google Maps Directions URL using only the stop's single destination.
 * Returns null if the address is missing/invalid so the UI never opens a broken link.
 */
export function buildSingleStopNavigationUrl(order) {
  const { fullAddress, isValid } = formatOrderDeliveryAddress(order);
  if (!isValid) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    fullAddress
  )}&travelmode=driving`;
}

/**
 * Sort driver stops deterministically: saved route_position stops first (by run date
 * then position), followed by legacy/unordered stops sorted by creation time.
 */
export function sortDriverStops(orders) {
  if (!Array.isArray(orders)) return [];
  return [...orders].sort((a, b) => {
    const aHasPos = a?.route_position !== null && a?.route_position !== undefined;
    const bHasPos = b?.route_position !== null && b?.route_position !== undefined;

    if (aHasPos && !bHasPos) return -1;
    if (!aHasPos && bHasPos) return 1;

    if (aHasPos && bHasPos) {
      const dateA = a.route_run_date || '9999-12-31';
      const dateB = b.route_run_date || '9999-12-31';
      if (dateA !== dateB) return dateA.localeCompare(dateB);

      const posDiff = Number(a.route_position) - Number(b.route_position);
      if (posDiff !== 0) return posDiff;
    }

    const timeA = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return timeA - timeB;
  });
}

/**
 * Return true if any assigned stop already carries a persisted manual Warehouse route order.
 */
export function hasSavedManualRouteOrder(orders) {
  return Array.isArray(orders) && orders.some(
    (o) => o?.route_position !== null && o?.route_position !== undefined
  );
}

/**
 * Validate whether an assigned stop list can safely be sent to Google DirectionsService.
 * Never truncates stops or silently filters out missing addresses.
 */
export function prepareDirectionsOptimizationInput(
  orders,
  maxWaypoints = getOptimizationWaypointLimit()
) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return { supported: false, reason: 'No delivery stops available to optimize.', stopDescriptors: [] };
  }

  const effectiveLimit = Math.min(
    Math.max(1, Number(maxWaypoints) || MAX_GOOGLE_DIRECTIONS_WAYPOINTS),
    MAX_GOOGLE_DIRECTIONS_WAYPOINTS
  );

  if (orders.length > effectiveLimit) {
    return {
      supported: false,
      oversized: true,
      reason: `Route has ${orders.length} stops, which exceeds the ${effectiveLimit}-stop automatic optimization limit. Following assigned order and one-stop navigation.`,
      stopDescriptors: [],
    };
  }

  const missingOrderIds = [];
  const stopDescriptors = orders.map((order) => {
    const addrInfo = formatOrderDeliveryAddress(order);
    if (!addrInfo.isValid) {
      missingOrderIds.push(order.id);
    }
    return {
      orderId: order.id,
      address: addrInfo.fullAddress,
    };
  });

  if (missingOrderIds.length > 0) {
    return {
      supported: false,
      hasMissingAddresses: true,
      missingOrderIds,
      reason: `${missingOrderIds.length} stop(s) are missing a complete delivery address. Skipping automatic optimization to preserve stop order.`,
      stopDescriptors: [],
    };
  }

  return {
    supported: true,
    reason: null,
    stopDescriptors,
    waypoints: stopDescriptors.map((s) => ({
      location: s.address,
      stopover: true,
    })),
  };
}

/**
 * Map Google DirectionsService waypoint_order indices back to exact order IDs,
 * preserving duplicate addresses as distinct stop records.
 */
export function mapWaypointOrderToOrderIds(stopDescriptors, waypointOrder, legs = []) {
  if (!Array.isArray(stopDescriptors) || !Array.isArray(waypointOrder)) return null;
  if (stopDescriptors.length === 0 || waypointOrder.length !== stopDescriptors.length) {
    return null;
  }

  const seenIndices = new Set();
  const mapped = [];

  for (let i = 0; i < waypointOrder.length; i++) {
    const origIdx = waypointOrder[i];
    if (!Number.isInteger(origIdx) || origIdx < 0 || origIdx >= stopDescriptors.length) {
      return null;
    }
    if (seenIndices.has(origIdx)) return null;
    seenIndices.add(origIdx);

    const descriptor = stopDescriptors[origIdx];
    mapped.push({
      orderId: descriptor.orderId,
      travelDistance: legs?.[i]?.distance?.text ?? legs?.[i]?.distance ?? undefined,
      travelTime: legs?.[i]?.duration?.text ?? legs?.[i]?.duration ?? undefined,
      routeLegIndex: i,
    });
  }

  return mapped;
}

/**
 * Reorder an order array deterministically using mapped order IDs while preserving
 * all stops (never dropping any stop).
 */
export function reorderOrdersByMappedSequence(orders, mappedSequence) {
  if (!Array.isArray(orders) || !Array.isArray(mappedSequence)) return orders || [];
  const byId = new Map(orders.map((o) => [o.id, o]));
  const result = [];
  const includedIds = new Set();

  for (const step of mappedSequence) {
    const matched = byId.get(step.orderId);
    if (matched) {
      includedIds.add(matched.id);
      result.push({
        ...matched,
        travelDistance: step.travelDistance ?? matched.travelDistance,
        travelTime: step.travelTime ?? matched.travelTime,
        routeLegIndex: step.routeLegIndex,
      });
    }
  }

  // Append any order not in mappedSequence so a stop can never disappear
  for (const order of orders) {
    if (!includedIds.has(order.id)) {
      result.push(order);
    }
  }

  return result;
}

/**
 * Move a stop up or down cleanly in a draft route list.
 */
export function moveStopInList(stops, index, direction) {
  if (!Array.isArray(stops)) return [];
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= stops.length || targetIndex < 0 || targetIndex >= stops.length) {
    return stops;
  }
  const next = [...stops];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

import React, { useState, useMemo } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { supabase } from '../lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  ArrowDown,
  Save,
  Sparkles,
  User,
  Calendar,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Route as RouteIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  WAREHOUSE_ADDRESS,
  formatOrderDeliveryAddress,
  sortDriverStops,
  moveStopInList,
  prepareDirectionsOptimizationInput,
  mapWaypointOrderToOrderIds,
  reorderOrdersByMappedSequence,
  getOptimizationWaypointLimit,
} from '../lib/routingUtils';

function getTodayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Shared Warehouse & Dispatch control panel for inspecting and persisting manual
 * driver stop sequences via save_driver_stop_order.
 */
export default function DriverRouteOrderManager({ drivers = [] }) {
  const queryClient = useQueryClient();
  const { isLoaded: isMapsLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });

  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [runDate, setRunDate] = useState(getTodayDateString);
  const [draftState, setDraftState] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [statusState, setStatusState] = useState(null);

  const effectiveDriverId = selectedDriverId || drivers[0]?.id || '';
  const scopeKey = `${effectiveDriverId}:${runDate}`;

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === effectiveDriverId) || null,
    [drivers, effectiveDriverId]
  );

  const {
    data: routeQueryData = { stops: [], otherRunDates: [] },
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['driver_route_stops_manager', effectiveDriverId, runDate],
    enabled: !!effectiveDriverId && !!selectedDriver?.full_name,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data: backorderItems, error: boErr } = await supabase
        .from('order_items')
        .select('order_id')
        .in('status', ['READY_TO_PACK', 'SHIPPED', 'OUT_FOR_DELIVERY']);
      if (boErr) throw boErr;
      const backorderOrderIds =
        backorderItems && backorderItems.length > 0
          ? [...new Set(backorderItems.map((i) => i.order_id))]
          : [];

      let query = supabase
        .from('orders')
        .select(
          `id, status, created_at, assigned_driver_id, driver_name, route_position, route_run_date, route_order_version, shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, companies(name), order_items(id, status)`
        );

      if (backorderOrderIds.length > 0) {
        query = query.or(
          `status.in.(ready_for_delivery,shipped,out_for_delivery),id.in.(${backorderOrderIds.join(',')})`
        );
      } else {
        query = query.in('status', ['ready_for_delivery', 'shipped', 'out_for_delivery']);
      }

      const driverPrefix = `${selectedDriver.full_name}%`;
      query = query.or(
        `assigned_driver_id.eq.${effectiveDriverId},and(assigned_driver_id.is.null,driver_name.ilike.${driverPrefix})`
      );

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      const eligibleAll = (data || []).filter((o) => {
        const isBackorder = ['delivered_partial', 'delivered'].includes(o.status);
        if (isBackorder) {
          const hasPendingRunItems = o.order_items?.some((i) =>
            ['READY_TO_PACK', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(i.status?.toUpperCase())
          );
          if (!hasPendingRunItems) return false;
        }
        return true;
      });

      const currentStops = [];
      const otherDateMap = new Map();
      for (const o of eligibleAll) {
        if (!o.route_run_date || o.route_run_date === runDate) {
          currentStops.push(o);
        } else {
          otherDateMap.set(o.route_run_date, (otherDateMap.get(o.route_run_date) || 0) + 1);
        }
      }

      const otherRunDates = [...otherDateMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count }));

      return {
        stops: sortDriverStops(currentStops),
        otherRunDates,
      };
    },
  });

  const fetchedStops = routeQueryData.stops;
  const otherRunDates = routeQueryData.otherRunDates;
  const isDirty = draftState?.scopeKey === scopeKey;
  const draftStops = isDirty ? draftState.stops : fetchedStops;
  const statusMessage = statusState?.scopeKey === scopeKey ? statusState : null;

  const saveOrderMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveDriverId) throw new Error('Select a driver first.');
      if (draftStops.length === 0) throw new Error('No stops to save.');

      const orderedIds = draftStops.map((s) => s.id);
      const expectedVersions = {};
      draftStops.forEach((s) => {
        expectedVersions[s.id] = Number(s.route_order_version ?? 0);
      });

      const { data, error: rpcErr } = await supabase.rpc('save_driver_stop_order', {
        p_driver_id: effectiveDriverId,
        p_run_scope: runDate,
        p_ordered_order_ids: orderedIds,
        p_expected_versions: expectedVersions,
      });

      if (rpcErr) throw rpcErr;
      return data;
    },
    onSuccess: () => {
      setDraftState(null);
      setStatusState({
        scopeKey,
        type: 'success',
        text: `Saved ${draftStops.length} stop(s) for ${selectedDriver?.full_name || 'driver'} (${runDate}).`,
      });
      toast.success('Driver route order saved!');
      queryClient.invalidateQueries({ queryKey: ['driver_route_stops_manager'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch_deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['admin_orders'] });
    },
    onError: (err) => {
      setStatusState({
        scopeKey,
        type: 'error',
        text: err.message || 'Failed to save route order. Refresh and try again.',
      });
      toast.error(err.message || 'Failed to save route order.');
    },
  });

  const handleMove = (index, direction) => {
    setDraftState((prev) => {
      const baseStops = prev?.scopeKey === scopeKey ? prev.stops : fetchedStops;
      return {
        scopeKey,
        stops: moveStopInList(baseStops, index, direction),
      };
    });
    setStatusState(null);
  };

  const handleOptimizePreview = () => {
    if (draftStops.length === 0) return;

    const prep = prepareDirectionsOptimizationInput(draftStops, getOptimizationWaypointLimit());
    if (!prep.supported) {
      setStatusState({ scopeKey, type: 'warning', text: prep.reason });
      toast.warning(prep.reason);
      return;
    }

    if (!isMapsLoaded || !window.google?.maps?.DirectionsService) {
      const msg = 'Google Maps routing service is unavailable right now. Use Up/Down buttons to arrange stops manually.';
      setStatusState({ scopeKey, type: 'warning', text: msg });
      toast.info(msg);
      return;
    }

    setIsOptimizing(true);
    const activeScopeKey = scopeKey;
    const activeStops = draftStops;
    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: WAREHOUSE_ADDRESS,
        destination: WAREHOUSE_ADDRESS,
        waypoints: prep.waypoints,
        optimizeWaypoints: true,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        setIsOptimizing(false);
        if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]) {
          const waypointOrder = result.routes[0].waypoint_order;
          const legs = result.routes[0].legs || [];
          const mapped = mapWaypointOrderToOrderIds(prep.stopDescriptors, waypointOrder, legs);
          if (!mapped) {
            setStatusState({
              scopeKey: activeScopeKey,
              type: 'warning',
              text: 'Received invalid waypoint sequence from Google Maps. Manual order preserved.',
            });
            return;
          }
          const reordered = reorderOrdersByMappedSequence(activeStops, mapped);
          setDraftState({ scopeKey: activeScopeKey, stops: reordered });
          setStatusState({
            scopeKey: activeScopeKey,
            type: 'info',
            text: 'Optimized sequence preview applied. Click "Save Route Order" to persist it for the driver.',
          });
        } else {
          const msg = `Optimization unavailable (${status}). Arrange stops manually and click Save Route Order.`;
          setStatusState({ scopeKey: activeScopeKey, type: 'warning', text: msg });
          toast.warning('Google route optimization unavailable; manual order preserved.');
        }
      }
    );
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-sm shrink-0">
            <RouteIcon size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">
              Planned Driver Route Order
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Arrange stop sequence for a driver run. Saved order takes priority on the Driver App across reloads.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              aria-label="Select driver for route ordering"
              value={effectiveDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-slate-900 shadow-sm"
            >
              {drivers.length === 0 && <option value="">No active drivers</option>}
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="date"
              aria-label="Planned run date"
              value={runDate}
              onChange={(e) => setRunDate(e.target.value)}
              className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-slate-900 shadow-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading || saveOrderMutation.isPending}
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
            title="Refresh stops"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`mx-5 mt-4 p-3.5 rounded-xl border text-xs font-semibold flex items-start gap-2.5 ${
            statusMessage.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : statusMessage.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {otherRunDates.length > 0 && (
        <div className="mx-5 mt-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span>This driver also has active stops saved under another run date:</span>
          <div className="flex flex-wrap gap-1.5">
            {otherRunDates.map((entry) => (
              <button
                key={entry.date}
                type="button"
                onClick={() => setRunDate(entry.date)}
                className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold hover:bg-amber-100 transition-colors"
              >
                {entry.date} ({entry.count})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-5 sm:p-6">
        {isError ? (
          <div className="p-6 text-center bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
            Failed to load assigned stops: {error?.message || 'Unknown error'}
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : draftStops.length === 0 ? (
          <div className="p-10 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <p className="text-sm font-bold text-slate-700">No active stops for this driver & run date</p>
            <p className="text-xs text-slate-500 mt-1">
              Dispatch orders to {selectedDriver?.full_name || 'a driver'} to arrange their delivery sequence.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {draftStops.map((stop, idx) => {
              const shortId = stop.id.substring(0, 8).toUpperCase();
              const recipient = stop.companies?.name
                ? `${stop.companies.name} — ${stop.shipping_name || 'Patient'}`
                : stop.shipping_name || 'Retail Customer';
              const addr = formatOrderDeliveryAddress(stop);

              return (
                <div
                  key={stop.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-sm transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-slate-900 text-white text-xs font-black flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          #{shortId}
                        </span>
                        <p className="font-bold text-sm text-slate-900 truncate">{recipient}</p>
                        {stop.status === 'out_for_delivery' && (
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                            En Route
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                        <MapPin size={12} className={addr.isValid ? 'text-slate-400 shrink-0' : 'text-amber-500 shrink-0'} />
                        {addr.isValid ? (
                          <span className="truncate">{addr.fullAddress}</span>
                        ) : (
                          <span className="text-amber-700 font-semibold">Missing or incomplete address</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0 || saveOrderMutation.isPending}
                      aria-label={`Move order ${shortId} up`}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 transition-all"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === draftStops.length - 1 || saveOrderMutation.isPending}
                      aria-label={`Move order ${shortId} down`}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 transition-all"
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {draftStops.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-xs font-semibold text-slate-500">
              {isDirty ? (
                <span className="text-amber-600 font-bold">Unsaved route order changes</span>
              ) : draftStops.some((s) => s.route_position != null) ? (
                <span className="text-emerald-700">Saved route order active ({draftStops.length} stops)</span>
              ) : (
                <span>Unordered (chronological fallback until saved)</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleOptimizePreview}
                disabled={isOptimizing || saveOrderMutation.isPending || draftStops.length < 2}
                className="px-4 py-2.5 bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <Sparkles size={14} className="text-blue-600" />
                {isOptimizing ? 'Optimizing Preview...' : 'Optimize Preview'}
              </button>

              <button
                type="button"
                onClick={() => saveOrderMutation.mutate()}
                disabled={saveOrderMutation.isPending || draftStops.length === 0}
                className="px-5 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
              >
                <Save size={14} />
                {saveOrderMutation.isPending ? 'Saving...' : 'Save Route Order'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

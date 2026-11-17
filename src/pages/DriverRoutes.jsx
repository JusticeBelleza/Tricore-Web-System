import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker, Polyline } from '@react-google-maps/api';
import { Truck, MapPin, Phone, User, CheckCircle2, AlertTriangle, XCircle, Navigation, Package, DollarSign, Clock, Check, X, PenTool, UploadCloud, Map, Minus, Plus, PackageCheck, Route, Camera, RefreshCw, StickyNote } from 'lucide-react';
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  WAREHOUSE_ADDRESS,
  buildSingleStopNavigationUrl,
  formatOrderDeliveryAddress,
  getOptimizationWaypointLimit,
  hasSavedManualRouteOrder,
  mapWaypointOrderToOrderIds,
  prepareDirectionsOptimizationInput,
  reorderOrdersByMappedSequence,
  sortDriverStops,
} from '../lib/routingUtils';
import { evaluatePodProof } from '../lib/podUtils';

import SignatureCanvas from 'react-signature-canvas';

const compressImage = (file, maxWidth = 800) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = maxWidth / img.width;
        canvas.width = maxWidth;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', 0.7); 
      };
    };
  });
};

// ✨ FIXED: Removed 'shipped' from this check so standard orders don't get trapped
const getActiveItems = (order) => {
  if (!order) return [];
  const isBackorder = ['delivered_partial', 'delivered'].includes(order.status);
  
  if (isBackorder) {
    return order.order_items?.filter(item => ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(item.status?.toUpperCase())) || [];
  }
  
  return order.order_items?.filter(item => 
    item.status?.toLowerCase() !== 'backordered' && 
    item.status?.toLowerCase() !== 'cancelled' && 
    item.status?.toLowerCase() !== 'rejected'
  ) || [];
};

function MasterRouteMap({ orders, onRouteOptimized, currentLocation }) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });

  const [directionsState, setDirectionsState] = useState({ key: '', result: null });
  const [showMap, setShowMap] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  const hasManualPlan = useMemo(() => hasSavedManualRouteOrder(orders), [orders]);
  const maxWaypoints = useMemo(() => getOptimizationWaypointLimit(), []);
  const optimizationInput = useMemo(
    () => prepareDirectionsOptimizationInput(orders, maxWaypoints),
    [orders, maxWaypoints]
  );

  const stopMembershipKey = useMemo(
    () => orders.map((o) => `${o.id}:${o.route_position ?? ''}:${o.route_order_version ?? 0}`).sort().join('|'),
    [orders]
  );

  const routePreviewKey = `${stopMembershipKey}:${hasManualPlan}`;
  const directions = directionsState.key === routePreviewKey ? directionsState.result : null;

  const activeDelivery = orders.find(o => 
    o.status === 'out_for_delivery' || 
    (['delivered_partial', 'delivered'].includes(o.status) && getActiveItems(o).some(i => i.status?.toUpperCase() === 'OUT_FOR_DELIVERY'))
  );
  
  const activeLegIndex = activeDelivery && activeDelivery.routeLegIndex !== undefined 
    ? activeDelivery.routeLegIndex 
    : -1;

  const handleRequestRoutePreview = (allowOptimization) => {
    if (orders.length === 0) return;

    if (directions) {
      setShowMap(true);
      return;
    }

    if (!optimizationInput.supported) {
      toast.warning(optimizationInput.reason);
      return;
    }

    if (!window.google?.maps?.DirectionsService) {
      toast.info("Map preview service unavailable right now. Use each stop's Navigate button for turn-by-turn GPS.");
      return;
    }

    setIsCalculating(true);
    const shouldOptimize = allowOptimization && !hasManualPlan;
    const directionsService = new window.google.maps.DirectionsService();

    const requestRoute = (optimize) => {
      directionsService.route(
        {
          origin: WAREHOUSE_ADDRESS,
          destination: WAREHOUSE_ADDRESS,
          waypoints: optimizationInput.waypoints,
          optimizeWaypoints: optimize,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            setDirectionsState({ key: routePreviewKey, result });
            setShowMap(true);

            if (optimize && !hasManualPlan && result.routes?.[0]) {
              const sequence = result.routes[0].waypoint_order || [];
              const legsData = (result.routes[0].legs || []).map(leg => ({
                distance: leg.distance?.text,
                duration: leg.duration?.text
              }));
              onRouteOptimized(optimizationInput.stopDescriptors, sequence, legsData);
            }
            setIsCalculating(false);
          } else if (optimize && (status === 'REQUEST_DENIED' || status === 'MAX_WAYPOINTS_EXCEEDED')) {
            requestRoute(false);
          } else {
            setIsCalculating(false);
            toast.error("In-app map preview unavailable. Use each stop's Navigate button for Google Maps GPS.");
          }
        }
      );
    };

    requestRoute(shouldOptimize);
  };

  const activeLegInfo = useMemo(() => {
    if (!directions || activeLegIndex < 0) return null;
    try {
      const leg = directions.routes[0].legs[activeLegIndex];
      if (!leg) return null;
      
      let path = [];
      leg.steps.forEach(step => {
        step.path.forEach(latLng => path.push({ lat: latLng.lat(), lng: latLng.lng() }));
      });
      return {
        distance: leg.distance.text,
        duration: leg.duration.text,
        path: path
      };
    } catch {
      return null;
    }
  }, [directions, activeLegIndex]);

  if (orders.length === 0) return null;

  if (!isLoaded) {
    return (
      <div className="mt-4 p-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold text-slate-600 flex items-center gap-2.5 shadow-sm">
        <Navigation size={16} className="text-blue-600 shrink-0" />
        <span>Use each stop's Navigate button below to open single-stop Google Maps directions.</span>
      </div>
    );
  }

  if (!showMap) {
    return (
      <div className="mt-4 space-y-2.5">
        {hasManualPlan && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs font-semibold text-blue-900 flex items-start gap-2.5">
            <Route size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <span>Warehouse/Dispatch set your stop sequence. Automatic reordering is paused so your planned route stays intact.</span>
          </div>
        )}

        {!optimizationInput.supported && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-semibold text-amber-900 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <span>{optimizationInput.reason}</span>
          </div>
        )}

        {optimizationInput.supported && (
          <button
            type="button"
            onClick={() => handleRequestRoutePreview(!hasManualPlan)}
            disabled={isCalculating}
            className="w-full py-3.5 bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-70 text-sm"
          >
            <Map size={18} />
            {isCalculating
              ? 'Loading Route Map...'
              : hasManualPlan
              ? 'Preview Assigned Route on Map'
              : 'Optimize Round-Trip Preview'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full mt-4 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-200 sticky top-4 z-40 bg-slate-50/80 backdrop-blur-xl p-2 rounded-[2rem] shadow-xl border border-slate-200/60">
      <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center gap-4 shadow-inner">
        <div className="bg-slate-800 p-2.5 rounded-xl shrink-0"><Truck size={20} className="text-blue-400" /></div>
        <div className="flex-1 overflow-hidden">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
            {activeLegInfo ? `Heading to Stop #${activeLegIndex + 1}` : hasManualPlan ? 'Manual Route Map Preview' : 'Round Trip Preview'}
          </p>
          <p className="text-sm font-black text-white truncate">
            {activeLegInfo ? `${activeLegInfo.distance} • ${activeLegInfo.duration}` : 'Start & End: Pittsburg'}
          </p>
        </div>
        <button type="button" onClick={() => setShowMap(false)} className="ml-auto p-2 bg-white/10 hover:bg-white/20 text-white rounded-full active:scale-95 transition-all"><X size={16} /></button>
      </div>

      <div className="w-full h-64 sm:h-80 rounded-2xl overflow-hidden relative shadow-inner border border-slate-300">
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={currentLocation || { lat: 38.0336, lng: -121.8817 }} 
          zoom={12}
          options={{ disableDefaultUI: true, zoomControl: true }}
        >
          {directions && (
            <DirectionsRenderer directions={directions} options={{ polylineOptions: { strokeColor: '#10b981', strokeWeight: 4, strokeOpacity: 0.5 }, suppressMarkers: false }} />
          )}
          {activeLegInfo && (
            <Polyline path={activeLegInfo.path} options={{ strokeColor: '#3b82f6', strokeOpacity: 1.0, strokeWeight: 6, zIndex: 50 }} />
          )}
          {currentLocation && (
            <Marker position={currentLocation} icon={{ url: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png', scaledSize: new window.google.maps.Size(38, 38) }} zIndex={999} />
          )}
        </GoogleMap>
      </div>
    </div>
  );
}

export default function DriverRoutes() {
  const { profile } = useAuth();

  const [orders, setOrders] = useState([]);
  const [completedThisWeek, setCompletedThisWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [licenseAlert, setLicenseAlert] = useState(null);
  
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const MAX_POD_PHOTOS = 4;
  const [activeOrder, setActiveOrder] = useState(null); 
  const [podPhotos, setPodPhotos] = useState([]); // [{ id, file, previewUrl }]
  const [receivedBy, setReceivedBy] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmptyPodConfirm, setShowEmptyPodConfirm] = useState(false);
  
  const [deliveredQuantities, setDeliveredQuantities] = useState({});

  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const [attemptingOrder, setAttemptingOrder] = useState(null);
  const [attemptReason, setAttemptReason] = useState('');
  const [isAttempting, setIsAttempting] = useState(false);

  const [toastAlert] = useState({ show: false, message: '', isError: false });

  const [currentLocation, setCurrentLocation] = useState(null);

  const sigCanvasRef = useRef(null);

  const checkLicenseStatus = useCallback(() => {
    if (profile?.role?.toLowerCase() !== 'driver') return;
    if (!profile?.license_expiry) {
      setLicenseAlert({ type: 'warning', title: 'Action Required', message: 'Please update your driver license details in your profile.' });
      return;
    }
    const expiryDate = new Date(profile.license_expiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      setLicenseAlert({ type: 'danger', title: 'License Expired!', message: `Your driver's license expired on ${expiryDate.toLocaleDateString()}. Please update your profile to continue deliveries.` });
    } else if (diffDays <= 30) {
      setLicenseAlert({ type: 'warning', title: 'License Expiring Soon', message: `Your driver's license expires in ${diffDays} day${diffDays === 1 ? '' : 's'} (${expiryDate.toLocaleDateString()}).` });
    } else {
      setLicenseAlert(null);
    }
  }, [profile?.role, profile?.license_expiry]);

  const fetchMyRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const { data: backorderItems } = await supabase.from('order_items').select('order_id').in('status', ['SHIPPED', 'OUT_FOR_DELIVERY']);
      const backorderOrderIds = backorderItems && backorderItems.length > 0 ? [...new Set(backorderItems.map(i => i.order_id))] : [];
      const driverOrFilter = profile?.id
        ? `assigned_driver_id.eq.${profile.id},and(assigned_driver_id.is.null,driver_name.ilike.${profile.full_name}%)`
        : `driver_name.ilike.${profile.full_name}%`;

      let query = supabase
        .from('orders')
        .select(`*, companies ( name, address, city, state, zip, phone ), agency_patients ( contact_number ), user_profiles ( full_name, contact_number ), order_items ( id, product_variant_id, quantity_variants, total_base_units, status, line_total, unit_price, product_variants ( product_id, name, multiplier, products(name) ) )`)
        .or(driverOrFilter)
        .order('created_at', { ascending: true });

      if (backorderOrderIds.length > 0) {
        query = query.or(`status.in.(ready_for_delivery,shipped,out_for_delivery),id.in.(${backorderOrderIds.join(',')})`);
      } else {
        query = query.in('status', ['ready_for_delivery', 'shipped', 'out_for_delivery']);
      }

      const { data: pendingData, error: pendingError } = await query;
      if (pendingError) throw pendingError;

      const validOrders = (pendingData || []).filter(order => {
        const isBackorder = ['delivered_partial', 'delivered'].includes(order.status);
        if (isBackorder) {
          return order.order_items?.some(item => ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(item.status?.toUpperCase()));
        }
        return true;
      });

      const sortedOrders = sortDriverStops(validOrders);

      const startOfWeek = new Date();
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

      const { count: completedCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'delivered')
        .or(driverOrFilter)
        .gte('updated_at', startOfWeek.toISOString());

      setOrders(sortedOrders);
      setCompletedThisWeek(completedCount || 0);
      setLastRefreshed(new Date());

      // 🚀 Auto-restore active POD order if returning from background/Google Maps
      try {
        const savedOrderId = sessionStorage.getItem('tricore_driver_active_order_id');
        if (savedOrderId) {
          const matched = sortedOrders.find(o => o.id === savedOrderId);
          if (matched) {
            setActiveOrder(matched);
          }
        }
      } catch {
        /* sessionStorage unavailable */
      }
    } catch (error) {
      console.error('Error fetching routes:', error.message);
      toast.error('Failed to load routes.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.full_name]);

  // 🚀 Auto-refresh routes when returning to foreground from Google Maps
  useEffect(() => {
    if (!profile?.id || profile?.role?.toLowerCase() !== 'driver') return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchMyRoutes();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [profile?.id, profile?.role, fetchMyRoutes]);

  useEffect(() => {
    if (!profile?.id || profile?.role?.toLowerCase() !== 'driver') return;
    
    let latestCoords = null;
    let lastSyncedCoords = null; 

    const watchId = navigator.geolocation.watchPosition(
      (position) => { 
        latestCoords = { lat: position.coords.latitude, lng: position.coords.longitude }; 
        setCurrentLocation(latestCoords);
      },
      (err) => console.warn("GPS Tracking Error:", err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    const syncInterval = setInterval(async () => {
      if (latestCoords) {
        const hasMoved = !lastSyncedCoords || 
          Math.abs(latestCoords.lat - lastSyncedCoords.lat) > 0.0001 || 
          Math.abs(latestCoords.lng - lastSyncedCoords.lng) > 0.0001;

        if (hasMoved) {
          await supabase.from('user_profiles').update({ 
            current_lat: latestCoords.lat, 
            current_lng: latestCoords.lng, 
            last_location_update: new Date().toISOString() 
          }).eq('id', profile.id);
          
          lastSyncedCoords = { ...latestCoords };
        }
      }
    }, 15000); 

    return () => { navigator.geolocation.clearWatch(watchId); clearInterval(syncInterval); };
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (!profile?.full_name) return;

    const channel = supabase.channel('driver-dispatch-updates')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders' 
      }, (payload) => {
        const matchesDriverId =
          Boolean(profile?.id) &&
          (payload.new?.assigned_driver_id === profile.id || payload.old?.assigned_driver_id === profile.id);
        const isMyOrder =
          matchesDriverId ||
          payload.new?.driver_name?.includes(profile.full_name) ||
          payload.old?.driver_name?.includes(profile.full_name);
                          
        if (isMyOrder) {
          fetchMyRoutes();
          if (payload.eventType === 'INSERT' || (payload.eventType === 'UPDATE' && payload.new.status === 'ready_for_delivery')) {
            toast.success("New order assigned to your route!"); 
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.full_name, fetchMyRoutes]);

  useEffect(() => {
    if (profile?.id && profile?.full_name) {
      fetchMyRoutes();
      checkLicenseStatus();
    }
  }, [profile?.id, profile?.full_name, fetchMyRoutes, checkLicenseStatus]);

  useEffect(() => {
    if (activeOrder) {
      const initialQtys = {};
      const activeItems = getActiveItems(activeOrder);
      
      activeItems.forEach(item => {
        initialQtys[item.id] = item.quantity_variants; 
      });
      setDeliveredQuantities(initialQtys);
    }
  }, [activeOrder]);

  const applyOptimizedOrder = (stopDescriptors, sequence, legsData) => {
    if (hasSavedManualRouteOrder(orders)) return;
    if (!sequence || sequence.length === 0) return;

    const mapped = mapWaypointOrderToOrderIds(stopDescriptors, sequence, legsData);
    if (!mapped) {
      toast.warning('Could not map optimized route stops safely. Keeping assigned stop order.');
      return;
    }

    setOrders((prev) => reorderOrdersByMappedSequence(prev, mapped));
    toast.success("Route Preview Optimized!");
  };

  const handlePhotoCapture = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;
    setShowEmptyPodConfirm(false);

    setPodPhotos((prev) => {
      const remainingSlots = MAX_POD_PHOTOS - prev.length;
      if (remainingSlots <= 0) {
        toast.info(`Maximum of ${MAX_POD_PHOTOS} photos allowed.`);
        return prev;
      }

      const filesToAdd = selectedFiles.slice(0, remainingSlots);
      if (selectedFiles.length > remainingSlots) {
        toast.info(`Only ${remainingSlots} more photo(s) added (max ${MAX_POD_PHOTOS}).`);
      }

      const newPhotos = filesToAdd.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      return [...prev, ...newPhotos];
    });

    e.target.value = '';
  };

  const handleRemovePhoto = (photoId) => {
    setPodPhotos((prev) => {
      const toRemove = prev.find((p) => p.id === photoId);
      if (toRemove?.previewUrl) {
        URL.revokeObjectURL(toRemove.previewUrl);
      }
      return prev.filter((p) => p.id !== photoId);
    });
  };

  const clearSignature = () => { 
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    if (newStatus !== 'out_for_delivery') return;

    const orderToUpdate = orders.find(o => o.id === orderId);
    const isBackorder = ['delivered_partial', 'delivered'].includes(orderToUpdate?.status);

    setOrders(currentOrders => currentOrders.map(order => {
      if (order.id !== orderId) return order;
      if (isBackorder) {
        return {
          ...order,
          order_items: order.order_items.map(item =>
            item.status?.toUpperCase() === 'SHIPPED' ? { ...item, status: 'OUT_FOR_DELIVERY' } : item
          )
        };
      }
      return { ...order, status: newStatus };
    }));

    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const { error } = await supabase.rpc('driver_start_delivery', {
        p_order_id: orderId
      });
      if (error) throw error;
    } catch (error) {
      console.error('Start route error:', error.message);
      toast.error(isBackorder ? "Failed to sync route start to database." : "Failed to sync status to database.");
      fetchMyRoutes();
    }
  };

  const submitDelivery = async (bypassEmptyConfirmation = false) => {
    const hasSignature = Boolean(sigCanvasRef.current && !sigCanvasRef.current.isEmpty());
    const proofEval = evaluatePodProof({
      receivedBy,
      hasSignature,
      photoCount: podPhotos.length,
    });

    if (proofEval.requiresEmptyProofConfirmation && !bypassEmptyConfirmation) {
      setShowEmptyPodConfirm(true);
      return;
    }
    setShowEmptyPodConfirm(false);

    const activeItems = getActiveItems(activeOrder);

    let totalDeliveredQty = 0;
    const deliveredItemsPayload = activeItems.map(item => {
      const delQty = deliveredQuantities[item.id] !== undefined ? Number(deliveredQuantities[item.id]) : item.quantity_variants;
      totalDeliveredQty += delQty;
      return {
        item_id: item.id,
        delivered_qty: delQty
      };
    });

    const isTotalRejection = totalDeliveredQty === 0;

    setIsSubmitting(true);
    try {
      let photoUrlStr = null;
      let signatureUrlStr = null;
      const uniquePrefix = `${Date.now()}-${activeOrder.id}`;
      
      if (podPhotos.length > 0) {
        const uploadedUrls = [];
        for (let i = 0; i < podPhotos.length; i++) {
          const photo = podPhotos[i];
          const compressedFile = await compressImage(photo.file);
          const photoPath = `pod-photos/${uniquePrefix}-${i + 1}.jpg`;
          const { error: photoErr } = await supabase.storage.from('delivery-proofs').upload(photoPath, compressedFile);
          if (photoErr) throw photoErr;
          const publicUrl = supabase.storage.from('delivery-proofs').getPublicUrl(photoPath).data.publicUrl;
          uploadedUrls.push(publicUrl);
        }
        photoUrlStr = uploadedUrls.length === 1 ? uploadedUrls[0] : JSON.stringify(uploadedUrls);
      }
      
      if (hasSignature && sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
        const signatureDataUrl = sigCanvasRef.current.getCanvas().toDataURL('image/png');
        const signatureBlob = await (await fetch(signatureDataUrl)).blob();
        const sigPath = `pod-signatures/${uniquePrefix}.png`;
        const { error: sigErr } = await supabase.storage.from('delivery-proofs').upload(sigPath, signatureBlob);
        if (sigErr) throw sigErr;
        signatureUrlStr = supabase.storage.from('delivery-proofs').getPublicUrl(sigPath).data.publicUrl;
      }

      const { data: completionResult, error: updateErr } = await supabase.rpc('driver_complete_delivery', {
        p_order_id: activeOrder.id,
        p_delivered_items: deliveredItemsPayload,
        p_received_by: proofEval.normalizedRecipient,
        p_signature_url: signatureUrlStr,
        p_photo_url: photoUrlStr
      });

      if (updateErr) throw updateErr;

      const resolvedTotalRejection = completionResult?.is_total_rejection ?? isTotalRejection;

      setOrders(orders.filter(o => o.id !== activeOrder.id));
      if (!resolvedTotalRejection) setCompletedThisWeek(prev => prev + 1);
      
      window.dispatchEvent(new Event('orderStatusChanged'));
      closeModal();
      
      toast.success(resolvedTotalRejection ? 'Order marked as attempted (Items rejected).' : 'Delivery completed successfully!');
      
    } catch (error) {
      console.error('Delivery Error:', error.message);
      toast.error('Failed to upload delivery proof. Check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitCancellation = async () => {
    if (!cancelReason.trim()) { toast.error('Please provide a reason for cancelling this delivery.'); return; }
    setIsCancelling(true);
    try {
      const isBackorderRun = ['delivered_partial', 'delivered'].includes(cancellingOrder.status);

      if (isBackorderRun) {
        const { error } = await supabase.rpc('driver_mark_attempted', {
          p_order_id: cancellingOrder.id,
          p_reason: cancelReason.trim()
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('reject_full_order', {
          p_order_id: cancellingOrder.id,
          p_reason: cancelReason.trim(),
          p_target_status: 'cancelled'
        });
        if (error) throw error;
      }
      
      setOrders(orders.filter(o => o.id !== cancellingOrder.id));
      window.dispatchEvent(new Event('orderStatusChanged'));
      closeCancelModal();
      toast.success('Route cancelled. Items flagged for return.');
    } catch (error) {
      console.error('Cancellation Error:', error.message);
      toast.error('Failed to cancel the delivery. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const submitAttempted = async () => {
    if (!attemptReason.trim()) { toast.error('Please provide a reason for the failed delivery attempt.'); return; }
    setIsAttempting(true);
    try {
      const { error } = await supabase.rpc('driver_mark_attempted', {
        p_order_id: attemptingOrder.id,
        p_reason: attemptReason.trim()
      });
      if (error) throw error;
      
      setOrders(orders.filter(o => o.id !== attemptingOrder.id));
      window.dispatchEvent(new Event('orderStatusChanged'));
      closeAttemptModal();
      toast.success('Order marked as attempted. Return to warehouse.');
    } catch (error) {
      console.error('Attempt Error:', error.message);
      toast.error('Failed to mark delivery as attempted.');
    } finally {
      setIsAttempting(false);
    }
  };

  const openPodModal = (order) => {
    setShowEmptyPodConfirm(false);
    setActiveOrder(order);
    try {
      sessionStorage.setItem('tricore_driver_active_order_id', order.id);
    } catch {
      /* sessionStorage unavailable */
    }
  };

  const closeModal = () => {
    try {
      sessionStorage.removeItem('tricore_driver_active_order_id');
    } catch {
      /* sessionStorage unavailable */
    }
    setShowEmptyPodConfirm(false);
    setActiveOrder(null);
    podPhotos.forEach(p => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    });
    setPodPhotos([]);
    setReceivedBy('');
    setDeliveredQuantities({});
    sigCanvasRef.current?.clear();
  };
  const closeCancelModal = () => { setCancellingOrder(null); setCancelReason(''); };
  const closeAttemptModal = () => { setAttemptingOrder(null); setAttemptReason(''); };

  const getDynamicTotal = () => {
    if (!activeOrder) return 0;
    let newSubtotal = 0;
    const activeItems = getActiveItems(activeOrder);

    activeItems.forEach(item => {
        const maxQty = item.quantity_variants;
        const currentDelivered = deliveredQuantities[item.id] !== undefined ? deliveredQuantities[item.id] : maxQty;
        const unitPrice = Number(item.unit_price) || (Number(item.line_total) / maxQty);
        newSubtotal += (currentDelivered * unitPrice);
    });

    const origSub = Number(activeOrder.subtotal) || 0;
    const taxRate = origSub > 0 ? (Number(activeOrder.tax_amount || 0) / origSub) : 0;
    const newTax = newSubtotal * taxRate;
    
    const isBackorderRun = ['delivered_partial', 'delivered'].includes(activeOrder.status);
    const shipping = isBackorderRun ? 0 : Number(activeOrder.shipping_amount || 0);

    return newSubtotal + shipping + newTax;
  };

  return (
    <div className="max-w-md sm:max-w-3xl mx-auto space-y-5 pb-24 relative px-4">
      
      {licenseAlert && (
        <div className={`p-4 rounded-3xl border flex items-start gap-3 mt-4 shadow-sm animate-in fade-in slide-in-from-top-4 ${licenseAlert.type === 'danger' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <div className={`p-2 rounded-full shrink-0 ${licenseAlert.type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="pt-0.5">
            <h4 className="text-sm font-black tracking-tight">{licenseAlert.title}</h4>
            <p className="text-sm font-medium mt-0.5 opacity-90 leading-snug">{licenseAlert.message}</p>
          </div>
        </div>
      )}

      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-lg relative overflow-hidden mt-4">
        
        <div className="flex justify-between items-start relative z-10">
          <div>
            <p className="text-emerald-400 font-bold tracking-widest uppercase text-[10px] mb-1">Driver Dashboard</p>
            <h2 className="text-2xl font-extrabold tracking-tight">Welcome, {profile?.full_name?.split(' ')[0] || 'Driver'}</h2>
          </div>
          
          <button 
            onClick={fetchMyRoutes} 
            disabled={loading}
            className="flex flex-col items-center gap-1.5 p-2 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-xl border border-white/10 min-w-[64px]"
          >
            <RefreshCw size={18} className={loading ? "animate-spin text-emerald-400" : "text-slate-300"} />
            <span className="text-[8px] font-black tracking-widest uppercase text-slate-300">
              {loading ? 'Syncing' : 'Refresh'}
            </span>
          </button>
        </div>
        
        <div className="relative z-10">
          <div className="flex gap-3 mt-5">
            <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-4 flex-1">
              <div className="flex items-center gap-1.5 text-slate-300 mb-1">
                <Route size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Remaining</span>
              </div>
              <p className="text-3xl font-black">{orders.length}</p>
            </div>
            <div className="bg-emerald-500/10 backdrop-blur border border-emerald-500/20 rounded-2xl p-4 flex-1">
              <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                <PackageCheck size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Done This Week</span>
              </div>
              <p className="text-3xl font-black text-emerald-400">{completedThisWeek}</p>
            </div>
          </div>
          
          <div className="mt-4 flex items-center justify-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-800/50 py-1.5 rounded-lg border border-white/5">
            <Clock size={10} /> Last synced: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>

        <Truck className="absolute -right-8 -bottom-8 text-white/5" size={160} strokeWidth={1} />
      </div>

      {!loading && orders.length > 0 && (
        <MasterRouteMap orders={orders} onRouteOptimized={applyOptimizedOrder} currentLocation={currentLocation} />
      )}

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(n => <div key={n} className="h-64 bg-slate-100 animate-pulse rounded-3xl"></div>)}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center bg-white p-10 rounded-3xl border border-slate-200 shadow-sm mt-4">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-white shadow-sm">
            <CheckCircle2 size={40} />
          </div>
          <h3 className="text-2xl font-black text-slate-900 mb-2">Route Complete!</h3>
          <p className="text-slate-500 text-sm max-w-xs mx-auto leading-relaxed">You have no pending deliveries assigned to you. Great job today!</p>
        </div>
      ) : (
        <div className="space-y-4 mt-2">
          {orders.map((order, index) => {
            const isB2B = !!order.company_id;
            const shipName = order.shipping_name || (isB2B ? order.companies?.name : order.user_profiles?.full_name || 'Customer');
            const addrInfo = formatOrderDeliveryAddress(order);
            const navUrl = buildSingleStopNavigationUrl(order);
            const shipAddress = addrInfo.street || 'No address provided';
            const shipCityState = addrInfo.cityStateZip;
            const shipPhone = order.agency_patients?.contact_number || order.user_profiles?.contact_number || '';
            const shortId = order.id.split('-')[0].toUpperCase();

            const isBackorder = ['delivered_partial', 'delivered'].includes(order.status);
            const validItems = getActiveItems(order);
            const totalItems = validItems.reduce((sum, item) => sum + (item.quantity_variants || 0), 0);
            
            const isCOD = order.payment_method === 'cod';
            const isNet30 = order.payment_method === 'net_30';
            const paymentText = isCOD ? `$${Number(order.total_amount).toFixed(2)}` : (isNet30 ? 'Net 30' : 'Paid');
            
            const isOutForDelivery = order.status === 'out_for_delivery' || (isBackorder && validItems.some(i => i.status?.toUpperCase() === 'OUT_FOR_DELIVERY'));

            return (
              <div key={order.id} className={`bg-white border rounded-3xl p-4 shadow-sm relative overflow-hidden flex flex-col transition-all ${isOutForDelivery ? 'border-blue-400 ring-4 ring-blue-500/10' : 'border-slate-200'}`}>
                
                <div className={`absolute top-0 right-0 text-white px-3 py-1.5 rounded-bl-xl font-black text-[10px] tracking-widest uppercase z-10 shadow-sm ${isOutForDelivery ? 'bg-blue-600' : 'bg-slate-900'}`}>
                  Stop #{order.routeLegIndex !== undefined ? order.routeLegIndex + 1 : index + 1}
                </div>

                <div className="mb-3 pr-16 pl-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 block">
                    Order #{shortId}{isBackorder ? '-B' : ''}
                  </span>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">{shipName}</h3>
                  {order.travelDistance && (
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                        <MapPin size={10} /> {order.travelDistance}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        <Clock size={10} /> {order.travelTime}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={`p-3 rounded-2xl border flex flex-col justify-center items-center text-center ${isBackorder ? 'bg-purple-50 border-purple-100' : 'bg-slate-50 border-slate-100'}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1 ${isBackorder ? 'text-purple-600' : 'text-slate-400'}`}>
                      <Package size={12}/> {isBackorder ? 'Backorder Items' : 'Packages'}
                    </span>
                    <span className={`font-black text-sm ${isBackorder ? 'text-purple-700' : 'text-slate-900'}`}>{totalItems} {totalItems === 1 ? 'Item' : 'Items'}</span>
                  </div>
                  
                  <div className={`p-3 rounded-2xl border flex flex-col justify-center items-center text-center ${isCOD ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1 ${isCOD ? 'text-amber-600' : 'text-emerald-600'}`}>
                      <DollarSign size={12}/> {isCOD ? 'Collect COD' : 'Terms'}
                    </span>
                    <span className={`font-black text-sm ${isCOD ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {paymentText}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <div className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
                    <div className="bg-blue-100 p-1.5 rounded-lg shrink-0">
                      <MapPin size={16} className="text-blue-600 mt-0.5 shrink-0"/>
                    </div>
                    <div className="leading-snug flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm break-words">{shipAddress}</p>
                      {shipCityState && <p className="text-slate-500 text-xs mt-0.5">{shipCityState}</p>}
                    </div>
                  </div>

                  {navUrl ? (
                    <a
                      href={navUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-3.5 bg-blue-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
                    >
                      <Navigation size={15} /> Navigate
                    </a>
                  ) : (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-800 flex items-center gap-2">
                      <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                      <span>{addrInfo.missingReason}</span>
                    </div>
                  )}

                  {shipPhone && (
                    <div className="flex items-center gap-2.5 text-sm font-medium pt-2.5 border-t border-slate-200/60 mt-1">
                      <Phone size={16} className="text-emerald-500 shrink-0"/>
                      <a href={`tel:${shipPhone.replace(/[^0-9+]/g, '')}`} className="text-slate-900 font-bold underline underline-offset-4 decoration-slate-300 hover:decoration-emerald-500 transition-colors">
                        {shipPhone}
                      </a>
                    </div>
                  )}
                </div>

                {order.order_notes && order.order_notes.trim() && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 flex items-center gap-1.5 mb-0.5">
                      <StickyNote size={12} /> Order Notes
                    </p>
                    <p className="text-xs font-medium text-amber-950 whitespace-pre-wrap break-words">
                      {order.order_notes}
                    </p>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  {!isOutForDelivery ? (
                    <button onClick={() => updateOrderStatus(order.id, 'out_for_delivery')} className="w-full py-3.5 text-sm bg-slate-900 text-white font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 transition-all flex justify-center items-center gap-2">
                      <Truck size={18} /> Start Route
                    </button>
                  ) : (
                    <button onClick={() => openPodModal(order)} className="w-full py-3.5 text-sm bg-emerald-500 text-white font-bold rounded-xl shadow-md hover:bg-emerald-600 active:scale-95 transition-all flex justify-center items-center gap-2">
                      <CheckCircle2 size={18} /> Complete POD
                    </button>
                  )}
                  
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button onClick={() => setCancellingOrder(order)} className="py-3 bg-red-50 text-red-600 border border-red-200 text-[13px] font-black rounded-xl hover:bg-red-100 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                      <XCircle size={16} /> Cancel
                    </button>
                    <button onClick={() => setAttemptingOrder(order)} className="py-3 bg-amber-50 text-amber-700 border border-amber-200 text-[13px] font-black rounded-xl hover:bg-amber-100 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                      <AlertTriangle size={16} /> Attempt
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {attemptingOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 duration-200 border border-slate-100 relative">
            <button onClick={closeAttemptModal} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-900 bg-slate-50 rounded-full active:scale-95 transition-all"><X size={18} /></button>
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-4 border border-amber-100 shadow-sm"><AlertTriangle size={24} /></div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Mark Attempted</h3>
            <p className="text-sm text-slate-500 mt-1 font-medium leading-relaxed">Could not deliver <strong className="text-slate-800">Order #{attemptingOrder.id.split('-')[0].toUpperCase()}</strong>? The items must be returned to the warehouse.</p>
            <div className="mt-5 space-y-3"><label className="block text-[11px] font-bold text-slate-700 uppercase tracking-widest">Reason for failed attempt</label><textarea rows="4" placeholder="e.g. Customer not home, wrong address, business closed..." value={attemptReason} onChange={(e) => setAttemptReason(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all text-sm font-medium text-slate-900 resize-none shadow-sm placeholder:text-slate-400"></textarea></div>
            <div className="mt-6 flex gap-3"><button onClick={closeAttemptModal} className="flex-1 py-3 bg-white text-slate-700 border border-slate-300 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">Back</button><button onClick={submitAttempted} disabled={isAttempting} className="flex-1 py-3 bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-600/30 hover:bg-amber-700 active:scale-95 transition-all disabled:opacity-70 flex justify-center items-center">{isAttempting ? 'Processing...' : 'Confirm'}</button></div>
          </div>
        </div>
      )}

      {cancellingOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 duration-200 border border-slate-100 relative">
            <button onClick={closeCancelModal} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-900 bg-slate-50 rounded-full active:scale-95 transition-all"><X size={18} /></button>
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4 border border-red-100 shadow-sm"><XCircle size={24} /></div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Confirm Cancellation</h3>
            <p className="text-sm text-slate-500 mt-1 font-medium leading-relaxed">Are you sure you want to cancel <strong className="text-slate-800">Order #{cancellingOrder.id.split('-')[0].toUpperCase()}</strong>? The items will auto-restock in inventory.</p>
            <div className="mt-5 space-y-3"><label className="block text-[11px] font-bold text-slate-700 uppercase tracking-widest">Reason for Cancellation</label><textarea rows="4" placeholder="e.g. Duplicate order, requested by dispatcher..." value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all text-sm font-medium text-slate-900 resize-none shadow-sm placeholder:text-slate-400"></textarea></div>
            <div className="mt-6 flex gap-3"><button onClick={closeCancelModal} className="flex-1 py-3 bg-white text-slate-700 border border-slate-300 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">Back</button><button onClick={submitCancellation} disabled={isCancelling} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-600/30 hover:bg-red-700 active:scale-95 transition-all disabled:opacity-70 flex justify-center items-center">{isCancelling ? 'Processing...' : 'Confirm Cancel'}</button></div>
          </div>
        </div>
      )}

      {activeOrder && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md h-[92vh] sm:h-auto sm:max-h-[90vh] rounded-t-[2rem] sm:rounded-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-full duration-300">
            
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50 rounded-t-[2rem] sm:rounded-t-3xl">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Proof of Delivery</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">Order #{activeOrder.id.split('-')[0]}</p>
              </div>
              <button onClick={closeModal} className="p-2.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 shadow-sm"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-white">
              
              {activeOrder.payment_method === 'cod' && (
                <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm transition-colors ${
                  getActiveItems(activeOrder).some(i => deliveredQuantities[i.id] !== undefined && deliveredQuantities[i.id] < i.quantity_variants) 
                    ? 'bg-amber-50 border-amber-200' 
                    : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${
                      getActiveItems(activeOrder).some(i => deliveredQuantities[i.id] !== undefined && deliveredQuantities[i.id] < i.quantity_variants) 
                        ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      Amount to Collect (COD)
                    </p>
                    <p className={`text-2xl font-black ${
                      getActiveItems(activeOrder).some(i => deliveredQuantities[i.id] !== undefined && deliveredQuantities[i.id] < i.quantity_variants) 
                        ? 'text-amber-700' : 'text-emerald-700'
                    }`}>
                      ${getDynamicTotal().toFixed(2)}
                    </p>
                  </div>
                  {getActiveItems(activeOrder).some(i => deliveredQuantities[i.id] !== undefined && deliveredQuantities[i.id] < i.quantity_variants) && (
                    <span className="text-xs font-bold bg-white text-amber-600 px-2 py-1 rounded-md shadow-sm border border-amber-100">Adjusted</span>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-widest">
                  <div className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px]">1</div>
                  Review Items
                </label>
                <p className="text-xs text-slate-500 font-medium mb-2">Adjust the quantity delivered if the customer refuses any items.</p>
                
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {getActiveItems(activeOrder).map(item => {
                    const maxQty = item.quantity_variants;
                    const currentDelivered = deliveredQuantities[item.id] !== undefined ? deliveredQuantities[item.id] : maxQty;
                    const isPartiallyRejected = currentDelivered < maxQty && currentDelivered > 0;
                    const isFullyRejected = currentDelivered === 0;
                    
                    const unitPrice = Number(item.unit_price) || (Number(item.line_total) / maxQty);
                    const displayTotal = currentDelivered * unitPrice;

                    return (
                      <div key={item.id} className={`flex flex-col p-3 rounded-xl border transition-all shadow-sm ${isFullyRejected ? 'bg-red-50 border-red-200' : isPartiallyRejected ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 pr-2">
                            <p className={`text-sm font-bold truncate transition-colors ${isFullyRejected ? 'text-red-900 line-through' : 'text-slate-900'}`}>
                              {item.product_variants?.products?.name || 'Item'}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <p className={`text-[10px] font-bold uppercase tracking-widest ${isFullyRejected ? 'text-red-500' : 'text-slate-500'}`}>
                                Ordered: {maxQty}
                              </p>
                              <p className={`text-[10px] font-bold uppercase tracking-widest ${isFullyRejected ? 'text-red-400' : 'text-emerald-600'}`}>
                                ${displayTotal.toFixed(2)}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
                              <button 
                                type="button"
                                aria-label={`Decrease delivered quantity for ${item.product_variants?.products?.name || 'Item'}`}
                                onClick={() => setDeliveredQuantities(prev => ({...prev, [item.id]: currentDelivered - 1}))}
                                disabled={currentDelivered <= 0}
                                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 transition-colors"
                              >
                                <Minus size={14} strokeWidth={3} />
                              </button>
                              <span className="w-5 text-center text-xs font-black text-slate-900">
                                {currentDelivered}
                              </span>
                              <button 
                                type="button"
                                aria-label={`Increase delivered quantity for ${item.product_variants?.products?.name || 'Item'}`}
                                onClick={() => setDeliveredQuantities(prev => ({...prev, [item.id]: currentDelivered + 1}))}
                                disabled={currentDelivered >= maxQty}
                                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 transition-colors"
                              >
                                <Plus size={14} strokeWidth={3} />
                              </button>
                            </div>
                            
                            {isFullyRejected ? (
                              <span className="text-[9px] font-black text-red-600 uppercase tracking-widest px-1">Rejected</span>
                            ) : isPartiallyRejected ? (
                              <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest px-1">Partial</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-widest">
                  <div className="w-5 h-5 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-[10px]">3</div>
                  Recipient Name (Optional)
                </label>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="Optional — enter recipient name if available..."
                  value={receivedBy}
                  onChange={(e) => {
                    setReceivedBy(e.target.value);
                    if (showEmptyPodConfirm) setShowEmptyPodConfirm(false);
                  }}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-slate-900 shadow-sm placeholder:font-medium placeholder:text-slate-400"
                />
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-widest">
                    <div className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px]">4</div>
                    Proof of Delivery Photos (Optional)
                  </label>
                  <span className="text-[11px] font-bold text-slate-400">
                    {podPhotos.length} / {MAX_POD_PHOTOS}
                  </span>
                </div>

                {/* Grid of uploaded photos */}
                {podPhotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {podPhotos.map((photo, index) => (
                      <div key={photo.id} className="relative aspect-video rounded-xl overflow-hidden border-2 border-slate-200 shadow-sm bg-slate-100 group">
                        <img src={photo.previewUrl} alt={`POD ${index + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-slate-900/70 backdrop-blur text-white text-[9px] font-bold rounded">
                          #{index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(photo.id)}
                          className="absolute top-1.5 right-1.5 p-1 bg-red-600/80 hover:bg-red-600 backdrop-blur text-white rounded-full active:scale-95 transition-all shadow-sm"
                          title="Remove photo"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Camera / Upload trigger if under max */}
                {podPhotos.length < MAX_POD_PHOTOS && (
                  <div className="relative group">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePhotoCapture}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="w-full h-20 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 flex flex-col items-center justify-center text-slate-500 gap-1.5 active:bg-slate-100 transition-colors">
                      <div className="p-1.5 bg-white rounded-full shadow-sm">
                        <Camera size={16} className="text-blue-500" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                        {podPhotos.length === 0 ? 'Tap for Camera / Upload' : `Add Another Photo (${MAX_POD_PHOTOS - podPhotos.length} remaining)`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              <div className="space-y-3 pb-4">
                <div className="flex justify-between items-end">
                  <label className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-widest">
                    <div className="w-5 h-5 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-[10px]">5</div>
                    Signature (Optional)
                  </label>
                  <button type="button" onClick={clearSignature} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg active:scale-95 hover:bg-slate-200 transition-colors">Clear</button>
                </div>
                
                <div className="relative w-full h-40 border-2 border-slate-200 rounded-2xl bg-white overflow-hidden shadow-inner touch-none">
                  <SignatureCanvas 
                    ref={sigCanvasRef} 
                    onEnd={() => {
                      if (showEmptyPodConfirm) setShowEmptyPodConfirm(false);
                    }}
                    canvasProps={{ className: "absolute inset-0 w-full h-full cursor-crosshair touch-none" }}
                    minWidth={2}
                    maxWidth={4}
                    penColor="#0f172a"
                  />
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03]">
                    <PenTool size={64} />
                  </div>
                </div>

              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-white shrink-0 pb-8 sm:pb-5 space-y-3">
              {showEmptyPodConfirm ? (
                <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-black text-amber-950">Complete delivery without recipient proof?</p>
                      <p className="text-xs font-medium text-amber-800 mt-0.5">
                        No recipient name, signature, or photo was entered. You can go back to add proof or confirm completion without it.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEmptyPodConfirm(false)}
                      disabled={isSubmitting}
                      className="py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      Go Back
                    </button>
                    <button
                      type="button"
                      onClick={() => submitDelivery(true)}
                      disabled={isSubmitting}
                      className="py-2.5 bg-emerald-600 text-white text-xs font-black rounded-xl hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-70"
                    >
                      {isSubmitting ? 'Submitting...' : 'Confirm & Complete'}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => submitDelivery(false)} disabled={isSubmitting} className="w-full py-4 bg-emerald-500 text-white text-base font-black rounded-2xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 active:scale-[0.98] transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                  {isSubmitting ? <span className="animate-pulse flex items-center gap-2">Processing Data...</span> : <><UploadCloud size={20} /> Submit Delivery</>}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {toastAlert.show && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[120] flex items-center gap-3 bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`p-1.5 rounded-full ${toastAlert.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {toastAlert.isError ? <AlertTriangle size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}
          </div>
          <p className="text-sm font-bold pr-2">{toastAlert.message}</p>
        </div>
      )}
    </div>
  );
}
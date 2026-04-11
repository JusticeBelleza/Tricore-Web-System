import React, { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker, Polyline } from '@react-google-maps/api';
import { 
  MapPin, Phone, CheckCircle2, Camera, PenTool, X, Clock,
  UploadCloud, Truck, Route, PackageCheck, Package, DollarSign, AlertTriangle, XCircle, Map
} from 'lucide-react';

const WAREHOUSE_ADDRESS = "2169 Harbor St, Pittsburg CA 94565";

// 🚀 1. THE STICKY MASTER MAP W/ BLUE ACTIVE ROUTE HIGHLIGHT & TIME/DISTANCE
function MasterRouteMap({ orders, onRouteOptimized, currentLocation, autoTrigger }) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });

  const [directions, setDirections] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  // 🚀 Look up the exact locked index from the active order!
  const activeDelivery = orders.find(o => o.status === 'out_for_delivery');
  const activeLegIndex = activeDelivery && activeDelivery.routeLegIndex !== undefined 
    ? activeDelivery.routeLegIndex 
    : -1;

  useEffect(() => {
    if (autoTrigger > 0 && !showMap) {
      handleOptimizeRoute();
    }
  }, [autoTrigger]);

  const handleOptimizeRoute = () => {
    if (orders.length === 0) return;
    if (directions) {
      setShowMap(true);
      return;
    }

    setIsCalculating(true);

    const addresses = orders.map(order => {
      const cityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.trim();
      return `${order.shipping_address}, ${cityState}`;
    });

    const routeAddresses = addresses.slice(0, 25);
    
    const waypoints = routeAddresses.map(address => ({
      location: address,
      stopover: true
    }));
    
    const directionsService = new window.google.maps.DirectionsService();

    directionsService.route(
      {
        origin: WAREHOUSE_ADDRESS,
        destination: WAREHOUSE_ADDRESS, 
        waypoints: waypoints,
        optimizeWaypoints: true, 
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);
          setShowMap(true);
          
          if (result.routes[0]) {
             const sequence = result.routes[0].waypoint_order;
             const legsData = result.routes[0].legs.map(leg => ({
               distance: leg.distance.text,
               duration: leg.duration.text
             }));
             onRouteOptimized(sequence, legsData);
          }
        } else {
          console.error("Master Route Error:", status);
          alert(`Could not calculate master route. Status: ${status}`);
        }
        setIsCalculating(false);
      }
    );
  };

  // 🚀 EXTRACT THE EXACT GPS PATH FOR THE ACTIVE LEG + DISTANCE/TIME
  const activeLegInfo = useMemo(() => {
    if (!directions || activeLegIndex < 0) return null;
    try {
      const leg = directions.routes[0].legs[activeLegIndex];
      if (!leg) return null;
      
      let path = [];
      leg.steps.forEach(step => {
        step.path.forEach(latLng => path.push(latLng));
      });
      return {
        distance: leg.distance.text,
        duration: leg.duration.text,
        path: path
      };
    } catch (e) {
      return null;
    }
  }, [directions, activeLegIndex]);

  if (!isLoaded) return <div className="w-full h-12 bg-slate-100 rounded-xl animate-pulse mt-4"></div>;
  if (orders.length === 0) return null;

  if (!showMap) {
    return (
      <button 
        onClick={handleOptimizeRoute}
        disabled={isCalculating}
        className="w-full py-4 mt-4 bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-70"
      >
        <Map size={20} />
        {isCalculating ? "Calculating Fastest Round Trip..." : "Optimize Round-Trip Route"}
      </button>
    );
  }

  return (
    <div className="w-full mt-4 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-200 sticky top-4 z-40 bg-slate-50/80 backdrop-blur-xl p-2 rounded-[2rem] shadow-xl border border-slate-200/60">
      
      <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center gap-4 shadow-inner">
        <div className="bg-slate-800 p-2.5 rounded-xl shrink-0">
          <Truck size={20} className="text-blue-400" />
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
            {activeLegInfo ? `Heading to Stop #${activeLegIndex + 1}` : 'Round Trip Active'}
          </p>
          <p className="text-sm font-black text-white truncate">
            {activeLegInfo ? `${activeLegInfo.distance} • ${activeLegInfo.duration}` : 'Start & End: Pittsburg'}
          </p>
        </div>
        <button 
          onClick={() => setShowMap(false)}
          className="ml-auto p-2 bg-white/10 hover:bg-white/20 text-white rounded-full active:scale-95 transition-all"
        >
          <X size={16} />
        </button>
      </div>

      <div className="w-full h-64 sm:h-80 rounded-2xl overflow-hidden relative shadow-inner border border-slate-300">
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={currentLocation || { lat: 38.0336, lng: -121.8817 }} 
          zoom={12}
          options={{ disableDefaultUI: true, zoomControl: true }}
        >
          {directions && (
            <DirectionsRenderer 
              directions={directions} 
              options={{ 
                polylineOptions: { strokeColor: '#10b981', strokeWeight: 4, strokeOpacity: 0.5 },
                suppressMarkers: false 
              }}
            />
          )}

          {/* 🚀 DRAW THE BLUE LINE FOR THE ACTIVE ROUTE */}
          {activeLegInfo && (
            <Polyline
              path={activeLegInfo.path}
              options={{
                strokeColor: '#3b82f6', // Bright Blue
                strokeOpacity: 1.0,
                strokeWeight: 6, // Thicker so it pops over the green
                zIndex: 50
              }}
            />
          )}

          {/* 🚀 LIVE TRUCK MARKER */}
          {currentLocation && (
            <Marker 
              position={currentLocation}
              icon={{
                url: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png', 
                scaledSize: new window.google.maps.Size(38, 38)
              }}
              zIndex={999}
            />
          )}
        </GoogleMap>
      </div>
    </div>
  );
}


// 🚀 2. THE MAIN DRIVER DASHBOARD
export default function DriverRoutes() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [completedThisWeek, setCompletedThisWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [licenseAlert, setLicenseAlert] = useState(null);

  const [activeOrder, setActiveOrder] = useState(null); 
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [receivedBy, setReceivedBy] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const [attemptingOrder, setAttemptingOrder] = useState(null);
  const [attemptReason, setAttemptReason] = useState('');
  const [isAttempting, setIsAttempting] = useState(false);

  const [toast, setToast] = useState({ show: false, message: '', isError: false });

  const [currentLocation, setCurrentLocation] = useState(null);
  const [triggerMapOpen, setTriggerMapOpen] = useState(0);

  const canvasRef = useRef(null);

  // SILENT GPS TRACKER
  useEffect(() => {
    if (!profile?.id || profile?.role?.toLowerCase() !== 'driver') return;
    let latestCoords = null;
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
        await supabase.from('user_profiles').update({ current_lat: latestCoords.lat, current_lng: latestCoords.lng, last_location_update: new Date().toISOString() }).eq('id', profile.id);
      }
    }, 15000); 
    return () => { navigator.geolocation.clearWatch(watchId); clearInterval(syncInterval); };
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (profile?.id && profile?.full_name) {
      fetchMyRoutes();
      checkLicenseStatus();
    }
  }, [profile?.id, profile?.full_name, profile?.license_expiry]);

  const checkLicenseStatus = () => {
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
  };

  const showToast = (message, isError = false) => {
    setToast({ show: true, message, isError });
    setTimeout(() => setToast({ show: false, message: '', isError: false }), 4000);
  };

  const fetchMyRoutes = async () => {
    setLoading(true);
    try {
      const { data: pendingData, error: pendingError } = await supabase
        .from('orders')
        .select(`*, companies ( name, address, city, state, zip, phone ), agency_patients ( contact_number ), user_profiles ( full_name, contact_number ), order_items ( id, product_variant_id, quantity_variants, total_base_units, status, product_variants ( product_id ) )`)
        .in('status', ['ready_for_delivery', 'shipped', 'out_for_delivery'])
        .ilike('driver_name', `${profile.full_name}%`) 
        .order('created_at', { ascending: true }); 

      if (pendingError) throw pendingError;

      const startOfWeek = new Date();
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

      const { count: completedCount } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'delivered').ilike('driver_name', `${profile.full_name}%`).gte('updated_at', startOfWeek.toISOString());

      setOrders(pendingData || []);
      setCompletedThisWeek(completedCount || 0);
    } catch (error) {
      console.error('Error fetching routes:', error.message);
      showToast('Failed to load routes.', true);
    } finally {
      setLoading(false);
    }
  };

  // 🚀 FIXED: Added routeLegIndex so the map remembers the original Google route mapping!
  const applyOptimizedOrder = (sequence, legsData) => {
    if (!sequence || sequence.length === 0) return;
    
    const routeOrders = orders.slice(0, 25); 
    const remainingOrders = orders.slice(25); 
    
    const sortedRouteOrders = sequence.map((originalIndex, i) => ({
      ...routeOrders[originalIndex],
      travelDistance: legsData[i]?.distance,
      travelTime: legsData[i]?.duration,
      routeLegIndex: i // 🚀 Locks the order to its specific Map Leg!
    }));
    
    const completelySortedOrders = [...sortedRouteOrders, ...remainingOrders];
    setOrders(completelySortedOrders);
    showToast("Route Optimized for Fastest Round Trip!");
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
  };

  // 🚀 FIXED SIGNATURE LOGIC WITH DELAY
  useEffect(() => {
    if (!activeOrder || !canvasRef.current) return;
    
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      
      canvas.width = (rect.width || 350) * 2; 
      canvas.height = (rect.height || 160) * 2;
      ctx.scale(2, 2); 
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a'; 

      let isDrawing = false;

      const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
        return { x: clientX - r.left, y: clientY - r.top };
      };

      const startPos = (e) => { e.preventDefault(); isDrawing = true; const pos = getPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); };
      const movePos = (e) => { e.preventDefault(); if (!isDrawing) return; const pos = getPos(e); ctx.lineTo(pos.x, pos.y); ctx.stroke(); };
      const stopPos = (e) => { e.preventDefault(); isDrawing = false; };

      canvas.onmousedown = startPos;
      canvas.onmousemove = movePos;
      canvas.onmouseup = stopPos;
      canvas.onmouseleave = stopPos;
      canvas.ontouchstart = startPos;
      canvas.ontouchmove = movePos;
      canvas.ontouchend = stopPos;
      canvas.ontouchcancel = stopPos;
    }, 200);

    return () => clearTimeout(timer);
  }, [activeOrder]);

  const clearSignature = () => { const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); };

  const updateOrderStatus = async (orderId, newStatus) => {
    setOrders(currentOrders => 
      currentOrders.map(order => 
        order.id === orderId ? { ...order, status: newStatus } : order
      )
    );

    if (newStatus === 'out_for_delivery') {
      setTriggerMapOpen(Date.now());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);
      if (error) throw error;
    } catch (error) { 
      showToast("Failed to sync status to database.", true); 
    }
  };

  const submitDelivery = async () => {
    if (!receivedBy.trim()) { showToast('Please enter the full name of the person receiving the order.', true); return; }
    const canvas = canvasRef.current; const blank = document.createElement('canvas'); blank.width = canvas.width; blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) { showToast('Please have the customer sign to confirm delivery.', true); return; }

    setIsSubmitting(true);
    try {
      let photoUrlStr = null; let signatureUrlStr = null; const uniquePrefix = `${Date.now()}-${activeOrder.id}`;
      if (photoFile) {
        const photoPath = `pod-photos/${uniquePrefix}.jpg`;
        const { error: photoErr } = await supabase.storage.from('delivery-proofs').upload(photoPath, photoFile);
        if (photoErr) throw photoErr;
        photoUrlStr = supabase.storage.from('delivery-proofs').getPublicUrl(photoPath).data.publicUrl;
      }
      const signatureBlob = await (await fetch(canvas.toDataURL('image/png'))).blob();
      const sigPath = `pod-signatures/${uniquePrefix}.png`;
      const { error: sigErr } = await supabase.storage.from('delivery-proofs').upload(sigPath, signatureBlob);
      if (sigErr) throw sigErr;
      signatureUrlStr = supabase.storage.from('delivery-proofs').getPublicUrl(sigPath).data.publicUrl;

      const { error: updateErr } = await supabase.from('orders').update({ status: 'delivered', photo_url: photoUrlStr, signature_url: signatureUrlStr, received_by: receivedBy.trim(), updated_at: new Date().toISOString() }).eq('id', activeOrder.id);
      if (updateErr) throw updateErr;

      setOrders(orders.filter(o => o.id !== activeOrder.id)); setCompletedThisWeek(prev => prev + 1); window.dispatchEvent(new Event('orderStatusChanged')); closeModal(); showToast('Delivery completed successfully!');
    } catch (error) { console.error('Delivery Error:', error.message); showToast('Failed to upload delivery proof. Check your connection.', true); } finally { setIsSubmitting(false); }
  };

  const submitCancellation = async () => {
    if (!cancelReason.trim()) { showToast('Please provide a reason for cancelling this delivery.', true); return; }
    setIsCancelling(true);
    try {
      for (const item of cancellingOrder.order_items || []) {
        const productId = item.product_variants?.product_id;
        if (item.status !== 'cancelled' && productId) {
          const { data: invData } = await supabase.from('inventory').select('base_units_on_hand').eq('product_id', productId).single();
          if (invData && invData.base_units_on_hand !== undefined) {
            const qtyToReturn = Number(item.total_base_units || item.quantity_variants || 0);
            const newStock = Number(invData.base_units_on_hand) + qtyToReturn;
            await supabase.from('inventory').update({ base_units_on_hand: newStock }).eq('product_id', productId);
          }
        }
      }
      const { error } = await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancelReason.trim(), is_restocked: true, updated_at: new Date().toISOString() }).eq('id', cancellingOrder.id);
      if (error) throw error;
      setOrders(orders.filter(o => o.id !== cancellingOrder.id)); window.dispatchEvent(new Event('orderStatusChanged')); closeCancelModal(); showToast('Order cancelled and items successfully restocked!', false); 
    } catch (error) { console.error('Cancellation Error:', error.message); showToast('Failed to cancel the delivery. Please try again.', true); } finally { setIsCancelling(false); }
  };

  const submitAttempted = async () => {
    if (!attemptReason.trim()) { showToast('Please provide a reason for the failed delivery attempt.', true); return; }
    setIsAttempting(true);
    try {
      const { error } = await supabase.from('orders').update({ status: 'attempted', cancellation_reason: attemptReason.trim(), updated_at: new Date().toISOString() }).eq('id', attemptingOrder.id);
      if (error) throw error;
      setOrders(orders.filter(o => o.id !== attemptingOrder.id)); window.dispatchEvent(new Event('orderStatusChanged')); closeAttemptModal(); showToast('Order marked as attempted.', false); 
    } catch (error) { console.error('Attempt Error:', error.message); showToast('Failed to mark delivery as attempted.', true); } finally { setIsAttempting(false); }
  };

  const closeModal = () => { setActiveOrder(null); setPhotoFile(null); setPhotoPreview(null); setReceivedBy(''); };
  const closeCancelModal = () => { setCancellingOrder(null); setCancelReason(''); };
  const closeAttemptModal = () => { setAttemptingOrder(null); setAttemptReason(''); };

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
        <div className="relative z-10">
          <p className="text-emerald-400 font-bold tracking-widest uppercase text-[10px] mb-1">Driver Dashboard</p>
          <h2 className="text-2xl font-extrabold tracking-tight">Welcome, {profile?.full_name?.split(' ')[0] || 'Driver'}</h2>
          
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
        </div>
        <Truck className="absolute -right-8 -bottom-8 text-white/5" size={160} strokeWidth={1} />
      </div>

      {!loading && orders.length > 0 && (
        <MasterRouteMap 
          orders={orders} 
          onRouteOptimized={applyOptimizedOrder} 
          currentLocation={currentLocation} 
          autoTrigger={triggerMapOpen} 
        />
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
            const shipAddress = order.shipping_address || 'No address provided';
            const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');
            const shipPhone = order.agency_patients?.contact_number || order.user_profiles?.contact_number || '';
            const shortId = order.id.split('-')[0].toUpperCase();

            const totalItems = order.order_items?.reduce((sum, item) => sum + (item.quantity_variants || 0), 0) || 0;
            const isCOD = order.payment_method === 'cod';
            const isNet30 = order.payment_method === 'net_30';
            const paymentText = isCOD ? `$${Number(order.total_amount).toFixed(2)}` : (isNet30 ? 'Net 30' : 'Paid');
            
            const isOutForDelivery = order.status === 'out_for_delivery';

            return (
              <div key={order.id} className={`bg-white border rounded-3xl p-4 shadow-sm relative overflow-hidden flex flex-col transition-all ${isOutForDelivery ? 'border-blue-400 ring-4 ring-blue-500/10' : 'border-slate-200'}`}>
                
                <div className={`absolute top-0 right-0 text-white px-3 py-1.5 rounded-bl-xl font-black text-[10px] tracking-widest uppercase z-10 shadow-sm ${isOutForDelivery ? 'bg-blue-600' : 'bg-slate-900'}`}>
                  Stop #{index + 1}
                </div>

                <div className="mb-3 pr-16 pl-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 block">Order #{shortId}</span>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">{shipName}</h3>
                  {/* 🚀 DISTANCE/TIME CARD BADGE */}
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
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col justify-center items-center text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Package size={12}/> Packages</span>
                    <span className="font-black text-slate-900 text-sm">{totalItems} {totalItems === 1 ? 'Item' : 'Items'}</span>
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

                <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <div className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
                    <MapPin size={16} className="text-blue-600 mt-0.5 shrink-0"/>
                    <div className="leading-snug">
                      <p className="font-bold text-slate-900 text-sm">{shipAddress}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{shipCityState}</p>
                    </div>
                  </div>
                  {shipPhone && (
                    <div className="flex items-center gap-2.5 text-sm font-medium pt-2.5 border-t border-slate-200/60 mt-1">
                      <Phone size={16} className="text-emerald-500 shrink-0"/>
                      <a href={`tel:${shipPhone.replace(/[^0-9+]/g, '')}`} className="text-slate-900 font-bold underline underline-offset-4 decoration-slate-300 hover:decoration-emerald-500 transition-colors">
                        {shipPhone}
                      </a>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {!isOutForDelivery ? (
                    <button 
                      onClick={() => updateOrderStatus(order.id, 'out_for_delivery')}
                      className="w-full py-3.5 text-sm bg-slate-900 text-white font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 transition-all flex justify-center items-center gap-2"
                    >
                      <Truck size={18} /> Start Route
                    </button>
                  ) : (
                    <button 
                      onClick={() => setActiveOrder(order)}
                      className="w-full py-3.5 text-sm bg-emerald-500 text-white font-bold rounded-xl shadow-md hover:bg-emerald-600 active:scale-95 transition-all flex justify-center items-center gap-2"
                    >
                      <CheckCircle2 size={18} /> Complete POD
                    </button>
                  )}
                  
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button 
                      onClick={() => setCancellingOrder(order)}
                      className="py-3 bg-red-50 text-red-600 border border-red-200 text-[13px] font-black rounded-xl hover:bg-red-100 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <XCircle size={16} /> Cancel
                    </button>
                    <button 
                      onClick={() => setAttemptingOrder(order)}
                      className="py-3 bg-amber-50 text-amber-700 border border-amber-200 text-[13px] font-black rounded-xl hover:bg-amber-100 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
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

      {/* 🚀 ORIGINAL, FULL PROOF OF DELIVERY MODAL RESTORED */}
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
              
              {/* Step 1: Photo Section */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-widest">
                  <div className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px]">1</div>
                  Take Photo (Optional)
                </label>
                
                {photoPreview ? (
                  <div className="relative w-full h-36 rounded-2xl overflow-hidden border-2 border-slate-200 shadow-sm">
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    <button onClick={() => { setPhotoPreview(null); setPhotoFile(null); }} className="absolute top-2 right-2 p-1.5 bg-slate-900/70 backdrop-blur text-white rounded-full active:scale-95"><X size={14}/></button>
                  </div>
                ) : (
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      onChange={handlePhotoCapture}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="w-full h-24 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 flex flex-col items-center justify-center text-slate-500 gap-2 active:bg-slate-100 transition-colors">
                      <div className="p-2 bg-white rounded-full shadow-sm"><Camera size={18} className="text-blue-500" /></div>
                      <span className="text-[10px] font-bold uppercase tracking-widest">Tap for Camera</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              {/* Step 2: Recipient Name */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-widest">
                  <div className="w-5 h-5 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-[10px]">2</div>
                  Recipient Name
                </label>
                <input 
                  type="text" 
                  placeholder="Enter full name..." 
                  value={receivedBy} 
                  onChange={(e) => setReceivedBy(e.target.value)} 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-slate-900 shadow-sm placeholder:font-medium placeholder:text-slate-400"
                />
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              {/* Step 3: Signature Section */}
              <div className="space-y-3 pb-4">
                <div className="flex justify-between items-end">
                  <label className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-widest">
                    <div className="w-5 h-5 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-[10px]">3</div>
                    Customer Signature
                  </label>
                  <button onClick={clearSignature} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg active:scale-95">Clear</button>
                </div>
                
                <div className="relative w-full h-40 border-2 border-slate-200 rounded-2xl bg-slate-50 overflow-hidden shadow-inner">
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full cursor-crosshair"
                    style={{ touchAction: 'none' }}
                  />
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
                    <PenTool size={48} />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-white shrink-0 pb-8 sm:pb-5">
              <button 
                onClick={submitDelivery} 
                disabled={isSubmitting}
                className="w-full py-4 bg-emerald-500 text-white text-base font-black rounded-2xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 active:scale-[0.98] transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="animate-pulse flex items-center gap-2">Uploading Data...</span>
                ) : (
                  <><UploadCloud size={20} /> Submit Delivery</>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {toast.show && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[120] flex items-center gap-3 bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`p-1.5 rounded-full ${toast.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {toast.isError ? <AlertTriangle size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}
          </div>
          <p className="text-sm font-bold pr-2">{toast.message}</p>
        </div>
      )}

    </div>
  );
}
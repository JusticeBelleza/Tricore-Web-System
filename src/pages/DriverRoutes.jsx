import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  MapPin, Phone, CheckCircle2, Camera, PenTool, X, 
  UploadCloud, Truck, Navigation, Route, Clock, PackageCheck
} from 'lucide-react';

export default function DriverRoutes() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [completedToday, setCompletedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Delivery Modal State
  const [activeOrder, setActiveOrder] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canvasRef = useRef(null);

  useEffect(() => {
    if (profile?.id && profile?.full_name) {
      fetchMyRoutes();
    }
  }, [profile?.id, profile?.full_name]);

  const fetchMyRoutes = async () => {
    setLoading(true);
    try {
      // 1. Fetch Pending Deliveries
      const { data: pendingData, error: pendingError } = await supabase
        .from('orders')
        .select(`
          *,
          companies ( name, address, city, state, zip, phone ),
          agency_patients ( contact_number ),
          user_profiles ( full_name, contact_number )
        `)
        .in('status', ['ready_for_delivery', 'shipped', 'out_for_delivery'])
        .ilike('driver_name', `${profile.full_name}%`) 
        .order('created_at', { ascending: true }); // Oldest first (chronological route)

      if (pendingError) throw pendingError;

      // 2. Fetch "Completed Today" count for the progress stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: completedCount, error: completedError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'delivered')
        .ilike('driver_name', `${profile.full_name}%`)
        .gte('updated_at', today.toISOString());

      setOrders(pendingData || []);
      setCompletedToday(completedCount || 0);

    } catch (error) {
      console.error('Error fetching routes:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  // 🚀 NATIVE CANVAS INITIALIZATION (Mobile-Proof Signature Pad)
  useEffect(() => {
    if (!activeOrder || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // High DPI Display Fix
    canvas.width = canvas.offsetWidth * 2; 
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2); 
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a'; 

    let isDrawing = false;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startPos = (e) => {
      e.preventDefault(); 
      isDrawing = true;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const movePos = (e) => {
      e.preventDefault(); // Prevents screen scrolling while signing
      if (!isDrawing) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };

    const stopPos = (e) => {
      e.preventDefault();
      isDrawing = false;
    };

    canvas.addEventListener('mousedown', startPos, { passive: false });
    canvas.addEventListener('mousemove', movePos, { passive: false });
    canvas.addEventListener('mouseup', stopPos, { passive: false });
    canvas.addEventListener('mouseleave', stopPos, { passive: false });
    canvas.addEventListener('touchstart', startPos, { passive: false });
    canvas.addEventListener('touchmove', movePos, { passive: false });
    canvas.addEventListener('touchend', stopPos, { passive: false });
    canvas.addEventListener('touchcancel', stopPos, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', startPos);
      canvas.removeEventListener('mousemove', movePos);
      canvas.removeEventListener('mouseup', stopPos);
      canvas.removeEventListener('mouseleave', stopPos);
      canvas.removeEventListener('touchstart', startPos);
      canvas.removeEventListener('touchmove', movePos);
      canvas.removeEventListener('touchend', stopPos);
      canvas.removeEventListener('touchcancel', stopPos);
    };
  }, [activeOrder]);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const submitDelivery = async () => {
    const canvas = canvasRef.current;
    
    // Check if canvas is completely empty
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
      alert('Please have the customer sign to confirm delivery.');
      return;
    }

    setIsSubmitting(true);
    try {
      let photoUrlStr = null;
      let signatureUrlStr = null;
      const uniquePrefix = `${Date.now()}-${activeOrder.id}`;

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

      const { error: updateErr } = await supabase.from('orders').update({
        status: 'delivered',
        photo_url: photoUrlStr,
        signature_url: signatureUrlStr,
        updated_at: new Date().toISOString()
      }).eq('id', activeOrder.id);

      if (updateErr) throw updateErr;

      setOrders(orders.filter(o => o.id !== activeOrder.id));
      setCompletedToday(prev => prev + 1);
      window.dispatchEvent(new Event('orderStatusChanged'));
      closeModal();
      
    } catch (error) {
      console.error('Delivery Error:', error.message);
      alert('Failed to upload delivery proof. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => {
    setActiveOrder(null);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24">
      
      {/* --- DRIVER HERO DASHBOARD --- */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-emerald-400 font-bold tracking-widest uppercase text-xs mb-1">Driver Dashboard</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Welcome, {profile?.full_name?.split(' ')[0] || 'Driver'}</h2>
          
          <div className="flex gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-4 flex-1">
              <div className="flex items-center gap-2 text-slate-300 mb-1">
                <Route size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">Remaining</span>
              </div>
              <p className="text-3xl font-extrabold">{orders.length}</p>
            </div>
            <div className="bg-emerald-500/10 backdrop-blur border border-emerald-500/20 rounded-2xl p-4 flex-1">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <PackageCheck size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">Done Today</span>
              </div>
              <p className="text-3xl font-extrabold text-emerald-400">{completedToday}</p>
            </div>
          </div>
        </div>
        <Truck className="absolute -right-8 -bottom-8 text-white/5" size={160} strokeWidth={1} />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(n => <div key={n} className="h-40 bg-slate-100 animate-pulse rounded-3xl"></div>)}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center bg-white p-12 rounded-3xl border border-slate-200 shadow-sm mt-6">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-white shadow-sm">
            <CheckCircle2 size={40} />
          </div>
          <h3 className="text-2xl font-extrabold text-slate-900 mb-2">Route Complete!</h3>
          <p className="text-slate-500 text-sm max-w-xs mx-auto">You have no pending deliveries assigned to you. Great job today!</p>
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order, index) => {
            const isB2B = !!order.company_id;
            const shipName = order.shipping_name || (isB2B ? order.companies?.name : order.user_profiles?.full_name || 'Customer');
            const shipAddress = order.shipping_address || 'No shipping address provided';
            const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');
            const shipPhone = order.agency_patients?.contact_number || order.user_profiles?.contact_number || '';
            const shortId = order.id.split('-')[0].toUpperCase();

            const fullAddress = `${shipAddress}, ${shipCityState}`;
            const directionsLink = `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`;

            return (
              <div key={order.id} className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm relative overflow-hidden">
                {/* Visual Stop Indicator */}
                <div className="absolute top-0 right-0 bg-slate-100 text-slate-500 px-4 py-1.5 rounded-bl-2xl font-black text-xs tracking-widest uppercase border-b border-l border-slate-200">
                  Stop #{index + 1}
                </div>

                <div className="mb-5 pr-16">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Order #{shortId}</span>
                  <h3 className="text-xl font-bold text-slate-900 leading-tight">{shipName}</h3>
                </div>

                <div className="space-y-3 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-start gap-3 text-sm font-medium text-slate-700">
                    <MapPin size={18} className="text-blue-500 mt-0.5 shrink-0"/>
                    <div className="leading-relaxed">
                      <p className="font-bold text-slate-900">{shipAddress}</p>
                      <p className="text-slate-500">{shipCityState}</p>
                    </div>
                  </div>
                  {shipPhone && (
                    <div className="flex items-center gap-3 text-sm font-medium pt-3 border-t border-slate-200/60">
                      <Phone size={18} className="text-emerald-500 shrink-0"/>
                      {/* 🚀 Clickable Phone Number for Drivers */}
                      <a href={`tel:${shipPhone.replace(/[^0-9+]/g, '')}`} className="text-slate-900 font-bold underline underline-offset-4 decoration-slate-300 hover:decoration-emerald-500 transition-colors">
                        {shipPhone}
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-2">
                  <a 
                    href={directionsLink} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-1 py-4 bg-blue-50 text-blue-700 border border-blue-200 text-sm font-bold rounded-2xl hover:bg-blue-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Navigation size={18} /> Open Maps
                  </a>
                  <button 
                    onClick={() => setActiveOrder(order)}
                    className="flex-1 py-4 bg-slate-900 text-white text-sm font-bold rounded-2xl hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md"
                  >
                    <CheckCircle2 size={18} /> Complete Stop
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- MODERN BOTTOM-SHEET DELIVERY MODAL --- */}
      {activeOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md h-[92vh] sm:h-auto sm:max-h-[90vh] rounded-t-[2rem] sm:rounded-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-full duration-300">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50 rounded-t-[2rem] sm:rounded-t-3xl">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Proof of Delivery</h3>
                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Order #{activeOrder.id.split('-')[0]}</p>
              </div>
              <button onClick={closeModal} className="p-2.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 shadow-sm"><X size={20} /></button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-8 bg-white">
              
              {/* Photo Section */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs">1</div>
                  Take Photo (Optional)
                </label>
                
                {photoPreview ? (
                  <div className="relative w-full h-48 rounded-2xl overflow-hidden border-2 border-slate-200 shadow-sm">
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    <button onClick={() => { setPhotoPreview(null); setPhotoFile(null); }} className="absolute top-3 right-3 p-2 bg-slate-900/70 backdrop-blur text-white rounded-full active:scale-95"><X size={16}/></button>
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
                    <div className="w-full h-32 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 flex flex-col items-center justify-center text-slate-500 gap-2 transition-colors group-hover:border-slate-400 group-hover:bg-slate-100">
                      <div className="p-3 bg-white rounded-full shadow-sm"><Camera size={24} className="text-blue-500" /></div>
                      <span className="text-xs font-bold uppercase tracking-widest">Tap to Open Camera</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              {/* Signature Section */}
              <div className="space-y-3 pb-4">
                <div className="flex justify-between items-end">
                  <label className="flex items-center gap-2 text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    <div className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs">2</div>
                    Customer Signature
                  </label>
                  <button onClick={clearSignature} className="text-xs font-bold text-slate-500 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg active:scale-95">Clear</button>
                </div>
                
                <div className="relative w-full h-56 border-2 border-slate-200 rounded-2xl bg-slate-50 overflow-hidden shadow-inner">
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full cursor-crosshair"
                    style={{ touchAction: 'none' }}
                  />
                  {/* Watermark to show where to sign */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
                    <PenTool size={64} />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer (Sticky Bottom) */}
            <div className="p-6 border-t border-slate-100 bg-white shrink-0 pb-10 sm:pb-6">
              <button 
                onClick={submitDelivery} 
                disabled={isSubmitting}
                className="w-full py-4.5 bg-emerald-500 text-white text-lg font-extrabold rounded-2xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 active:scale-[0.98] transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="animate-pulse flex items-center gap-2">Uploading Data...</span>
                ) : (
                  <><UploadCloud size={22} /> Mark as Delivered</>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  MapPin, Phone, CheckCircle2, Camera, PenTool, X, 
  UploadCloud, Truck, Navigation, Route, PackageCheck, Package, DollarSign
} from 'lucide-react';

// 🚀 DEFINE YOUR WAREHOUSE ADDRESS HERE
const WAREHOUSE_ADDRESS = "2169 Harbor St, Pittsburg CA 94565";

export default function DriverRoutes() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [completedToday, setCompletedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Delivery Modal State
  const [activeOrder, setActiveOrder] = useState(null); 
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [receivedBy, setReceivedBy] = useState(''); // 🚀 NEW: State for recipient name
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
      const { data: pendingData, error: pendingError } = await supabase
        .from('orders')
        .select(`
          *,
          companies ( name, address, city, state, zip, phone ),
          agency_patients ( contact_number ),
          user_profiles ( full_name, contact_number ),
          order_items ( quantity_variants )
        `)
        .in('status', ['ready_for_delivery', 'shipped', 'out_for_delivery'])
        .ilike('driver_name', `${profile.full_name}%`) 
        .order('created_at', { ascending: true }); 

      if (pendingError) throw pendingError;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: completedCount } = await supabase
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

  // NATIVE CANVAS INITIALIZATION
  useEffect(() => {
    if (!activeOrder || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

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
      e.preventDefault(); 
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
    // 🚀 VALIDATE NAME INPUT
    if (!receivedBy.trim()) {
      alert('Please enter the full name of the person receiving the order.');
      return;
    }

    const canvas = canvasRef.current;
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

      // 🚀 UPDATED DB SUBMISSION (includes received_by)
      const { error: updateErr } = await supabase.from('orders').update({
        status: 'delivered',
        photo_url: photoUrlStr,
        signature_url: signatureUrlStr,
        received_by: receivedBy.trim(),
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
    setReceivedBy(''); // Reset name when closing modal
  };

  return (
    <div className="max-w-md sm:max-w-3xl mx-auto space-y-5 pb-24">
      
      {/* --- DRIVER HERO DASHBOARD --- */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-lg relative overflow-hidden">
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
                <span className="text-[10px] font-bold uppercase tracking-wider">Done Today</span>
              </div>
              <p className="text-3xl font-black text-emerald-400">{completedToday}</p>
            </div>
          </div>
        </div>
        <Truck className="absolute -right-8 -bottom-8 text-white/5" size={160} strokeWidth={1} />
      </div>

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
        <div className="space-y-4">
          {orders.map((order, index) => {
            const isB2B = !!order.company_id;
            const shipName = order.shipping_name || (isB2B ? order.companies?.name : order.user_profiles?.full_name || 'Customer');
            const shipAddress = order.shipping_address || 'No address provided';
            const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');
            const shipPhone = order.agency_patients?.contact_number || order.user_profiles?.contact_number || '';
            const shortId = order.id.split('-')[0].toUpperCase();

            const totalItems = order.order_items?.reduce((sum, item) => sum + item.quantity_variants, 0) || 0;
            
            // 🚀 FIXED PAYMENT STATUS LOGIC
            const isCOD = order.payment_method === 'cod';
            const isNet30 = order.payment_method === 'net_30';
            const paymentText = isCOD ? `$${Number(order.total_amount).toFixed(2)}` : (isNet30 ? 'Net 30' : 'Paid');

            const fullAddress = `${shipAddress}, ${shipCityState}`;
            const mapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(fullAddress)}&t=m&z=15&output=embed&iwloc=near`;
            const directionsLink = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(WAREHOUSE_ADDRESS)}&destination=${encodeURIComponent(fullAddress)}`;

            return (
              <div key={order.id} className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm relative overflow-hidden flex flex-col">
                
                {/* Visual Stop Indicator */}
                <div className="absolute top-0 right-0 bg-slate-900 text-white px-3 py-1.5 rounded-bl-xl font-black text-[10px] tracking-widest uppercase z-10 shadow-sm">
                  Stop #{index + 1}
                </div>

                <div className="mb-3 pr-16 pl-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 block">Order #{shortId}</span>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">{shipName}</h3>
                </div>

                {/* QUICK INFO DASHBOARD */}
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

                {/* GOOGLE MAPS EMBED */}
                <div className="w-full h-36 rounded-2xl overflow-hidden border border-slate-200 shadow-inner mb-3 relative bg-slate-100 pointer-events-none">
                  <iframe 
                    width="100%" 
                    height="100%" 
                    frameBorder="0" 
                    scrolling="no" 
                    marginHeight="0" 
                    marginWidth="0" 
                    src={mapEmbedUrl}
                    title="Google Maps Location"
                    className="absolute inset-0"
                  ></iframe>
                </div>

                <div className="space-y-2 mb-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
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

                <div className="flex gap-2.5 mt-auto">
                  <a 
                    href={directionsLink} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-1 py-3.5 bg-blue-50 text-blue-700 border border-blue-200 text-sm font-black rounded-xl hover:bg-blue-100 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Navigation size={18} /> Navigate
                  </a>
                  <button 
                    onClick={() => setActiveOrder(order)}
                    className="flex-1 py-3.5 bg-slate-900 text-white text-sm font-black rounded-xl hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <CheckCircle2 size={18} /> Complete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- MODERN BOTTOM-SHEET DELIVERY POD MODAL --- */}
      {activeOrder && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md h-[92vh] sm:h-auto sm:max-h-[90vh] rounded-t-[2rem] sm:rounded-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-full duration-300">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50 rounded-t-[2rem] sm:rounded-t-3xl">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Proof of Delivery</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">Order #{activeOrder.id.split('-')[0]}</p>
              </div>
              <button onClick={closeModal} className="p-2.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 shadow-sm"><X size={20} /></button>
            </div>

            {/* Modal Body */}
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

              {/* 🚀 Step 2: Recipient Name */}
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

            {/* Modal Footer */}
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
    </div>
  );
}
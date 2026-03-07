import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  MapPin, Phone, User, Package, CheckCircle2, 
  Camera, PenTool, X, UploadCloud, Truck, Navigation
} from 'lucide-react';

export default function DriverRoutes() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeOrder, setActiveOrder] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canvasRef = useRef(null);

  useEffect(() => {
    if (profile?.id) {
      fetchMyRoutes();
    }
  }, [profile?.id]);

  const fetchMyRoutes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          companies ( name, address, city, state, zip, phone ),
          agency_patients ( contact_number ),
          user_profiles ( contact_number )
        `)
        .in('status', ['ready_for_delivery', 'shipped', 'out_for_delivery'])
        .ilike('driver_name', `${profile.full_name}%`) 
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
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
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);
    }
  };

  useEffect(() => {
    if (!activeOrder || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth * 2; 
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2); 
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
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

      // 🚀 UPDATED: Saves the exact timestamp to updated_at
      const { error: updateErr } = await supabase.from('orders').update({
        status: 'delivered',
        photo_url: photoUrlStr,
        signature_url: signatureUrlStr,
        updated_at: new Date().toISOString()
      }).eq('id', activeOrder.id);

      if (updateErr) throw updateErr;

      setOrders(orders.filter(o => o.id !== activeOrder.id));
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
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold tracking-tight">Active Route</h2>
          <p className="text-slate-300 text-sm mt-1 font-medium">{orders.length} deliveries pending</p>
        </div>
        <Truck className="absolute -right-4 -bottom-4 text-white/5" size={120} strokeWidth={1} />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(n => <div key={n} className="h-32 bg-slate-100 animate-pulse rounded-2xl"></div>)}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center bg-white p-12 rounded-3xl border border-slate-200 shadow-sm mt-6">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Route Complete!</h3>
          <p className="text-slate-500 text-sm">You have no pending deliveries assigned to you.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const isB2B = !!order.company_id;
            const shipName = order.shipping_name || (isB2B ? order.companies?.name : 'Retail Customer');
            const shipAddress = order.shipping_address || 'No shipping address provided';
            const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');
            const shipPhone = order.agency_patients?.contact_number || order.user_profiles?.contact_number || '';
            const shortId = order.id.split('-')[0].toUpperCase();

            const fullAddress = `${shipAddress}, ${shipCityState}`;
            const directionsLink = `http://googleusercontent.com/maps.google.com/8{encodeURIComponent(fullAddress)}`;

            return (
              <div key={order.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm active:scale-[0.98] transition-transform">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] uppercase tracking-widest font-bold">#{shortId}</span>
                    <h3 className="text-lg font-bold text-slate-900 mt-2 leading-tight">{shipName}</h3>
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex items-start gap-2.5 text-sm font-medium text-slate-600">
                    <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0"/>
                    <div>
                      <p>{shipAddress}</p>
                      <p>{shipCityState}</p>
                    </div>
                  </div>
                  {shipPhone && (
                    <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
                      <Phone size={16} className="text-slate-400 shrink-0"/>
                      <a href={`tel:${shipPhone}`} className="text-blue-600 underline underline-offset-2">{shipPhone}</a>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-2">
                  <a 
                    href={directionsLink} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-1 py-3.5 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-md hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Navigation size={18} /> Directions
                  </a>
                  <button 
                    onClick={() => setActiveOrder(order)}
                    className="flex-1 py-3.5 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-slate-800 active:bg-slate-950 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} /> Complete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md h-[90vh] sm:h-auto sm:max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-10">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Proof of Delivery</h3>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-900 bg-slate-50 rounded-full active:scale-95"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wider">
                  <Camera size={16} className="text-blue-600" /> 1. Take Photo (Optional)
                </label>
                {photoPreview ? (
                  <div className="relative w-full h-48 rounded-xl overflow-hidden border-2 border-slate-200 shadow-sm">
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    <button onClick={() => { setPhotoPreview(null); setPhotoFile(null); }} className="absolute top-2 right-2 p-2 bg-slate-900/50 backdrop-blur text-white rounded-full"><X size={14}/></button>
                  </div>
                ) : (
                  <div className="relative">
                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className="w-full h-24 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center text-slate-500 gap-1 transition-colors hover:border-slate-400 hover:bg-slate-100">
                      <Camera size={24} />
                      <span className="text-xs font-bold uppercase tracking-widest">Tap to Open Camera</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wider">
                    <PenTool size={16} className="text-purple-600" /> 2. Customer Signature
                  </label>
                  <button onClick={clearSignature} className="text-xs font-bold text-slate-400 hover:text-slate-900 underline underline-offset-2">Clear</button>
                </div>
                <div className="relative w-full h-48 border-2 border-slate-200 rounded-xl bg-slate-50 overflow-hidden shadow-inner">
                  <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair" style={{ touchAction: 'none' }} />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-3xl shrink-0">
              <button onClick={submitDelivery} disabled={isSubmitting} className="w-full py-4 bg-emerald-600 text-white text-base font-bold rounded-xl shadow-md hover:bg-emerald-700 active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                {isSubmitting ? <span className="animate-pulse flex items-center gap-2">Uploading Data...</span> : <><UploadCloud size={20} /> Mark as Delivered</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
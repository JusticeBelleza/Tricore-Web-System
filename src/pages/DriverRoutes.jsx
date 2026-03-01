import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function DriverRoutes() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // States for the active delivery being processed
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, companies(name, shipping_fee)')
        .eq('status', 'out_for_delivery')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching routes:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file, pathPrefix) => {
    if (!file) return null;
    const fileExt = file.name.split('.').pop();
    const fileName = `${pathPrefix}-${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('deliveries')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('deliveries').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const submitDelivery = async (e) => {
    e.preventDefault();
    if (!photoFile || !signatureFile || !activeDelivery) {
      alert("Both a photo and signature image are required.");
      return;
    }

    setProcessingId(activeDelivery.id);
    try {
      // 1. Upload files
      const photoUrl = await handleUpload(photoFile, `photo-${activeDelivery.id}`);
      const sigUrl = await handleUpload(signatureFile, `sig-${activeDelivery.id}`);

      // 2. Call our secure RPC to complete delivery & deduct inventory
      const { error } = await supabase.rpc('complete_delivery', {
        p_order_id: activeDelivery.id,
        p_photo_url: photoUrl,
        p_signature_url: sigUrl
      });

      if (error) throw error;

      alert('Delivery completed successfully! Inventory deducted.');
      setActiveDelivery(null);
      setPhotoFile(null);
      setSignatureFile(null);
      fetchRoutes(); // Refresh the list

    } catch (error) {
      console.error('Delivery error:', error.message);
      alert('Failed to process delivery.');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <div className="text-slate-500">Loading routes...</div>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Driver Routes</h2>
        <p className="text-sm text-slate-500 mt-1">Orders out for delivery today.</p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 shadow-sm">
          No pending deliveries for you right now. Great job!
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{order.companies?.name}</h3>
                  <p className="text-sm font-mono text-slate-500">Order #{order.id.split('-')[0]}</p>
                </div>
                <span className="bg-orange-100 text-orange-800 px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider">
                  Action Required
                </span>
              </div>

              {activeDelivery?.id === order.id ? (
                <form onSubmit={submitDelivery} className="mt-6 pt-6 border-t border-slate-100 space-y-4">
                  <h4 className="font-medium text-slate-900">Proof of Delivery</h4>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Take Photo of Delivery</label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      onChange={(e) => setPhotoFile(e.target.files[0])}
                      className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Customer Signature (Image)</label>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => setSignatureFile(e.target.files[0])}
                      className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button 
                      type="button" 
                      onClick={() => setActiveDelivery(null)}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={processingId === order.id}
                      className="flex-1 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-50"
                    >
                      {processingId === order.id ? 'Uploading & Updating...' : 'Complete Delivery'}
                    </button>
                  </div>
                </form>
              ) : (
                <button 
                  onClick={() => setActiveDelivery(order)}
                  className="w-full mt-2 px-4 py-2 bg-slate-100 text-slate-900 text-sm font-medium rounded-md hover:bg-slate-200 transition-colors"
                >
                  Deliver Order
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
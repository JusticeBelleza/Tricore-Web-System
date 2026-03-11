import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Truck, Navigation, CheckCircle2, Clock, MapPin, 
  User, Image as ImageIcon, PenTool, X, Search,
  AlertTriangle, XCircle
} from 'lucide-react';

export default function DispatchMonitor() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('in_transit');
  
  const [selectedPod, setSelectedPod] = useState(null);

  useEffect(() => {
    fetchDeliveries();

    const sub = supabase.channel('dispatch_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchDeliveries)
      .subscribe();

    window.addEventListener('orderStatusChanged', fetchDeliveries);

    return () => {
      supabase.removeChannel(sub);
      window.removeEventListener('orderStatusChanged', fetchDeliveries);
    };
  }, []);

  // 🚀 SMART NOTIFICATION CLEARING:
  useEffect(() => {
    if (activeTab === 'delivered') {
      localStorage.setItem('lastViewedDelivered', new Date().toISOString());
      window.dispatchEvent(new Event('podViewed'));
    }
  }, [activeTab, deliveries]);

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        // 🚀 CHANGED TO '*' SO IT NEVER CRASHES EVEN IF A COLUMN IS MISSING
        .select('*')
        .in('status', ['ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'])
        .not('driver_name', 'is', null)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setDeliveries(data || []);
    } catch (error) {
      console.error('Error fetching dispatch data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const displayedDeliveries = deliveries.filter(d => {
    let matchesTab = false;
    if (activeTab === 'in_transit') matchesTab = ['ready_for_delivery', 'shipped', 'out_for_delivery'].includes(d.status);
    if (activeTab === 'delivered') matchesTab = d.status === 'delivered';
    if (activeTab === 'cancelled') matchesTab = d.status === 'cancelled';
      
    const searchString = `${d.id} ${d.driver_name} ${d.shipping_name}`.toLowerCase();
    const matchesSearch = searchString.includes(searchTerm.toLowerCase());

    return matchesTab && matchesSearch;
  });

  const getStatusBadge = (status) => {
    if (status === 'delivered') return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><CheckCircle2 size={12}/> Delivered</span>;
    if (status === 'cancelled') return <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><XCircle size={12}/> Cancelled</span>;
    return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><Truck size={12}/> In Transit</span>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
            <Navigation size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Dispatch Monitor</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Track active fleet routes and review Proof of Delivery (POD).</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-100/50 rounded-xl border border-slate-200 w-full md:w-auto overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('in_transit')} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'in_transit' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}>
            <Truck size={16}/> In Transit ({deliveries.filter(d => ['ready_for_delivery', 'shipped', 'out_for_delivery'].includes(d.status)).length})
          </button>
          <button onClick={() => setActiveTab('delivered')} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'delivered' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-200/50'}`}>
            <CheckCircle2 size={16}/> Delivered ({deliveries.filter(d => d.status === 'delivered').length})
          </button>
          
          <button onClick={() => setActiveTab('cancelled')} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'cancelled' ? 'bg-red-600 text-white shadow-md' : 'text-slate-500 hover:text-red-700 hover:bg-slate-200/50'}`}>
            <AlertTriangle size={16}/> Exceptions ({deliveries.filter(d => d.status === 'cancelled').length})
          </button>
        </div>
        <div className="relative w-full md:w-80 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search Driver or Customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all shadow-sm" />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="w-full h-14 bg-slate-50/80 border-b border-slate-200"></div>
          {[1,2,3,4,5].map(n => (<div key={n} className="w-full h-20 bg-white border-b border-slate-100 flex items-center px-6 gap-6 animate-pulse"><div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0"></div><div className="w-32 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-48 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-24 h-6 bg-slate-100 rounded-lg shrink-0 ml-auto"></div></div>))}
        </div>
      ) : displayedDeliveries.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mt-6">
          <Navigation size={56} strokeWidth={1} className="mx-auto text-slate-300 mb-5" />
          <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">No routes found</h3>
          <p className="text-slate-500 text-sm">There are no deliveries matching your current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-x-auto mt-6">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold tracking-tight rounded-tl-3xl">Delivery Info</th>
                <th className="px-6 py-4 font-bold tracking-tight">Assigned Driver</th>
                <th className="px-6 py-4 font-bold tracking-tight">Status</th>
                <th className="px-6 py-4 font-bold tracking-tight text-center rounded-tr-3xl">Proof / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedDeliveries.map(delivery => {
                const shortId = delivery.id.substring(0, 8).toUpperCase();
                const driverName = (delivery.driver_name || 'Unassigned').split(' | ')[0];
                const hasPod = delivery.photo_url || delivery.signature_url || delivery.received_by;

                return (
                  <tr key={delivery.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono font-bold text-slate-900 text-xs">#{shortId}</span>
                        <p className="font-bold text-slate-700">{delivery.shipping_name}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={10}/> {delivery.shipping_city || 'Address hidden'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <p className="font-bold text-slate-900 flex items-center gap-1.5"><User size={14} className="text-slate-400"/> {driverName}</p>
                        <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5"><Truck size={14} className="text-slate-400"/> {delivery.vehicle_name || 'Vehicle'}</p>
                      </div>
                    </td>
                    
                    {/* 🚀 FIXED: Color-coded date and exact time based on status */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1.5">
                        {getStatusBadge(delivery.status)}
                        
                        {delivery.status === 'delivered' ? (
                          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                            <CheckCircle2 size={10}/> {new Date(delivery.updated_at || delivery.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})} at {new Date(delivery.updated_at || delivery.created_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})}
                          </span>
                        ) : delivery.status === 'cancelled' ? (
                          <span className="text-[9px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                            <XCircle size={10}/> {new Date(delivery.updated_at || delivery.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})} at {new Date(delivery.updated_at || delivery.created_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})}
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                            <Clock size={10}/> Since {new Date(delivery.updated_at || delivery.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})} at {new Date(delivery.updated_at || delivery.created_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      {delivery.status === 'delivered' ? (
                        hasPod ? (
                          <button onClick={() => setSelectedPod(delivery)} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm">
                            <ImageIcon size={14} /> View POD
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 text-xs font-bold rounded-lg border border-slate-200">No POD Attached</span>
                        )
                      ) : delivery.status === 'cancelled' ? (
                        <button onClick={() => setSelectedPod(delivery)} className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 text-xs font-bold rounded-xl hover:bg-red-100 active:scale-95 transition-all shadow-sm">
                          <AlertTriangle size={14} /> View Reason
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-400 text-xs font-bold rounded-lg border border-slate-100 italic">Waiting...</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedPod && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className={`px-6 py-5 border-b flex justify-between items-center ${selectedPod.status === 'cancelled' ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
              <div>
                <h3 className={`text-lg font-bold tracking-tight ${selectedPod.status === 'cancelled' ? 'text-red-900' : 'text-slate-900'}`}>
                  {selectedPod.status === 'cancelled' ? 'Delivery Exception' : 'Proof of Delivery'}
                </h3>
                <p className={`text-xs font-mono font-bold mt-1 uppercase tracking-widest ${selectedPod.status === 'cancelled' ? 'text-red-500' : 'text-slate-500'}`}>
                  Order #{selectedPod.id.substring(0,8)}
                </p>
              </div>
              <button onClick={() => setSelectedPod(null)} className="p-2 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              {/* EXCEPTION REASON */}
              {selectedPod.status === 'cancelled' && (
                <div className="bg-red-50 border border-red-200 p-5 rounded-2xl flex items-start gap-3">
                  <AlertTriangle size={20} className="text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-black text-red-900 tracking-tight">Driver Notes</h4>
                    <p className="text-sm text-red-700 mt-1 font-medium leading-relaxed">
                      {selectedPod.cancellation_reason || "No reason provided by driver."}
                    </p>
                  </div>
                </div>
              )}

              {/* RECIPIENT NAME */}
              {selectedPod.received_by && (
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Received By</p>
                  <p className="font-bold text-slate-900 flex items-center gap-2 text-base">
                    <User size={18} className="text-emerald-500" /> {selectedPod.received_by}
                  </p>
                </div>
              )}

              {/* PHOTO POD */}
              {selectedPod.photo_url && (
                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wider"><ImageIcon size={16} className="text-blue-600" /> Delivery Photo</h4>
                  <div className="rounded-2xl overflow-hidden border-2 border-slate-200 shadow-sm bg-slate-50">
                    <img src={selectedPod.photo_url} alt="Delivery Proof" className="w-full h-auto object-cover" />
                  </div>
                </div>
              )}
              
              {selectedPod.photo_url && selectedPod.signature_url && <div className="h-px w-full bg-slate-100"></div>}

              {/* SIGNATURE POD */}
              {selectedPod.signature_url && (
                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wider"><PenTool size={16} className="text-purple-600" /> Customer Signature</h4>
                  <div className="rounded-2xl border-2 border-slate-200 shadow-inner bg-white p-4">
                    <img src={selectedPod.signature_url} alt="Customer Signature" className="w-full h-32 object-contain mix-blend-multiply" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setSelectedPod(null)} className="w-full py-3.5 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 transition-all">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
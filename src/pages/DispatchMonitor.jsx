import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Truck, Navigation, CheckCircle2, Clock, MapPin, 
  User, Image as ImageIcon, PenTool, X, Search,
  AlertTriangle, XCircle, ChevronDown, Car, Hash, PackageCheck
} from 'lucide-react';

export default function DispatchMonitor() {
  const [deliveries, setDeliveries] = useState([]);
  const [fleetVehicles, setFleetVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // DEFAULT TAB IS NOW 'needs_dispatch'
  const [activeTab, setActiveTab] = useState('needs_dispatch');
  
  const [selectedPod, setSelectedPod] = useState(null);

  // Dispatch Assignment States
  const [assigningOrder, setAssigningOrder] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleType, setVehicleType] = useState('Cargo Van');
  const [vehicleLicense, setVehicleLicense] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', isError: false });

  // Auto-hide notifications
  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => { setNotification({ ...notification, show: false }); }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  useEffect(() => {
    fetchFleetAndDrivers();
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

  // 🚀 SMART NOTIFICATION CLEARING
  useEffect(() => {
    if (activeTab === 'delivered') {
      localStorage.setItem('lastViewedDelivered', new Date().toISOString());
      window.dispatchEvent(new Event('podViewed'));
    }
    // NEW: Clear badge when the Needs Dispatch tab is opened
    if (activeTab === 'needs_dispatch') {
      localStorage.setItem('lastViewedDispatch', new Date().toISOString());
      window.dispatchEvent(new Event('dispatchViewed'));
    }
  }, [activeTab, deliveries]);

  const fetchFleetAndDrivers = async () => {
    const [fleetRes, driversRes] = await Promise.all([
      supabase.from('vehicles').select('*').order('name', { ascending: true }),
      supabase.from('user_profiles').select('id, full_name, contact_number').eq('role', 'driver').order('full_name', { ascending: true }) 
    ]);
    setFleetVehicles(fleetRes.data || []);
    setDrivers(driversRes.data || []);
  };

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['ready_for_delivery', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setDeliveries(data || []);
    } catch (error) {
      console.error('Error fetching dispatch data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const openAssignModal = (order) => {
    setDriverName((order.driver_name || '').split(' | ')[0]); setVehicleName(order.vehicle_name || '');
    setVehicleType(order.vehicle_type || 'Cargo Van'); setVehicleLicense(order.vehicle_license || ''); setAssigningOrder(order);
  };

  const handleFleetSelection = (e) => {
    const selectedVehicle = fleetVehicles.find(v => v.id === e.target.value);
    if (selectedVehicle) { setVehicleName(selectedVehicle.name); setVehicleType(selectedVehicle.type); setVehicleLicense(selectedVehicle.license_plate || ''); }
    else { setVehicleName(''); setVehicleType('Cargo Van'); setVehicleLicense(''); }
  };

  const confirmAssignment = async (e) => {
    e.preventDefault(); if (!assigningOrder) return;
    try {
      const assignedDriverObj = drivers.find(d => d.full_name === driverName);
      const driverPhone = assignedDriverObj?.contact_number || '';
      const finalDriverName = driverPhone ? `${driverName} | ${driverPhone}` : driverName;

      const { data, error } = await supabase.from('orders').update({ 
        driver_name: finalDriverName || null, vehicle_name: vehicleName || null, 
        vehicle_license: vehicleLicense || null, status: 'shipped', 
        updated_at: new Date().toISOString(),
        shipped_at: new Date().toISOString()
      })
      .eq('id', assigningOrder.id)
      .eq('status', assigningOrder.status)
      .select();
      
      if (error) throw error;

      if (data && data.length === 0) {
        setAssigningOrder(null);
        setNotification({ show: true, isError: true, message: 'Action Blocked: Another user already modified this order.' });
        fetchDeliveries();
        return;
      }
      
      setAssigningOrder(null);
      setNotification({ show: true, isError: false, message: 'Driver assigned and order shipped successfully!' });
      window.dispatchEvent(new Event('orderStatusChanged'));
    } catch (error) { setNotification({ show: true, isError: true, message: `Failed to dispatch: ${error.message}` }); }
  };

  const displayedDeliveries = deliveries.filter(d => {
    let matchesTab = false;
    if (activeTab === 'needs_dispatch') matchesTab = d.status === 'ready_for_delivery';
    if (activeTab === 'in_transit') matchesTab = ['shipped', 'out_for_delivery'].includes(d.status);
    if (activeTab === 'delivered') matchesTab = d.status === 'delivered';
    if (activeTab === 'cancelled') matchesTab = d.status === 'cancelled';
      
    const searchString = `${d.id} ${d.driver_name} ${d.shipping_name}`.toLowerCase();
    const matchesSearch = searchString.includes(searchTerm.toLowerCase());

    return matchesTab && matchesSearch;
  });

  const getStatusBadge = (status) => {
    if (status === 'delivered') return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><CheckCircle2 size={12}/> Delivered</span>;
    if (status === 'cancelled') return <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><XCircle size={12}/> Cancelled</span>;
    if (status === 'ready_for_delivery') return <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><PackageCheck size={12}/> Needs Dispatch</span>;
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
            <p className="text-sm text-slate-500 mt-1 font-medium">Assign drivers, track active routes, and review Proof of Delivery (POD).</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-100/50 rounded-xl border border-slate-200 w-full xl:w-auto overflow-x-auto shrink-0">
          
          <button onClick={() => setActiveTab('needs_dispatch')} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'needs_dispatch' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:text-purple-700 hover:bg-slate-200/50'}`}>
            <PackageCheck size={16}/> Needs Dispatch ({deliveries.filter(d => d.status === 'ready_for_delivery').length})
          </button>
          
          <button onClick={() => setActiveTab('in_transit')} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'in_transit' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}>
            <Truck size={16}/> In Transit ({deliveries.filter(d => ['shipped', 'out_for_delivery'].includes(d.status)).length})
          </button>
          
          <button onClick={() => setActiveTab('delivered')} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'delivered' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-200/50'}`}>
            <CheckCircle2 size={16}/> Delivered ({deliveries.filter(d => d.status === 'delivered').length})
          </button>
          
          <button onClick={() => setActiveTab('cancelled')} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'cancelled' ? 'bg-red-600 text-white shadow-md' : 'text-slate-500 hover:text-red-700 hover:bg-slate-200/50'}`}>
            <AlertTriangle size={16}/> Exceptions ({deliveries.filter(d => d.status === 'cancelled').length})
          </button>
        </div>
        <div className="relative w-full xl:w-80 shrink-0">
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
                <th className="px-6 py-4 font-bold tracking-tight text-center rounded-tr-3xl">Action / Proof</th>
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
                        <p className={`font-bold flex items-center gap-1.5 ${delivery.driver_name ? 'text-slate-900' : 'text-slate-400 italic'}`}><User size={14} className="text-slate-400"/> {driverName}</p>
                        <p className={`text-xs font-medium flex items-center gap-1.5 ${delivery.vehicle_name ? 'text-slate-500' : 'text-slate-400 italic'}`}><Truck size={14} className="text-slate-400"/> {delivery.vehicle_name || 'No Vehicle'}</p>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1.5">
                        {getStatusBadge(delivery.status)}
                        
                        {delivery.status === 'delivered' ? (
                          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                            <CheckCircle2 size={10}/> {new Date(delivery.delivered_at || delivery.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})} at {new Date(delivery.delivered_at || delivery.updated_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})}
                          </span>
                        ) : delivery.status === 'cancelled' ? (
                          <span className="text-[9px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                            <XCircle size={10}/> {new Date(delivery.cancelled_at || delivery.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})} at {new Date(delivery.cancelled_at || delivery.updated_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})}
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                            <Clock size={10}/> Since {new Date(delivery.shipped_at || delivery.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})} at {new Date(delivery.shipped_at || delivery.updated_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      {delivery.status === 'ready_for_delivery' ? (
                        <button onClick={() => openAssignModal(delivery)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm">
                            <Truck size={14} /> Dispatch Driver
                        </button>
                      ) : delivery.status === 'delivered' ? (
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
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-400 text-xs font-bold rounded-lg border border-slate-100 italic">En Route...</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DISPATCH ASSIGNMENT MODAL */}
      {assigningOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><Truck size={18}/> Assign Fleet & Driver</h3>
              <button onClick={() => setAssigningOrder(null)} className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            <form onSubmit={confirmAssignment} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Assigned Driver</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select required value={driverName} onChange={(e) => setDriverName(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold cursor-pointer appearance-none transition-all">
                    <option value="" disabled>-- Select a Driver from Staff Directory --</option>
                    {drivers.map(d => (<option key={d.id} value={d.full_name}>{d.full_name}</option>))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                </div>
              </div>
              <div className="h-px w-full bg-slate-100"></div>
              <div>
                <label className="block text-xs font-bold text-blue-600 uppercase tracking-widest mb-1.5">Select Vehicle from Fleet</label>
                <div className="relative">
                  <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-400" size={16} />
                  <select onChange={handleFleetSelection} className="w-full pl-10 pr-4 py-3 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold cursor-pointer appearance-none transition-all">
                    <option value="">-- Custom Vehicle (Type Below) --</option>
                    {fleetVehicles.map(v => (<option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={16} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Vehicle Name</label><input type="text" required value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">License Plate</label><input type="text" required value={vehicleLicense} onChange={(e) => setVehicleLicense(e.target.value.toUpperCase())} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold font-mono tracking-wide transition-all" /></div>
              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setAssigningOrder(null)} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button><button type="submit" className="w-full py-3 text-sm bg-blue-600 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-blue-700 active:scale-95 transition-all"><Truck size={16} /> Confirm Dispatch</button></div>
            </form>
          </div>
        </div>
      )}

      {/* POD / EXCEPTION MODAL */}
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

      {/* TOAST NOTIFICATION */}
      {notification.show && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[120] flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`p-1.5 rounded-full ${notification.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{notification.isError ? <XCircle size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}</div>
          <p className="text-sm font-medium pr-2">{notification.message}</p>
        </div>
      )}
    </div>
  );
}
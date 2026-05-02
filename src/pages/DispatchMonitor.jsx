import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { 
  Truck, Navigation, CheckCircle2, Clock, MapPin, 
  User, Image as ImageIcon, X, Search,
  AlertTriangle, XCircle, ChevronDown, Car, PackageCheck, CreditCard, Package,
  ChevronLeft, ChevronRight
} from 'lucide-react';

export default function DispatchMonitor() {
  const queryClient = useQueryClient();
  
  const [page, setPage] = useState(0);
  const pageSize = 20;
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  const [activeTab, setActiveTab] = useState('needs_dispatch');
  const [selectedPod, setSelectedPod] = useState(null);

  // Dispatch Assignment States
  const [assigningOrder, setAssigningOrder] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleType, setVehicleType] = useState('Cargo Van');
  const [vehicleLicense, setVehicleLicense] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', isError: false });

  // Debounce Search
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(0); }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Reset page on tab change
  useEffect(() => {
    setPage(0);
  }, [activeTab]);

  // Auto-hide notifications
  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => { setNotification({ ...notification, show: false }); }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  // Handle local storage markers for badges
  useEffect(() => {
    if (activeTab === 'delivered') {
      localStorage.setItem('lastViewedDelivered', new Date().toISOString());
      window.dispatchEvent(new Event('podViewed'));
    }
    if (activeTab === 'needs_dispatch') {
      localStorage.setItem('lastViewedDispatch', new Date().toISOString());
      window.dispatchEvent(new Event('dispatchViewed'));
    }
  }, [activeTab]);

  // ==========================================
  // 🚀 REACT QUERY: DATA FETCHING
  // ==========================================

  // 1. Fetch Fleet Vehicles (Cached)
  const { data: fleetVehicles = [] } = useQuery({
    queryKey: ['fleet_vehicles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vehicles').select('*').order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: Infinity,
  });

  // 2. Fetch Drivers (Cached)
  const { data: drivers = [] } = useQuery({
    queryKey: ['dispatch_drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_profiles').select('id, full_name, contact_number, license_number, license_expiry').eq('role', 'driver').order('full_name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: Infinity,
  });

  // 3. Fetch Tab Counts via RPC
  const { data: tabCounts = { needs_dispatch: 0, in_transit: 0, delivered: 0, cancelled: 0 } } = useQuery({
    queryKey: ['dispatch_tab_counts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dispatch_tab_counts');
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  // 4. Fetch Paginated Deliveries (N+1)
  const { data: deliveriesData, isLoading } = useQuery({
    queryKey: ['dispatch_deliveries', activeTab, page, debouncedSearch],
    queryFn: async () => {
      let query = supabase.from('orders').select('*');

      // Server-side Tab Filtering
      if (activeTab === 'needs_dispatch') query = query.eq('status', 'ready_for_delivery');
      else if (activeTab === 'in_transit') query = query.in('status', ['shipped', 'out_for_delivery']);
      else if (activeTab === 'delivered') query = query.eq('status', 'delivered');
      else if (activeTab === 'cancelled') query = query.eq('status', 'cancelled');

      // Server-side Search Filtering
      if (debouncedSearch) {
        const clean = debouncedSearch.trim();
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
        if (isUUID) {
          query = query.or(`id.eq.${clean},shipping_name.ilike.%${clean}%,driver_name.ilike.%${clean}%`);
        } else {
          query = query.or(`shipping_name.ilike.%${clean}%,driver_name.ilike.%${clean}%`);
        }
      }

      query = query.order('updated_at', { ascending: false });

      // N+1 Pagination Math
      const from = page * pageSize;
      const to = from + pageSize; 
      query = query.range(from, to);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    placeholderData: keepPreviousData,
  });

  // Process N+1 Array
  const hasNextPage = deliveriesData && deliveriesData.length > pageSize;
  const displayedDeliveries = deliveriesData ? deliveriesData.slice(0, pageSize) : [];


  // ==========================================
  // 🚀 THROTTLED REAL-TIME SUBSCRIPTION
  // ==========================================
  useEffect(() => {
    let debounceTimer;
    
    const sub = supabase.channel('dispatch_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['dispatch_deliveries'] });
          queryClient.invalidateQueries({ queryKey: ['dispatch_tab_counts'] });
        }, 500);
      }).subscribe();
      
    return () => { 
      clearTimeout(debounceTimer);
      supabase.removeChannel(sub); 
    };
  }, [queryClient]);

  // ==========================================
  // 🚀 REACT QUERY: MUTATIONS
  // ==========================================
  const assignDriverMutation = useMutation({
    mutationFn: async () => {
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
      if (data && data.length === 0) throw new Error('Action Blocked: Another user already modified this order.');
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch_deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch_tab_counts'] });
      setAssigningOrder(null);
      setNotification({ show: true, isError: false, message: 'Driver assigned and order shipped successfully!' });
      window.dispatchEvent(new Event('orderStatusChanged'));
    },
    onError: (error) => {
      setNotification({ show: true, isError: true, message: `Failed to dispatch: ${error.message}` });
    }
  });

  const confirmAssignment = (e) => {
    e.preventDefault(); 
    if (!assigningOrder) return;
    if (!vehicleName) {
      setNotification({ show: true, isError: true, message: 'You must select a vehicle.' });
      return;
    }
    assignDriverMutation.mutate();
  };

  const openAssignModal = (order) => {
    setDriverName((order.driver_name || '').split(' | ')[0]); 
    setVehicleName(order.vehicle_name || '');
    setVehicleType(order.vehicle_type || 'Cargo Van'); 
    setVehicleLicense(order.vehicle_license || ''); 
    setAssigningOrder(order);
  };

  const handleFleetSelection = (e) => {
    const selectedVehicle = fleetVehicles.find(v => v.id === e.target.value);
    if (selectedVehicle) { 
      setVehicleName(selectedVehicle.name); 
      setVehicleType(selectedVehicle.type); 
      setVehicleLicense(selectedVehicle.license_plate || ''); 
    } else { 
      setVehicleName(''); 
      setVehicleType('Cargo Van'); 
      setVehicleLicense(''); 
    }
  };

  // --- UI HELPERS ---
  const getInitials = (name) => {
    if (!name || name === 'Unassigned') return '??';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getStatusBadge = (status) => {
    if (status === 'delivered') return <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><CheckCircle2 size={14}/> Delivered</span>;
    if (status === 'cancelled') return <span className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-xl text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><XCircle size={14}/> Cancelled</span>;
    if (status === 'ready_for_delivery') return <span className="px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><PackageCheck size={14}/> Needs Dispatch</span>;
    return <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><Truck size={14}/> In Transit</span>;
  };

  const tabBaseClass = "flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95";
  const tabInactiveClass = "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50";
  const activeStyles = {
    needs_dispatch: 'bg-purple-600 text-white shadow-md',
    in_transit: 'bg-blue-600 text-white shadow-md',
    delivered: 'bg-emerald-600 text-white shadow-md',
    cancelled: 'bg-red-600 text-white shadow-md'
  };

  const selectedDriverObj = drivers.find(d => d.full_name === driverName);
  const isLicenseExpired = selectedDriverObj?.license_expiry ? new Date(selectedDriverObj.license_expiry) < new Date(new Date().setHours(0,0,0,0)) : false;
  const selectedVehicleObj = fleetVehicles.find(v => v.name === vehicleName);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
            <Navigation size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Dispatch Monitor</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Assign drivers, track active routes, and review Proof of Delivery.</p>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-100/50 rounded-xl border border-slate-200 w-full lg:w-auto overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('needs_dispatch')} className={`${tabBaseClass} ${activeTab === 'needs_dispatch' ? activeStyles.needs_dispatch : tabInactiveClass}`}>
            <PackageCheck size={16}/> Needs Dispatch ({tabCounts.needs_dispatch})
          </button>
          <button onClick={() => setActiveTab('in_transit')} className={`${tabBaseClass} ${activeTab === 'in_transit' ? activeStyles.in_transit : tabInactiveClass}`}>
            <Truck size={16}/> In Transit ({tabCounts.in_transit})
          </button>
          <button onClick={() => setActiveTab('delivered')} className={`${tabBaseClass} ${activeTab === 'delivered' ? activeStyles.delivered : tabInactiveClass}`}>
            <CheckCircle2 size={16}/> Delivered ({tabCounts.delivered})
          </button>
          <button onClick={() => setActiveTab('cancelled')} className={`${tabBaseClass} ${activeTab === 'cancelled' ? activeStyles.cancelled : tabInactiveClass}`}>
            <AlertTriangle size={16}/> Exceptions ({tabCounts.cancelled})
          </button>
        </div>
        <div className="relative w-full lg:w-80 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search Driver or Customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all shadow-sm" />
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
          <div className="w-full h-14 bg-slate-50/80 border-b border-slate-200"></div>
          {[1,2,3,4,5].map(n => (<div key={n} className="w-full h-20 bg-white border-b border-slate-100 flex items-center px-6 gap-6 animate-pulse"><div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0"></div><div className="w-32 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-48 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-24 h-6 bg-slate-100 rounded-lg shrink-0 ml-auto"></div></div>))}
        </div>
      ) : displayedDeliveries.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mt-6">
          <Navigation size={56} strokeWidth={1.5} className="mx-auto text-slate-300 mb-5" />
          <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">No routes found</h3>
          <p className="text-slate-500 text-sm">There are no deliveries matching your current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-x-auto mt-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold tracking-tight rounded-tl-3xl">Delivery Details</th>
                <th className="px-6 py-4 font-bold tracking-tight">Fleet Assignment</th>
                <th className="px-6 py-4 font-bold tracking-tight">Current Status</th>
                <th className="px-6 py-4 font-bold tracking-tight text-right rounded-tr-3xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedDeliveries.map(delivery => {
                const shortId = delivery.id.substring(0, 8).toUpperCase();
                const driverName = (delivery.driver_name || 'Unassigned').split(' | ')[0];
                const hasPod = delivery.photo_url || delivery.signature_url || delivery.received_by;
                const isAssigned = delivery.driver_name;

                return (
                  <tr key={delivery.id} className="hover:bg-slate-50/80 transition-colors group">
                    
                    {/* Column 1: Delivery Details */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-200 shadow-sm shrink-0">
                          <Package size={18} />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-slate-900 text-xs mb-0.5">#{shortId}</span>
                          <p className="font-bold text-slate-700 text-sm">{delivery.shipping_name}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 font-medium">
                            <MapPin size={12} className="text-slate-400"/> {delivery.shipping_city || 'Address hidden'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Column 2: Driver & Fleet */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border shadow-sm ${isAssigned ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-50 text-slate-400 border-dashed border-slate-300'}`}>
                          {getInitials(driverName)}
                        </div>
                        <div className="flex flex-col gap-1">
                          <p className={`font-bold text-sm ${isAssigned ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                            {driverName}
                          </p>
                          <p className={`text-[11px] font-medium flex items-center gap-1 ${delivery.vehicle_name ? 'text-slate-500' : 'text-slate-400 italic'}`}>
                            <Car size={12} className="text-slate-400"/> {delivery.vehicle_name || 'No Vehicle'}
                          </p>
                        </div>
                      </div>
                    </td>
                    
                    {/* Column 3: Status */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1.5">
                        {getStatusBadge(delivery.status)}
                        
                        {delivery.status === 'delivered' ? (
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                            <Clock size={10}/> {new Date(delivery.delivered_at || delivery.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})} at {new Date(delivery.delivered_at || delivery.updated_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})}
                          </span>
                        ) : delivery.status === 'cancelled' ? (
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                            <Clock size={10}/> {new Date(delivery.cancelled_at || delivery.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})} at {new Date(delivery.cancelled_at || delivery.updated_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                            <Clock size={10}/> Updated {new Date(delivery.shipped_at || delivery.updated_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Column 4: Actions */}
                    <td className="px-6 py-4 text-right">
                      {delivery.status === 'ready_for_delivery' ? (
                        <button onClick={() => openAssignModal(delivery)} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md">
                            <Truck size={14} /> Assign Driver
                        </button>
                      ) : delivery.status === 'delivered' ? (
                        hasPod ? (
                          <button onClick={() => setSelectedPod(delivery)} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">
                            <ImageIcon size={14} className="text-slate-400" /> View POD
                          </button>
                        ) : (
                          <span className="inline-flex items-center justify-center px-4 py-2 bg-slate-50 text-slate-400 text-xs font-bold rounded-xl border border-slate-100 italic">No POD</span>
                        )
                      ) : delivery.status === 'cancelled' ? (
                        <button onClick={() => setSelectedPod(delivery)} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">
                          <AlertTriangle size={14} className="text-red-500" /> View Reason
                        </button>
                      ) : (
                        <span className="inline-flex items-center justify-center px-4 py-2 text-slate-400 text-xs font-bold italic">En Route...</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 🚀 ULTIMATE INFINITE PAGINATION UI */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-3xl">
            <span className="text-sm font-medium text-slate-500">
              Page {page + 1}: {(page * pageSize) + 1}-{page * pageSize + displayedDeliveries.length}
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(0, p - 1))} 
                disabled={page === 0} 
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <button 
                onClick={() => setPage(p => p + 1)} 
                disabled={!hasNextPage} 
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MINIMALIST DISPATCH ASSIGNMENT MODAL --- */}
      {assigningOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
            
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Truck size={18} className="text-purple-600"/> Assign Fleet & Driver
              </h3>
              <button onClick={() => setAssigningOrder(null)} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"><X size={16} /></button>
            </div>
            
            <form onSubmit={confirmAssignment} className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">
              
              {/* DRIVER SECTION */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">Driver Assignment</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select 
                    required 
                    value={driverName} 
                    onChange={(e) => setDriverName(e.target.value)} 
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm font-medium cursor-pointer appearance-none transition-all shadow-sm"
                  >
                    <option value="" disabled>Select a driver...</option>
                    {drivers.map(d => (<option key={d.id} value={d.full_name}>{d.full_name}</option>))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                </div>
                
                {selectedDriverObj && (
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-xl animate-in fade-in slide-in-from-top-1 mt-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                        <CreditCard size={14} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">License Number</p>
                        <p className="text-sm font-mono font-medium text-slate-900">{selectedDriverObj.license_number || 'Not on file'}</p>
                      </div>
                    </div>
                    <div>
                      {selectedDriverObj.license_expiry ? (
                        isLicenseExpired ? (
                          <span className="px-2.5 py-1 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-red-100">Expired</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-emerald-100">Valid</span>
                        )
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-slate-200">No Expiry</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              {/* VEHICLE SECTION */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">Fleet Vehicle</label>
                <div className="relative">
                  <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select 
                    required 
                    value={fleetVehicles.find(v => v.name === vehicleName)?.id || ""}
                    onChange={handleFleetSelection} 
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm font-medium cursor-pointer appearance-none transition-all shadow-sm"
                  >
                    <option value="" disabled>Select a vehicle...</option>
                    {fleetVehicles.map(v => (<option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                </div>

                {selectedVehicleObj && (
                  <div className="mt-3 p-4 bg-blue-50/30 border border-blue-100 rounded-2xl animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-1.5 mb-3 text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                      <Car size={12} /> Detailed Vehicle Info
                    </div>
                    
                    <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-slate-100">
                          <tr className="hover:bg-slate-50 transition-colors">
                            <th className="px-4 py-3 font-semibold text-slate-500 w-2/5">Display Name</th>
                            <td className="px-4 py-3 font-bold text-slate-900">{selectedVehicleObj.name}</td>
                          </tr>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <th className="px-4 py-3 font-semibold text-slate-500">Vehicle Type</th>
                            <td className="px-4 py-3">
                              <span className="inline-flex px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded border border-blue-200">
                                {selectedVehicleObj.type || 'Standard'}
                              </span>
                            </td>
                          </tr>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <th className="px-4 py-3 font-semibold text-slate-500">Make & Model</th>
                            <td className="px-4 py-3 font-medium text-slate-800">{selectedVehicleObj.make || 'N/A'} {selectedVehicleObj.model || ''}</td>
                          </tr>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <th className="px-4 py-3 font-semibold text-slate-500">Year</th>
                            <td className="px-4 py-3 font-medium text-slate-800">{selectedVehicleObj.year || 'N/A'}</td>
                          </tr>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <th className="px-4 py-3 font-semibold text-slate-500">License Plate</th>
                            <td className="px-4 py-3 font-mono font-bold text-slate-900">
                              <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 shadow-inner text-xs">
                                {selectedVehicleObj.license_plate || 'N/A'}
                              </span>
                            </td>
                          </tr>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <th className="px-4 py-3 font-semibold text-slate-500">VIN Number</th>
                            <td className="px-4 py-3 font-mono text-xs font-medium text-slate-600">{selectedVehicleObj.vin || 'N/A'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setAssigningOrder(null)} disabled={assignDriverMutation.isPending} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 active:scale-95 transition-all">Cancel</button>
                <button type="submit" disabled={!vehicleName || isLicenseExpired || assignDriverMutation.isPending} className={`w-full py-3 text-sm text-white font-semibold rounded-xl flex justify-center gap-2 items-center active:scale-95 transition-all ${!vehicleName || isLicenseExpired || assignDriverMutation.isPending ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 shadow-md'}`}>
                  {assignDriverMutation.isPending ? 'Processing...' : 'Confirm Dispatch'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* --- MINIMALIST POD / EXCEPTION MODAL --- */}
      {selectedPod && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-slate-900">
                  {selectedPod.status === 'cancelled' ? 'Delivery Exception' : 'Proof of Delivery'}
                </h3>
                <p className="text-xs font-mono font-medium text-slate-500 mt-1">
                  Order #{selectedPod.id.substring(0,8).toUpperCase()}
                </p>
              </div>
              <button onClick={() => setSelectedPod(null)} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-full transition-all"><X size={16} /></button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              {/* EXCEPTION REASON */}
              {selectedPod.status === 'cancelled' && (
                <div className="bg-red-50/50 border border-red-100 p-4 rounded-xl flex items-start gap-3">
                  <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-red-900">Driver Notes</h4>
                    <p className="text-sm text-red-700 mt-1 leading-relaxed">
                      {selectedPod.cancellation_reason || "No reason provided by driver."}
                    </p>
                  </div>
                </div>
              )}

              {/* RECIPIENT NAME */}
              {selectedPod.received_by && (
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center gap-3">
                   <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                      <User size={16} className="text-slate-500" />
                   </div>
                   <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Received By</p>
                     <p className="text-sm font-medium text-slate-900">{selectedPod.received_by}</p>
                   </div>
                </div>
              )}

              {/* PHOTO POD */}
              {selectedPod.photo_url && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-900">Delivery Photo</h4>
                  <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50">
                    <img src={selectedPod.photo_url} alt="Delivery Proof" className="w-full h-auto object-cover" />
                  </div>
                </div>
              )}

              {/* SIGNATURE POD */}
              {selectedPod.signature_url && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-900">Customer Signature</h4>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <img src={selectedPod.signature_url} alt="Customer Signature" className="w-full h-24 object-contain mix-blend-multiply" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100">
              <button onClick={() => setSelectedPod(null)} className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 active:scale-95 transition-all">Close</button>
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
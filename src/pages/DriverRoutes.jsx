import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext'; // NEW: We pull the logged in driver!
import { Search, MapPin, Truck, CheckCircle2, Navigation, PackageCheck, User, Car, Hash } from 'lucide-react';

export default function DriverRoutes() {
  const { profile } = useAuth(); // NEW: Get the currently logged in profile
  
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('ready_for_delivery'); 

  useEffect(() => {
    // Only fetch if profile exists to prevent fetching the wrong data
    if (profile) fetchDriverOrders();
  }, [profile]);

  const fetchDriverOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`*, companies ( name, address, city, state, zip )`)
        .in('status', ['ready_for_delivery', 'shipped'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching routes:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const getDisplayName = (order) => {
    if (order.companies?.name) return order.patient_name ? `${order.companies.name} - ${order.patient_name}` : order.companies.name;
    return order.customer_name || 'Retail Customer';
  };

  const acceptDelivery = async (orderId) => {
    if(!window.confirm("Start route? This will mark the order as Out For Delivery.")) return;
    try {
      const { error } = await supabase.from('orders').update({ status: 'shipped' }).eq('id', orderId);
      if (error) throw error;
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'shipped' } : o));
    } catch (error) {
      alert('Failed to start route.');
    }
  };

  // NEW: Filters out orders NOT assigned to the currently logged in driver
  const displayedOrders = orders.filter(o => {
    const isMyRoute = o.driver_name === profile?.full_name; // Strict security filter
    const isCorrectTab = o.status === activeTab;
    const matchesSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase()) || getDisplayName(o).toLowerCase().includes(searchTerm.toLowerCase());
    
    return isMyRoute && isCorrectTab && matchesSearch;
  });

  if (loading) return <div className="text-slate-500 font-medium">Loading routes...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div><h2 className="text-3xl font-bold text-slate-900 tracking-tight">My Routes</h2><p className="text-sm text-slate-500 mt-2">View your assigned boxes and begin deliveries.</p></div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-50 rounded-xl border border-slate-100 w-full md:w-auto">
          <button onClick={() => setActiveTab('ready_for_delivery')} className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'ready_for_delivery' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>Available ({orders.filter(o => o.status === 'ready_for_delivery' && o.driver_name === profile?.full_name).length})</button>
          <button onClick={() => setActiveTab('shipped')} className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'shipped' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>En Route ({orders.filter(o => o.status === 'shipped' && o.driver_name === profile?.full_name).length})</button>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search Route or Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 outline-none text-sm font-medium transition-all" />
        </div>
      </div>

      {displayedOrders.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-100 shadow-sm mt-6">
          <Navigation size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No Routes Assigned</h3>
          <p className="text-slate-500 text-sm">Wait for dispatch to assign you a delivery.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {displayedOrders.map(order => {
            let address = "No Address Provided";
            if (order.companies && order.companies.address) {
              address = `${order.companies.address}, ${order.companies.city || ''} ${order.companies.state || ''} ${order.companies.zip || ''}`;
            }
            
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-6 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Order #{order.id.substring(0, 8).toUpperCase()}</p>
                    <h3 className="text-lg font-bold text-slate-900 leading-tight">{getDisplayName(order)}</h3>
                  </div>
                  {activeTab === 'ready_for_delivery' ? <span className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100"><PackageCheck size={16}/></span> : <span className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600 border border-green-100"><CheckCircle2 size={16}/></span>}
                </div>
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 flex gap-3">
                  <MapPin size={18} className="text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-slate-700 leading-relaxed">{address}</p>
                </div>

                <div className="mb-6 space-y-2 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500 flex items-center justify-between">
                    <span className="flex items-center gap-2"><User size={14} className="text-slate-400"/> <span className="font-semibold text-slate-700">{order.driver_name || 'Assigned to You'}</span></span>
                    <span className="font-mono text-slate-400">Driver</span>
                  </p>
                  
                  <div className="bg-slate-50 rounded-lg p-3 space-y-2 border border-slate-100">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-xs font-semibold text-slate-700 flex items-center gap-2"><Car size={14} className="text-slate-400"/> {order.vehicle_name || 'Vehicle'} ({order.vehicle_type || 'Type'})</p>
                      <p className="text-[10px] font-mono font-bold text-slate-600 tracking-wider bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm">{order.vehicle_license || 'NO-PLATE'}</p>
                    </div>
                  </div>
                </div>

                {activeTab === 'ready_for_delivery' ? (
                  <button onClick={() => acceptDelivery(order.id)} className="mt-auto w-full py-4 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-md flex items-center justify-center gap-2"><Truck size={18} /> Accept & Start Route</button>
                ) : (
                  <button disabled className="mt-auto w-full py-3 rounded-xl text-sm font-bold bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed flex items-center justify-center gap-2"><CheckCircle2 size={18} /> Out for Delivery</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
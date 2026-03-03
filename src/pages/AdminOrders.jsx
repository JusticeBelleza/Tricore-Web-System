import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Search, Package, CheckCircle2, XCircle, Clock, 
  Eye, Truck, X, AlertCircle, PackageCheck, User, Car, Hash, Info, Building, MapPin
} from 'lucide-react';

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [fleetVehicles, setFleetVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  const [viewingOrder, setViewingOrder] = useState(null);
  const [confirmAction, setConfirmAction] = useState({ show: false, title: '', message: '', onConfirm: null });
  const [notification, setNotification] = useState({ show: false, message: '', isError: false });
  
  const [assigningOrder, setAssigningOrder] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleType, setVehicleType] = useState('Cargo Van');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleVin, setVehicleVin] = useState('');
  const [vehicleLicense, setVehicleLicense] = useState('');

  useEffect(() => {
    fetchOrdersFleetAndDrivers();
  }, []);

  const fetchOrdersFleetAndDrivers = async () => {
    setLoading(true);
    try {
      // Fetch Orders, Fleet, and Drivers. 
      // FIXED: Added address fields to the companies fetch so we can display B2B billing addresses!
      const [ordersRes, fleetRes, driversRes] = await Promise.all([
        supabase.from('orders').select(`*, companies ( name, address, city, state, zip ), order_items ( id, quantity_variants, unit_price, line_total, product_variants ( name, sku ) )`).order('created_at', { ascending: false }),
        supabase.from('vehicles').select('*').order('name', { ascending: true }),
        supabase.from('profiles').select('id, full_name').eq('role', 'driver').order('full_name', { ascending: true }) 
      ]);

      if (ordersRes.error) throw ordersRes.error;
      setOrders(ordersRes.data || []);
      setFleetVehicles(fleetRes.data || []);
      setDrivers(driversRes.data || []);

    } catch (error) {
      console.error('Error fetching data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChangeClick = (orderId, newStatus) => {
    const isAccepting = newStatus === 'processing';
    setConfirmAction({
      show: true,
      title: isAccepting ? 'Accept Order?' : 'Reject Order?',
      message: isAccepting ? 'Approve and send to warehouse?' : 'Cancel and reject this order?',
      onConfirm: () => {
        setConfirmAction({ show: false, title: '', message: '', onConfirm: null });
        executeOrderStatusUpdate(orderId, newStatus);
      }
    });
  };

  const executeOrderStatusUpdate = async (orderId, newStatus) => {
    try {
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (error) throw error;
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      if (viewingOrder && viewingOrder.id === orderId) setViewingOrder({ ...viewingOrder, status: newStatus });
      setNotification({ show: true, isError: false, message: newStatus === 'processing' ? 'Order sent to warehouse.' : 'Order rejected.' });
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Update failed: ${error.message}` });
    }
  };

  const openAssignModal = (order) => {
    setDriverName(order.driver_name || '');
    setVehicleName(order.vehicle_name || '');
    setVehicleType(order.vehicle_type || 'Cargo Van');
    setVehicleMake(order.vehicle_make || '');
    setVehicleModel(order.vehicle_model || '');
    setVehicleYear(order.vehicle_year || '');
    setVehicleVin(order.vehicle_vin || '');
    setVehicleLicense(order.vehicle_license || '');
    setAssigningOrder(order);
  };

  const handleFleetSelection = (e) => {
    const selectedId = e.target.value;
    if (!selectedId) {
      setVehicleName(''); setVehicleType('Cargo Van'); setVehicleMake('');
      setVehicleModel(''); setVehicleYear(''); setVehicleVin(''); setVehicleLicense('');
      return;
    }
    const selectedVehicle = fleetVehicles.find(v => v.id === selectedId);
    if (selectedVehicle) {
      setVehicleName(selectedVehicle.name); setVehicleType(selectedVehicle.type);
      setVehicleMake(selectedVehicle.make || ''); setVehicleModel(selectedVehicle.model || '');
      setVehicleYear(selectedVehicle.year || ''); setVehicleVin(selectedVehicle.vin || '');
      setVehicleLicense(selectedVehicle.license_plate || '');
    }
  };

  const confirmAssignment = async (e) => {
    e.preventDefault();
    if (!assigningOrder) return;
    try {
      const updates = { 
        driver_name: driverName, vehicle_name: vehicleName, vehicle_type: vehicleType, 
        vehicle_make: vehicleMake, vehicle_model: vehicleModel, vehicle_year: vehicleYear,
        vehicle_vin: vehicleVin, vehicle_license: vehicleLicense
      };
      const { error } = await supabase.from('orders').update(updates).eq('id', assigningOrder.id);
      if (error) throw error;
      
      setOrders(orders.map(o => o.id === assigningOrder.id ? { ...o, ...updates } : o));
      if (viewingOrder && viewingOrder.id === assigningOrder.id) setViewingOrder({ ...viewingOrder, ...updates });
      
      setAssigningOrder(null);
      setNotification({ show: true, isError: false, message: 'Driver and vehicle assigned successfully.' });
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to assign driver: ${error.message}` });
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase()) || (o.companies?.name || o.shipping_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? o.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    switch(status) {
      case 'pending': return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1.5 w-fit"><Clock size={12}/> Pending Review</span>;
      case 'processing': return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1.5 w-fit"><Package size={12}/> In Warehouse</span>;
      case 'ready_for_delivery': return <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold flex items-center gap-1.5 w-fit"><PackageCheck size={12}/> Ready for Delivery</span>;
      case 'shipped': return <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold flex items-center gap-1.5 w-fit"><Truck size={12}/> Shipped</span>;
      case 'cancelled': return <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1.5 w-fit"><XCircle size={12}/> Cancelled</span>;
      default: return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">{status}</span>;
    }
  };

  if (loading) return <div className="text-slate-500 font-medium">Loading orders...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div><h2 className="text-3xl font-bold text-slate-900 tracking-tight">Order Management</h2><p className="text-sm text-slate-500 mt-2">Review, accept, dispatch, and route incoming orders.</p></div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search Order ID, Customer, or Company..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 outline-none text-sm transition-all" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-48 px-4 py-2 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 outline-none text-sm transition-all cursor-pointer font-semibold text-slate-700">
          <option value="">All Statuses</option>
          <option value="pending">Pending Review</option>
          <option value="processing">In Warehouse</option>
          <option value="ready_for_delivery">Ready for Delivery</option>
          <option value="shipped">Shipped</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold tracking-tight">Order ID</th>
                <th className="px-6 py-4 font-bold tracking-tight">Date</th>
                <th className="px-6 py-4 font-bold tracking-tight">Customer</th>
                <th className="px-6 py-4 font-bold tracking-tight">Total</th>
                <th className="px-6 py-4 font-bold tracking-tight">Status</th>
                <th className="px-6 py-4 font-bold tracking-tight text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredOrders.map(order => {
                const isB2B = !!order.company_id;
                return (
                <tr key={order.id} className="hover:bg-slate-50/50 group">
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{order.id.substring(0, 8).toUpperCase()}</td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">{order.companies?.name || order.shipping_name || 'Retail Customer'}</p>
                    {/* B2B vs Retail Badge */}
                    <span className={`inline-flex mt-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded ${isB2B ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                      {isB2B ? 'B2B Order' : 'Retail Order'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-extrabold text-slate-900">${Number(order.total_amount).toFixed(2)}</td>
                  <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                  <td className="px-6 py-4 text-right"><button onClick={() => setViewingOrder(order)} className="px-4 py-2 bg-white border border-slate-200 text-slate-900 text-xs font-bold rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm inline-flex items-center gap-2"><Eye size={14} /> Review</button></td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {viewingOrder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90dvh] flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div>
                <div className="flex gap-3 items-center mb-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order #{viewingOrder.id.substring(0, 8).toUpperCase()}</p>
                  <span className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded flex items-center gap-1 ${viewingOrder.company_id ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {viewingOrder.company_id ? 'B2B Order' : 'Retail Order'}
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{viewingOrder.companies?.name || viewingOrder.shipping_name || 'Retail Customer'}</h3>
              </div>
              <button onClick={() => setViewingOrder(null)} className="p-2 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-full"><X size={18} /></button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 space-y-8">
              <div className="flex justify-between items-center">
                <div><p className="text-xs text-slate-500 font-semibold mb-1">Current Status</p>{getStatusBadge(viewingOrder.status)}</div>
                <div className="text-right"><p className="text-xs text-slate-500 font-semibold mb-1">Payment Method</p><p className="text-sm font-bold text-slate-900 uppercase tracking-wide">{viewingOrder.payment_method === 'net_30' ? 'Net 30 Terms' : (viewingOrder.payment_method === 'credit_card' ? 'Credit Card' : 'Cash on Delivery')}</p></div>
              </div>

              {/* NEW: Bill To / Ship To Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Building size={14}/> Bill To</h4>
                  {viewingOrder.company_id ? (
                    <div className="text-sm font-medium text-slate-700">
                      <p className="font-bold text-slate-900">{viewingOrder.companies?.name}</p>
                      <p>{viewingOrder.companies?.address || 'No address provided'}</p>
                      {viewingOrder.companies?.city && <p>{viewingOrder.companies.city}, {viewingOrder.companies.state} {viewingOrder.companies.zip}</p>}
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-slate-700">
                      <p className="font-bold text-slate-900">{viewingOrder.shipping_name}</p>
                      <p>{viewingOrder.shipping_address || 'No address provided'}</p>
                      {viewingOrder.shipping_city && <p>{viewingOrder.shipping_city}, {viewingOrder.shipping_state} {viewingOrder.shipping_zip}</p>}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><MapPin size={14}/> Ship To</h4>
                  <div className="text-sm font-medium text-slate-700">
                    <p className="font-bold text-slate-900">{viewingOrder.shipping_name}</p>
                    <p>{viewingOrder.shipping_address || <span className="text-red-500 italic">No shipping address</span>}</p>
                    {viewingOrder.shipping_city && <p>{viewingOrder.shipping_city}, {viewingOrder.shipping_state} {viewingOrder.shipping_zip}</p>}
                  </div>
                </div>
              </div>

              {(viewingOrder.status === 'ready_for_delivery' || viewingOrder.status === 'shipped') && viewingOrder.driver_name && (
                <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100 grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
                  <div className="sm:col-span-2 border-b border-blue-100 pb-3 mb-1"><p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Assigned Driver</p><p className="text-base font-bold text-blue-900 flex items-center gap-2"><User size={16}/> {viewingOrder.driver_name}</p></div>
                  <div><p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Vehicle Name & Type</p><p className="font-bold text-blue-900 flex items-center gap-2"><Car size={14}/> {viewingOrder.vehicle_name || 'N/A'} ({viewingOrder.vehicle_type || 'N/A'})</p></div>
                  <div><p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Make, Model, Year</p><p className="font-bold text-blue-900 flex items-center gap-2">{viewingOrder.vehicle_make || 'N/A'} {viewingOrder.vehicle_model || 'N/A'} {viewingOrder.vehicle_year || ''}</p></div>
                  <div><p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">License Plate</p><p className="font-mono font-bold text-blue-900 flex items-center gap-2"><Hash size={14}/> {viewingOrder.vehicle_license || 'N/A'}</p></div>
                  <div><p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">VIN Number</p><p className="font-mono font-bold text-blue-900 flex items-center gap-2"><Info size={14}/> {viewingOrder.vehicle_vin || 'N/A'}</p></div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Order Items</h4>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><th className="px-5 py-3 font-semibold">Item</th><th className="px-5 py-3 font-semibold text-center">Qty</th><th className="px-5 py-3 font-semibold text-right">Total</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {viewingOrder.order_items?.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/50"><td className="px-5 py-3"><p className="font-bold text-slate-900">{item.product_variants?.name || 'Item'}</p><p className="text-[10px] font-mono text-slate-500">{item.product_variants?.sku}</p></td><td className="px-5 py-3 text-center font-semibold text-slate-700">{item.quantity_variants}</td><td className="px-5 py-3 text-right font-bold text-slate-900">${Number(item.line_total).toFixed(2)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-white flex gap-3 justify-end shrink-0">
              {viewingOrder.status === 'pending' && (
                <><button onClick={() => handleStatusChangeClick(viewingOrder.id, 'cancelled')} className="px-6 py-3 bg-white border border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50">Reject</button><button onClick={() => handleStatusChangeClick(viewingOrder.id, 'processing')} className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 flex items-center gap-2"><CheckCircle2 size={18} /> Accept & Send to Warehouse</button></>
              )}
              {viewingOrder.status === 'ready_for_delivery' && (
                <button onClick={() => openAssignModal(viewingOrder)} className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center gap-2"><Truck size={18} /> Assign Driver & Fleet Details</button>
              )}
              {viewingOrder.status !== 'pending' && viewingOrder.status !== 'ready_for_delivery' && (
                <button onClick={() => setViewingOrder(null)} className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800">Close</button>
              )}
            </div>
          </div>
        </div>
      )}

      {assigningOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="text-lg font-bold text-slate-900 tracking-tight">Assign Fleet & Driver</h3><button onClick={() => setAssigningOrder(null)} className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full"><X size={16} /></button></div>
            
            <form onSubmit={confirmAssignment} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              
              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Assigned Driver</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select required value={driverName} onChange={(e) => setDriverName(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold cursor-pointer appearance-none">
                    <option value="" disabled>-- Select a Driver from Staff Directory --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.full_name}>{d.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              <div>
                <label className="block text-xs font-bold text-blue-500 uppercase tracking-widest mb-1.5">Select Vehicle from Fleet</label>
                <select onChange={handleFleetSelection} className="w-full px-4 py-3 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold cursor-pointer">
                  <option value="">-- Custom Vehicle (Type Below) --</option>
                  {fleetVehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Vehicle Name</label>
                  <input type="text" required value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                </div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Vehicle Type</label>
                  <select required value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium cursor-pointer">
                    <option value="Car">Car</option>
                    <option value="Cargo Van">Cargo Van</option>
                    <option value="Box Truck">Box Truck</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Make</label><input type="text" required value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Model</label><input type="text" required value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Year</label><input type="number" required value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">License</label><input type="text" required value={vehicleLicense} onChange={(e) => setVehicleLicense(e.target.value.toUpperCase())} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold font-mono tracking-wide" /></div>
              </div>

              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">VIN</label><input type="text" required value={vehicleVin} onChange={(e) => setVehicleVin(e.target.value.toUpperCase())} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold font-mono tracking-wide" /></div>

              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setAssigningOrder(null)} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl">Cancel</button><button type="submit" className="w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center"><Truck size={18} /> Confirm Dispatch</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      {confirmAction.show && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in"><div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center"><div className="w-16 h-16 bg-slate-50 text-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100"><AlertCircle size={32} /></div><h4 className="text-xl font-bold text-slate-900">{confirmAction.title}</h4><p className="text-sm text-slate-500 mt-2 font-medium">{confirmAction.message}</p><div className="flex gap-3 pt-4"><button onClick={() => setConfirmAction({ show: false })} className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl">Cancel</button><button onClick={confirmAction.onConfirm} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">Confirm</button></div></div></div>}
      {notification.show && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in"><div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center"><div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border ${notification.isError ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>{notification.isError ? <XCircle size={32} /> : <CheckCircle2 size={32} />}</div><h4 className="text-xl font-bold text-slate-900">{notification.isError ? 'Error' : 'Success'}</h4><p className="text-sm text-slate-500 mt-2 font-medium">{notification.message}</p><button onClick={() => setNotification({ show: false, message: '', isError: false })} className="w-full mt-4 py-3 bg-slate-900 text-white font-bold rounded-xl">Okay</button></div></div>}
    </div>
  );
}
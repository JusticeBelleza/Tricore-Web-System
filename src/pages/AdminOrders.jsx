import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  Search, Package, CheckCircle2, XCircle, Clock, 
  Truck, X, AlertCircle, PackageCheck, User, Car, Hash, Building, MapPin,
  ChevronDown, DollarSign, CreditCard, FileText, Calendar, ShieldAlert, Phone, FileDown, Mail,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AdminOrders() {
  const { profile } = useAuth(); 
  const [orders, setOrders] = useState([]);
  const [fleetVehicles, setFleetVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); 
  
  const [tabCounts, setTabCounts] = useState({ pending: 0, processing: 0, dispatch: 0, due: 0 });
  const [newPendingCount, setNewPendingCount] = useState(0);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [confirmAction, setConfirmAction] = useState({ show: false, title: '', message: '', onConfirm: null });
  const [notification, setNotification] = useState({ show: false, message: '', isError: false });
  
  const [assigningOrder, setAssigningOrder] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleType, setVehicleType] = useState('Cargo Van');
  const [vehicleLicense, setVehicleLicense] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(0); }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => { setPage(0); }, [activeTab]);

  useEffect(() => {
    if (profile?.id) {
      fetchOrdersFleetAndDrivers();
      fetchTabCounts(); 
      const sub = supabase.channel('admin_orders_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { fetchOrdersFleetAndDrivers(); fetchTabCounts(); }).subscribe();
      return () => supabase.removeChannel(sub);
    }
  }, [profile?.id, activeTab, debouncedSearch, page]); 

  const fetchTabCounts = async () => {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - 25);
      const [pendingReq, processingReq, dispatchReq, dueReq] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['ready_for_delivery', 'shipped']),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('payment_method', 'net_30').eq('payment_status', 'unpaid').lte('created_at', thresholdDate.toISOString())
      ]);
      setTabCounts({ pending: pendingReq.count || 0, processing: processingReq.count || 0, dispatch: dispatchReq.count || 0, due: dueReq.count || 0 });
    } catch (error) { console.error('Error fetching tab counts:', error); }
  };

  const fetchOrdersFleetAndDrivers = async () => {
    setLoading(true);
    try {
      const [fleetRes, driversRes] = await Promise.all([
        supabase.from('vehicles').select('*').order('name', { ascending: true }),
        supabase.from('user_profiles').select('id, full_name, contact_number').eq('role', 'driver')
      ]);
      setFleetVehicles(fleetRes.data || []);
      setDrivers(driversRes.data || []);

      // 🚀 QUERY GRABS THE NEW SHIPPING_EMAIL & SHIPPING_PHONE COLUMNS
      let query = supabase.from('orders').select(`
          *, 
          companies ( name, address, city, state, zip, phone, email ), 
          agency_patients ( contact_number, email ),
          user_profiles ( full_name, contact_number, email ),
          order_items ( id, quantity_variants, unit_price, line_total, product_variants ( name, sku, products(base_sku) ) )
        `, { count: 'exact' }); 

      if (activeTab === 'pending') query = query.eq('status', 'pending');
      else if (activeTab === 'processing') query = query.eq('status', 'processing');
      else if (activeTab === 'dispatch') query = query.in('status', ['ready_for_delivery', 'shipped']);
      else if (activeTab === 'completed') query = query.eq('status', 'delivered');
      else if (activeTab === 'cancelled') query = query.eq('status', 'cancelled');
      
      if (debouncedSearch) query = query.ilike('shipping_name', `%${debouncedSearch}%`);

      // 🚀 ALWAYS SORT LATEST TO OLDEST
      query = query.order('created_at', { ascending: false });

      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;
      setOrders(data || []);
      setTotalCount(count || 0);

    } catch (error) { console.error('Error fetching data:', error.message); } finally { setLoading(false); }
  };

  const toggleOrderDetails = (orderId) => setExpandedOrderId(expandedOrderId === orderId ? null : orderId);

  const executeOrderStatusUpdate = async (orderId, newStatus) => {
    try {
      await supabase.from('orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', orderId);
      setNotification({ show: true, isError: false, message: newStatus === 'processing' ? 'Order sent to warehouse.' : 'Order rejected.' });
      window.dispatchEvent(new Event('orderStatusChanged'));
    } catch (error) { setNotification({ show: true, isError: true, message: `Update failed: ${error.message}` }); }
  };

  const handleStatusChangeClick = (orderId, newStatus) => {
    setConfirmAction({
      show: true, title: newStatus === 'processing' ? 'Accept Order?' : 'Reject Order?',
      message: newStatus === 'processing' ? 'Approve and send to warehouse?' : 'Cancel and reject this order?',
      onConfirm: () => { setConfirmAction({ show: false, title: '', message: '', onConfirm: null }); executeOrderStatusUpdate(orderId, newStatus); }
    });
  };

  const executeMarkAsPaid = async (orderId) => {
    try {
      await supabase.from('orders').update({ payment_status: 'paid', updated_at: new Date().toISOString() }).eq('id', orderId);
      setNotification({ show: true, isError: false, message: 'Order successfully marked as Paid!' });
      window.dispatchEvent(new Event('orderStatusChanged'));
    } catch (error) { setNotification({ show: true, isError: true, message: `Failed: ${error.message}` }); }
  };

  const handleMarkAsPaid = (orderId) => {
    setConfirmAction({
      show: true, title: 'Mark as Paid?', message: 'Confirming this will mark the invoice as Paid.',
      onConfirm: () => { setConfirmAction({ show: false, title: '', message: '', onConfirm: null }); executeMarkAsPaid(orderId); }
    });
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

      await supabase.from('orders').update({ 
        driver_name: finalDriverName || null, vehicle_name: vehicleName || null, 
        vehicle_license: vehicleLicense || null, status: 'shipped', updated_at: new Date().toISOString()
      }).eq('id', assigningOrder.id);
      
      setAssigningOrder(null); setExpandedOrderId(null); 
      setNotification({ show: true, isError: false, message: 'Driver assigned and order shipped successfully!' });
      window.dispatchEvent(new Event('orderStatusChanged'));
    } catch (error) { setNotification({ show: true, isError: true, message: `Failed to dispatch: ${error.message}` }); }
  };

  const getDisplayName = (order) => {
    if (order.companies?.name) return order.companies.name;
    return order.user_profiles?.full_name || order.shipping_name || 'Retail Customer';
  };

  const getStatusBadge = (status) => {
    const styles = { pending: 'bg-yellow-50 text-yellow-700 border-yellow-200', processing: 'bg-blue-50 text-blue-700 border-blue-200', ready_for_delivery: 'bg-purple-50 text-purple-700 border-purple-200', shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200', delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200', cancelled: 'bg-red-50 text-red-700 border-red-200' };
    const icons = { pending: <Clock size={12}/>, processing: <Package size={12}/>, ready_for_delivery: <PackageCheck size={12}/>, shipped: <Truck size={12}/>, delivered: <CheckCircle2 size={12}/>, cancelled: <XCircle size={12}/> };
    return (<span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shadow-sm flex items-center gap-1.5 w-fit whitespace-nowrap ${styles[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{icons[status]} {status.replace(/_/g, ' ')}</span>);
  };

  const getPaymentBadge = (paymentStatus) => {
    if (paymentStatus === 'paid') return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm">Paid</span>;
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 shadow-sm">Unpaid</span>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md"><ShieldAlert size={28} strokeWidth={1.5} /></div>
          <div><h2 className="text-3xl font-bold text-slate-900 tracking-tight">Order Management</h2><p className="text-sm text-slate-500 mt-1 font-medium">Review, approve, dispatch, and track incoming orders.</p></div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-100/50 rounded-xl border border-slate-200 w-full xl:w-auto overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('all')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'all' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}>All</button>
          <button onClick={() => setActiveTab('pending')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'pending' ? 'bg-red-500 text-white shadow-md' : 'text-red-600 hover:bg-red-50'}`}>Pending ({tabCounts.pending})</button>
          <button onClick={() => setActiveTab('processing')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'processing' ? 'bg-blue-600 text-white shadow-md' : 'text-blue-600 hover:bg-blue-50'}`}>Processing ({tabCounts.processing})</button>
          <button onClick={() => setActiveTab('dispatch')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'dispatch' ? 'bg-purple-600 text-white shadow-md' : 'text-purple-600 hover:bg-purple-50'}`}>Dispatch ({tabCounts.dispatch})</button>
          <button onClick={() => setActiveTab('completed')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'completed' ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-600 hover:bg-emerald-50'}`}>Completed</button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="w-full h-14 bg-slate-50/80 border-b border-slate-200"></div>
          {[1,2,3,4,5].map(n => (<div key={n} className="w-full h-20 bg-white border-b border-slate-100 flex items-center px-6 gap-6 animate-pulse"><div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0"></div><div className="w-32 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-48 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-24 h-6 bg-slate-100 rounded-lg shrink-0 ml-auto"></div></div>))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mt-6">
          <Package size={56} strokeWidth={1} className="mx-auto text-slate-300 mb-5" />
          <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">No orders found</h3>
          <p className="text-slate-500 text-sm">There are no orders matching your current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm mt-6 flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-bold tracking-tight rounded-tl-3xl">Order Details</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Date</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Customer / Agency</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Amount</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Status</th>
                  <th className="px-6 py-4 font-bold tracking-tight text-right rounded-tr-3xl"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map(order => {
                  const isExpanded = expandedOrderId === order.id;
                  const isB2B = !!order.company_id;
                  const shortId = order.id.substring(0, 8).toUpperCase();

                  // 🚀 SMART ADMIN UI RENDER LOGIC (PULLS SAVED EMAIL/PHONE)
                  const billName = isB2B ? (order.companies?.name || 'Agency') : (order.user_profiles?.full_name || order.shipping_name || 'Retail Customer');
                  const billEmail = isB2B ? (order.companies?.email || '') : (order.shipping_email || order.user_profiles?.email || 'No email provided');
                  const billPhone = isB2B ? (order.companies?.phone || '') : (order.shipping_phone || order.user_profiles?.contact_number || 'No phone provided');
                  const billAddress = isB2B ? (order.companies?.address || 'No billing address provided') : (order.shipping_address || 'No billing address provided');
                  const billCityState = isB2B 
                    ? (`${order.companies?.city || ''}, ${order.companies?.state || ''} ${order.companies?.zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '')) 
                    : (`${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, ''));

                  const shipName = order.shipping_name || (isB2B ? 'Patient' : billName);
                  const shipEmail = order.shipping_email || order.agency_patients?.email || order.user_profiles?.email || 'No email provided';
                  const shipPhone = order.shipping_phone || order.agency_patients?.contact_number || order.user_profiles?.contact_number || 'No phone provided';
                  const shipAddress = order.shipping_address || 'No shipping address provided';
                  const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');

                  return (
                    <React.Fragment key={order.id}>
                      <tr onClick={() => toggleOrderDetails(order.id)} className={`group cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50 border-l-4 border-l-slate-900' : 'hover:bg-slate-50/80 border-l-4 border-transparent'}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors shadow-sm ${isExpanded ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-500 border-slate-200'}`}><Package size={18} /></div>
                            <div><p className="font-mono font-bold text-slate-900 text-sm tracking-tight">{shortId}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Hash size={10}/> Order ID</p></div>
                          </div>
                        </td>
                        <td className="px-6 py-4"><p className="font-medium text-slate-700">{new Date(order.created_at).toLocaleDateString()}</p></td>
                        <td className="px-6 py-4"><p className="font-bold text-slate-900">{getDisplayName(order)}</p></td>
                        <td className="px-6 py-4"><p className="font-extrabold text-slate-900 text-base">${Number(order.total_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</p></td>
                        <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                        <td className="px-6 py-4 text-right"><button className={`p-1.5 rounded-lg transition-transform duration-200 ${isExpanded ? 'bg-slate-200 text-slate-900 rotate-180' : 'text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-900'}`}><ChevronDown size={20} /></button></td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50 shadow-inner">
                          <td colSpan="6" className="p-0 border-b border-slate-200">
                            <div className="p-6 sm:p-8 animate-in slide-in-from-top-2 fade-in duration-200">
                              
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 border-b border-slate-200 pb-4">
                                <div><h3 className="text-xl font-bold text-slate-900 tracking-tight">Order Management Panel</h3></div>
                                <div className="flex flex-wrap gap-2">
                                  {order.status === 'pending' && (<><button onClick={() => handleStatusChangeClick(order.id, 'cancelled')} className="px-5 py-2 bg-white border border-red-200 text-red-600 text-sm font-bold rounded-xl shadow-sm hover:bg-red-50">Reject</button><button onClick={() => handleStatusChangeClick(order.id, 'processing')} className="px-5 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-slate-800"><CheckCircle2 size={16} className="inline mr-2"/> Approve</button></>)}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 space-y-6">
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-slate-300 transition-colors">
                                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><CreditCard size={14}/> Bill To</h4>
                                      <p className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2"><User size={16} className="text-slate-400"/> {billName}</p>
                                      <div className="space-y-2 text-sm font-medium text-slate-600">
                                        <div className="flex flex-col gap-1.5 text-xs text-slate-500">
                                          <p className="flex items-center gap-2"><Mail size={14} className="text-slate-400"/> {billEmail}</p>
                                          <p className="flex items-center gap-2"><Phone size={14} className="text-slate-400"/> {billPhone}</p>
                                        </div>
                                        <div className="flex items-start gap-2 pt-2 border-t border-slate-100 mt-2">
                                          <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0"/>
                                          <div className="whitespace-normal leading-relaxed text-sm"><p>{billAddress}</p>{billCityState && <p>{billCityState}</p>}</div>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-slate-300 transition-colors">
                                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Package size={14}/> Ship To</h4>
                                      <p className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2"><User size={16} className="text-slate-400"/> {shipName}</p>
                                      <div className="space-y-2 text-sm font-medium text-slate-600">
                                        <div className="flex flex-col gap-1.5 text-xs text-slate-500">
                                          <p className="flex items-center gap-2"><Mail size={14} className="text-slate-400"/> {shipEmail}</p>
                                          <p className="flex items-center gap-2"><Phone size={14} className="text-slate-400"/> {shipPhone}</p>
                                        </div>
                                        <div className="flex items-start gap-2 pt-2 border-t border-slate-100 mt-2">
                                          <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0"/>
                                          <div className="whitespace-normal leading-relaxed text-sm"><p>{shipAddress}</p>{shipCityState && <p>{shipCityState}</p>}</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider"><FileText size={16} className="text-slate-400" /> Order Items</h4>
                                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                      <table className="w-full text-left text-sm whitespace-normal">
                                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                                          <tr><th className="px-5 py-3 font-bold w-full">Product</th><th className="px-5 py-3 font-bold text-center">Qty</th><th className="px-5 py-3 font-bold text-right">Total</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {order.order_items?.map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="px-5 py-4">
                                                <p className="font-bold text-slate-900 leading-snug">{item.product_variants?.products?.name || item.product_variants?.name}</p>
                                                {/* 🚀 EXPLICITLY PULLS VARIANT SKU */}
                                                <p className="text-xs text-slate-500 mt-1 font-medium">Variant: <span className="text-slate-700">{item.product_variants?.name}</span> <span className="mx-1.5 text-slate-300">|</span> SKU: <span className="font-mono text-slate-600">{item.product_variants?.sku || 'N/A'}</span></p>
                                              </td>
                                              <td className="px-5 py-4 text-center"><span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200 shadow-sm">{item.quantity_variants}</span></td>
                                              <td className="px-5 py-4 text-right font-extrabold text-slate-900">${Number(item.line_total).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalCount > pageSize && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-3xl">
              <span className="text-sm font-medium text-slate-500">
                Showing <span className="font-bold text-slate-900">{page * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> entries
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"><ChevronLeft size={18} /></button>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalCount} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"><ChevronRight size={18} /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
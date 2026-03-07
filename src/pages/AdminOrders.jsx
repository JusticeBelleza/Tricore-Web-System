import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  Search, Package, CheckCircle2, XCircle, Clock, 
  Truck, X, AlertCircle, PackageCheck, User, Car, Hash, Building, MapPin,
  ChevronDown, DollarSign, CreditCard, FileText, Calendar, ShieldAlert, Phone, FileDown, Mail
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AdminOrders() {
  const { profile } = useAuth(); 
  const [orders, setOrders] = useState([]);
  const [fleetVehicles, setFleetVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  // Interactive Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all'); 
  
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [confirmAction, setConfirmAction] = useState({ show: false, title: '', message: '', onConfirm: null });
  const [notification, setNotification] = useState({ show: false, message: '', isError: false });
  
  const [assigningOrder, setAssigningOrder] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleType, setVehicleType] = useState('Cargo Van');
  const [vehicleLicense, setVehicleLicense] = useState('');

  useEffect(() => {
    if (profile?.id) {
      fetchOrdersFleetAndDrivers();
    }
  }, [profile?.id]);

  const fetchOrdersFleetAndDrivers = async () => {
    setLoading(true);
    try {
      const [ordersRes, fleetRes, driversRes] = await Promise.all([
        supabase.from('orders').select(`
          *, 
          companies ( name, address, city, state, zip, phone, email ), 
          agency_patients ( contact_number, email ),
          user_profiles ( contact_number, email ),
          order_items ( id, quantity_variants, unit_price, line_total, product_variants ( name, sku, products(base_sku) ) )
        `).order('created_at', { ascending: false }),
        supabase.from('vehicles').select('*').order('name', { ascending: true }),
        supabase.from('user_profiles').select('id, full_name, contact_number').eq('role', 'driver').order('full_name', { ascending: true }) 
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

  const toggleOrderDetails = (orderId) => setExpandedOrderId(expandedOrderId === orderId ? null : orderId);

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
      setNotification({ show: true, isError: false, message: newStatus === 'processing' ? 'Order sent to warehouse.' : 'Order rejected.' });
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Update failed: ${error.message}` });
    }
  };

  const handleMarkAsPaid = (orderId) => {
    setConfirmAction({
      show: true,
      title: 'Mark as Paid?',
      message: 'Confirming this will mark the invoice as Paid and replenish the agency\'s available credit limit.',
      onConfirm: () => {
        setConfirmAction({ show: false, title: '', message: '', onConfirm: null });
        executeMarkAsPaid(orderId);
      }
    });
  };

  const executeMarkAsPaid = async (orderId) => {
    try {
      const { error } = await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId);
      if (error) throw error;
      setOrders(orders.map(o => o.id === orderId ? { ...o, payment_status: 'paid' } : o));
      setNotification({ show: true, isError: false, message: 'Order successfully marked as Paid!' });
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to update payment status: ${error.message}` });
    }
  };

  const openAssignModal = (order) => {
    const rawName = order.driver_name || '';
    const cleanName = rawName.split(' | ')[0]; 
    setDriverName(cleanName);
    setVehicleName(order.vehicle_name || '');
    setVehicleType(order.vehicle_type || 'Cargo Van');
    setVehicleLicense(order.vehicle_license || '');
    setAssigningOrder(order);
  };

  const handleFleetSelection = (e) => {
    const selectedId = e.target.value;
    if (!selectedId) {
      setVehicleName(''); setVehicleType('Cargo Van'); setVehicleLicense('');
      return;
    }
    const selectedVehicle = fleetVehicles.find(v => v.id === selectedId);
    if (selectedVehicle) {
      setVehicleName(selectedVehicle.name); 
      setVehicleType(selectedVehicle.type);
      setVehicleLicense(selectedVehicle.license_plate || '');
    }
  };

  const confirmAssignment = async (e) => {
    e.preventDefault();
    if (!assigningOrder) return;
    try {
      const assignedDriverObj = drivers.find(d => d.full_name === driverName);
      const driverPhone = assignedDriverObj?.contact_number || '';
      const finalDriverName = driverPhone ? `${driverName} | ${driverPhone}` : driverName;

      const updates = { 
        driver_name: finalDriverName || null, 
        vehicle_name: vehicleName || null, 
        vehicle_license: vehicleLicense || null,
        status: 'shipped' 
      };
      const { error } = await supabase.from('orders').update(updates).eq('id', assigningOrder.id);
      if (error) throw error;
      
      setOrders(orders.map(o => o.id === assigningOrder.id ? { ...o, ...updates } : o));
      setAssigningOrder(null); setExpandedOrderId(null); 
      setNotification({ show: true, isError: false, message: 'Driver assigned and order shipped successfully!' });
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to dispatch: ${error.message}` });
    }
  };

  const getBase64ImageFromUrl = (imageUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL("image/png");
        resolve({ dataURL, width: img.width, height: img.height });
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    });
  };

  const generateInvoice = async (order) => {
    const doc = new jsPDF();
    const orderNum = order.id.substring(0, 8).toUpperCase();
    const datePlaced = new Date(order.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const logoData = await getBase64ImageFromUrl('/images/tricore-logo2.png');
    if (logoData) {
      const imgWidth = 45; 
      const imgHeight = (logoData.height * imgWidth) / logoData.width; 
      doc.addImage(logoData.dataURL, 'PNG', 14, 12, imgWidth, imgHeight); 
    } else {
      doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); 
      doc.text("TRICORE MEDICAL SUPPLY", 14, 20);
    }
    
    doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); 
    doc.text("INVOICE", 140, 18);
    
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.setFont("helvetica", "bold"); doc.text(`Invoice #: INV-${orderNum}`, 140, 24);
    doc.setFont("helvetica", "normal"); doc.text(`Date: ${datePlaced}`, 140, 29);
    doc.text(`Status: ${order.payment_status === 'paid' ? 'PAID' : 'UNPAID'}`, 140, 34);

    const isB2B = !!order.company_id;
    const agencyName = order.companies?.name || '';

    const shipName = order.shipping_name || (isB2B ? 'Patient' : 'Retail Customer');
    const shipAddress = order.shipping_address || 'No Address Provided';
    const shipCityState = [order.shipping_city, order.shipping_state, order.shipping_zip].filter(Boolean).join(' ');

    const billName = isB2B ? agencyName : shipName;
    const billAddress = isB2B ? (order.companies?.address || 'No Address Provided') : shipAddress;
    const billCityState = isB2B 
      ? [order.companies?.city, order.companies?.state, order.companies?.zip].filter(Boolean).join(' ') 
      : shipCityState;

    doc.setFont("helvetica", "bold");
    doc.text("BILL TO:", 14, 50); doc.text("SHIP TO:", 110, 50);
    
    doc.setFont("helvetica", "normal");
    let currentYBill = 56;
    doc.setFont("helvetica", "bold");
    doc.text(billName, 14, currentYBill); currentYBill += 5;
    doc.setFont("helvetica", "normal");
    if (billAddress !== 'N/A') { doc.text(billAddress, 14, currentYBill); currentYBill += 5; }
    if (billCityState) { doc.text(billCityState, 14, currentYBill); currentYBill += 5; }

    let currentYShip = 56;
    doc.setFont("helvetica", "bold");
    doc.text(shipName, 110, currentYShip); currentYShip += 5;
    doc.setFont("helvetica", "normal");
    if (isB2B && agencyName) { doc.text(`c/o ${agencyName}`, 110, currentYShip); currentYShip += 5; }
    if (shipAddress !== 'N/A') { doc.text(shipAddress, 110, currentYShip); currentYShip += 5; }
    if (shipCityState) { doc.text(shipCityState, 110, currentYShip); currentYShip += 5; }

    const maxAddressY = Math.max(currentYBill, currentYShip);

    const tableRows = order.order_items?.map(item => [
      `${item.product_variants?.products?.name || item.product_variants?.name || 'Item'}\nSKU: ${item.product_variants?.products?.base_sku || item.product_variants?.sku || 'N/A'}`,
      item.quantity_variants, `$${Number(item.unit_price || 0).toFixed(2)}`, `$${Number(item.line_total || 0).toFixed(2)}`
    ]) || [];

    autoTable(doc, {
      startY: maxAddressY + 10,
      head: [["DESCRIPTION", "QTY", "UNIT PRICE", "TOTAL"]],
      body: tableRows,
      theme: 'striped', headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 5 }, columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
    });

    const finalY = doc.lastAutoTable.finalY || maxAddressY + 10;
    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", 140, finalY + 10); doc.text(`$${Number(order.subtotal || 0).toFixed(2)}`, 180, finalY + 10, { align: 'right' });
    doc.text("Shipping:", 140, finalY + 16); doc.text(`$${Number(order.shipping_amount || 0).toFixed(2)}`, 180, finalY + 16, { align: 'right' });
    doc.text("Tax:", 140, finalY + 22); doc.text(`$${Number(order.tax_amount || 0).toFixed(2)}`, 180, finalY + 22, { align: 'right' });
    
    doc.setFont("helvetica", "bold");
    doc.text("Grand Total:", 140, finalY + 30); doc.text(`$${Number(order.total_amount || 0).toFixed(2)}`, 180, finalY + 30, { align: 'right' });

    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("Thank you for your business!", 105, pageHeight - 30, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("TRICORE MEDICAL SUPPLY", 105, pageHeight - 24, { align: "center" });
    doc.text("2169 Harbor St, Pittsburg CA 94565, United States", 105, pageHeight - 19, { align: "center" });
    doc.text("info@tricoremedicalsupply.com", 105, pageHeight - 14, { align: "center" });
    doc.text("www.tricoremedicalsupply.com", 105, pageHeight - 9, { align: "center" });

    doc.save(`Invoice_${orderNum}.pdf`);
  };

  const getDisplayName = (order) => {
    if (order.companies?.name) return order.companies.name;
    return order.shipping_name || 'Retail Customer';
  };

  // 🚀 DUE ORDERS BADGE CALCULATION (Within 5 days or overdue)
  const dueOrdersCount = orders.filter(o => {
    if (o.payment_method !== 'net_30' || o.payment_status !== 'unpaid') return false;
    const dueDate = new Date(o.created_at);
    dueDate.setDate(dueDate.getDate() + 30);
    const diffDays = (dueDate - new Date()) / (1000 * 60 * 60 * 24);
    return diffDays <= 5;
  }).length;

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase()) || (o.companies?.name || o.shipping_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesTab = true;
    if (activeTab === 'pending') matchesTab = o.status === 'pending';
    if (activeTab === 'processing') matchesTab = o.status === 'processing';
    if (activeTab === 'dispatch') matchesTab = o.status === 'ready_for_delivery' || o.status === 'shipped';
    if (activeTab === 'completed') matchesTab = o.status === 'delivered';
    if (activeTab === 'cancelled') matchesTab = o.status === 'cancelled';
    
    // 🚀 NEW TAB FILTER: Due within 5 days or Overdue
    if (activeTab === 'due') {
      if (o.payment_method !== 'net_30' || o.payment_status !== 'unpaid') {
        matchesTab = false;
      } else {
        const dueDate = new Date(o.created_at);
        dueDate.setDate(dueDate.getDate() + 30);
        const diffDays = (dueDate - new Date()) / (1000 * 60 * 60 * 24);
        matchesTab = diffDays <= 5;
      }
    }
    
    return matchesSearch && matchesTab;
  });

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
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
            <ShieldAlert size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Order Management</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Review, approve, dispatch, and track incoming orders.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-100/50 rounded-xl border border-slate-200 w-full xl:w-auto overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('all')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'all' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}>
            All
          </button>
          <button onClick={() => setActiveTab('pending')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'pending' ? 'bg-red-500 text-white shadow-md' : 'text-red-600 hover:bg-red-50'}`}>
            {orders.filter(o=>o.status==='pending').length > 0 && <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>}
            Pending ({orders.filter(o=>o.status==='pending').length})
          </button>
          <button onClick={() => setActiveTab('processing')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'processing' ? 'bg-blue-600 text-white shadow-md' : 'text-blue-600 hover:bg-blue-50'}`}>
            Processing ({orders.filter(o=>o.status==='processing').length})
          </button>
          <button onClick={() => setActiveTab('dispatch')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'dispatch' ? 'bg-purple-600 text-white shadow-md' : 'text-purple-600 hover:bg-purple-50'}`}>
            Dispatch ({orders.filter(o=>['ready_for_delivery', 'shipped'].includes(o.status)).length})
          </button>
          <button onClick={() => setActiveTab('completed')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'completed' ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-600 hover:bg-emerald-50'}`}>
            Completed
          </button>
          
          {/* 🚀 NEW PAYMENTS DUE TAB */}
          <button onClick={() => setActiveTab('due')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'due' ? 'bg-amber-500 text-white shadow-md' : 'text-amber-600 hover:bg-amber-50'}`}>
            {dueOrdersCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>}
            Payments Due ({dueOrdersCount})
          </button>
        </div>

        <div className="relative w-full xl:w-64 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search ID or Customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all" />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="w-full h-14 bg-slate-50/80 border-b border-slate-200"></div>
          {[1,2,3,4,5].map(n => (<div key={n} className="w-full h-20 bg-white border-b border-slate-100 flex items-center px-6 gap-6 animate-pulse"><div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0"></div><div className="w-32 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-48 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-24 h-6 bg-slate-100 rounded-lg shrink-0 ml-auto"></div></div>))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mt-6">
          <Package size={56} strokeWidth={1} className="mx-auto text-slate-300 mb-5" />
          <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">No orders found</h3>
          <p className="text-slate-500 text-sm">There are no orders matching your current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-x-auto mt-6">
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
              {filteredOrders.map(order => {
                const isExpanded = expandedOrderId === order.id;
                const isB2B = !!order.company_id;
                const shortId = order.id.substring(0, 8).toUpperCase();

                const billName = order.companies?.name || 'Retail Customer';
                const billEmail = order.companies?.email || order.user_profiles?.email || '';
                const billPhone = order.companies?.phone || order.user_profiles?.contact_number || '';
                const billAddress = order.companies?.address || 'No billing address provided';
                const billCityState = order.companies ? `${order.companies.city || ''}, ${order.companies.state || ''} ${order.companies.zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '') : '';

                const shipName = order.shipping_name || billName;
                const shipEmail = order.agency_patients?.email || order.user_profiles?.email || '';
                const shipPhone = order.agency_patients?.contact_number || order.user_profiles?.contact_number || '';
                const shipAddress = order.shipping_address || 'No shipping address provided';
                const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');

                const rawDriverName = order.driver_name || '';
                const driverParts = rawDriverName.split(' | ');
                const displayDriverName = driverParts[0];
                let displayDriverPhone = driverParts[1] || '';

                if (!displayDriverPhone && displayDriverName) {
                  const assignedDriverObj = drivers.find(d => d.full_name === displayDriverName);
                  displayDriverPhone = assignedDriverObj?.contact_number || '';
                }

                // 🚀 SMART DUE DATE BADGES (Overdue vs Due Soon)
                const isNet30 = order.payment_method === 'net_30';
                let isOverdue = false;
                let isDueSoon = false;
                let dueDateDisplay = '';

                if (isNet30) {
                  const placedDate = new Date(order.created_at);
                  const dueDate = new Date(placedDate);
                  dueDate.setDate(dueDate.getDate() + 30);
                  dueDateDisplay = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                  
                  const diffDays = (dueDate - new Date()) / (1000 * 60 * 60 * 24);
                  if (order.payment_status === 'unpaid') {
                    if (diffDays < 0) isOverdue = true;
                    else if (diffDays <= 5) isDueSoon = true;
                  }
                }

                return (
                  <React.Fragment key={order.id}>
                    <tr 
                      onClick={() => toggleOrderDetails(order.id)}
                      className={`group cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50 border-l-4 border-l-slate-900' : 'hover:bg-slate-50/80 border-l-4 border-transparent'}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors shadow-sm ${isExpanded ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            <Package size={18} />
                          </div>
                          <div>
                            <p className="font-mono font-bold text-slate-900 text-sm tracking-tight">{shortId}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Hash size={10}/> Order ID</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-700">{new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Calendar size={10}/> Placed</p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{getDisplayName(order)}</p>
                        <span className={`inline-flex mt-1 px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-bold rounded shadow-sm ${isB2B ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                          {isB2B ? 'B2B Agency' : 'Retail'}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <p className="font-extrabold text-slate-900 text-base">${Number(order.total_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                          <div className="flex items-center gap-2">
                            {getPaymentBadge(order.payment_status)}
                            {/* 🚀 Visual Warning Badges for Net-30 Status */}
                            {isOverdue && <span className="text-[9px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1"><AlertCircle size={10} /> Overdue</span>}
                            {isDueSoon && <span className="text-[9px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1"><Clock size={10} /> Due Soon</span>}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        {getStatusBadge(order.status)}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button className={`p-1.5 rounded-lg transition-transform duration-200 ${isExpanded ? 'bg-slate-200 text-slate-900 rotate-180' : 'text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-900'}`}>
                          <ChevronDown size={20} />
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50 shadow-inner">
                        <td colSpan="6" className="p-0 border-b border-slate-200">
                          <div className="p-6 sm:p-8 animate-in slide-in-from-top-2 fade-in duration-200">
                            
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 border-b border-slate-200 pb-4">
                              <div>
                                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Order Management Panel</h3>
                                <p className="text-sm text-slate-500 font-medium">Review details and process fulfillment</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {order.status === 'pending' && (
                                  <>
                                    <button onClick={() => handleStatusChangeClick(order.id, 'cancelled')} className="px-5 py-2 bg-white border border-red-200 text-red-600 text-sm font-bold rounded-xl shadow-sm hover:bg-red-50 active:scale-95 transition-all">Reject</button>
                                    <button onClick={() => handleStatusChangeClick(order.id, 'processing')} className="px-5 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2"><CheckCircle2 size={16} /> Approve to Warehouse</button>
                                  </>
                                )}
                                {order.status === 'ready_for_delivery' && (
                                  <button onClick={() => openAssignModal(order)} className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2"><Truck size={16} /> Dispatch Driver</button>
                                )}
                                
                                {order.status === 'delivered' && (
                                  <>
                                    <button onClick={() => generateInvoice(order)} className="px-5 py-2 bg-white border border-slate-200 text-slate-900 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-2">
                                      <FileDown size={16} className="text-slate-400" /> Download Invoice
                                    </button>
                                    {order.payment_status === 'unpaid' && (
                                      <button onClick={() => handleMarkAsPaid(order.id)} className="px-5 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2">
                                        <CheckCircle2 size={16} /> Mark as Paid
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              <div className="lg:col-span-2 space-y-6">
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Building size={14}/> Bill To</h4>
                                    <p className="font-bold text-slate-900 text-base mb-2">{billName}</p>
                                    <div className="space-y-2 text-sm font-medium text-slate-600">
                                      {billEmail && <p className="flex items-center gap-2"><Mail size={14} className="text-slate-400"/> {billEmail}</p>}
                                      {billPhone && <p className="flex items-center gap-2"><Phone size={14} className="text-slate-400"/> {billPhone}</p>}
                                      <div className="flex items-start gap-2">
                                        <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0"/>
                                        <div><p>{billAddress}</p>{billCityState && <p>{billCityState}</p>}</div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><MapPin size={14}/> Ship To</h4>
                                    <p className="font-bold text-slate-900 text-base mb-2">{shipName}</p>
                                    <div className="space-y-2 text-sm font-medium text-slate-600">
                                      {shipEmail && <p className="flex items-center gap-2"><Mail size={14} className="text-slate-400"/> {shipEmail}</p>}
                                      {shipPhone && <p className="flex items-center gap-2"><Phone size={14} className="text-slate-400"/> {shipPhone}</p>}
                                      <div className="flex items-start gap-2">
                                        <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0"/>
                                        <div><p>{shipAddress}</p>{shipCityState && <p>{shipCityState}</p>}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider">
                                    <FileText size={16} className="text-slate-400" /> Order Items
                                  </h4>
                                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left text-sm whitespace-normal">
                                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                                        <tr>
                                          <th className="px-5 py-3 font-bold w-full">Product</th>
                                          <th className="px-5 py-3 font-bold text-center">Qty</th>
                                          <th className="px-5 py-3 font-bold text-right">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {order.order_items?.map((item) => (
                                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-5 py-4">
                                              <p className="font-bold text-slate-900 leading-snug">{item.product_variants?.products?.name || item.product_variants?.name}</p>
                                              <p className="text-xs text-slate-500 mt-1 font-medium">Variant: <span className="text-slate-700">{item.product_variants?.name}</span> <span className="mx-1.5 text-slate-300">|</span> SKU: <span className="font-mono text-slate-600">{item.product_variants?.products?.base_sku || item.product_variants?.sku}</span></p>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                              <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200 shadow-sm">{item.quantity_variants}</span>
                                            </td>
                                            <td className="px-5 py-4 text-right font-extrabold text-slate-900">
                                              ${Number(item.line_total).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                  <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2">
                                    <DollarSign size={16} className="text-slate-400" /> Summary
                                  </h4>
                                  <div className="space-y-3 text-sm font-medium">
                                    <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="text-slate-900">${Number(order.subtotal).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                                    <div className="flex justify-between text-slate-500"><span>Shipping</span><span className="text-slate-900">${Number(order.shipping_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                                    <div className="flex justify-between text-slate-500"><span>Tax</span><span className="text-slate-900">${Number(order.tax_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                                    <div className="h-px w-full bg-slate-200/60 my-2"></div>
                                    <div className="flex justify-between items-end">
                                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Grand Total</span>
                                      <span className="text-2xl font-extrabold text-slate-900 tracking-tight leading-none">${Number(order.total_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                                    <div className="flex items-center gap-2">
                                      <CreditCard size={14} className="text-slate-400 shrink-0" />
                                      <span className="font-bold text-slate-700 capitalize">{order.payment_method.replace('_', ' ')}</span>
                                    </div>
                                    {getPaymentBadge(order.payment_status)}
                                  </div>

                                  {isNet30 && (
                                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Net 30 Due Date</span>
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${isOverdue ? 'bg-red-100 text-red-700 border border-red-200 shadow-sm' : isDueSoon ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm' : 'text-slate-700 bg-slate-100 border border-slate-200'}`}>
                                        {dueDateDisplay}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {(order.status === 'ready_for_delivery' || order.status === 'shipped' || order.status === 'delivered') && order.driver_name && (
                                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2">
                                      <Truck size={16} className="text-slate-400" /> Dispatch Info
                                    </h4>
                                    <div className="space-y-3 text-sm">
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Assigned Driver</p>
                                        <p className="font-bold text-slate-900 flex items-center gap-1.5"><User size={14} className="text-slate-400"/> {displayDriverName}</p>
                                      </div>
                                      {displayDriverPhone && (
                                        <div>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Contact Number</p>
                                          <p className="font-medium text-slate-600 flex items-center gap-1.5"><Phone size={14} className="text-slate-400"/> {displayDriverPhone}</p>
                                        </div>
                                      )}
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Vehicle</p>
                                        <p className="font-medium text-slate-700 flex items-center gap-1.5"><Car size={14} className="text-slate-400"/> {order.vehicle_name || 'Assigned Vehicle'}</p>
                                      </div>
                                      {order.vehicle_license && (
                                        <div>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">License Plate</p>
                                          <p className="font-mono font-bold text-slate-700 flex items-center gap-1.5"><Hash size={14} className="text-slate-400"/> {order.vehicle_license}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
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
      )}

      {/* --- ASSIGN DRIVER MODAL --- */}
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
                  <select required value={driverName} onChange={(e) => {
                      setDriverName(e.target.value);
                    }} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold cursor-pointer appearance-none transition-all">
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

      {/* --- CONFIRMATION MODAL --- */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm ${confirmAction.title.includes('Reject') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-900 border-slate-200'}`}>
              {confirmAction.title.includes('Reject') ? <XCircle size={32} /> : <CheckCircle2 size={32} />}
            </div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{confirmAction.title}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => setConfirmAction({ show: false, title: '', message: '', onConfirm: null })} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button>
              <button onClick={confirmAction.onConfirm} className={`w-full py-3 text-sm text-white font-bold rounded-xl shadow-md active:scale-95 transition-all ${confirmAction.title.includes('Reject') ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODERN TOAST NOTIFICATION --- */}
      {notification.show && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[120] flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`p-1.5 rounded-full ${notification.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {notification.isError ? <XCircle size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}
          </div>
          <p className="text-sm font-medium pr-2">{notification.message}</p>
        </div>
      )}

    </div>
  );
}
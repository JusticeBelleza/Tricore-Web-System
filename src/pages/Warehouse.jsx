import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  Search, Package, CheckCircle2, Truck, FileDown, 
  CheckSquare, Square, Box, ChevronDown, Hash, Calendar, MapPin, Building, User, Phone, Mail, Car
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Warehouse() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('processing'); 
  
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [pickedItems, setPickedItems] = useState({});
  const [confirmReady, setConfirmReady] = useState({ show: false, orderId: null });

  useEffect(() => {
    if (profile?.id) {
      fetchWarehouseOrders();
    }
  }, [profile?.id]);

  const fetchWarehouseOrders = async () => {
    setLoading(true);
    try {
      const [ordersRes, driversRes] = await Promise.all([
        supabase.from('orders').select(`
          *, 
          companies ( name, address, city, state, zip, phone, email ), 
          agency_patients ( contact_number, email ),
          user_profiles ( contact_number, email ),
          order_items ( id, quantity_variants, unit_price, line_total, product_variants ( name, sku, products ( name ) ) )
        `)
        .in('status', ['processing', 'ready_for_delivery', 'shipped']) 
        .order('created_at', { ascending: false }),
        supabase.from('user_profiles').select('full_name, contact_number').eq('role', 'driver')
      ]);

      if (ordersRes.error) throw ordersRes.error;
      setOrders(ordersRes.data || []);
      setDrivers(driversRes.data || []);
    } catch (error) {
      console.error('Error:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const getDisplayName = (order) => {
    if (order.companies?.name) {
      return order.patient_name ? `${order.companies.name} - ${order.patient_name}` : order.companies.name;
    }
    return order.shipping_name || order.customer_name || 'Retail Customer';
  };

  const toggleOrderDetails = (orderId) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
    } else {
      setExpandedOrderId(orderId);
      setPickedItems({}); 
    }
  };

  const togglePickItem = (itemId) => { 
    setPickedItems(prev => ({ ...prev, [itemId]: !prev[itemId] })); 
  };

  const markAsReady = async (orderId) => {
    try {
      const { error } = await supabase.from('orders').update({ status: 'ready_for_delivery' }).eq('id', orderId);
      if (error) throw error;
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'ready_for_delivery' } : o));
      
      if (activeTab === 'processing') {
        setExpandedOrderId(null);
      }
    } catch (error) { alert('Failed to mark as ready.'); }
  };

  // --- 100% RELIABLE CANVAS IMAGE LOADER FOR jsPDF ---
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
      img.onerror = () => {
        console.error("Failed to load logo image.");
        resolve(null);
      };
      img.src = imageUrl;
    });
  };

  // --- REBUILT PACKING SLIP PDF GENERATOR ---
  const generatePackingSlip = async (order) => {
    const doc = new jsPDF();
    const orderNum = order.id.substring(0, 8).toUpperCase();
    const dateObj = new Date(order.created_at);
    const datePacked = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // 1. Fetch and Stamp Logo (Preserving Aspect Ratio securely)
    const logoData = await getBase64ImageFromUrl('/images/tricore-logo2.png');
    if (logoData) {
      const imgWidth = 45; 
      const imgHeight = (logoData.height * imgWidth) / logoData.width; 
      doc.addImage(logoData.dataURL, 'PNG', 14, 12, imgWidth, imgHeight); 
    } else {
      doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); 
      doc.text("TRICORE MEDICAL SUPPLY", 14, 20);
    }
    
    // Order Info (Top Right)
    doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
    doc.text("PACKING SLIP", 140, 18);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Order #: ${orderNum}`, 140, 24);
    doc.text(`Date: ${datePacked}`, 140, 29);

    const isB2B = !!order.company_id;

    // --- LOGIC: Agency = Bill To, Patient = Ship To ---
    const billName = isB2B ? (order.companies?.name || 'Agency') : (order.shipping_name || 'Retail Customer');
    const billAddress = isB2B ? (order.companies?.address || 'N/A') : (order.shipping_address || 'N/A');
    const billCityState = isB2B 
      ? (`${order.companies?.city || ''}, ${order.companies?.state || ''} ${order.companies?.zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '')) 
      : (`${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, ''));
    const billPhone = isB2B ? (order.companies?.phone || '') : (order.user_profiles?.contact_number || '');

    const shipName = order.shipping_name || billName;
    const shipAddress = order.shipping_address || 'N/A';
    const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');
    const shipPhone = order.agency_patients?.contact_number || order.user_profiles?.contact_number || '';

    // Render Addresses Header
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("SHIP TO", 14, 45); 
    doc.text("BILL TO", 110, 45);
    
    // Left side: SHIP TO (Patient)
    let currentYShip = 52;
    doc.setFont("helvetica", "bold");
    doc.text(shipName, 14, currentYShip); currentYShip += 5;
    doc.setFont("helvetica", "normal");
    if (isB2B && order.companies?.name) {
        doc.text(`c/o ${order.companies.name}`, 14, currentYShip); currentYShip += 5; 
    }
    if (shipAddress !== 'N/A') { doc.text(shipAddress, 14, currentYShip); currentYShip += 5; }
    if (shipCityState) { doc.text(shipCityState, 14, currentYShip); currentYShip += 5; }
    if (shipPhone) { doc.text(`Phone: ${shipPhone}`, 14, currentYShip); currentYShip += 5; }

    // Right side: BILL TO (Agency or Retail Customer)
    let currentYBill = 52;
    doc.setFont("helvetica", "bold");
    doc.text(billName, 110, currentYBill); currentYBill += 5;
    doc.setFont("helvetica", "normal");
    if (billAddress !== 'N/A') { doc.text(billAddress, 110, currentYBill); currentYBill += 5; }
    if (billCityState) { doc.text(billCityState, 110, currentYBill); currentYBill += 5; }
    if (billPhone) { doc.text(`Phone: ${billPhone}`, 110, currentYBill); currentYBill += 5; }

    const maxAddressY = Math.max(currentYBill, currentYShip);

    // Render Items Table (Strict Columns: Name, Variant, SKU, Qty)
    const tableRows = order.order_items.map(item => {
      const productName = item.product_variants?.products?.name || item.product_variants?.name || 'Item';
      const variantName = item.product_variants?.name || 'N/A';
      const sku = item.product_variants?.sku || 'N/A';
      return [
        productName,
        variantName,
        sku,
        `${item.quantity_variants} of ${item.quantity_variants}`
      ];
    });

    autoTable(doc, {
      startY: maxAddressY + 10,
      head: [["PRODUCT NAME", "VARIANT", "SKU", "QTY"]],
      body: tableRows,
      theme: 'striped', 
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 6, textColor: [15, 23, 42] }, 
      columnStyles: { 
        0: { cellWidth: 'auto' }, 
        1: { cellWidth: 45 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25, halign: 'center', valign: 'middle', fontStyle: 'bold' } 
      }
    });

    const finalY = doc.lastAutoTable.finalY || maxAddressY + 20;
    
    // Signatures Area
    doc.setFont("helvetica", "bold");
    doc.text("Signed by:", 14, finalY + 20);
    doc.setFont("helvetica", "normal");
    doc.text("________________________________________", 14, finalY + 30);

    doc.setFont("helvetica", "bold");
    doc.text("Delivered by:", 110, finalY + 20);
    doc.setFont("helvetica", "normal");
    doc.text("________________________________________", 110, finalY + 30);

    // Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("Thank you for shopping with us!", 105, pageHeight - 30, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("TRICORE MEDICAL SUPPLY", 105, pageHeight - 24, { align: "center" });
    doc.text("2169 Harbor St, Pittsburg CA 94565, United States", 105, pageHeight - 19, { align: "center" });
    doc.text("info@tricoremedicalsupply.com", 105, pageHeight - 14, { align: "center" });
    doc.text("www.tricoremedicalsupply.com", 105, pageHeight - 9, { align: "center" });

    doc.save(`Packing_Slip_${orderNum}.pdf`);
  };

  const displayedOrders = orders.filter(o => {
    const isCorrectTab = activeTab === 'processing' ? o.status === 'processing' : (o.status === 'ready_for_delivery' || o.status === 'shipped');
    const matchesSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase()) || getDisplayName(o).toLowerCase().includes(searchTerm.toLowerCase());
    return isCorrectTab && matchesSearch;
  });

  const getStatusBadge = (status) => {
    if (status === 'processing') return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><Package size={12}/> To Pack</span>;
    if (status === 'ready_for_delivery') return <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><Box size={12}/> Ready</span>;
    if (status === 'shipped') return <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><Truck size={12}/> Shipped</span>;
    return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] uppercase tracking-widest font-bold border border-slate-200 shadow-sm">{status}</span>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      <div className="flex items-center gap-4 pb-2">
        <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md"><Package size={28} strokeWidth={1.5} /></div>
        <div><h2 className="text-3xl font-bold text-slate-900 tracking-tight">Pick & Pack</h2><p className="text-sm text-slate-500 mt-1 font-medium">Warehouse fulfillment queue and packing slip generation.</p></div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-100/50 rounded-xl border border-slate-200 w-full md:w-auto overflow-x-auto shrink-0">
          <button onClick={() => { setActiveTab('processing'); setExpandedOrderId(null); }} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'processing' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}><Package size={16}/> To Pack ({orders.filter(o=>o.status==='processing').length})</button>
          <button onClick={() => { setActiveTab('completed'); setExpandedOrderId(null); }} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'completed' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}><CheckCircle2 size={16}/> Packed ({orders.filter(o=>o.status==='ready_for_delivery' || o.status === 'shipped').length})</button>
        </div>
        <div className="relative w-full md:w-80 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search Order ID or Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all shadow-sm" />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="w-full h-14 bg-slate-50/80 border-b border-slate-200"></div>
          {[1,2,3,4,5].map(n => (<div key={n} className="w-full h-20 bg-white border-b border-slate-100 flex items-center px-6 gap-6 animate-pulse"><div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0"></div><div className="w-32 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-48 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-24 h-6 bg-slate-100 rounded-lg shrink-0 ml-auto"></div></div>))}
        </div>
      ) : displayedOrders.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mt-6">
          <Package size={56} strokeWidth={1} className="mx-auto text-slate-300 mb-5" />
          <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">Queue is empty</h3>
          <p className="text-slate-500 text-sm">There are no orders in this tab matching your search right now.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-x-auto mt-6">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold tracking-tight rounded-tl-3xl">Order Details</th>
                <th className="px-6 py-4 font-bold tracking-tight">Date</th>
                <th className="px-6 py-4 font-bold tracking-tight">Customer / Agency</th>
                <th className="px-6 py-4 font-bold tracking-tight text-center">Items</th>
                <th className="px-6 py-4 font-bold tracking-tight">Status</th>
                <th className="px-6 py-4 font-bold tracking-tight text-right rounded-tr-3xl"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedOrders.map(order => {
                const isExpanded = expandedOrderId === order.id;
                const shortId = order.id.substring(0, 8).toUpperCase();
                const isB2B = !!order.company_id;
                const isOrderDone = order.status === 'ready_for_delivery' || order.status === 'shipped';
                
                // 🚀 FIXED: Dynamic Counter
                const currentPickedCount = isOrderDone 
                  ? (order.order_items?.length || 0) 
                  : Object.values(pickedItems).filter(Boolean).length;
                
                const allItemsPicked = order.order_items?.every(item => pickedItems[item.id]) || false;
                
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

                const driverParts = (order.driver_name || '').split(' | ');
                const displayDriverName = driverParts[0];
                const displayDriverPhone = driverParts[1] || '';

                return (
                  <React.Fragment key={order.id}>
                    <tr onClick={() => toggleOrderDetails(order.id)} className={`group cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50 border-l-4 border-l-slate-900' : 'hover:bg-slate-50/80 border-l-4 border-transparent'}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors shadow-sm ${isExpanded ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-500 border-slate-200'}`}><Box size={18} /></div>
                          <div><p className="font-mono font-bold text-slate-900 text-sm tracking-tight">{shortId}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Hash size={10}/> Order ID</p></div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><p className="font-medium text-slate-700">{new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Calendar size={10}/> Placed</p></td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{getDisplayName(order)}</p>
                        <span className={`inline-flex mt-1 px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-bold rounded shadow-sm ${isB2B ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>{isB2B ? 'B2B Agency' : 'Retail'}</span>
                      </td>
                      <td className="px-6 py-4 text-center"><span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-extrabold text-xs shadow-inner border border-slate-200">{order.order_items?.length || 0}</span></td>
                      <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                      <td className="px-6 py-4 text-right"><button className={`p-1.5 rounded-lg transition-transform duration-200 ${isExpanded ? 'bg-slate-200 text-slate-900 rotate-180' : 'text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-900'}`}><ChevronDown size={20} /></button></td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50 shadow-inner">
                        <td colSpan="6" className="p-0 border-b border-slate-200">
                          <div className="p-6 sm:p-8 animate-in slide-in-from-top-2 fade-in duration-200">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              <div className="lg:col-span-2 space-y-4">
                                <div className="flex justify-between items-end mb-4 border-b border-slate-200 pb-2">
                                  <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider"><CheckSquare size={16} className="text-slate-400" /> Items to Pick</h4>
                                  {/* 🚀 FIXED: Renders the dynamically updated counter */}
                                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{currentPickedCount} / {order.order_items?.length} Picked</span>
                                </div>
                                <div className="space-y-3">
                                  {order.order_items?.map(item => {
                                    const isPicked = pickedItems[item.id];
                                    const isDone = order.status === 'ready_for_delivery' || order.status === 'shipped';
                                    return (
                                      <div key={item.id} onClick={() => order.status === 'processing' && togglePickItem(item.id)} className={`flex items-center justify-between p-4 sm:px-5 sm:py-4 rounded-2xl border transition-all ${order.status === 'processing' ? 'cursor-pointer active:scale-[0.99]' : ''} ${isPicked || isDone ? 'bg-emerald-50/80 border-emerald-200 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'}`}>
                                        <div className="flex items-center gap-4 sm:gap-5">
                                          <div className={`transition-colors ${isPicked || isDone ? 'text-emerald-500' : 'text-slate-300'}`}>{isPicked || isDone ? <CheckSquare size={26} strokeWidth={2} /> : <Square size={26} strokeWidth={2} />}</div>
                                          <div><p className={`font-bold text-slate-900 leading-snug text-sm sm:text-base transition-all ${isPicked || isDone ? 'line-through decoration-emerald-500/40 text-slate-500' : ''}`}>{item.product_variants?.products?.name || item.product_variants?.name || 'Item'}</p><p className="text-xs font-mono text-slate-500 mt-1">SKU: {item.product_variants?.sku}</p></div>
                                        </div>
                                        <div className="text-center bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 shrink-0"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Qty</p><p className={`text-lg font-extrabold leading-none ${isPicked || isDone ? 'text-emerald-700' : 'text-slate-900'}`}>{item.quantity_variants}</p></div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="space-y-6">
                                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                  <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2 border-b border-slate-100 pb-3"><MapPin size={16} className="text-slate-400" /> Delivery Route</h4>
                                  <div className="space-y-4">
                                    <div>
                                      <p className="font-bold text-slate-900 text-sm mb-2">{shipName}</p>
                                      <div className="space-y-1.5 text-xs font-medium text-slate-600">
                                        {shipEmail && <p className="flex items-center gap-1.5"><Mail size={12} className="text-slate-400"/> {shipEmail}</p>}
                                        {shipPhone && <p className="flex items-center gap-1.5"><Phone size={12} className="text-slate-400"/> {shipPhone}</p>}
                                        <div className="flex items-start gap-1.5">
                                          <MapPin size={12} className="text-slate-400 mt-0.5 shrink-0"/>
                                          <div><p>{shipAddress}</p>{shipCityState && <p>{shipCityState}</p>}</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {(order.status === 'ready_for_delivery' || order.status === 'shipped' || order.status === 'delivered') && order.driver_name && (
                                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2"><Truck size={16} className="text-slate-400" /> Dispatch Info</h4>
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
                                      <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Vehicle</p><p className="font-medium text-slate-700 flex items-center gap-1.5"><Car size={14} className="text-slate-400"/> {order.vehicle_name || 'Assigned Vehicle'}</p></div>
                                      {order.vehicle_license && <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">License Plate</p><p className="font-mono font-bold text-slate-700 flex items-center gap-1.5"><Hash size={14} className="text-slate-400"/> {order.vehicle_license}</p></div>}
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-3">
                                  {order.status === 'processing' && (<button onClick={() => setConfirmReady({ show: true, orderId: order.id })} disabled={!allItemsPicked} className={`w-full py-4 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md ${allItemsPicked ? 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}><Box size={18} /> {allItemsPicked ? 'Mark as Ready for Delivery' : 'Pick all items to continue'}</button>)}
                                  {(order.status === 'ready_for_delivery' || order.status === 'shipped') && (<button onClick={() => generatePackingSlip(order)} className="w-full py-4 text-sm bg-white border border-slate-200 text-slate-900 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"><FileDown size={18} className="text-slate-400"/> Print Packing Slip</button>)}
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
      )}

      {confirmReady.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-100 shadow-sm"><Box size={32} /></div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">Ready for Delivery?</h4><p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">Confirming this will clear the order from the packing queue and mark it ready for driver dispatch.</p>
            <div className="flex gap-3 pt-5"><button onClick={() => setConfirmReady({ show: false, orderId: null })} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">Cancel</button><button onClick={() => { markAsReady(confirmReady.orderId); setConfirmReady({ show: false, orderId: null }); }} className="w-full py-3.5 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md bg-slate-900 hover:bg-slate-800">Confirm Ready</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
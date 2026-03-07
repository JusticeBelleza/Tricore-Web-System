import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  Package, Receipt, ChevronDown, Calendar, Hash, 
  CreditCard, DollarSign, Truck, FileText, ShoppingCart, User, Car, FileDown, Phone, AlertCircle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function MyOrders() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  useEffect(() => {
    if (profile?.company_id || profile?.id) {
      fetchMyOrders();
    }
  }, [profile?.company_id, profile?.id]);

  const fetchMyOrders = async () => {
    setLoading(true);
    try {
      // REMOVED updated_at to prevent the Supabase 400 Error
      let query = supabase
        .from('orders')
        .select(`
          id, status, created_at, total_amount, subtotal, tax_amount, shipping_amount, payment_method, payment_status, signature_url, photo_url,
          driver_name, vehicle_name, vehicle_license,
          companies ( name, address, city, state, zip ),
          order_items (
            id, quantity_variants, unit_price, line_total,
            product_variants ( name, sku, products ( name, base_sku ) )
          )
        `)
        .order('created_at', { ascending: false });

      if (profile?.company_id) {
        query = query.eq('company_id', profile.company_id);
      } else if (profile?.id) {
        query = query.eq('user_id', profile.id);
      }

      const [ordersRes, driversRes] = await Promise.all([
        query,
        supabase.from('user_profiles').select('full_name, contact_number').eq('role', 'driver')
      ]);

      if (ordersRes.error) throw ordersRes.error;
      setOrders(ordersRes.data || []);
      setDrivers(driversRes.data || []);
    } catch (error) {
      console.error('Error fetching orders:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderDetails = (orderId) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      approved: 'bg-blue-50 text-blue-700 border-blue-200',
      picking: 'bg-purple-50 text-purple-700 border-purple-200',
      packed: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      out_for_delivery: 'bg-orange-50 text-orange-700 border-orange-200',
      delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
    return <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shadow-sm whitespace-nowrap ${styles[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{status.replace(/_/g, ' ')}</span>;
  };

  const getPaymentStatusBadge = (paymentStatus) => {
    if (paymentStatus === 'paid') return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm">Paid</span>;
    if (paymentStatus === 'unpaid') return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-200 shadow-sm">Unpaid</span>;
    return null;
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

    const shipName = order.shipping_name || (isB2B ? 'Patient' : profile?.full_name || 'Retail Customer');
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

    const tableRows = order.order_items?.map(item => {
      const productName = item.product_variants?.products?.name || item.product_variants?.name || 'Item';
      const variantName = item.product_variants?.name || 'N/A';
      const sku = item.product_variants?.sku || item.product_variants?.products?.base_sku || 'N/A';
      return [
        `${productName}\nVariant: ${variantName}\nSKU: ${sku}`,
        item.quantity_variants, 
        `$${Number(item.unit_price || 0).toFixed(2)}`, 
        `$${Number(item.line_total || 0).toFixed(2)}`
      ];
    }) || [];

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

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex items-center gap-4 pb-2">
        <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
          <Receipt size={28} strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Order History</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">View, track, and manage your previous purchases.</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="w-full h-12 bg-slate-50/80 border-b border-slate-200"></div>
          {[1,2,3].map(n => (
            <div key={n} className="w-full h-20 bg-white border-b border-slate-100 flex items-center px-6 gap-6 animate-pulse">
              <div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0"></div>
              <div className="w-24 h-4 bg-slate-100 rounded shrink-0"></div>
              <div className="w-24 h-4 bg-slate-100 rounded shrink-0"></div>
              <div className="w-20 h-6 bg-slate-100 rounded-lg shrink-0 ml-auto"></div>
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mt-6">
          <Package size={56} strokeWidth={1} className="mx-auto text-slate-300 mb-5" />
          <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">No orders found</h3>
          <p className="text-slate-500 text-sm mb-8 max-w-md mx-auto">It looks like you haven't placed any orders yet. Browse our catalog to start stocking up.</p>
          <button onClick={() => navigate('/catalog')} className="px-6 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2 mx-auto">
            <ShoppingCart size={16} /> Go to Catalog
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold tracking-tight">Order Details</th>
                <th className="px-6 py-4 font-bold tracking-tight">Date Placed</th>
                <th className="px-6 py-4 font-bold tracking-tight">Total Amount</th>
                <th className="px-6 py-4 font-bold tracking-tight">Payment</th>
                <th className="px-6 py-4 font-bold tracking-tight">Fulfillment</th>
                <th className="px-6 py-4 font-bold tracking-tight text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const shortId = order.id.split('-')[0].toUpperCase();

                // 🚀 SMART PARSER
                const rawDriverName = order.driver_name || '';
                const driverParts = rawDriverName.split('|').map(s => s.trim());
                const displayDriverName = driverParts[0] || '';
                let displayDriverPhone = driverParts[1] || '';

                if (!displayDriverPhone && displayDriverName) {
                  const assignedDriverObj = drivers.find(d => (d.full_name || '').toLowerCase() === displayDriverName.toLowerCase());
                  displayDriverPhone = assignedDriverObj?.contact_number || '';
                }

                // 🚀 DUE DATE CALCULATION (Fallback to created_at + 30 days)
                const isNet30 = order.payment_method === 'net_30';
                let dueDateDisplay = '';
                let isOverdue = false;

                if (isNet30) {
                  const baseDate = new Date(order.created_at);
                  const dueDate = new Date(baseDate);
                  dueDate.setDate(dueDate.getDate() + 30);
                  dueDateDisplay = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                  isOverdue = order.payment_status === 'unpaid' && new Date() > dueDate;
                }
                
                return (
                  <React.Fragment key={order.id}>
                    <tr 
                      onClick={() => toggleOrderDetails(order.id)} 
                      className={`group cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50 border-l-4 border-l-slate-800' : 'hover:bg-slate-50/80 border-l-4 border-transparent'}`}
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
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Calendar size={10}/> Date</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-extrabold text-slate-900 text-base">${order.total_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1">
                          {getPaymentStatusBadge(order.payment_status)}
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                            <CreditCard size={10} /> {order.payment_method.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1">
                          {getStatusBadge(order.status)}
                          {isOverdue && (
                            <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1 mt-1">
                              <AlertCircle size={10} /> Overdue
                            </span>
                          )}
                        </div>
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
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              <div className="lg:col-span-2 space-y-4">
                                <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider">
                                  <FileText size={16} className="text-slate-400" /> Order Items
                                </h4>
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                  <table className="w-full text-left text-sm whitespace-normal">
                                    <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                                      <tr>
                                        <th className="px-5 py-3 font-bold w-full rounded-tl-2xl">Product</th>
                                        <th className="px-5 py-3 font-bold text-center">Qty</th>
                                        <th className="px-5 py-3 font-bold text-right rounded-tr-2xl">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {order.order_items?.map((item) => (
                                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                          <td className="px-5 py-4">
                                            <p className="font-bold text-slate-900 leading-snug">{item.product_variants?.products?.name}</p>
                                            <p className="text-xs text-slate-500 mt-1 font-medium">Variant: <span className="text-slate-700">{item.product_variants?.name}</span> <span className="mx-1.5 text-slate-300">|</span> SKU: <span className="font-mono text-slate-600">{item.product_variants?.products?.base_sku}</span></p>
                                          </td>
                                          <td className="px-5 py-4 text-center">
                                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200 shadow-sm">{item.quantity_variants}</span>
                                          </td>
                                          <td className="px-5 py-4 text-right font-extrabold text-slate-900">
                                            ${item.line_total.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                              <div className="space-y-6">
                                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                  <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2">
                                    <DollarSign size={16} className="text-slate-400" /> Summary
                                  </h4>
                                  <div className="space-y-3 text-sm font-medium">
                                    <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="text-slate-900">${order.subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                                    <div className="flex justify-between text-slate-500"><span>Shipping</span><span className="text-slate-900">${order.shipping_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                                    <div className="flex justify-between text-slate-500"><span>Tax</span><span className="text-slate-900">${order.tax_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                                    <div className="h-px w-full bg-slate-200/60 my-2"></div>
                                    <div className="flex justify-between items-end">
                                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Grand Total</span>
                                      <span className="text-2xl font-extrabold text-slate-900 tracking-tight leading-none">${order.total_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                    </div>
                                  </div>

                                  {isNet30 && (
                                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Due Date</span>
                                      <span className={`text-xs font-bold px-2 py-1 rounded shadow-sm border ${
                                        isOverdue 
                                          ? 'bg-red-50 text-red-700 border-red-200' 
                                          : order.status === 'delivered' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                                      }`}>
                                        {dueDateDisplay}
                                      </span>
                                    </div>
                                  )}

                                  <div className="pt-3 border-t border-slate-100">
                                    <button onClick={() => generateInvoice(order)} className="w-full py-3.5 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2">
                                      <FileDown size={16} /> Download Invoice PDF
                                    </button>
                                  </div>
                                </div>
                                {(order.status === 'ready_for_delivery' || order.status === 'shipped' || order.status === 'out_for_delivery' || order.status === 'delivered') && order.driver_name && (
                                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2">
                                      <Truck size={16} className="text-slate-400" /> Dispatch Info
                                    </h4>
                                    <div className="space-y-3 text-sm">
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Assigned Driver</p>
                                        <p className="font-bold text-slate-900 flex items-center gap-1.5"><User size={14} className="text-slate-400"/> {displayDriverName}</p>
                                      </div>
                                      
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Contact Number</p>
                                        <p className={`font-medium flex items-center gap-1.5 ${displayDriverPhone ? 'text-slate-600' : 'text-slate-400 italic'}`}>
                                          <Phone size={14} className={displayDriverPhone ? 'text-slate-400' : 'text-slate-300'}/> 
                                          {displayDriverPhone || 'Not provided'}
                                        </p>
                                      </div>

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
                                {order.status === 'delivered' && (order.photo_url || order.signature_url) && (
                                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-4">
                                      <Truck size={16} className="text-slate-400" /> Proof of Delivery
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                      {order.photo_url && (
                                        <div>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Photo</p>
                                          <a href={order.photo_url} target="_blank" rel="noreferrer" className="block relative group rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                                            <img src={order.photo_url} alt="Delivery Proof" className="w-full h-24 object-cover group-hover:scale-105 transition-transform duration-300" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                                          </a>
                                        </div>
                                      )}
                                      {order.signature_url && (
                                        <div>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Signature</p>
                                          <a href={order.signature_url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 bg-white p-2 hover:border-slate-300 transition-colors shadow-sm">
                                            <img src={order.signature_url} alt="Signature" className="w-full h-20 object-contain mix-blend-multiply" />
                                          </a>
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
    </div>
  );
}
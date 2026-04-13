import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  Package, Receipt, ChevronDown, Calendar, Hash, MapPin, Mail,
  CreditCard, DollarSign, Truck, FileText, ShoppingCart, User, Car, FileDown, Phone, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, PackageCheck, XCircle, Clock, AlertTriangle, RefreshCw 
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

  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;
  
  const [activeTab, setActiveTab] = useState('all'); 
  const [tabCounts, setTabCounts] = useState({ all: 0, delivered: 0, due: 0, paid: 0, cancelled: 0, returned: 0 });

  useEffect(() => {
    setPage(0);
    setExpandedOrderId(null);
  }, [activeTab]);

  useEffect(() => {
    if (profile?.company_id || profile?.id) {
      fetchMyOrders();
      fetchTabCounts();
    }
  }, [profile?.company_id, profile?.id, page, activeTab]);

  const fetchTabCounts = async () => {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - 25);

      const baseQuery = () => {
        let q = supabase.from('orders').select('*', { count: 'exact', head: true });
        if (profile?.company_id) q = q.eq('company_id', profile.company_id);
        else if (profile?.id) q = q.eq('user_id', profile.id);
        return q;
      };

      const [allReq, deliveredReq, dueReq, paidReq, cancelledReq, returnedReq] = await Promise.all([
        baseQuery(),
        baseQuery().in('status', ['delivered', 'delivered_partial']),
        baseQuery().in('status', ['delivered', 'delivered_partial']).eq('payment_method', 'net_30').eq('payment_status', 'unpaid').lte('created_at', thresholdDate.toISOString()),
        baseQuery().eq('payment_status', 'paid'),
        baseQuery().eq('status', 'cancelled'),
        baseQuery().in('status', ['restocked', 'attempted'])
      ]);

      setTabCounts({
        all: allReq.count || 0,
        delivered: deliveredReq.count || 0,
        due: dueReq.count || 0,
        paid: paidReq.count || 0,
        cancelled: cancelledReq.count || 0,
        returned: returnedReq.count || 0
      });
    } catch (error) {
      console.error('Error counting tabs:', error);
    }
  };

  const fetchMyOrders = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('orders')
        .select(`
          id, status, created_at, updated_at, processing_at, shipped_at, delivered_at, cancelled_at, cancellation_reason, total_amount, subtotal, tax_amount, shipping_amount, payment_method, payment_status, signature_url, photo_url, received_by,
          driver_name, vehicle_name, vehicle_license,
          shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, company_id,
          companies ( name, address, city, state, zip, phone, email ),
          agency_patients ( contact_number, email ),
          user_profiles ( full_name, contact_number, email ),
          order_items (
            id, quantity_variants, unit_price, line_total, status, cancellation_reason,
            product_variants ( name, sku, products ( name, base_sku ) ) 
          )
        `, { count: 'exact' });

      if (profile?.company_id) {
        query = query.eq('company_id', profile.company_id);
      } else if (profile?.id) {
        query = query.eq('user_id', profile.id);
      }

      if (activeTab === 'delivered') {
        query = query.in('status', ['delivered', 'delivered_partial']);
      } else if (activeTab === 'due') {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - 25);
        query = query.in('status', ['delivered', 'delivered_partial']).eq('payment_method', 'net_30').eq('payment_status', 'unpaid').lte('created_at', thresholdDate.toISOString());
      } else if (activeTab === 'paid') {
        query = query.eq('payment_status', 'paid');
      } else if (activeTab === 'cancelled') {
        query = query.eq('status', 'cancelled');
      } else if (activeTab === 'returned') {
        query = query.in('status', ['restocked', 'attempted']);
      }

      query = query.order('created_at', { ascending: false });
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const [ordersRes, driversRes] = await Promise.all([
        query,
        supabase.from('user_profiles').select('full_name, contact_number').eq('role', 'driver')
      ]);

      if (ordersRes.error) throw ordersRes.error;
      
      setOrders(ordersRes.data || []);
      setTotalCount(ordersRes.count || 0);
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
    const displayStatus = status === 'delivered_partial' ? 'delivered' : status.replace(/_/g, ' ');
    
    const styles = {
      pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      processing: 'bg-blue-50 text-blue-700 border-blue-200',
      ready_for_delivery: 'bg-purple-50 text-purple-700 border-purple-200',
      shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      out_for_delivery: 'bg-orange-50 text-orange-700 border-orange-200',
      delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      delivered_partial: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      cancelled: 'bg-red-50 text-red-700 border-red-200',
      attempted: 'bg-amber-50 text-amber-700 border-amber-200',
      restocked: 'bg-slate-100 text-slate-700 border-slate-300' 
    };
    
    let label = displayStatus;
    if (status === 'restocked') label = 'returned';

    return <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shadow-sm whitespace-nowrap ${styles[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{label}</span>;
  };

  const getPaymentStatusBadge = (paymentStatus, orderStatus) => {
    if (['cancelled', 'restocked', 'attempted'].includes(orderStatus)) return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-400 border border-slate-200 shadow-sm">Voided</span>;
    if (paymentStatus === 'paid') return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm">Paid</span>;
    if (paymentStatus === 'unpaid') return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-200 shadow-sm">Unpaid</span>;
    return null;
  };

  const format12hr = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const getBase64ImageFromUrl = (imageUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
        resolve({ dataURL: canvas.toDataURL("image/png"), width: img.width, height: img.height });
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    });
  };

  const generatePDF = async (order, docType = 'invoice') => {
    const doc = new jsPDF();
    const orderNum = order.id.substring(0, 8).toUpperCase();
    const datePlaced = new Date(order.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // 🚀 DYNAMIC CALCULATIONS FOR PDF
    // The DB already holds the exact final Net Subtotal, Final Tax, and Final Total. 
    // We just need to sum all items to display the original gross subtotal!
    const rejectedItemsSum = order.order_items?.filter(item => item.status === 'cancelled' || item.status === 'rejected').reduce((sum, item) => sum + (Number(item.line_total) || 0), 0) || 0;
    const grossSubtotal = order.order_items?.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0) || 0;
    
    const finalTax = Number(order.tax_amount || 0);
    const finalTotal = Number(order.total_amount || 0);

    const logoData = await getBase64ImageFromUrl('/images/tricore-logo2.png');
    if (logoData) {
      const imgWidth = 45; const imgHeight = (logoData.height * imgWidth) / logoData.width; 
      doc.addImage(logoData.dataURL, 'PNG', 14, 12, imgWidth, imgHeight); 
    } else {
      doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.text("TRICORE MEDICAL SUPPLY", 14, 20);
    }
    
    doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); 
    doc.text(docType === 'receipt' ? "PAYMENT RECEIPT" : "INVOICE", 140, 18);
    
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.setFont("helvetica", "bold"); doc.text(`${docType === 'receipt' ? 'Receipt' : 'Invoice'} #: INV-${orderNum}`, 140, 24);
    doc.setFont("helvetica", "normal"); doc.text(`Date: ${datePlaced}`, 140, 29);
    
    if (docType === 'receipt') { doc.setFont("helvetica", "bold"); doc.setTextColor(16, 185, 129); doc.text("Status: PAID IN FULL", 140, 34); doc.setTextColor(15, 23, 42); } 
    else { doc.text(`Status: ${order.payment_status === 'paid' ? 'PAID' : 'UNPAID'}`, 140, 34); }

    const isB2B = !!order.company_id || !!profile?.company_id;

    const billName = isB2B ? (order.companies?.name || 'Agency') : (order.user_profiles?.full_name || profile?.full_name || 'Retail Customer');
    const billAddress = isB2B ? (order.companies?.address || 'No billing address provided') : (order.shipping_address || 'No billing address provided');
    const billCityState = isB2B ? (`${order.companies?.city || ''}, ${order.companies?.state || ''} ${order.companies?.zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '')) : (`${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, ''));
    const billPhone = isB2B ? (order.companies?.phone || '') : (order.user_profiles?.contact_number || profile?.contact_number || profile?.phone || '');
    const billEmail = isB2B ? (order.companies?.email || '') : (order.user_profiles?.email || profile?.email || '');

    const shipName = order.shipping_name || (isB2B ? 'Patient' : billName);
    const shipAddress = order.shipping_address || 'No shipping address provided';
    const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');
    const shipPhone = order.shipping_phone || order.agency_patients?.contact_number || order.user_profiles?.contact_number || profile?.contact_number || profile?.phone || '';
    const shipEmail = order.shipping_email || order.agency_patients?.email || order.user_profiles?.email || profile?.email || '';

    doc.setFont("helvetica", "bold"); doc.text("BILL TO:", 14, 50); doc.text("SHIP TO:", 110, 50); doc.setFont("helvetica", "normal");
    
    let currentYBill = 56;
    doc.setFont("helvetica", "bold"); doc.text(billName, 14, currentYBill); currentYBill += 5; doc.setFont("helvetica", "normal");
    if (billAddress && billAddress !== 'No billing address provided') { doc.text(billAddress, 14, currentYBill); currentYBill += 5; }
    if (billCityState) { doc.text(billCityState, 14, currentYBill); currentYBill += 5; }
    if (billPhone) { doc.text(`Phone: ${billPhone}`, 14, currentYBill); currentYBill += 5; }
    if (billEmail) { doc.text(`Email: ${billEmail}`, 14, currentYBill); currentYBill += 5; }

    let currentYShip = 56;
    doc.setFont("helvetica", "bold"); doc.text(shipName, 110, currentYShip); currentYShip += 5; doc.setFont("helvetica", "normal");
    if (shipAddress && shipAddress !== 'No shipping address provided') { doc.text(shipAddress, 110, currentYShip); currentYShip += 5; }
    if (shipCityState) { doc.text(shipCityState, 110, currentYShip); currentYShip += 5; }
    if (shipPhone) { doc.text(`Phone: ${shipPhone}`, 110, currentYShip); currentYShip += 5; }
    if (shipEmail) { doc.text(`Email: ${shipEmail}`, 110, currentYShip); currentYShip += 5; }

    const maxAddressY = Math.max(currentYBill, currentYShip);

    // 🚀 FILTER OUT REJECTED ITEMS FROM THE ACTUAL INVOICE LIST
    const activeItems = order.order_items?.filter(item => item.status !== 'cancelled' && item.status !== 'rejected') || [];
    const tableRows = activeItems.map(item => [
      `${item.product_variants?.products?.name || item.product_variants?.name || 'Item'}\nSKU: ${item.product_variants?.products?.base_sku || item.product_variants?.sku || 'N/A'}`,
      item.quantity_variants, `$${Number(item.unit_price || 0).toFixed(2)}`, `$${Number(item.line_total || 0).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: maxAddressY + 10,
      head: [["DESCRIPTION", "QTY", "UNIT PRICE", "TOTAL"]],
      body: tableRows,
      theme: 'striped', headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 5 }, columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
    });

    const finalY = doc.lastAutoTable.finalY || maxAddressY + 10;
    doc.setFont("helvetica", "normal");
    
    let currentY = finalY + 10;

    doc.text("Subtotal (Gross):", 140, currentY); doc.text(`$${grossSubtotal.toFixed(2)}`, 180, currentY, { align: 'right' });
    currentY += 6;
    
    if (rejectedItemsSum > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text("Adjustments:", 140, currentY); doc.text(`-$${rejectedItemsSum.toFixed(2)}`, 180, currentY, { align: 'right' });
      doc.setTextColor(15, 23, 42); 
      currentY += 6;
    }

    doc.text("Shipping:", 140, currentY); doc.text(`$${Number(order.shipping_amount || 0).toFixed(2)}`, 180, currentY, { align: 'right' });
    currentY += 6;

    doc.text("Tax:", 140, currentY); doc.text(`$${finalTax.toFixed(2)}`, 180, currentY, { align: 'right' });
    currentY += 10;
    
    if (docType === 'receipt') {
      doc.text(`Payment Method: ${order.payment_method?.replace(/_/g, ' ').toUpperCase() || 'CARD'}`, 14, currentY);
      doc.setFont("helvetica", "bold");
      doc.text("Total Paid:", 140, currentY); doc.text(`$${finalTotal.toFixed(2)}`, 180, currentY, { align: 'right' });
      currentY += 6;
      doc.text("Balance Due:", 140, currentY); doc.text("$0.00", 180, currentY, { align: 'right' });
    } else {
      doc.setFont("helvetica", "bold");
      doc.text("Grand Total:", 140, currentY); doc.text(`$${finalTotal.toFixed(2)}`, 180, currentY, { align: 'right' });
    }

    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("Thank you for your business!", 105, pageHeight - 30, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("TRICORE MEDICAL SUPPLY", 105, pageHeight - 24, { align: "center" });
    doc.text("2169 Harbor St, Pittsburg CA 94565, United States", 105, pageHeight - 19, { align: "center" });
    doc.text("info@tricoremedicalsupply.com", 105, pageHeight - 14, { align: "center" });
    doc.text("www.tricoremedicalsupply.com", 105, pageHeight - 9, { align: "center" });

    doc.save(`${docType === 'receipt' ? 'Receipt' : 'Invoice'}_${orderNum}.pdf`);
  };

  const tabBaseClass = "flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95";
  const tabActiveClass = "bg-slate-900 text-white shadow-md";
  const tabInactiveClass = "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50";

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 relative">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
            <Receipt size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Order History</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">View, track, and manage your previous purchases.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-100/50 rounded-xl border border-slate-200 w-full overflow-x-auto shrink-0 scrollbar-hide">
          <button onClick={() => setActiveTab('all')} className={`${tabBaseClass} ${activeTab === 'all' ? tabActiveClass : tabInactiveClass}`}>
            <FileText size={16}/> All History ({tabCounts.all})
          </button>
          <button onClick={() => setActiveTab('delivered')} className={`${tabBaseClass} ${activeTab === 'delivered' ? tabActiveClass : tabInactiveClass}`}>
            <PackageCheck size={16}/> Delivered ({tabCounts.delivered})
          </button>
          <button onClick={() => setActiveTab('due')} className={`${tabBaseClass} ${activeTab === 'due' ? 'bg-amber-500 text-white shadow-md' : tabInactiveClass}`}>
            <AlertCircle size={16}/> Due ({tabCounts.due})
          </button>
          <button onClick={() => setActiveTab('paid')} className={`${tabBaseClass} ${activeTab === 'paid' ? 'bg-emerald-600 text-white shadow-md' : tabInactiveClass}`}>
            <CheckCircle2 size={16}/> Paid ({tabCounts.paid})
          </button>
          <button onClick={() => setActiveTab('cancelled')} className={`${tabBaseClass} ${activeTab === 'cancelled' ? 'bg-red-600 text-white shadow-md' : tabInactiveClass}`}>
            <XCircle size={16}/> Cancelled ({tabCounts.cancelled})
          </button>
          <button onClick={() => setActiveTab('returned')} className={`${tabBaseClass} ${activeTab === 'returned' ? 'bg-slate-600 text-white shadow-md' : tabInactiveClass}`}>
            <RefreshCw size={16}/> Returned ({tabCounts.returned})
          </button>
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
          <p className="text-slate-500 text-sm mb-8 max-w-md mx-auto">There are no orders matching this category right now.</p>
          <button onClick={() => navigate('/catalog')} className="px-6 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2 mx-auto">
            <ShoppingCart size={16} /> Go to Catalog
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-bold tracking-tight rounded-tl-3xl">Order Details</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Date Placed</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Total Amount</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Payment</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Fulfillment</th>
                  <th className="px-6 py-4 font-bold tracking-tight text-right rounded-tr-3xl"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const isExpanded = expandedOrderId === order.id;
                  const shortId = order.id.split('-')[0].toUpperCase();
                  const isB2B = !!order.company_id || !!profile?.company_id;
                  
                  const hasAdjustments = order.order_items?.some(item => item.status === 'cancelled' || item.status === 'rejected');

                  const rawDriverName = order.driver_name || '';
                  const driverParts = rawDriverName.split('|').map(s => s.trim());
                  const displayDriverName = driverParts[0] || '';
                  let displayDriverPhone = driverParts[1] || '';

                  if (!displayDriverPhone && displayDriverName) {
                    const assignedDriverObj = drivers.find(d => (d.full_name || '').toLowerCase() === displayDriverName.toLowerCase());
                    displayDriverPhone = assignedDriverObj?.contact_number || '';
                  }

                  const billName = isB2B ? (order.companies?.name || 'Agency') : (order.user_profiles?.full_name || profile?.full_name || 'Retail Customer');
                  const billAddress = isB2B ? (order.companies?.address || 'No billing address provided') : (order.shipping_address || 'No billing address provided');
                  const billCityState = isB2B 
                    ? (`${order.companies?.city || ''}, ${order.companies?.state || ''} ${order.companies?.zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '')) 
                    : (`${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, ''));
                  const billPhone = isB2B ? (order.companies?.phone || '') : (order.user_profiles?.contact_number || profile?.contact_number || profile?.phone || '');
                  const billEmail = isB2B ? (order.companies?.email || '') : (order.user_profiles?.email || profile?.email || '');

                  const shipName = order.shipping_name || (isB2B ? 'Patient' : billName);
                  const shipAddress = order.shipping_address || 'No shipping address provided';
                  const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');
                  const shipPhone = order.shipping_phone || order.agency_patients?.contact_number || order.user_profiles?.contact_number || profile?.contact_number || profile?.phone || '';
                  const shipEmail = order.shipping_email || order.agency_patients?.email || order.user_profiles?.email || profile?.email || '';

                  const isNet30 = order.payment_method === 'net_30';
                  let dueDateDisplay = '';
                  let isOverdue = false;

                  if (isNet30) {
                    const baseDate = new Date(order.created_at);
                    const dueDate = new Date(baseDate);
                    dueDate.setDate(dueDate.getDate() + 30);
                    dueDateDisplay = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    isOverdue = order.payment_status === 'unpaid' && !['cancelled', 'restocked', 'attempted'].includes(order.status) && new Date() > dueDate;
                  }

                  // 🚀 DYNAMIC CALCULATIONS FOR ROW AND SUMMARY
                  // The DB already holds the exact final Net Subtotal, Final Tax, and Final Total. 
                  const rejectedItemsSum = order.order_items?.filter(item => item.status === 'cancelled' || item.status === 'rejected').reduce((sum, item) => sum + (Number(item.line_total) || 0), 0) || 0;
                  const grossSubtotal = order.order_items?.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0) || 0;
                  const finalTax = Number(order.tax_amount || 0);
                  const finalTotal = Number(order.total_amount || 0);
                  
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
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Calendar size={10}/> at {format12hr(order.created_at)}</p>
                        </td>
                        
                        <td className="px-6 py-4">
                          <p className={`font-extrabold text-base ${['cancelled', 'restocked', 'attempted'].includes(order.status) ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                            ${finalTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-start gap-1">
                            {getPaymentStatusBadge(order.payment_status, order.status)}
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                              <CreditCard size={10} /> {order.payment_method.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-start gap-1.5">
                            {getStatusBadge(order.status)}
                            
                            {['delivered', 'delivered_partial'].includes(order.status) && (order.delivered_at || order.updated_at) && (
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                                <CheckCircle2 size={10} /> {new Date(order.delivered_at || order.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {format12hr(order.delivered_at || order.updated_at)}
                              </span>
                            )}
                            
                            {['cancelled', 'restocked'].includes(order.status) && (order.cancelled_at || order.updated_at) && (
                              <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                                <XCircle size={10} /> {order.status === 'restocked' ? 'Returned' : 'Cancelled'} on {new Date(order.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {format12hr(order.updated_at)}
                              </span>
                            )}

                            {order.status === 'attempted' && order.updated_at && (
                              <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                                <AlertTriangle size={10} /> Attempted on {new Date(order.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {format12hr(order.updated_at)}
                              </span>
                            )}

                            {['processing', 'ready_for_delivery', 'shipped', 'out_for_delivery'].includes(order.status) && (
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                                <Clock size={10} /> Updated at {format12hr(order.shipped_at || order.processing_at || order.updated_at)}
                              </span>
                            )}

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
                              
                              {['cancelled', 'attempted', 'restocked'].includes(order.status) && order.cancellation_reason && (
                                <div className={`mb-6 p-4 border rounded-2xl flex items-start gap-3 shadow-sm ${order.status === 'attempted' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                                  <AlertTriangle size={20} className={`${order.status === 'attempted' ? 'text-amber-600' : 'text-red-600'} mt-0.5 shrink-0`} />
                                  <div>
                                    <h4 className={`text-sm font-black tracking-tight ${order.status === 'attempted' ? 'text-amber-900' : 'text-red-900'}`}>
                                      {order.status === 'restocked' ? 'Order Returned' : order.status === 'attempted' ? 'Delivery Attempted (Failed)' : 'Order Cancelled'}
                                    </h4>
                                    <p className={`text-sm mt-1 font-medium leading-relaxed ${order.status === 'attempted' ? 'text-amber-700' : 'text-red-700'}`}>
                                      {order.cancellation_reason}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {hasAdjustments && !['cancelled', 'attempted', 'restocked'].includes(order.status) && (
                                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 shadow-sm">
                                  <AlertCircle size={20} className="text-amber-600 mt-0.5 shrink-0" />
                                  <div>
                                    <h4 className="text-sm font-black text-amber-900 tracking-tight">Order Adjusted</h4>
                                    <p className="text-sm text-amber-700 mt-1 font-medium leading-relaxed">Some items in this order were cancelled or rejected at delivery. Please review your updated totals below.</p>
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 space-y-6">
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* BILL TO CARD */}
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-slate-300 transition-colors">
                                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><CreditCard size={14}/> Bill To</h4>
                                      <p className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2">
                                        <User size={16} className="text-slate-400"/> {billName}
                                      </p>
                                      <div className="space-y-2 text-sm font-medium text-slate-600">
                                        <div className="flex flex-col gap-1.5 text-xs text-slate-500">
                                          {billEmail && <p className="flex items-center gap-2"><Mail size={14} className="text-slate-400"/> {billEmail}</p>}
                                          {billPhone && <p className="flex items-center gap-2"><Phone size={14} className="text-slate-400"/> {billPhone}</p>}
                                        </div>
                                        <div className="flex items-start gap-2 pt-2 border-t border-slate-100 mt-2">
                                          <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0"/>
                                          <div className="whitespace-normal leading-relaxed text-sm">
                                            <p>{billAddress}</p>
                                            {billCityState && <p>{billCityState}</p>}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* SHIP TO CARD */}
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-slate-300 transition-colors">
                                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Package size={14}/> Ship To</h4>
                                      <p className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2">
                                        <User size={16} className="text-slate-400"/> {shipName}
                                      </p>
                                      <div className="space-y-2 text-sm font-medium text-slate-600">
                                        <div className="flex flex-col gap-1.5 text-xs text-slate-500">
                                          {shipEmail && <p className="flex items-center gap-2"><Mail size={14} className="text-slate-400"/> {shipEmail}</p>}
                                          {shipPhone && <p className="flex items-center gap-2"><Phone size={14} className="text-slate-400"/> {shipPhone}</p>}
                                        </div>
                                        <div className="flex items-start gap-2 pt-2 border-t border-slate-100 mt-2">
                                          <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0"/>
                                          <div className="whitespace-normal leading-relaxed text-sm">
                                            <p>{shipAddress}</p>
                                            {shipCityState && <p>{shipCityState}</p>}
                                          </div>
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
                                        <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                                          <tr>
                                            <th className="px-5 py-3 font-bold w-full rounded-tl-2xl">Product</th>
                                            <th className="px-5 py-3 font-bold text-center">Qty</th>
                                            <th className="px-5 py-3 font-bold text-right rounded-tr-2xl">Total</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {order.order_items?.map((item) => {
                                            const isItemCancelled = item.status?.toLowerCase() === 'cancelled';
                                            const isItemRejected = item.status?.toLowerCase() === 'rejected';
                                            const isVoided = isItemCancelled || isItemRejected;

                                            return (
                                              <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${isVoided ? 'opacity-60 bg-slate-50/50' : ''}`}>
                                                <td className="px-5 py-4">
                                                  <p className={`font-bold text-slate-900 leading-snug ${isVoided ? 'line-through text-slate-500' : ''}`}>
                                                    {item.product_variants?.products?.name || item.product_variants?.name || 'Product'}
                                                  </p>
                                                  <p className="text-xs text-slate-500 mt-1 font-medium">Variant: <span className="text-slate-700">{item.product_variants?.name}</span> <span className="mx-1.5 text-slate-300">|</span> SKU: <span className="font-mono text-slate-600">{item.product_variants?.products?.base_sku || item.product_variants?.sku}</span></p>
                                                  
                                                  {isItemCancelled && (
                                                    <p className="text-[10px] text-red-600 font-bold mt-1.5 uppercase tracking-widest flex items-center gap-1">
                                                      <XCircle size={10} /> Cancelled: {item.cancellation_reason || 'Out of stock'}
                                                    </p>
                                                  )}
                                                  {isItemRejected && (
                                                    <p className="text-[10px] text-orange-600 font-bold mt-1.5 uppercase tracking-widest flex items-center gap-1">
                                                      <XCircle size={10} /> Rejected at Delivery
                                                    </p>
                                                  )}
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                  <span className={`px-2.5 py-1 font-bold rounded-lg border shadow-sm ${isVoided ? 'bg-slate-100 text-slate-400 border-slate-200 line-through' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                                    {item.quantity_variants}
                                                  </span>
                                                </td>
                                                <td className={`px-5 py-4 text-right font-extrabold ${isVoided ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                                  ${Number(item.line_total).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-6">
                                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2">
                                      <DollarSign size={16} className="text-slate-400" /> Summary
                                    </h4>
                                    <div className="space-y-3 text-sm font-medium">
                                      <div className="flex justify-between text-slate-500">
                                        <span>Subtotal (Gross)</span>
                                        <span className="text-slate-900">${grossSubtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                      </div>

                                      {rejectedItemsSum > 0 && (
                                        <div className="flex justify-between text-red-500 font-bold">
                                          <span>Adjustments</span>
                                          <span>-${rejectedItemsSum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                        </div>
                                      )}

                                      <div className="flex justify-between text-slate-500"><span>Shipping</span><span className="text-slate-900">${Number(order.shipping_amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
                                      <div className="flex justify-between text-slate-500"><span>Tax</span><span className="text-slate-900">${finalTax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
                                      
                                      <div className="h-px w-full bg-slate-200/60 my-2"></div>
                                      
                                      <div className="flex justify-between items-end">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Grand Total</span>
                                        <span className={`text-2xl font-extrabold tracking-tight leading-none ${['cancelled', 'restocked', 'attempted'].includes(order.status) ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                          ${finalTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                        </span>
                                      </div>
                                    </div>
                                    
                                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                                      <div className="flex items-center gap-2">
                                        <CreditCard size={14} className="text-slate-400 shrink-0" />
                                        <span className="font-bold text-slate-700 capitalize">{order.payment_method.replace('_', ' ')}</span>
                                      </div>
                                      {getPaymentStatusBadge(order.payment_status, order.status)}
                                    </div>

                                    {isNet30 && (
                                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Due Date</span>
                                        <span className={`text-xs font-bold px-2 py-1 rounded shadow-sm border ${
                                          isOverdue 
                                            ? 'bg-red-50 text-red-700 border-red-200' 
                                            : ['delivered', 'delivered_partial'].includes(order.status) ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                                        }`}>
                                          {dueDateDisplay}
                                        </span>
                                      </div>
                                    )}

                                    {['delivered', 'delivered_partial'].includes(order.status) && (
                                      <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                                        {order.payment_status === 'paid' ? (
                                          <button onClick={() => generatePDF(order, 'receipt')} className="w-full py-3 bg-emerald-600 border border-emerald-600 text-white text-sm font-bold rounded-xl shadow-md hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                                            <CheckCircle2 size={16} /> Download Receipt
                                          </button>
                                        ) : (
                                          <button onClick={() => generatePDF(order, 'invoice')} className="w-full py-3 bg-white border border-slate-200 text-slate-900 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center gap-2">
                                            <FileDown size={16} className="text-slate-400" /> Download Invoice
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {['ready_for_delivery', 'shipped', 'delivered', 'delivered_partial', 'attempted', 'restocked'].includes(order.status) && order.driver_name && (
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
                                            <p className="font-medium text-blue-600 flex items-center gap-1.5 hover:text-blue-700 transition-colors">
                                              <Phone size={14} className="text-slate-400"/> 
                                              <a href={`tel:${displayDriverPhone.replace(/[^0-9+]/g, '')}`} className="underline underline-offset-2">
                                                {displayDriverPhone}
                                              </a>
                                            </p>
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

                                  {['delivered', 'delivered_partial'].includes(order.status) && (order.photo_url || order.signature_url || order.received_by) && (
                                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                      <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2">
                                        <PackageCheck size={16} className="text-slate-400" /> Proof of Delivery
                                      </h4>

                                      {order.received_by && (
                                        <div className="mb-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Received By</p>
                                          <p className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                                            <User size={14} className="text-emerald-500" /> {order.received_by}
                                          </p>
                                        </div>
                                      )}

                                      <div className="grid grid-cols-2 gap-3">
                                        {order.photo_url && (
                                          <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Photo</p>
                                            <a href={order.photo_url} target="_blank" rel="noreferrer" className="block relative group rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50">
                                              <img src={order.photo_url} alt="Delivery Proof" className="w-full h-24 object-cover group-hover:scale-105 transition-transform duration-300" />
                                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                                            </a>
                                          </div>
                                        )}
                                        {order.signature_url && (
                                          <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Signature</p>
                                            <a href={order.signature_url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 bg-white p-2 hover:border-slate-300 transition-colors shadow-sm">
                                              <img src={order.signature_url} alt="Customer Signature" className="w-full h-20 object-contain mix-blend-multiply" />
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

          {totalCount > pageSize && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-3xl">
              <span className="text-sm font-medium text-slate-500">
                Showing <span className="font-bold text-slate-900">{page * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> orders
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
                  disabled={(page + 1) * pageSize >= totalCount} 
                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
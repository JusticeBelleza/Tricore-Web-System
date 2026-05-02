import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { 
  Search, Package, CheckCircle2, Truck, FileDown, 
  CheckSquare, Square, Box, ChevronDown, Hash, Calendar, MapPin, User, Phone, Mail, Car,
  ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, XCircle, RefreshCw, ArrowRightCircle, RotateCcw
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function Warehouse() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  const [page, setPage] = useState(0);
  const pageSize = 20;
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState('processing'); 
  
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [pickedItems, setPickedItems] = useState({});
  
  const [confirmReady, setConfirmReady] = useState({ show: false, orderId: null });
  const [confirmRestock, setConfirmRestock] = useState({ show: false, order: null });
  const [confirmReattempt, setConfirmReattempt] = useState({ show: false, orderId: null });

  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(0); }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    setPage(0);
    setExpandedOrderId(null);
    setPickedItems({});
  }, [activeTab]);

  const { data: drivers = [] } = useQuery({
    queryKey: ['warehouse_drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_profiles').select('full_name, contact_number').eq('role', 'driver');
      if (error) throw error;
      return data || [];
    },
    staleTime: Infinity,
  });

  const { data: tabCounts = { processing: 0, completed: 0, returns: 0 } } = useQuery({
    queryKey: ['warehouse_tab_counts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_warehouse_tab_counts');
      if (error) {
        console.error("RPC Error:", error);
        return { processing: 0, completed: 0, returns: 0 };
      }
      return data;
    },
    enabled: !!profile?.id,
    refetchInterval: 60000, 
  });

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['warehouse_orders', activeTab, page, debouncedSearch],
    queryFn: async () => {
      let query = supabase.from('orders').select(`
          *, 
          companies ( name, address, city, state, zip, phone, email ), 
          agency_patients ( contact_number, email ),
          user_profiles ( contact_number, email ),
          order_items ( id, product_variant_id, quantity_variants, total_base_units, unit_price, line_total, status, product_variants ( product_id, name, sku, multiplier, products ( name ) ) )
        `);

      if (activeTab === 'processing') query = query.eq('status', 'processing');
      else if (activeTab === 'returns') query = query.in('status', ['attempted', 'delivered_partial']).is('is_restocked', false);
      else query = query.in('status', ['ready_for_delivery', 'shipped']);

      if (debouncedSearch) query = query.ilike('shipping_name', `%${debouncedSearch}%`);

      query = query.order('updated_at', { ascending: false });
      
      const from = page * pageSize; 
      const to = from + pageSize;
      query = query.range(from, to);

      const { data, error } = await query;
      if (error) throw error;
      
      return data || [];
    },
    placeholderData: keepPreviousData,
    enabled: !!profile?.id,
  });

  const hasNextPage = ordersData && ordersData.length > pageSize;
  const displayOrders = ordersData ? ordersData.slice(0, pageSize) : [];

  useEffect(() => {
    if (!profile?.id) return;
    
    let debounceTimer;
    
    const sub = supabase.channel('warehouse_orders_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['warehouse_orders'] });
          queryClient.invalidateQueries({ queryKey: ['warehouse_tab_counts'] });
        }, 500);
      }).subscribe();
      
    return () => { 
      clearTimeout(debounceTimer);
      supabase.removeChannel(sub); 
    };
  }, [profile?.id, queryClient]);

  const markAsReadyMutation = useMutation({
    mutationFn: async (orderId) => {
      const { error } = await supabase.from('orders').update({ status: 'ready_for_delivery', updated_at: new Date().toISOString() }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order packed and moved to dispatch!");
      queryClient.invalidateQueries({ queryKey: ['warehouse_orders'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse_tab_counts'] });
      if (activeTab === 'processing') setExpandedOrderId(null);
    },
    onError: (err) => toast.error(`Failed to mark as ready: ${err.message}`)
  });

  const reattemptMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('orders').update({ status: 'ready_for_delivery', updated_at: new Date().toISOString() }).eq('id', confirmReattempt.orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order rescheduled for delivery.");
      queryClient.invalidateQueries({ queryKey: ['warehouse_orders'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse_tab_counts'] });
      setConfirmReattempt({ show: false, orderId: null });
      setExpandedOrderId(null);
    },
    onError: (err) => toast.error(`Failed to reschedule delivery: ${err.message}`)
  });

  const restockMutation = useMutation({
    mutationFn: async () => {
      const { order } = confirmRestock;
      
      const { error } = await supabase.rpc('process_warehouse_restock', {
        p_order_id: order.id
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse_orders'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse_tab_counts'] });
      setConfirmRestock({ show: false, order: null });
      setExpandedOrderId(null);
      toast.success("Inventory correctly restocked!");
    },
    onError: (error) => toast.error(`Failed to process restock: ${error.message}`)
  });

  const getDisplayName = (order) => {
    if (order.companies?.name) return order.patient_name ? `${order.companies.name} - ${order.patient_name}` : order.companies.name;
    return order.shipping_name || order.customer_name || 'Retail Customer';
  };

  const toggleOrderDetails = (orderId) => {
    if (expandedOrderId === orderId) setExpandedOrderId(null);
    else { setExpandedOrderId(orderId); setPickedItems({}); }
  };

  const togglePickItem = (itemId) => { setPickedItems(prev => ({ ...prev, [itemId]: !prev[itemId] })); };

  const toggleSelectAll = (activeItems, isAllPicked) => {
    const newPickedState = { ...pickedItems };
    activeItems.forEach(item => { newPickedState[item.id] = !isAllPicked; });
    setPickedItems(newPickedState);
  };

  const getBase64ImageFromUrl = (imageUrl) => {
    return new Promise((resolve) => {
      const img = new Image(); img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
        resolve({ dataURL: canvas.toDataURL("image/png"), width: img.width, height: img.height });
      };
      img.onerror = () => resolve(null); img.src = imageUrl;
    });
  };

  const generatePackingSlip = async (order) => {
    const doc = new jsPDF();
    const orderNum = order.id.substring(0, 8).toUpperCase();
    const datePacked = new Date(order.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const logoData = await getBase64ImageFromUrl('/images/tricore-logo2.png');
    if (logoData) {
      const imgWidth = 45; const imgHeight = (logoData.height * imgWidth) / logoData.width; 
      doc.addImage(logoData.dataURL, 'PNG', 14, 12, imgWidth, imgHeight); 
    } else {
      doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.text("TRICORE MEDICAL SUPPLY", 14, 20);
    }
    
    doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.text("PACKING SLIP", 140, 18);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(`Order #: ${orderNum}`, 140, 24); doc.text(`Date: ${datePacked}`, 140, 29);

    const isB2B = !!order.company_id;
    const billName = isB2B ? (order.companies?.name || 'Agency') : (order.shipping_name || 'Retail Customer');
    const billAddress = isB2B ? (order.companies?.address || 'No billing address provided') : (order.shipping_address || 'No billing address provided');
    const billCityState = isB2B ? (`${order.companies?.city || ''}, ${order.companies?.state || ''} ${order.companies?.zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '')) : (`${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, ''));
    const billPhone = isB2B ? (order.companies?.phone || '') : (order.user_profiles?.contact_number || '');
    const billEmail = isB2B ? (order.companies?.email || '') : (order.user_profiles?.email || '');

    const shipName = order.shipping_name || billName;
    const shipAddress = order.shipping_address || 'No shipping address provided';
    const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');
    const shipPhone = order.agency_patients?.contact_number || order.user_profiles?.contact_number || '';
    const shipEmail = order.agency_patients?.email || order.user_profiles?.email || '';

    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("SHIP TO", 14, 45); doc.text("BILL TO", 110, 45);
    
    let currentYShip = 52; doc.setFont("helvetica", "bold"); doc.text(shipName, 14, currentYShip); currentYShip += 5; doc.setFont("helvetica", "normal");
    if (shipAddress && shipAddress !== 'No shipping address provided') { doc.text(shipAddress, 14, currentYShip); currentYShip += 5; }
    if (shipCityState) { doc.text(shipCityState, 14, currentYShip); currentYShip += 5; }
    if (shipPhone) { doc.text(`Phone: ${shipPhone}`, 14, currentYShip); currentYShip += 5; }
    if (shipEmail) { doc.text(`Email: ${shipEmail}`, 14, currentYShip); currentYShip += 5; }

    let currentYBill = 52; doc.setFont("helvetica", "bold"); doc.text(billName, 110, currentYBill); currentYBill += 5; doc.setFont("helvetica", "normal");
    if (billAddress && billAddress !== 'No billing address provided') { doc.text(billAddress, 110, currentYBill); currentYBill += 5; }
    if (billCityState) { doc.text(billCityState, 110, currentYBill); currentYBill += 5; }
    if (billPhone) { doc.text(`Phone: ${billPhone}`, 110, currentYBill); currentYBill += 5; }
    if (billEmail) { doc.text(`Email: ${billEmail}`, 110, currentYBill); currentYBill += 5; }

    const maxAddressY = Math.max(currentYBill, currentYShip);

    const activeItems = order.order_items?.filter(item => item.status?.toLowerCase() !== 'cancelled' && item.status?.toLowerCase() !== 'rejected') || [];
    const tableRows = activeItems.map(item => [
      item.product_variants?.products?.name || item.product_variants?.name || 'Item',
      item.product_variants?.name || 'N/A', item.product_variants?.sku || 'N/A', `${item.quantity_variants} of ${item.quantity_variants}`
    ]);

    autoTable(doc, {
      startY: maxAddressY + 10, head: [["PRODUCT NAME", "VARIANT", "SKU", "QTY"]], body: tableRows, theme: 'striped', 
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 6, textColor: [15, 23, 42] }, 
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 45 }, 2: { cellWidth: 35 }, 3: { cellWidth: 25, halign: 'center', valign: 'middle', fontStyle: 'bold' } }
    });

    const finalY = doc.lastAutoTable.finalY || maxAddressY + 20;
    doc.setFont("helvetica", "bold"); doc.text("Signed by:", 14, finalY + 20); doc.setFont("helvetica", "normal"); doc.text("________________________________________", 14, finalY + 30);
    doc.setFont("helvetica", "bold"); doc.text("Delivered by:", 110, finalY + 20); doc.setFont("helvetica", "normal"); doc.text("________________________________________", 110, finalY + 30);

    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("Thank you for shopping with us!", 105, pageHeight - 30, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.text("TRICORE MEDICAL SUPPLY", 105, pageHeight - 24, { align: "center" });
    doc.text("2169 Harbor St, Pittsburg CA 94565, United States", 105, pageHeight - 19, { align: "center" });
    doc.text("info@tricoremedicalsupply.com", 105, pageHeight - 14, { align: "center" });
    doc.text("www.tricoremedicalsupply.com", 105, pageHeight - 9, { align: "center" });

    doc.save(`Packing_Slip_${orderNum}.pdf`);
  };

  const getStatusBadge = (status) => {
    const displayStatus = status === 'delivered_partial' ? 'delivered' : status;
    if (status === 'processing') return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><Package size={12}/> To Pack</span>;
    if (status === 'ready_for_delivery') return <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><Box size={12}/> Ready</span>;
    if (status === 'shipped') return <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><Truck size={12}/> Shipped</span>;
    if (status === 'attempted') return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><AlertTriangle size={12}/> Attempted</span>;
    if (status === 'delivered_partial' || status === 'delivered') return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><CheckCircle2 size={12}/> Delivered</span>;
    if (status === 'cancelled') return <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 w-fit shadow-sm"><XCircle size={12}/> Cancelled</span>;
    return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] uppercase tracking-widest font-bold border border-slate-200 shadow-sm">{displayStatus}</span>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md"><Package size={28} strokeWidth={1.5} /></div>
          <div><h2 className="text-3xl font-bold text-slate-900 tracking-tight">Pick & Pack</h2><p className="text-sm text-slate-500 mt-1 font-medium">Warehouse fulfillment queue and packing slip generation.</p></div>
        </div>

        <button 
          className="relative p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center shrink-0"
          title="View Returned Orders"
          onClick={() => setActiveTab('returns')}
        >
          <RotateCcw size={22} className="text-slate-700" />
          {tabCounts.returns > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-md border-2 border-white animate-in zoom-in">
              {tabCounts.returns}
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm w-full">
        <div className="w-full md:w-auto overflow-x-auto scrollbar-hide rounded-xl shrink-0">
          <div className="flex gap-2 p-1 bg-slate-100/50 border border-slate-200 w-max rounded-xl">
            <button onClick={() => setActiveTab('processing')} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'processing' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}><Package size={16}/> To Pack ({tabCounts.processing})</button>
            <button onClick={() => setActiveTab('completed')} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'completed' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}><CheckCircle2 size={16}/> Packed ({tabCounts.completed})</button>
            <button onClick={() => setActiveTab('returns')} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${activeTab === 'returns' ? 'bg-amber-600 text-white shadow-md' : 'text-amber-600 hover:bg-amber-50'}`}><RefreshCw size={16}/> Returns ({tabCounts.returns})</button>
          </div>
        </div>
        <div className="relative w-full md:w-80 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search Patient Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all" />
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="w-full h-14 bg-slate-50/80 border-b border-slate-200"></div>
          {[1,2,3,4,5].map(n => (<div key={n} className="w-full h-20 bg-white border-b border-slate-100 flex items-center px-6 gap-6 animate-pulse"><div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0"></div><div className="w-32 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-48 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-24 h-6 bg-slate-100 rounded-lg shrink-0 ml-auto"></div></div>))}
        </div>
      ) : displayOrders.length === 0 ? (
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
              {displayOrders.map(order => {
                const isExpanded = expandedOrderId === order.id;
                const shortId = order.id.substring(0, 8).toUpperCase();
                const isB2B = !!order.company_id;
                const isOrderDone = order.status === 'ready_for_delivery' || order.status === 'shipped';
                
                const isReturn = activeTab === 'returns' && (order.status === 'attempted' || order.status === 'delivered_partial');
                
                let activeItems = [];
                if (activeTab === 'returns' && order.status === 'delivered_partial') {
                  // 🚀 THE FIX: Make sure the Returns tab shows both rejected AND successfully restocked items
                  activeItems = order.order_items?.filter(item => item.status?.toLowerCase() === 'rejected' || item.status?.toLowerCase() === 'restocked') || [];
                } else {
                  activeItems = order.order_items?.filter(item => item.status?.toLowerCase() !== 'cancelled') || [];
                }
                
                const currentPickedCount = isOrderDone ? activeItems.length : Object.values(pickedItems).filter(Boolean).length;
                const allItemsPicked = activeItems.length > 0 && activeItems.every(item => pickedItems[item.id]);
                
                const billName = order.companies?.name || 'Retail Customer';
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
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors shadow-sm ${isExpanded ? 'bg-slate-900 text-white border-slate-900' : isReturn ? (order.status === 'delivered_partial' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200') : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {isReturn ? <RefreshCw size={18} /> : <Box size={18} />}
                          </div>
                          <div><p className="font-mono font-bold text-slate-900 text-sm tracking-tight">{shortId}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Hash size={10}/> Order ID</p></div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><p className="font-medium text-slate-700">{new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Calendar size={10}/> Placed</p></td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{getDisplayName(order)}</p>
                        <span className={`inline-flex mt-1 px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-bold rounded shadow-sm ${isB2B ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>{isB2B ? 'B2B Agency' : 'Retail'}</span>
                      </td>
                      <td className="px-6 py-4 text-center"><span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-extrabold text-xs shadow-inner border border-slate-200">{activeItems.length}</span></td>
                      <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                      <td className="px-6 py-4 text-right"><button className={`p-1.5 rounded-lg transition-transform duration-200 ${isExpanded ? 'bg-slate-200 text-slate-900 rotate-180' : 'text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-900'}`}><ChevronDown size={20} /></button></td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50 shadow-inner">
                        <td colSpan="6" className="p-0 border-b border-slate-200">
                          <div className="p-6 sm:p-8 animate-in slide-in-from-top-2 fade-in duration-200">
                            
                            {isReturn && order.cancellation_reason && (
                              <div className={`mb-6 p-4 border rounded-2xl flex items-start gap-3 shadow-sm ${order.status === 'delivered_partial' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                                {order.status === 'delivered_partial' ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />}
                                <div>
                                  <h4 className={`text-sm font-black tracking-tight ${order.status === 'delivered_partial' ? 'text-emerald-900' : 'text-amber-900'}`}>
                                    {order.status === 'delivered_partial' ? 'Delivered (with rejected items)' : 'Delivery Attempted (Failed)'}
                                  </h4>
                                  <p className={`text-sm mt-1 font-medium leading-relaxed ${order.status === 'delivered_partial' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {order.cancellation_reason}
                                  </p>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              <div className="lg:col-span-2 space-y-4">
                                <div className="flex justify-between items-end mb-4 border-b border-slate-200 pb-2">
                                  <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider">
                                    <CheckSquare size={16} className="text-slate-400" /> 
                                    Items to {isReturn ? 'Restock' : 'Pick'}
                                  </h4>
                                  
                                  <div className="flex items-center gap-4">
                                    {!isReturn && <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{currentPickedCount} / {activeItems.length} Picked</span>}
                                    
                                    {order.status === 'processing' && activeItems.length > 0 && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); toggleSelectAll(activeItems, allItemsPicked); }}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold rounded-lg border shadow-sm transition-all active:scale-95 ${allItemsPicked ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
                                      >
                                        <CheckCircle size={14} className={allItemsPicked ? 'text-slate-400' : 'text-emerald-500'} />
                                        {allItemsPicked ? 'Deselect All' : 'Select All'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  {activeItems.length === 0 ? (
                                    <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                                      <p className="text-slate-500 font-medium">No items available for processing.</p>
                                    </div>
                                  ) : (
                                    activeItems.map(item => {
                                      const isPicked = pickedItems[item.id];
                                      const isDone = isOrderDone || isReturn; 
                                      
                                      // 🚀 THE FIX: This ensures restocked items are perfectly crossed out!
                                      const isItemRejected = item.status?.toLowerCase() === 'rejected' || item.status?.toLowerCase() === 'restocked';

                                      return (
                                        <div key={item.id} onClick={() => order.status === 'processing' && togglePickItem(item.id)} className={`flex items-center justify-between p-4 sm:px-5 sm:py-4 rounded-2xl border transition-all ${order.status === 'processing' ? 'cursor-pointer active:scale-[0.99]' : ''} ${isPicked || isDone ? (isReturn && isItemRejected ? 'bg-red-50/50 border-red-200 shadow-sm' : 'bg-slate-100 border-slate-200 shadow-sm') : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'}`}>
                                          <div className="flex items-center gap-4 sm:gap-5 flex-1 min-w-0 pr-4">
                                            {!isReturn && <div className={`shrink-0 transition-colors ${isPicked || isDone ? 'text-emerald-500' : 'text-slate-300'}`}>{isPicked || isDone ? <CheckSquare size={26} strokeWidth={2} /> : <Square size={26} strokeWidth={2} />}</div>}
                                            {isReturn && <div className={`shrink-0 ${isItemRejected ? 'text-red-400' : 'text-emerald-500'}`}>{isItemRejected ? <Package size={24} strokeWidth={1.5} /> : <CheckCircle2 size={24} strokeWidth={1.5} />}</div>}
                                            
                                            <div className="flex-1 min-w-0">
                                              <p className={`whitespace-normal font-bold leading-snug text-xs sm:text-sm transition-all ${isItemRejected ? 'line-through decoration-red-500 text-slate-400' : 'text-slate-900'} ${(!isItemRejected && (isPicked || isOrderDone)) ? 'text-slate-500' : ''}`}>
                                                {item.product_variants?.products?.name || item.product_variants?.name || 'Item'}
                                              </p>
                                              <p className={`text-[10px] sm:text-xs font-mono mt-1 ${isItemRejected ? 'text-slate-300' : 'text-slate-500'}`}>SKU: {item.product_variants?.sku}</p>
                                            </div>
                                          </div>
                                          <div className={`text-center bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm shrink-0 ${isItemRejected ? 'opacity-60' : ''}`}>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Qty</p>
                                            <p className={`text-lg font-extrabold leading-none ${isItemRejected ? 'text-slate-400 line-through decoration-red-500' : (isPicked || isOrderDone ? 'text-emerald-700' : 'text-slate-900')}`}>
                                              {item.quantity_variants}
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
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

                                {(isOrderDone || isReturn) && order.driver_name && (
                                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2"><Truck size={16} className="text-slate-400" /> Dispatch Info</h4>
                                    <div className="space-y-3 text-sm">
                                      <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Assigned Driver</p><p className="font-bold text-slate-900 flex items-center gap-1.5"><User size={14} className="text-slate-400"/> {displayDriverName}</p></div>
                                      {displayDriverPhone && <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Contact Number</p><p className="font-medium text-slate-600 flex items-center gap-1.5"><Phone size={14} className="text-slate-400"/> {displayDriverPhone}</p></div>}
                                      <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Vehicle</p><p className="font-medium text-slate-700 flex items-center gap-1.5"><Car size={14} className="text-slate-400"/> {order.vehicle_name || 'Assigned Vehicle'}</p></div>
                                      {order.vehicle_license && <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">License Plate</p><p className="font-mono font-bold text-slate-700 flex items-center gap-1.5"><Hash size={14} className="text-slate-400"/> {order.vehicle_license}</p></div>}
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-3">
                                  {order.status === 'processing' && (
                                    <button 
                                      onClick={() => setConfirmReady({ show: true, orderId: order.id })} 
                                      disabled={!allItemsPicked || activeItems.length === 0 || markAsReadyMutation.isPending} 
                                      className={`w-full py-4 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md ${allItemsPicked && activeItems.length > 0 ? 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                    >
                                      <Box size={18} /> {markAsReadyMutation.isPending ? 'Processing...' : (allItemsPicked && activeItems.length > 0 ? 'Mark as Ready for Delivery' : 'Pick all items to continue')}
                                    </button>
                                  )}

                                  {isReturn && (
                                    <div className="flex flex-col gap-3">
                                      {order.status !== 'delivered_partial' && (
                                        <button 
                                          onClick={() => setConfirmReattempt({ show: true, orderId: order.id })}
                                          className="w-full py-4 text-sm bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-md"
                                        >
                                          <ArrowRightCircle size={18} className="text-blue-200"/> Re-Attempt Delivery
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => setConfirmRestock({ show: true, order: order })} 
                                        className="w-full py-4 text-sm bg-slate-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-95 transition-all shadow-md"
                                      >
                                        <RefreshCw size={18} className="text-slate-400"/> Mark as Restocked
                                      </button>
                                    </div>
                                  )}
                                  
                                  {isOrderDone && (
                                    <button onClick={() => generatePackingSlip(order)} className="w-full py-4 text-sm bg-white border border-slate-200 text-slate-900 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all shadow-sm">
                                      <FileDown size={18} className="text-slate-400"/> Print Packing Slip
                                    </button>
                                  )}
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

      {/* 🚀 ULTIMATE INFINITE PAGINATION UI */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-3xl">
        <span className="text-sm font-medium text-slate-500">
          Page {page + 1}: {(page * pageSize) + 1}-{page * pageSize + displayOrders.length}
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

      {/* MODALS */}
      {confirmReady.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-100 shadow-sm"><Box size={32} /></div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">Ready for Delivery?</h4><p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">Confirming this will clear the order from the packing queue and mark it ready for driver dispatch.</p>
            <div className="flex gap-3 pt-5"><button onClick={() => setConfirmReady({ show: false, orderId: null })} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">Cancel</button><button onClick={() => { markAsReadyMutation.mutate(confirmReady.orderId); setConfirmReady({ show: false, orderId: null }); }} className="w-full py-3.5 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md bg-slate-900 hover:bg-slate-800">Confirm Ready</button></div>
          </div>
        </div>
      )}

      {confirmReattempt.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-sm"><Truck size={32} /></div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">Re-Attempt Delivery?</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">This will push the order back into the dispatch queue for a driver to deliver. Inventory will remain packed.</p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => setConfirmReattempt({ show: false, orderId: null })} disabled={reattemptMutation.isPending} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">Cancel</button>
              <button onClick={() => reattemptMutation.mutate()} disabled={reattemptMutation.isPending} className="w-full py-3.5 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed">
                {reattemptMutation.isPending ? 'Loading...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRestock.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-100 shadow-sm"><RefreshCw size={32} /></div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">Restock Items?</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">Confirming this will update the system inventory and clear these items from the returns queue.</p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => setConfirmRestock({ show: false, order: null })} disabled={restockMutation.isPending} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">Cancel</button>
              <button onClick={() => restockMutation.mutate()} disabled={restockMutation.isPending} className="w-full py-3.5 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md bg-slate-900 hover:bg-slate-800 disabled:opacity-70 disabled:cursor-not-allowed">
                {restockMutation.isPending ? 'Restocking...' : 'Confirm Restock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
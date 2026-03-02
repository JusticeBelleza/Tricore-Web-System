import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Package, CheckCircle2, Truck, FileDown, X, CheckSquare, Square, Box, Clock } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Warehouse() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('processing'); 
  const [viewingOrder, setViewingOrder] = useState(null);
  const [pickedItems, setPickedItems] = useState({});
  const [confirmReady, setConfirmReady] = useState({ show: false, orderId: null });

  useEffect(() => {
    fetchWarehouseOrders();
  }, []);

  const fetchWarehouseOrders = async () => {
    setLoading(true);
    try {
      // FIXED: Added address, city, state, zip to the companies select query!
      const { data, error } = await supabase
        .from('orders')
        .select(`*, companies ( name, address, city, state, zip ), order_items ( id, quantity_variants, unit_price, line_total, product_variants ( name, sku ) )`)
        .in('status', ['processing', 'ready_for_delivery', 'shipped']) 
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
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
    return order.customer_name || 'Retail Customer';
  };

  const openOrderModal = (order) => { setViewingOrder(order); setPickedItems({}); };
  const togglePickItem = (itemId) => { setPickedItems(prev => ({ ...prev, [itemId]: !prev[itemId] })); };

  const markAsReady = async (orderId) => {
    try {
      const { error } = await supabase.from('orders').update({ status: 'ready_for_delivery' }).eq('id', orderId);
      if (error) throw error;
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'ready_for_delivery' } : o));
      if (viewingOrder && viewingOrder.id === orderId) setViewingOrder({ ...viewingOrder, status: 'ready_for_delivery' });
    } catch (error) { alert('Failed to mark as ready.'); }
  };

  // --- NEW CUSTOM PACKING SLIP PDF GENERATION ---
  const generatePackingSlip = (order) => {
    const doc = new jsPDF();
    const orderNum = order.id.substring(0, 8).toUpperCase();
    
    // Format Date like "March 2, 2026"
    const dateObj = new Date(order.created_at);
    const datePacked = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // 1. Header Area
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42); 
    doc.text("TriCore MEDICAL SUPPLY", 14, 22);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Order #${orderNum}`, 150, 20);
    doc.text(datePacked, 150, 26);

    // 2. Addresses Area
    const contactName = order.patient_name || order.customer_name || 'Retail Customer';
    const companyName = order.companies?.name || '';
    const addressLine1 = order.companies?.address || '';
    const addressLine2 = order.companies ? `${order.companies.city || ''} ${order.companies.state || ''} ${order.companies.zip || ''}`.trim() : '';

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("SHIP TO", 14, 40);
    doc.text("BILL TO", 110, 40);

    doc.setFont("helvetica", "normal");
    
    // Filter out any empty lines so there aren't awkward gaps
    const addressLines = [
      contactName,
      companyName,
      addressLine1,
      addressLine2,
      addressLine2 ? "United States" : ""
    ].filter(Boolean);

    let currentY = 46;
    addressLines.forEach(line => {
      doc.text(line, 14, currentY); // Ship To
      doc.text(line, 110, currentY); // Bill To (Assuming same for B2B)
      currentY += 5;
    });

    // 3. Items Table
    // Formatting rows to match the reference document: Name \n SKU format
    const tableRows = order.order_items.map(item => [
      `${item.product_variants?.name || 'Item'}\nSKU: ${item.product_variants?.sku || 'N/A'}`,
      `${item.quantity_variants} of ${item.quantity_variants}`
    ]);

    autoTable(doc, {
      startY: currentY + 10,
      head: [["ITEMS", "QUANTITY"]],
      body: tableRows,
      theme: 'plain', // A clean, unbordered look like typical packing slips
      headStyles: { fontStyle: 'bold', textColor: [0, 0, 0], fillColor: [245, 245, 245] },
      styles: { fontSize: 10, cellPadding: 5 },
      columnStyles: {
        0: { cellWidth: 140 }, // Wide column for item names
        1: { cellWidth: 40, halign: 'center' } // Narrow column for quantity
      }
    });

    const finalY = doc.lastAutoTable.finalY || currentY + 10;

    // 4. Signatures
    doc.setFont("helvetica", "normal");
    doc.text("Signed by: _________________________________", 14, finalY + 20);
    doc.text("Delivered by: _________________________________", 14, finalY + 30);

    // 5. Footer (Centered at the bottom of the page)
    const pageHeight = doc.internal.pageSize.height;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Thank you for shopping with us!", 105, pageHeight - 30, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.text("Tricore Medical Supply", 105, pageHeight - 24, { align: "center" });
    doc.text("2169 Harbor St, Pittsburg CA 94565, United States", 105, pageHeight - 19, { align: "center" });
    doc.text("info@tricoremedicalsupply.com | www.tricoremedicalsupply.com", 105, pageHeight - 14, { align: "center" });

    doc.save(`Packing_Slip_${orderNum}.pdf`);
  };

  const displayedOrders = orders.filter(o => {
    const isCorrectTab = activeTab === 'processing' ? o.status === 'processing' : (o.status === 'ready_for_delivery' || o.status === 'shipped');
    const matchesSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase()) || getDisplayName(o).toLowerCase().includes(searchTerm.toLowerCase());
    return isCorrectTab && matchesSearch;
  });

  const allItemsPicked = viewingOrder?.order_items?.every(item => pickedItems[item.id]) || false;

  const getStatusBadge = (status) => {
    if (status === 'processing') return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1.5 w-fit"><Package size={12}/> To Pack</span>;
    if (status === 'ready_for_delivery') return <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold flex items-center gap-1.5 w-fit"><Box size={12}/> Ready</span>;
    if (status === 'shipped') return <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold flex items-center gap-1.5 w-fit"><Truck size={12}/> Shipped</span>;
    return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">{status}</span>;
  };

  if (loading) return <div className="text-slate-500 font-medium">Loading warehouse queue...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div><h2 className="text-3xl font-bold text-slate-900 tracking-tight">Pick & Pack</h2><p className="text-sm text-slate-500 mt-2">Warehouse fulfillment queue and packing slips.</p></div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-50 rounded-xl border border-slate-100 w-full md:w-auto">
          <button onClick={() => setActiveTab('processing')} className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'processing' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>To Pack ({orders.filter(o=>o.status==='processing').length})</button>
          <button onClick={() => setActiveTab('completed')} className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'completed' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>Packed ({orders.filter(o=>o.status==='ready_for_delivery' || o.status === 'shipped').length})</button>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search Order ID or Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 outline-none text-sm font-medium transition-all" />
        </div>
      </div>

      {displayedOrders.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-100 shadow-sm mt-6">
          <Package size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">Queue is empty</h3>
          <p className="text-slate-500 text-sm">There are no orders in this list right now.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-bold tracking-tight">Order ID</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Date</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Customer</th>
                  <th className="px-6 py-4 font-bold tracking-tight text-center">Items</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Status</th>
                  <th className="px-6 py-4 font-bold tracking-tight text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayedOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/50 group transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{order.id.substring(0, 8).toUpperCase()}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{getDisplayName(order)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                        {order.order_items?.length || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => openOrderModal(order)} 
                        title={activeTab === 'processing' ? 'Pick & Pack Order' : 'View & Download Slip'}
                        className={`p-2.5 rounded-xl transition-all shadow-sm inline-flex items-center justify-center ml-auto ${activeTab === 'processing' ? 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95' : 'bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 active:scale-95'}`}
                      >
                        {activeTab === 'processing' ? <Package size={16} /> : <FileDown size={16} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order #{viewingOrder.id.substring(0, 8).toUpperCase()}</p>
                  {(viewingOrder.status === 'ready_for_delivery' || viewingOrder.status === 'shipped') && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded-md">Packed</span>}
                </div>
                <h3 className="text-2xl font-bold text-slate-900">{getDisplayName(viewingOrder)}</h3>
              </div>
              <button onClick={() => setViewingOrder(null)} className="p-2 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-full"><X size={18} /></button>
            </div>
            <div className="p-8 overflow-y-auto flex-1 bg-white">
              <div className="flex justify-between items-end mb-4"><h4 className="text-sm font-bold text-slate-900">Items to Pick</h4></div>
              <div className="space-y-3">
                {viewingOrder.order_items?.map(item => {
                  const isPicked = pickedItems[item.id];
                  const isDone = viewingOrder.status === 'ready_for_delivery' || viewingOrder.status === 'shipped';
                  return (
                    <div key={item.id} onClick={() => viewingOrder.status === 'processing' && togglePickItem(item.id)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${viewingOrder.status === 'processing' ? 'cursor-pointer' : ''} ${isPicked || isDone ? 'bg-green-50/50 border-green-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex items-center gap-4">
                        {viewingOrder.status === 'processing' && <div className={isPicked ? 'text-green-600' : 'text-slate-300'}>{isPicked ? <CheckSquare size={24} /> : <Square size={24} />}</div>}
                        <div><p className={`font-bold text-slate-900 ${isPicked || isDone ? 'line-through decoration-green-600/30' : ''}`}>{item.product_variants?.name || 'Item'}</p><p className="text-xs font-mono text-slate-500">SKU: {item.product_variants?.sku}</p></div>
                      </div>
                      <div className="text-center bg-white px-4 py-2 rounded-xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qty</p><p className="text-lg font-extrabold text-slate-900">{item.quantity_variants}</p></div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3 justify-end">
              {viewingOrder.status === 'processing' && (
                <button 
                  onClick={() => setConfirmReady({ show: true, orderId: viewingOrder.id })} 
                  disabled={!allItemsPicked} 
                  className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 active:scale-95 transition-all shadow-md"
                >
                  <Box size={18} /> {allItemsPicked ? 'Mark as Ready for Delivery' : 'Pick all items to continue'}
                </button>
              )}
              {(viewingOrder.status === 'ready_for_delivery' || viewingOrder.status === 'shipped') && (
                <button 
                  onClick={() => generatePackingSlip(viewingOrder)} 
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-md"
                >
                  <FileDown size={18} /> Download Packing Slip PDF
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR 'MARK AS READY' */}
      {confirmReady.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-100 shadow-sm">
              <Box size={32} />
            </div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">Ready for Delivery?</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
              Confirming this will mark the order as packed and ready for the driver to pick up.
            </p>
            <div className="flex gap-3 pt-5">
              <button 
                onClick={() => setConfirmReady({ show: false, orderId: null })} 
                className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  markAsReady(confirmReady.orderId);
                  setConfirmReady({ show: false, orderId: null });
                }} 
                className="w-full py-3 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md bg-slate-900 hover:bg-slate-800"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
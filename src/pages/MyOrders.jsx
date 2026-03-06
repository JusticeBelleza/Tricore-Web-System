import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  Package, Receipt, ChevronDown, Calendar, Hash, 
  CreditCard, DollarSign, Truck, FileText, ShoppingCart, User, Car, FileDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function MyOrders() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
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

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
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

  // --- DYNAMIC INVOICE PDF GENERATOR ---
  const generateInvoice = (order) => {
    const doc = new jsPDF();
    const orderNum = order.id.substring(0, 8).toUpperCase();
    const datePlaced = new Date(order.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Header
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42); 
    doc.text("INVOICE", 14, 22);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("TriCore MEDICAL SUPPLY", 14, 30);
    doc.text("2169 Harbor St, Pittsburg CA 94565", 14, 35);
    
    // Order Details Box
    doc.setFont("helvetica", "bold");
    doc.text(`Invoice #: INV-${orderNum}`, 140, 22);
    doc.setFont("helvetica", "normal");
    doc.text(`Date: ${datePlaced}`, 140, 28);
    doc.text(`Status: ${order.payment_status === 'paid' ? 'PAID' : 'UNPAID'}`, 140, 34);

    // Addresses
    doc.setFont("helvetica", "bold");
    doc.text("BILL TO:", 14, 50);
    doc.text("SHIP TO:", 110, 50);

    doc.setFont("helvetica", "normal");
    const billName = order.companies?.name || profile?.full_name || 'Retail Customer';
    const billAddress = order.companies?.address || 'N/A';
    const billCityState = order.companies ? `${order.companies.city || ''}, ${order.companies.state || ''} ${order.companies.zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '') : '';
    
    const shipName = order.shipping_name || billName;
    const shipAddress = order.shipping_address || 'N/A';
    const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');

    doc.text(billName, 14, 56);
    doc.text(billAddress, 14, 61);
    if (billCityState) doc.text(billCityState, 14, 66);

    doc.text(shipName, 110, 56);
    doc.text(shipAddress, 110, 61);
    if (shipCityState) doc.text(shipCityState, 110, 66);

    // Items Table
    const tableRows = order.order_items?.map(item => [
      `${item.product_variants?.products?.name || item.product_variants?.name || 'Item'}\nSKU: ${item.product_variants?.products?.base_sku || item.product_variants?.sku || 'N/A'}`,
      item.quantity_variants,
      `$${Number(item.unit_price || 0).toFixed(2)}`,
      `$${Number(item.line_total || 0).toFixed(2)}`
    ]) || [];

    autoTable(doc, {
      startY: 75,
      head: [["DESCRIPTION", "QTY", "UNIT PRICE", "TOTAL"]],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 5 },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      }
    });

    const finalY = doc.lastAutoTable.finalY || 80;

    // Totals
    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", 140, finalY + 10);
    doc.text(`$${Number(order.subtotal || 0).toFixed(2)}`, 180, finalY + 10, { align: 'right' });
    doc.text("Shipping:", 140, finalY + 16);
    doc.text(`$${Number(order.shipping_amount || 0).toFixed(2)}`, 180, finalY + 16, { align: 'right' });
    doc.text("Tax:", 140, finalY + 22);
    doc.text(`$${Number(order.tax_amount || 0).toFixed(2)}`, 180, finalY + 22, { align: 'right' });
    
    doc.setFont("helvetica", "bold");
    doc.text("Grand Total:", 140, finalY + 30);
    doc.text(`$${Number(order.total_amount || 0).toFixed(2)}`, 180, finalY + 30, { align: 'right' });

    // Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("Thank you for your business!", 105, pageHeight - 20, { align: "center" });

    doc.save(`Invoice_${orderNum}.pdf`);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      
      {/* Header */}
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
                
                return (
                  <React.Fragment key={order.id}>
                    {/* --- MAIN ROW --- */}
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
                        {getStatusBadge(order.status)}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button className={`p-1.5 rounded-lg transition-transform duration-200 ${isExpanded ? 'bg-slate-200 text-slate-900 rotate-180' : 'text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-900'}`}>
                          <ChevronDown size={20} />
                        </button>
                      </td>
                    </tr>

                    {/* --- EXPANDED DETAILS DRAWER --- */}
                    {isExpanded && (
                      <tr className="bg-slate-50 shadow-inner">
                        <td colSpan="6" className="p-0 border-b border-slate-200">
                          <div className="p-6 sm:p-8 animate-in slide-in-from-top-2 fade-in duration-200">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              
                              {/* Left: Line Items */}
                              <div className="lg:col-span-2 space-y-4">
                                <div className="flex justify-between items-center mb-2">
                                  <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider">
                                    <FileText size={16} className="text-slate-400" /> Order Items
                                  </h4>
                                </div>
                                
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

                              {/* Right: Financials & Delivery */}
                              <div className="space-y-6">
                                
                                {/* Summary Box */}
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

                                  <div className="pt-3 border-t border-slate-100">
                                    <button onClick={() => generateInvoice(order)} className="w-full py-3.5 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2">
                                      <FileDown size={16} /> Download Invoice PDF
                                    </button>
                                  </div>
                                </div>

                                {/* Dispatch Box (If assigned) */}
                                {(order.status === 'ready_for_delivery' || order.status === 'shipped' || order.status === 'out_for_delivery' || order.status === 'delivered') && order.driver_name && (
                                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider mb-2">
                                      <Truck size={16} className="text-slate-400" /> Delivery Details
                                    </h4>
                                    <div className="space-y-3 text-sm">
                                      <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Assigned Driver</p><p className="font-bold text-slate-900 flex items-center gap-1.5"><User size={14} className="text-slate-400"/> {order.driver_name}</p></div>
                                      <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Vehicle</p><p className="font-medium text-slate-700 flex items-center gap-1.5"><Car size={14} className="text-slate-400"/> {order.vehicle_name || 'Assigned Vehicle'}</p></div>
                                      {order.vehicle_license && <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">License Plate</p><p className="font-mono font-bold text-slate-700 flex items-center gap-1.5"><Hash size={14} className="text-slate-400"/> {order.vehicle_license}</p></div>}
                                    </div>
                                  </div>
                                )}

                                {/* Proof of Delivery (Only if Delivered) */}
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
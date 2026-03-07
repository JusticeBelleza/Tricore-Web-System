import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ClipboardList, Search, Plus, CheckCircle2, Clock, XCircle, 
  ChevronDown, FileText, Building, Calendar, DollarSign, 
  Trash2, X, FileDown, Mail, PackagePlus, Send
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function PurchaseOrders() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [expandedPoId, setExpandedPoId] = useState(null);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New PO Form State
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [poItems, setPoItems] = useState([
    { description: '', sku: '', quantity: 1, unit_cost: 0 }
  ]);

  useEffect(() => {
    fetchPOs();
  }, []);

  const fetchPOs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_order_items (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPurchaseOrders(data || []);
    } catch (error) {
      console.error('Error fetching POs:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- FORM LOGIC ---
  const handleAddItem = () => {
    setPoItems([...poItems, { description: '', sku: '', quantity: 1, unit_cost: 0 }]);
  };

  const handleRemoveItem = (index) => {
    const newItems = poItems.filter((_, i) => i !== index);
    setPoItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...poItems];
    newItems[index][field] = value;
    setPoItems(newItems);
  };

  const calculateTotal = () => {
    return poItems.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.unit_cost)), 0);
  };

  const submitNewPO = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // 1. Generate a PO Number (e.g. PO-20231015-XYZ)
      const poNumber = `PO-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const totalAmount = calculateTotal();

      // 2. Insert PO Header
      const { data: newPo, error: poError } = await supabase
        .from('purchase_orders')
        .insert([{
          po_number: poNumber,
          supplier_name: supplierName,
          supplier_email: supplierEmail,
          expected_delivery: expectedDelivery || null,
          total_amount: totalAmount,
          notes: notes,
          status: 'pending'
        }])
        .select()
        .single();

      if (poError) throw poError;

      // 3. Insert PO Items
      const itemsToInsert = poItems.map(item => ({
        po_id: newPo.id,
        description: item.description,
        sku: item.sku,
        quantity: Number(item.quantity),
        unit_cost: Number(item.unit_cost),
        line_total: Number(item.quantity) * Number(item.unit_cost)
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // 4. Cleanup & Refresh
      closeModal();
      fetchPOs();
    } catch (error) {
      alert(`Failed to create PO: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setSupplierName('');
    setSupplierEmail('');
    setExpectedDelivery('');
    setNotes('');
    setPoItems([{ description: '', sku: '', quantity: 1, unit_cost: 0 }]);
  };

  // --- ACTION LOGIC ---
  const updatePoStatus = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setPurchaseOrders(purchaseOrders.map(po => po.id === id ? { ...po, status: newStatus } : po));
    } catch (error) {
      alert(`Failed to update status: ${error.message}`);
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
        resolve({ dataURL: canvas.toDataURL("image/png"), width: img.width, height: img.height });
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    });
  };

  const generatePDF = async (po) => {
    const doc = new jsPDF();
    const datePlaced = new Date(po.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const logoData = await getBase64ImageFromUrl('/images/tricore-logo2.png');
    if (logoData) {
      const imgWidth = 45; 
      const imgHeight = (logoData.height * imgWidth) / logoData.width; 
      doc.addImage(logoData.dataURL, 'PNG', 14, 12, imgWidth, imgHeight); 
    } else {
      doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); 
      doc.text("TRICORE MEDICAL SUPPLY", 14, 20);
    }
    
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); 
    doc.text("PURCHASE ORDER", 140, 18);
    
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.setFont("helvetica", "bold"); doc.text(`PO #: ${po.po_number}`, 140, 24);
    doc.setFont("helvetica", "normal"); doc.text(`Date: ${datePlaced}`, 140, 29);
    if (po.expected_delivery) {
      doc.text(`Expected: ${new Date(po.expected_delivery).toLocaleDateString()}`, 140, 34);
    }

    doc.setFont("helvetica", "bold");
    doc.text("VENDOR:", 14, 50); 
    doc.text("SHIP TO:", 110, 50);
    
    doc.setFont("helvetica", "normal");
    
    // Vendor Info
    let currentYVendor = 56;
    doc.setFont("helvetica", "bold");
    doc.text(po.supplier_name, 14, currentYVendor); currentYVendor += 5;
    doc.setFont("helvetica", "normal");
    if (po.supplier_email) { doc.text(po.supplier_email, 14, currentYVendor); currentYVendor += 5; }

    // Ship To Info (TriCore Warehouse)
    let currentYShip = 56;
    doc.setFont("helvetica", "bold");
    doc.text("TriCore Medical Supply", 110, currentYShip); currentYShip += 5;
    doc.setFont("helvetica", "normal");
    doc.text("2169 Harbor St", 110, currentYShip); currentYShip += 5;
    doc.text("Pittsburg, CA 94565", 110, currentYShip); currentYShip += 5;
    doc.text("United States", 110, currentYShip); currentYShip += 5;

    const maxAddressY = Math.max(currentYVendor, currentYShip);

    const tableRows = po.purchase_order_items?.map(item => [
      `${item.description}\nSKU: ${item.sku || 'N/A'}`,
      item.quantity, 
      `$${Number(item.unit_cost || 0).toFixed(2)}`, 
      `$${Number(item.line_total || 0).toFixed(2)}`
    ]) || [];

    autoTable(doc, {
      startY: maxAddressY + 10,
      head: [["DESCRIPTION", "QTY", "UNIT COST", "LINE TOTAL"]],
      body: tableRows,
      theme: 'striped', headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 5 }, columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
    });

    const finalY = doc.lastAutoTable.finalY || maxAddressY + 10;
    
    if (po.notes) {
      doc.setFont("helvetica", "bold");
      doc.text("Notes / Instructions:", 14, finalY + 10);
      doc.setFont("helvetica", "normal");
      const splitNotes = doc.splitTextToSize(po.notes, 100);
      doc.text(splitNotes, 14, finalY + 15);
    }

    doc.setFont("helvetica", "bold");
    doc.text("Total Amount:", 140, finalY + 15); 
    doc.text(`$${Number(po.total_amount || 0).toFixed(2)}`, 180, finalY + 15, { align: 'right' });

    doc.save(`${po.po_number}.pdf`);
  };

  const filteredPOs = purchaseOrders.filter(po => {
    const matchesTab = activeTab === 'all' || po.status === activeTab;
    const matchesSearch = po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          po.supplier_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const getStatusBadge = (status) => {
    const styles = { 
      pending: 'bg-yellow-50 text-yellow-700 border-yellow-200', 
      sent: 'bg-blue-50 text-blue-700 border-blue-200', 
      received: 'bg-emerald-50 text-emerald-700 border-emerald-200', 
      cancelled: 'bg-red-50 text-red-700 border-red-200' 
    };
    const icons = { pending: <Clock size={12}/>, sent: <Send size={12}/>, received: <CheckCircle2 size={12}/>, cancelled: <XCircle size={12}/> };
    return (<span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shadow-sm flex items-center gap-1.5 w-fit whitespace-nowrap ${styles[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{icons[status] || <Clock size={12}/>} {status}</span>);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
            <ClipboardList size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Purchase Orders</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Manage supplier orders and inventory receiving.</p>
          </div>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="px-5 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2">
          <Plus size={18} /> Create PO
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-100/50 rounded-xl border border-slate-200 w-full xl:w-auto overflow-x-auto shrink-0">
          {['all', 'pending', 'sent', 'received', 'cancelled'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all whitespace-nowrap capitalize active:scale-95 ${activeTab === tab ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="relative w-full xl:w-64 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search PO or Supplier..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="w-full h-14 bg-slate-50/80 border-b border-slate-200"></div>
          {[1,2,3,4].map(n => (<div key={n} className="w-full h-20 bg-white border-b border-slate-100 flex items-center px-6 gap-6 animate-pulse"><div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0"></div><div className="w-32 h-4 bg-slate-100 rounded shrink-0"></div><div className="w-48 h-4 bg-slate-100 rounded shrink-0"></div></div>))}
        </div>
      ) : filteredPOs.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mt-6">
          <PackagePlus size={56} strokeWidth={1} className="mx-auto text-slate-300 mb-5" />
          <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">No Purchase Orders</h3>
          <p className="text-slate-500 text-sm">Create a new purchase order to restock your inventory.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-x-auto mt-6">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold tracking-tight rounded-tl-3xl">PO Number</th>
                <th className="px-6 py-4 font-bold tracking-tight">Date / Expected</th>
                <th className="px-6 py-4 font-bold tracking-tight">Supplier</th>
                <th className="px-6 py-4 font-bold tracking-tight">Amount</th>
                <th className="px-6 py-4 font-bold tracking-tight">Status</th>
                <th className="px-6 py-4 font-bold tracking-tight text-right rounded-tr-3xl"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPOs.map(po => {
                const isExpanded = expandedPoId === po.id;

                return (
                  <React.Fragment key={po.id}>
                    <tr onClick={() => setExpandedPoId(isExpanded ? null : po.id)} className={`group cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50 border-l-4 border-l-slate-900' : 'hover:bg-slate-50/80 border-l-4 border-transparent'}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors shadow-sm ${isExpanded ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            <ClipboardList size={18} />
                          </div>
                          <p className="font-mono font-bold text-slate-900 text-sm tracking-tight">{po.po_number}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-700">{new Date(po.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        {po.expected_delivery && <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Calendar size={10}/> Due: {new Date(po.expected_delivery).toLocaleDateString()}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{po.supplier_name}</p>
                        {po.supplier_email && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Mail size={10}/> {po.supplier_email}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-extrabold text-slate-900 text-base">${Number(po.total_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(po.status)}
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
                                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Purchase Order Details</h3>
                                <p className="text-sm text-slate-500 font-medium">Review line items and update fulfillment status.</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {po.status === 'pending' && (
                                  <>
                                    <button onClick={() => updatePoStatus(po.id, 'cancelled')} className="px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-bold rounded-xl shadow-sm hover:bg-red-50 active:scale-95 transition-all">Cancel PO</button>
                                    <button onClick={() => updatePoStatus(po.id, 'sent')} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2"><Send size={16} /> Mark as Sent</button>
                                  </>
                                )}
                                {po.status === 'sent' && (
                                  <button onClick={() => updatePoStatus(po.id, 'received')} className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2"><CheckCircle2 size={16} /> Mark as Received</button>
                                )}
                                <button onClick={() => generatePDF(po)} className="px-4 py-2 bg-white border border-slate-200 text-slate-900 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-2">
                                  <FileDown size={16} className="text-slate-400" /> Export PDF
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              <div className="lg:col-span-2 space-y-6">
                                <div className="space-y-3">
                                  <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wider">
                                    <FileText size={16} className="text-slate-400" /> Line Items
                                  </h4>
                                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left text-sm whitespace-normal">
                                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest">
                                        <tr>
                                          <th className="px-5 py-3 font-bold w-full">Description</th>
                                          <th className="px-5 py-3 font-bold text-center">Qty</th>
                                          <th className="px-5 py-3 font-bold text-right">Unit Cost</th>
                                          <th className="px-5 py-3 font-bold text-right">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {po.purchase_order_items?.map((item) => (
                                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-5 py-4">
                                              <p className="font-bold text-slate-900 leading-snug">{item.description}</p>
                                              {item.sku && <p className="text-xs font-mono text-slate-500 mt-1">SKU: {item.sku}</p>}
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                              <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200 shadow-sm">{item.quantity}</span>
                                            </td>
                                            <td className="px-5 py-4 text-right font-medium text-slate-600">
                                              ${Number(item.unit_cost).toFixed(2)}
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
                                  <div className="flex justify-between items-end pb-3 border-b border-slate-100">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Amount</span>
                                    <span className="text-2xl font-extrabold text-slate-900 tracking-tight leading-none">${Number(po.total_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                  </div>
                                  {po.notes && (
                                    <div className="pt-2">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Notes</span>
                                      <p className="text-sm font-medium text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">{po.notes}</p>
                                    </div>
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

      {/* --- CREATE PO MODAL --- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col border border-slate-100 my-8">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl shrink-0">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><PackagePlus size={20}/> Create Purchase Order</h3>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            
            <form onSubmit={submitNewPO} className="p-6 space-y-6">
              {/* Supplier Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Supplier Name *</label>
                  <div className="relative">
                    <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="text" required value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" placeholder="e.g. MedSupply Co." />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Supplier Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="email" value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" placeholder="sales@medsupply.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Expected Delivery Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" />
                  </div>
                </div>
              </div>

              <div className="h-px w-full bg-slate-100"></div>

              {/* Dynamic Line Items */}
              <div className="space-y-3">
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Line Items *</label>
                </div>
                
                {poItems.map((item, index) => (
                  <div key={index} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="w-full sm:flex-1">
                      <input type="text" required placeholder="Product Description" value={item.description} onChange={(e) => handleItemChange(index, 'description', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                    </div>
                    <div className="w-full sm:w-32">
                      <input type="text" placeholder="SKU" value={item.sku} onChange={(e) => handleItemChange(index, 'sku', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 text-sm font-mono" />
                    </div>
                    <div className="w-full sm:w-24">
                      <input type="number" min="1" required placeholder="Qty" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 text-sm text-center font-bold" />
                    </div>
                    <div className="w-full sm:w-32 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                      <input type="number" step="0.01" min="0" required placeholder="Cost" value={item.unit_cost} onChange={(e) => handleItemChange(index, 'unit_cost', e.target.value)} className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-right" />
                    </div>
                    {poItems.length > 1 && (
                      <button type="button" onClick={() => handleRemoveItem(index)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
                
                <button type="button" onClick={handleAddItem} className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 py-2 px-1">
                  <Plus size={16} /> Add Another Item
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Notes / Instructions</label>
                <textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" placeholder="Any special instructions for the vendor..."></textarea>
              </div>

              {/* Total & Submit */}
              <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-900 p-5 rounded-2xl text-white mt-4 shadow-md">
                <div className="flex flex-col text-left mb-4 sm:mb-0 w-full sm:w-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Estimated Cost</span>
                  <span className="text-3xl font-extrabold tracking-tight">${calculateTotal().toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button type="button" onClick={closeModal} className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-colors w-full sm:w-auto">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-extrabold rounded-xl shadow-lg active:scale-95 transition-all w-full sm:w-auto flex justify-center items-center gap-2">
                    {isSubmitting ? 'Creating...' : <><CheckCircle2 size={18} /> Create PO</>}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
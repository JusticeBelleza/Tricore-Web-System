import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  ClipboardList, Search, Plus, CheckCircle2,
  ChevronDown, Building, Trash2, X, FileDown, Mail, PackagePlus, ArrowRight, Box,
  AlertTriangle, XCircle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPoId, setExpandedPoId] = useState(null);

  // UI State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState({ show: false, title: '', message: '', isError: false });
  const [confirmAction, setConfirmAction] = useState({ show: false, title: '', message: '', onConfirm: null });

  // New Receiving Form State
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [poItems, setPoItems] = useState([
    { variant_id: '', product_id: '', name: '', sku: '', multiplier: 1, quantity: 1 }
  ]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_order_items (*)
        `)
        .order('created_at', { ascending: false });

      if (poError) throw poError;
      setPurchaseOrders(poData || []);

      const { data: variantData, error: variantError } = await supabase
        .from('product_variants')
        .select(`
          id, sku, name, multiplier, product_id,
          products ( name )
        `)
        .order('sku', { ascending: true });

      if (variantError) throw variantError;
      setVariants(variantData || []);

    } catch (error) {
      console.error('Error fetching data:', error.message);
      showToast('Error', 'Failed to load receiving history.', true);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (title, message, isError = false) => {
    setNotification({ show: true, title, message, isError });
    setTimeout(() => setNotification({ show: false, title: '', message: '', isError: false }), 4000);
  };

  const handleAddItem = () => {
    setPoItems([...poItems, { variant_id: '', product_id: '', name: '', sku: '', multiplier: 1, quantity: 1 }]);
  };

  const handleRemoveItem = (index) => {
    const newItems = poItems.filter((_, i) => i !== index);
    setPoItems(newItems);
  };

  const handleProductChange = (index, value) => {
    const newItems = [...poItems];
    newItems[index].name = value;

    const selectedVariant = variants.find(v => {
      const displayName = `${v.products?.name || 'Product'} - ${v.name || 'Variant'} (SKU: ${v.sku})`;
      return displayName === value;
    });
    
    if (selectedVariant) {
      newItems[index].variant_id = selectedVariant.id;
      newItems[index].product_id = selectedVariant.product_id;
      newItems[index].multiplier = selectedVariant.multiplier || 1;
      newItems[index].sku = selectedVariant.sku || '';
    } else {
      newItems[index].variant_id = '';
      newItems[index].product_id = '';
      newItems[index].sku = '';
      newItems[index].multiplier = 1;
    }
    
    setPoItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...poItems];
    newItems[index][field] = value;
    setPoItems(newItems);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setSupplierName('');
    setSupplierEmail('');
    setNotes('');
    setPoItems([{ variant_id: '', product_id: '', name: '', sku: '', multiplier: 1, quantity: 1 }]);
  };

  // Triggers the Confirmation Modal instead of instantly submitting
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!supplierName) {
      return showToast("Missing Info", "Please enter a supplier name.", true);
    }
    
    if (poItems.some(item => !item.name.trim() || item.quantity < 1)) {
      return showToast("Missing Info", "Please enter a product name and a valid quantity for all items.", true);
    }

    setConfirmAction({
      show: true,
      title: 'Confirm Delivery',
      message: 'Are you sure you want to receive this delivery? This will automatically update your warehouse inventory levels.',
      onConfirm: processDelivery
    });
  };

  // The actual database submission logic
  const processDelivery = async () => {
    setConfirmAction({ show: false, title: '', message: '', onConfirm: null });
    setIsSubmitting(true);

    try {
      const generatedPoNumber = `PO-${Math.floor(100000 + Math.random() * 900000)}`;

      const { data: newPO, error: poError } = await supabase
        .from('purchase_orders')
        .insert([{
          po_number: generatedPoNumber,
          supplier_name: supplierName,
          supplier_email: supplierEmail,
          status: 'completed',
          total_amount: 0,
          notes: notes,
          expected_delivery: new Date().toISOString()
        }])
        .select()
        .single();

      if (poError) throw poError;

      const itemsToInsert = [];

      for (const item of poItems) {
        itemsToInsert.push({
          po_id: newPO.id,
          description: item.name,
          sku: item.sku || null,
          quantity: item.quantity,
          unit_cost: 0,
          line_total: 0
        });

        if (item.product_id) {
          const quantityToAdd = Number(item.quantity) * Number(item.multiplier);

          const { data: invData, error: invError } = await supabase
            .from('inventory')
            .select('*')
            .eq('product_id', item.product_id)
            .maybeSingle();

          if (invError) throw invError;

          if (invData) {
            const { error: updateError } = await supabase
              .from('inventory')
              .update({ base_units_on_hand: Number(invData.base_units_on_hand || 0) + quantityToAdd })
              .eq('product_id', item.product_id);
            if (updateError) throw updateError;
          } else {
            const { error: insertError } = await supabase
              .from('inventory')
              .insert([{ product_id: item.product_id, base_units_on_hand: quantityToAdd }]);
            if (insertError) throw insertError;
          }
        }
      }

      const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      showToast('Success', `Delivery ${generatedPoNumber} received and inventory updated.`);
      closeModal();
      fetchData(); 

    } catch (error) {
      console.error('Error receiving delivery:', error.message);
      showToast('Error', `Failed to process delivery: ${error.message}`, true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const generatePDF = (po) => {
    const doc = new jsPDF();
    const poNum = po.po_number || `PO-${po.id.substring(0, 8).toUpperCase()}`;
    const date = new Date(po.created_at).toLocaleDateString();

    doc.setFontSize(20);
    doc.text("RECEIVING RECORD", 14, 22);
    
    doc.setFontSize(10);
    doc.text(`Reference #: ${poNum}`, 14, 32);
    doc.text(`Date Received: ${date}`, 14, 38);
    doc.text(`Supplier: ${po.supplier_name}`, 14, 44);
    if (po.supplier_email) doc.text(`Email: ${po.supplier_email}`, 14, 50);

    const tableRows = po.purchase_order_items?.map(item => [
      item.sku ? `${item.description}\nSKU: ${item.sku}` : item.description,
      item.quantity
    ]) || [];

    autoTable(doc, {
      startY: 60,
      head: [["PRODUCT DETAILS", "QTY RECEIVED"]],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`Receiving_Record_${poNum}.pdf`);
  };

  const filteredPOs = purchaseOrders.filter(po => 
    po.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (po.po_number && po.po_number.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500 text-white rounded-xl shadow-sm">
            <PackagePlus size={24} strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Product Receiving</h2>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Log incoming deliveries and update inventory automatically.</p>
          </div>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
        >
          <Plus size={16} /> Receive Delivery
        </button>
      </div>

      {/* SEARCH BAR */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Search receiving history by supplier or PO Number..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all font-medium text-slate-700 shadow-sm"
        />
      </div>

      {/* RECEIVING HISTORY LIST */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold tracking-tight">Reference ID</th>
                <th className="px-6 py-4 font-bold tracking-tight">Supplier</th>
                <th className="px-6 py-4 font-bold tracking-tight">Date Received</th>
                <th className="px-6 py-4 font-bold tracking-tight">Status</th>
                <th className="px-6 py-4 font-bold tracking-tight text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500 font-medium">Loading history...</td>
                </tr>
              ) : filteredPOs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <ClipboardList size={40} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium">No receiving history found.</p>
                  </td>
                </tr>
              ) : (
                filteredPOs.map((po) => {
                  const isExpanded = expandedPoId === po.id;
                  return (
                    <React.Fragment key={po.id}>
                      <tr 
                        onClick={() => setExpandedPoId(isExpanded ? null : po.id)}
                        className={`group cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}
                      >
                        <td className="px-6 py-4 font-mono text-xs font-bold text-slate-900">{po.po_number || `PO-${po.id.substring(0,8).toUpperCase()}`}</td>
                        <td className="px-6 py-4 font-bold text-slate-700 flex items-center gap-2">
                          <Building size={14} className="text-slate-400" /> {po.supplier_name}
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-medium">
                          {new Date(po.created_at).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}
                        </td>
                        <td className="px-6 py-4">
                           <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200">Received</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-slate-400 hover:text-slate-900 transition-colors">
                            <ChevronDown size={20} className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/50 border-b border-slate-200">
                          <td colSpan="5" className="p-6">
                            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                              <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                                <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                                  <Box size={16} className="text-slate-400" /> Received Items ({po.purchase_order_items?.length || 0})
                                </h4>
                                <button onClick={() => generatePDF(po)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-2">
                                  <FileDown size={14} /> Download PDF
                                </button>
                              </div>
                              <div className="space-y-3">
                                {po.purchase_order_items?.map((item) => (
                                  <div key={item.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div>
                                      <p className="font-bold text-slate-900">{item.description}</p>
                                      {item.sku && (
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                                          SKU: <span className="font-mono">{item.sku}</span>
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p className="font-extrabold text-slate-900 text-lg">{item.quantity}</p>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Quantity</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECEIVE DELIVERY MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                  <PackagePlus size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Receive Delivery</h3>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">Log incoming stock to update inventory automatically.</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Supplier Name *</label>
                  <div className="relative">
                    <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input required type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-sm font-medium transition-all" placeholder="e.g. Medline Industries" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Supplier Email (Optional)</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="email" value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-sm font-medium transition-all" placeholder="contact@supplier.com" />
                  </div>
                </div>
              </div>

              {/* ITEMS SECTION */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex justify-between items-center">
                  <h4 className="font-bold text-slate-900 text-sm">Received Items</h4>
                  <button type="button" onClick={() => navigate('/admin/products')} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors">
                    Can't find product? Add it <ArrowRight size={14} />
                  </button>
                </div>
                
                <div className="divide-y divide-slate-100 bg-white">
                  {poItems.map((item, index) => (
                    <div key={index} className="p-5 flex items-end gap-4 relative group">
                      
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Search or Enter Product *</label>
                        <input 
                          required
                          type="text"
                          list={`variants-list-${index}`}
                          value={item.name}
                          onChange={(e) => handleProductChange(index, e.target.value)}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-sm font-medium transition-all"
                          placeholder="Start typing to search existing products, or type custom text..."
                        />
                        <datalist id={`variants-list-${index}`}>
                          {variants.map(v => (
                            <option key={v.id} value={`${v.products?.name} - ${v.name} (SKU: ${v.sku})`} />
                          ))}
                        </datalist>
                      </div>

                      <div className="w-32">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Qty *</label>
                        <input required type="number" min="1" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-sm font-medium transition-all text-center" />
                      </div>

                      <div className="w-12 flex justify-end">
                        <button type="button" onClick={() => handleRemoveItem(index)} disabled={poItems.length === 1} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-30">
                          <Trash2 size={18} />
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
                
                <div className="bg-slate-50 border-t border-slate-200 p-3">
                  <button type="button" onClick={handleAddItem} className="text-sm font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 py-1 px-2 transition-colors">
                    <Plus size={16} /> Add Another Row
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Notes / Reference</label>
                <textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-sm font-medium transition-all" placeholder="Delivery notes, truck numbers, or reference IDs..."></textarea>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={closeModal} className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-2">
                  {isSubmitting ? 'Processing...' : <><CheckCircle2 size={18} /> Receive Delivery</>}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">{confirmAction.title}</h3>
              <p className="text-sm text-slate-500 font-medium mb-6">{confirmAction.message}</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmAction({ show: false, title: '', message: '', onConfirm: null })} 
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmAction.onConfirm} 
                  className="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl shadow-sm transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {notification.show && (
        <div className={`fixed bottom-6 right-6 z-[110] flex items-start gap-3 px-5 py-4 rounded-xl shadow-2xl animate-in slide-in-from-bottom-5 w-80 max-w-[calc(100vw-3rem)] ${
          notification.isError ? 'bg-red-500 text-white border border-red-400' : 'bg-slate-900 text-white border border-slate-700'
        }`}>
          <div className="mt-0.5">
            {notification.isError ? <XCircle size={20} className="text-white" /> : <CheckCircle2 size={20} className="text-emerald-400" />}
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold tracking-tight">{notification.title}</h4>
            <p className="text-xs font-medium opacity-90 mt-1 leading-relaxed">{notification.message}</p>
          </div>
          <button 
            onClick={() => setNotification({ ...notification, show: false })} 
            className="opacity-70 hover:opacity-100 hover:bg-white/10 p-1 rounded-md transition-all -mr-2"
          >
            <X size={16} />
          </button>
        </div>
      )}

    </div>
  );
}
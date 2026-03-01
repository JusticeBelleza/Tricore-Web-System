import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function PurchaseOrders() {
  const { profile } = useAuth();
  const [pos, setPOs] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  const [supplierName, setSupplierName] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [cart, setCart] = useState([]); // PO items

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch POs
      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .select('*, purchase_order_items(quantity, unit_cost, line_total, products(name))')
        .order('created_at', { ascending: false });
      if (poError) throw poError;

      // Fetch Products for the form dropdown
      const { data: prodData, error: prodError } = await supabase
        .from('products')
        .select('id, name, base_sku')
        .order('name');
      if (prodError) throw prodError;

      setPOs(poData || []);
      setProducts(prodData || []);
    } catch (error) {
      console.error('Error fetching data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const addItemToPO = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setCart([...cart, { product_id: product.id, name: product.name, quantity: 1, unit_cost: 0 }]);
  };

  const updateCartItem = (index, field, value) => {
    const newCart = [...cart];
    newCart[index][field] = Number(value);
    setCart(newCart);
  };

  const handleCreatePO = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return alert('Add at least one item to the PO.');

    const totalAmount = cart.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
    const poNumber = `PO-${Math.floor(100000 + Math.random() * 900000)}`;

    try {
      // 1. Create PO Record
      const { data: newPO, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: poNumber,
          supplier_name: supplierName,
          status: 'sent',
          total_amount: totalAmount,
          expected_delivery_date: expectedDate || null
        })
        .select()
        .single();
      if (poError) throw poError;

      // 2. Insert PO Items
      const itemsToInsert = cart.map(item => ({
        purchase_order_id: newPO.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        line_total: item.quantity * item.unit_cost
      }));

      const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // Success
      setShowForm(false);
      setCart([]);
      setSupplierName('');
      setExpectedDate('');
      fetchData();
    } catch (error) {
      console.error('Error creating PO:', error.message);
      alert('Failed to create Purchase Order');
    }
  };

  const handleReceivePO = async (poId) => {
    if (!confirm("Are you sure you want to receive this PO? This will permanently add the items to your inventory.")) return;
    
    try {
      // Call our secure RPC to receive items and update inventory
      const { error } = await supabase.rpc('receive_purchase_order', { p_po_id: poId });
      if (error) throw error;
      
      alert('Purchase Order received successfully! Inventory updated.');
      fetchData();
    } catch (error) {
      console.error('Error receiving PO:', error.message);
      alert('Failed to receive Purchase Order');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-slate-100 text-slate-600',
      sent: 'bg-blue-100 text-blue-800',
      received: 'bg-green-100 text-green-800'
    };
    return `px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${styles[status] || styles.draft}`;
  };

  if (loading) return <div className="text-slate-500">Loading Purchase Orders...</div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto relative">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Purchase Orders</h2>
          <p className="text-sm text-slate-500 mt-1">Order supplies and receive them into inventory.</p>
        </div>
        <button 
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 transition-colors"
        >
          + Create PO
        </button>
      </div>

      {/* Main PO List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-4 font-medium">PO Number</th>
              <th className="px-6 py-4 font-medium">Supplier</th>
              <th className="px-6 py-4 font-medium">Expected Date</th>
              <th className="px-6 py-4 font-medium">Total</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pos.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-slate-500">No purchase orders found.</td>
              </tr>
            ) : pos.map(po => (
              <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-mono font-medium text-slate-900">{po.po_number}</td>
                <td className="px-6 py-4 text-slate-700">{po.supplier_name}</td>
                <td className="px-6 py-4 text-slate-500">{po.expected_delivery_date || 'N/A'}</td>
                <td className="px-6 py-4 font-semibold text-slate-900">${po.total_amount.toFixed(2)}</td>
                <td className="px-6 py-4">
                  <span className={getStatusBadge(po.status)}>{po.status}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  {po.status === 'sent' && (
                    <button 
                      onClick={() => handleReceivePO(po.id)}
                      className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 text-xs font-semibold rounded-md transition-colors"
                    >
                      Receive Items
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slide-over Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-200">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900">New Purchase Order</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleCreatePO} className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Supplier Name</label>
                  <input type="text" required value={supplierName} onChange={e => setSupplierName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 outline-none" placeholder="e.g. Medline Industries" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expected Delivery Date</label>
                  <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 outline-none" />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Add Items</label>
                <select 
                  onChange={(e) => { addItemToPO(e.target.value); e.target.value = ''; }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 outline-none mb-4 text-sm"
                >
                  <option value="">-- Select a product to add --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.base_sku})</option>)}
                </select>

                <div className="space-y-3">
                  {cart.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                      </div>
                      <input type="number" min="1" placeholder="Qty" value={item.quantity} onChange={e => updateCartItem(i, 'quantity', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-sm" required/>
                      <input type="number" min="0" step="0.01" placeholder="$ Cost" value={item.unit_cost} onChange={e => updateCartItem(i, 'unit_cost', e.target.value)} className="w-24 px-2 py-1 border border-slate-300 rounded text-sm" required/>
                      <button type="button" onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700 px-2 font-bold">&times;</button>
                    </div>
                  ))}
                  {cart.length > 0 && (
                    <div className="text-right pt-2 font-bold text-slate-900 border-t border-slate-200 mt-4">
                      Total: ${cart.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              <button type="submit" className="w-full py-3 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors mt-8 shadow-md">
                Submit Purchase Order
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
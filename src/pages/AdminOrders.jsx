import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function AdminOrders() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  useEffect(() => {
    // Only fetch if the user is an admin
    if (profile?.role === 'admin') {
      fetchAllOrders();
    } else {
      setLoading(false);
    }
  }, [profile]);

  const fetchAllOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          companies ( name, account_type, tax_exempt ),
          order_items (
            id, quantity_variants, unit_price, line_total,
            product_variants ( name, products ( name, base_sku ) )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching admin orders:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      
      setOrders(prev => prev.map(order => 
        order.id === orderId ? { ...order, status: newStatus } : order
      ));
    } catch (error) {
      console.error('Error updating status:', error.message);
      alert('Failed to update order status.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      picking: 'bg-purple-100 text-purple-800',
      packed: 'bg-indigo-100 text-indigo-800',
      out_for_delivery: 'bg-orange-100 text-orange-800',
      delivered: 'bg-green-100 text-green-800'
    };
    return `px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${styles[status] || 'bg-slate-100 text-slate-800'}`;
  };

  if (profile?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-900">Access Denied</h2>
        <p className="text-slate-500 mt-2">You must be an administrator to view this page.</p>
      </div>
    );
  }

  if (loading) return <div className="text-slate-500">Loading master order list...</div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto print:m-0 print:max-w-none">
      
      {/* Hide header when printing */}
      <div className="print:hidden">
        <h2 className="text-2xl font-bold text-slate-900">Master Order Management</h2>
        <p className="text-sm text-slate-500 mt-1">Approve orders, print packing slips, and generate invoices.</p>
      </div>

      <div className="space-y-4 print:hidden">
        {orders.map((order) => (
          <div key={order.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all">
            
            {/* Order Header Summary */}
            <div 
              onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
              className="p-6 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <div className="w-1/4">
                <p className="font-bold text-slate-900">{order.companies?.name}</p>
                <p className="text-xs text-slate-500">Order #{order.id.split('-')[0]}</p>
              </div>
              <div className="w-1/4 text-sm text-slate-500">
                {new Date(order.created_at).toLocaleDateString()}
              </div>
              <div className="w-1/4 text-center">
                <span className={getStatusBadge(order.status)}>{order.status.replace('_', ' ')}</span>
              </div>
              <div className="w-1/4 text-right font-bold text-slate-900">
                ${order.total_amount.toFixed(2)}
              </div>
            </div>

            {/* Expanded Admin Actions & Printable Invoice */}
            {expandedOrderId === order.id && (
              <div className="border-t border-slate-200 bg-slate-50 p-6">
                
                {/* Action Buttons */}
                <div className="flex gap-3 mb-6 pb-6 border-b border-slate-200">
                  {order.status === 'pending' && (
                    <button onClick={() => updateOrderStatus(order.id, 'approved')} className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800">
                      Approve Order
                    </button>
                  )}
                  <button onClick={handlePrint} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50">
                    Print Invoice / Packing Slip
                  </button>
                </div>

                {/* Printable Area (Only this shows up when printing) */}
                <div className="bg-white p-8 rounded-lg border border-slate-200 print:border-none print:block print:absolute print:inset-0 print:bg-white print:p-0">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h1 className="text-3xl font-bold text-slate-900 tracking-tight">INVOICE</h1>
                      <p className="text-slate-500 mt-1">Order #{order.id.split('-')[0]}</p>
                    </div>
                    <div className="text-right">
                      <h3 className="font-bold text-slate-900">Tricore Medical Supply</h3>
                      <p className="text-sm text-slate-500">Date: {new Date(order.created_at).toLocaleDateString()}</p>
                      <p className="text-sm text-slate-500 uppercase">Terms: {order.payment_method.replace('_', ' ')}</p>
                    </div>
                  </div>

                  <div className="mb-8">
                    <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Bill To</p>
                    <p className="font-medium text-slate-900">{order.companies?.name}</p>
                    <p className="text-sm text-slate-500">Account Type: {order.companies?.account_type}</p>
                  </div>

                  <table className="w-full text-left text-sm mb-8">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 font-medium">Item Description</th>
                        <th className="py-2 font-medium text-right">Qty</th>
                        <th className="py-2 font-medium text-right">Unit Price</th>
                        <th className="py-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {order.order_items?.map((item) => (
                        <tr key={item.id}>
                          <td className="py-3">
                            <p className="font-medium text-slate-900">{item.product_variants?.products?.name}</p>
                            <p className="text-xs text-slate-500">SKU: {item.product_variants?.products?.base_sku} | {item.product_variants?.name}</p>
                          </td>
                          <td className="py-3 text-right">{item.quantity_variants}</td>
                          <td className="py-3 text-right">${item.unit_price.toFixed(2)}</td>
                          <td className="py-3 text-right font-medium">${item.line_total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="w-1/2 ml-auto space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span>${order.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Shipping</span>
                      <span>${order.shipping_amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Tax</span>
                      <span>${order.tax_amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-bold text-lg pt-2 border-t border-slate-200">
                      <span>Total Due</span>
                      <span>${order.total_amount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
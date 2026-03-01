import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function MyOrders() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  useEffect(() => {
    if (profile?.company_id) {
      fetchMyOrders();
    }
  }, [profile]);

  const fetchMyOrders = async () => {
    setLoading(true);
    try {
      // Fetch orders specific to the logged-in user's company, including the nested items
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, created_at, total_amount, subtotal, tax_amount, shipping_amount, payment_method, signature_url, photo_url,
          order_items (
            id, quantity_variants, unit_price, line_total,
            product_variants ( name, products ( name, base_unit_name ) )
          )
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderDetails = (orderId) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
    } else {
      setExpandedOrderId(orderId);
    }
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

  if (loading) return <div className="text-slate-500">Loading your orders...</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Order History</h2>
        <p className="text-sm text-slate-500 mt-1">View and track your previous purchases.</p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 shadow-sm">
          You haven't placed any orders yet. Head to the Catalog to get started!
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all">
              
              {/* Order Header (Clickable) */}
              <div 
                onClick={() => toggleOrderDetails(order.id)}
                className="p-6 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="text-sm text-slate-500 mb-1">
                    Order Placed: {new Date(order.created_at).toLocaleDateString()}
                  </p>
                  <p className="font-mono font-medium text-slate-900">
                    #{order.id.split('-')[0]}
                  </p>
                </div>
                
                <div className="text-right flex items-center gap-6">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Total Amount</p>
                    <p className="font-bold text-slate-900">${order.total_amount.toFixed(2)}</p>
                  </div>
                  <div className="w-32 text-right">
                    <span className={getStatusBadge(order.status)}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-slate-400">
                    {expandedOrderId === order.id ? '▲' : '▼'}
                  </div>
                </div>
              </div>

              {/* Order Details (Expands when clicked) */}
              {expandedOrderId === order.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-6 animate-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    
                    {/* Line Items */}
                    <div className="md:col-span-2 space-y-4">
                      <h4 className="font-semibold text-slate-900 border-b border-slate-200 pb-2">Items Included</h4>
                      <div className="divide-y divide-slate-200/60">
                        {order.order_items?.map((item) => (
                          <div key={item.id} className="py-3 flex justify-between">
                            <div>
                              <p className="font-medium text-slate-900">
                                {item.product_variants?.products?.name}
                              </p>
                              <p className="text-sm text-slate-500">
                                Variant: {item.product_variants?.name} | Qty: {item.quantity_variants}
                              </p>
                            </div>
                            <p className="font-medium text-slate-900">
                              ${item.line_total.toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Summary & Proof of Delivery */}
                    <div className="space-y-6">
                      <div className="space-y-2 text-sm">
                        <h4 className="font-semibold text-slate-900 border-b border-slate-200 pb-2 mb-3">Order Summary</h4>
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
                        <div className="flex justify-between text-slate-900 font-bold pt-2 border-t border-slate-200">
                          <span>Total</span>
                          <span>${order.total_amount.toFixed(2)}</span>
                        </div>
                        <div className="pt-2">
                          <span className="text-xs text-slate-500 uppercase tracking-wider">Method: {order.payment_method.replace('_', ' ')}</span>
                        </div>
                      </div>

                      {/* Proof of Delivery (Only visible if delivered) */}
                      {order.status === 'delivered' && (order.photo_url || order.signature_url) && (
                        <div className="pt-4 border-t border-slate-200">
                          <h4 className="font-semibold text-slate-900 text-sm mb-3">Proof of Delivery</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {order.photo_url && (
                              <img src={order.photo_url} alt="Delivery Proof" className="w-full h-24 object-cover rounded-md border border-slate-200" />
                            )}
                            {order.signature_url && (
                              <img src={order.signature_url} alt="Signature" className="w-full h-24 object-contain bg-white rounded-md border border-slate-200 p-1" />
                            )}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
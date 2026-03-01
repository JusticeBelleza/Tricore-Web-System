import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Warehouse() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveOrders();
  }, []);

  const fetchActiveOrders = async () => {
    setLoading(true);
    try {
      // Fetch orders that are not yet delivered, along with company and item details
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          companies ( name ),
          order_items ( id, quantity_variants, line_total, product_variants(name, products(name)) )
        `)
        .neq('status', 'delivered')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching warehouse orders:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, currentStatus) => {
    // Determine the next logical status in the workflow
    const flow = {
      'pending': 'approved',
      'approved': 'picking',
      'picking': 'packed',
      'packed': 'out_for_delivery'
    };
    
    const nextStatus = flow[currentStatus];
    if (!nextStatus) return;

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: nextStatus })
        .eq('id', orderId);

      if (error) throw error;
      
      // Update local state to reflect the change instantly
      setOrders(prev => prev.map(order => 
        order.id === orderId ? { ...order, status: nextStatus } : order
      ));
    } catch (error) {
      console.error('Error updating status:', error.message);
      alert('Failed to update order status.');
    }
  };

  // Helper for status badge styling
  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      picking: 'bg-purple-100 text-purple-800',
      packed: 'bg-indigo-100 text-indigo-800',
      out_for_delivery: 'bg-orange-100 text-orange-800'
    };
    return `px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${styles[status] || 'bg-slate-100 text-slate-800'}`;
  };

  if (loading) {
    return <div className="text-slate-500">Loading warehouse data...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Warehouse Operations</h2>
        <p className="text-sm text-slate-500 mt-1">Manage order fulfillment and dispatch.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">Order ID</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium">Items</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-500">
                    No active orders to fulfill at the moment.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-600">
                      {order.id.split('-')[0]}...
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {order.companies?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {order.order_items?.length || 0} variants
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={getStatusBadge(order.status)}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {order.status !== 'out_for_delivery' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, order.status)}
                          className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 transition-colors"
                        >
                          {order.status === 'pending' && 'Approve'}
                          {order.status === 'approved' && 'Start Picking'}
                          {order.status === 'picking' && 'Mark Packed'}
                          {order.status === 'packed' && 'Ship (Out for Delivery)'}
                        </button>
                      )}
                      {order.status === 'out_for_delivery' && (
                        <span className="text-xs text-slate-400 font-medium">Awaiting Driver</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
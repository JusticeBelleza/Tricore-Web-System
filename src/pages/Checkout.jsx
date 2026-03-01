import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function Checkout() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Grab the cart passed from the Catalog page
  const cart = location.state?.cart || [];
  
  const [paymentMethod, setPaymentMethod] = useState('net_30');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0);
  const shippingFee = Number(profile?.companies?.shipping_fee || 0);
  // For simplicity, we'll calculate a flat 8% tax unless the company is tax_exempt
  const taxRate = profile?.companies?.tax_exempt ? 0 : 0.08;
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + shippingFee + taxAmount;

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    setError('');

    try {
      // 1. Create the Order Record
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          company_id: profile.company_id,
          status: 'pending',
          payment_method: paymentMethod,
          payment_status: 'unpaid',
          subtotal,
          tax_amount: taxAmount,
          shipping_amount: shippingFee,
          total_amount: totalAmount,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Prepare and Insert the Order Items
      const orderItems = cart.map(item => ({
        order_id: order.id,
        product_variant_id: item.variant_id,
        quantity_variants: item.quantity,
        total_base_units: item.quantity, // In a full app, you'd multiply by the variant's base multiplier here
        unit_price: item.unit_price,
        line_total: item.line_total
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // 3. Success! Redirect to orders page
      alert('Order placed successfully!');
      navigate('/orders');

    } catch (err) {
      console.error('Checkout error:', err.message);
      setError('Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-700">Your cart is empty</h2>
        <button onClick={() => navigate('/catalog')} className="mt-4 text-blue-600 hover:underline">
          Return to Catalog
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Checkout</h2>
        <p className="text-sm text-slate-500 mt-1">Review your items and complete your order.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Order Summary (Left Side) */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-semibold text-slate-800">Order Items</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {cart.map((item, index) => (
                <div key={index} className="px-6 py-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <p className="text-sm text-slate-500">Qty: {item.quantity} x ${item.unit_price.toFixed(2)}</p>
                  </div>
                  <p className="font-semibold text-slate-900">${item.line_total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Payment & Totals (Right Side) */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Payment Details</h3>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Method</label>
              <select 
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="net_30">Net 30 Terms</option>
                <option value="cod">Cash on Delivery</option>
              </select>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Shipping</span>
                <span>${shippingFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax {profile?.companies?.tax_exempt && '(Exempt)'}</span>
                <span>${taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold text-lg pt-2 border-t border-slate-100">
                <span>Total</span>
                <span>${totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={loading}
              className="w-full mt-4 bg-slate-900 text-white py-2.5 rounded-lg font-medium hover:bg-slate-800 transition-colors disabled:opacity-70"
            >
              {loading ? 'Processing...' : 'Place Order'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
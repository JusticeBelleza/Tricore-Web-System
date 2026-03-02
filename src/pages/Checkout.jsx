import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
// FIXED: Added the 'X' icon to the import list below!
import { ArrowLeft, CheckCircle2, Package, CreditCard, Receipt, X } from 'lucide-react';

export default function Checkout() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Grab the cart passed from the Catalog page
  const cart = location.state?.cart || [];
  
  const [paymentMethod, setPaymentMethod] = useState('net_30');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // --- Calculations ---
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
          user_id: profile.id, // FIXED: Added user_id so Supabase RLS allows the insert!
          company_id: profile.company_id || null, // Ensure this handles retail users without a company
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
        // Multiply by the variant's base multiplier to track exact physical inventory drawn
        total_base_units: item.quantity * (item.multiplier || 1), 
        unit_price: item.unit_price,
        line_total: item.line_total
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // 3. Show Success Modal
      setShowSuccess(true);

    } catch (err) {
      console.error('Checkout error:', err.message);
      setError('Failed to place order. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const finishCheckout = () => {
    setShowSuccess(false);
    navigate('/orders'); // Assuming you have an orders page setup next
  };

  // If cart is empty, show a fallback screen
  if (cart.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm mt-10">
        <Package size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-5" />
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Your cart is empty</h2>
        <p className="text-slate-500 mt-2 mb-8">Looks like you haven't added any products yet.</p>
        <button 
          onClick={() => navigate('/catalog')} 
          className="px-6 py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
        >
          Return to Catalog
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors w-fit"
        >
          <ArrowLeft size={16} /> Back to Catalog
        </button>
        <div className="hidden sm:block w-px h-6 bg-slate-200 mx-2"></div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Secure Checkout</h2>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 font-medium rounded-xl border border-red-100 text-sm flex items-center gap-3">
          <X size={18} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* --- LEFT COLUMN: Order Items --- */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <Package size={20} className="text-slate-400" />
              <h3 className="font-bold text-slate-900 text-lg">Order Summary</h3>
            </div>
            
            <div className="divide-y divide-slate-50">
              {cart.map((item, index) => (
                <div key={index} className="px-6 py-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="pr-4">
                    <p className="font-bold text-slate-900 leading-snug">{item.name}</p>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                      {item.quantity} x ${item.unit_price.toFixed(2)}
                    </p>
                  </div>
                  <p className="font-extrabold text-slate-900 text-lg shrink-0">
                    ${item.line_total.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* --- RIGHT COLUMN: Payment & Totals --- */}
        <div className="lg:col-span-5 space-y-6 sticky top-8">
          
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            
            <div className="flex items-center gap-3 mb-2">
              <CreditCard size={20} className="text-slate-400" />
              <h3 className="font-bold text-slate-900 text-lg">Payment Details</h3>
            </div>
            
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Billing Method
              </label>
              <select 
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all cursor-pointer"
              >
                <option value="net_30">Net 30 Terms (Invoice)</option>
                <option value="cod">Cash on Delivery</option>
              </select>
            </div>

            <div className="h-px w-full bg-slate-100 my-2"></div>

            <div className="space-y-3 text-sm font-medium">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="text-slate-900">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Shipping</span>
                <span className="text-slate-900">${shippingFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Tax {profile?.companies?.tax_exempt && <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ml-1">Exempt</span>}</span>
                <span className="text-slate-900">${taxAmount.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-end pt-4 border-t border-slate-100 mt-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total</span>
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
                  ${totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={loading}
              className="w-full mt-6 bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-70 shadow-md flex items-center justify-center gap-2"
            >
              {loading ? 'Processing...' : (
                <>
                  <Receipt size={18} /> Place Order
                </>
              )}
            </button>

            <p className="text-xs text-center text-slate-400 font-medium pt-2">
              By placing this order, you agree to our B2B purchasing terms.
            </p>
          </div>

        </div>
      </div>

      {/* --- SUCCESS NOTIFICATION MODAL --- */}
      {showSuccess && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center space-y-4 animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={40} strokeWidth={2} />
            </div>
            <div>
              <h4 className="text-2xl font-bold text-slate-900 tracking-tight">Order Received!</h4>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed font-medium">
                Your order has been placed successfully. Our warehouse team is processing it now.
              </p>
            </div>
            <div className="mt-8 pt-2">
              <button
                onClick={finishCheckout}
                className="w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
              >
                View My Orders
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
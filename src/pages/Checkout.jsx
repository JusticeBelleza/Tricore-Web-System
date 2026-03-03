import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ArrowLeft, CheckCircle2, Package, CreditCard, Receipt, X, Building, MapPin, Search, User } from 'lucide-react';

export default function Checkout() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Grab the cart passed from the Catalog page
  const cart = location.state?.cart || [];
  
  // Identify if the user is B2B (Agency) or Retail
  const isB2B = !!profile?.company_id; 

  const [paymentMethod, setPaymentMethod] = useState(isB2B ? 'net_30' : 'credit_card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // Patient Search State (Only used for B2B)
  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Fetch Patients on Load ONLY if B2B
  useEffect(() => {
    if (isB2B) {
      fetchPatients();
    }
  }, [isB2B, profile]);

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from('agency_patients')
        .select('*')
        .eq('agency_id', profile.company_id)
        .order('full_name', { ascending: true });
      
      if (error) throw error;
      setPatients(data || []);
    } catch (err) {
      console.error('Error fetching patients:', err);
    }
  };

  const filteredPatients = patients.filter(p => 
    p.full_name.toLowerCase().includes(patientSearch.toLowerCase())
  );

  // --- Calculations ---
  const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0);
  const shippingFee = isB2B ? Number(profile?.companies?.shipping_fee || 0) : 10.00; // Example $10 flat rate for retail
  const taxRate = (isB2B && profile?.companies?.tax_exempt) ? 0 : 0.08;
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + shippingFee + taxAmount;

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    
    // Validation: Ensure a patient is selected if it's a B2B order
    if (isB2B && !selectedPatient) {
      setError('Please select a patient for the shipping address.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Create the Order Record (Handles both B2B and Retail)
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: profile.id, 
          company_id: profile.company_id || null, 
          patient_id: isB2B ? selectedPatient.id : null,
          // Conditionally save Shipping Info based on user type
          shipping_name: isB2B ? selectedPatient.full_name : profile.full_name, 
          shipping_address: isB2B ? selectedPatient.address : profile.address,
          shipping_city: isB2B ? selectedPatient.city : profile.city,
          shipping_state: isB2B ? selectedPatient.state : profile.state,
          shipping_zip: isB2B ? selectedPatient.zip : profile.zip,
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
    navigate('/orders'); 
  };

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
        
        {/* --- LEFT COLUMN: Addresses & Order Items --- */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Conditional Layout: B2B vs Retail Address Block */}
          {isB2B ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Bill To (Agency) */}
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-50">
                  <Building size={18} className="text-blue-500" />
                  <h3 className="font-bold text-slate-900 text-sm tracking-wide uppercase">Bill To</h3>
                </div>
                <div className="text-sm font-medium text-slate-600 space-y-1">
                  <p className="font-bold text-slate-900 text-base">{profile?.companies?.name || 'Your Agency'}</p>
                  <p>{profile?.companies?.address || 'No billing address on file'}</p>
                  {profile?.companies?.city && (
                    <p>{profile?.companies?.city}, {profile?.companies?.state} {profile?.companies?.zip}</p>
                  )}
                </div>
              </div>

              {/* Ship To (Patient) */}
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative">
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-50">
                  <div className="flex items-center gap-2">
                    <MapPin size={18} className="text-green-500" />
                    <h3 className="font-bold text-slate-900 text-sm tracking-wide uppercase">Ship To</h3>
                  </div>
                  {selectedPatient && (
                    <button onClick={() => setSelectedPatient(null)} className="text-xs font-bold text-slate-400 hover:text-red-600 transition-colors">
                      Change
                    </button>
                  )}
                </div>

                {!selectedPatient ? (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search patient roster..."
                        value={patientSearch}
                        onChange={(e) => {
                          setPatientSearch(e.target.value);
                          setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all"
                      />
                    </div>
                    
                    {/* Dropdown Results */}
                    {showDropdown && patientSearch && (
                      <div className="absolute z-20 w-full mt-2 bg-white border border-slate-100 shadow-xl rounded-xl max-h-48 overflow-y-auto overflow-x-hidden">
                        {filteredPatients.length > 0 ? filteredPatients.map(p => (
                          <button 
                            key={p.id} 
                            onClick={() => { setSelectedPatient(p); setShowDropdown(false); setPatientSearch(''); }} 
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <User size={14} className="text-slate-400" />
                              <p className="font-bold text-slate-900 text-sm">{p.full_name}</p>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 pl-6 truncate">
                              {p.address ? `${p.address}, ${p.city}` : 'No address saved'}
                            </p>
                          </button>
                        )) : (
                          <div className="px-4 py-4 text-sm font-medium text-slate-500 text-center">No patients match your search.</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm font-medium text-slate-600 space-y-1 animate-in fade-in">
                    <p className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <User size={16} className="text-slate-400" /> {selectedPatient.full_name}
                    </p>
                    <p className="pl-6">{selectedPatient.address || <span className="text-red-500 italic">No delivery address provided</span>}</p>
                    {selectedPatient.city && (
                      <p className="pl-6">{selectedPatient.city}, {selectedPatient.state} {selectedPatient.zip}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Retail Customer Address Layout */
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <MapPin size={18} className="text-blue-500" />
                  <h3 className="font-bold text-slate-900 text-sm tracking-wide uppercase">Shipping & Billing Address</h3>
                </div>
              </div>
              <div className="text-sm font-medium text-slate-600 space-y-1">
                <p className="font-bold text-slate-900 text-base">{profile?.full_name}</p>
                <p>{profile?.address || <span className="text-red-500 italic">No address on file. Please update your profile.</span>}</p>
                {(profile?.city || profile?.state) && (
                  <p>{profile?.city}, {profile?.state} {profile?.zip}</p>
                )}
              </div>
            </div>
          )}

          {/* Order Summary Items */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <Package size={20} className="text-slate-400" />
              <h3 className="font-bold text-slate-900 text-lg">Order Items</h3>
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
                {/* Retail typically doesn't get invoice terms */}
                {isB2B && <option value="net_30">Net 30 Terms (Invoice)</option>}
                <option value="credit_card">Credit Card</option>
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
                <span>Tax {(isB2B && profile?.companies?.tax_exempt) && <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ml-1">Exempt</span>}</span>
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
              className={`w-full mt-6 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md ${(isB2B && !selectedPatient) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95 disabled:opacity-70'}`}
            >
              {loading ? 'Processing...' : (
                <>
                  <Receipt size={18} /> Place Order
                </>
              )}
            </button>
            
            {(isB2B && !selectedPatient) && (
              <p className="text-xs text-center text-red-500 font-bold animate-pulse">
                * Please select a patient to ship to
              </p>
            )}

            <p className="text-xs text-center text-slate-400 font-medium pt-2">
              By placing this order, you agree to our purchasing terms.
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
                Your order has been placed successfully. Our team is processing it now.
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
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  ArrowLeft, CheckCircle2, Package, CreditCard, Receipt, 
  X, Building, MapPin, Search, User, Trash2, AlertCircle, 
  ChevronDown, Mail, Phone, Edit2, Save, ChevronLeft, ChevronRight, AlertTriangle
} from 'lucide-react';

export default function Checkout() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);

  // CART PAGINATION & DELETE STATE
  const [cartPage, setCartPage] = useState(1);
  const [itemToDelete, setItemToDelete] = useState(null); // Holds the index of the item to delete
  const ITEMS_PER_PAGE = 5;

  const cartKey = profile?.company_id ? `tricore_cart_agency_${profile.company_id}` : `tricore_cart_user_${profile?.id}`;

  useEffect(() => {
    if (profile?.id) {
      const savedCart = localStorage.getItem(cartKey);
      if (savedCart) setCart(JSON.parse(savedCart));
      else setCart([]);
      setCartLoaded(true);
    }
  }, [profile?.id, cartKey]);

  useEffect(() => {
    if (cartLoaded && profile?.id) {
      localStorage.setItem(cartKey, JSON.stringify(cart));
    }
  }, [cart, cartLoaded, profile?.id, cartKey]);

  // Handle page edge case when an item is deleted and a page becomes empty
  const totalCartPages = Math.ceil(cart.length / ITEMS_PER_PAGE);
  useEffect(() => {
    if (cartPage > totalCartPages && totalCartPages > 0) {
      setCartPage(totalCartPages);
    }
  }, [cart.length, totalCartPages, cartPage]);
  
  const isB2B = !!profile?.company_id; 

  const [paymentMethod, setPaymentMethod] = useState('net_30');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  
  // NEW: Ship to Agency State
  const [shipToAgency, setShipToAgency] = useState(false);

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const [financials, setFinancials] = useState({ limit: 0, outstanding: 0, available: 0 });

  const [isEditingRetail, setIsEditingRetail] = useState(false);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  
  const [retailInfo, setRetailInfo] = useState({
    full_name: '', email: '', phone: '', address: '', city: '', state: '', zip: ''
  });

  const [billingInfo, setBillingInfo] = useState({ address: '', city: '', state: '', zip: '' });

  // LIVE TAX STATES
  const [taxData, setTaxData] = useState(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);

  useEffect(() => {
    if (!isB2B && profile && user) {
      const initEmail = user.email || profile.email || '';
      const initPhone = profile.contact_number || profile.phone || '';
      const initAddress = profile.address || '';
      
      setRetailInfo({
        full_name: profile.full_name || '',
        email: initEmail,
        phone: initPhone,
        address: initAddress,
        city: profile.city || '',
        state: profile.state || '',
        zip: profile.zip || ''
      });
      
      if (!initAddress || !initPhone) {
        setIsEditingRetail(true);
      }
    }
  }, [profile, user, isB2B]);

  useEffect(() => {
    if (isB2B) fetchB2BData();
  }, [isB2B, profile]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchB2BData = async () => {
    try {
      const [patientsRes, unpaidRes] = await Promise.all([
        supabase.from('agency_patients').select('*').eq('agency_id', profile.company_id).order('full_name', { ascending: true }),
        supabase.from('orders').select('total_amount').eq('company_id', profile.company_id).eq('payment_status', 'unpaid')
      ]);
      setPatients(patientsRes.data || []);
      const limit = Number(profile?.companies?.credit_limit || 0);
      const outstanding = unpaidRes.data?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      setFinancials({ limit, outstanding, available: limit - outstanding });
    } catch (err) { console.error(err); }
  };

  // LIVE TAX CALCULATOR EFFECT
  useEffect(() => {
    // Use Agency ZIP if shipping to agency
    const targetZip = isB2B 
      ? (shipToAgency ? profile?.companies?.zip : selectedPatient?.zip) 
      : retailInfo?.zip;
    
    if (isB2B && profile?.companies?.tax_exempt) {
      setTaxData(null);
      return;
    }

    if (!targetZip || targetZip.trim().length < 5) {
      setTaxData(null);
      return;
    }

    const cleanZip = targetZip.trim().substring(0, 5);

    const fetchTax = async () => {
      setTaxLoading(true);
      try {
        const { data, error } = await supabase
          .from('tax_rates')
          .select('*')
          .eq('ZipCode', cleanZip)
          .maybeSingle(); 
          
        if (error) throw error;
        setTaxData(data || null);
      } catch (err) {
        console.error("Error fetching live tax:", err);
        setTaxData(null);
      } finally {
        setTaxLoading(false);
      }
    };

    const timeoutId = setTimeout(() => { fetchTax(); }, 500);
    return () => clearTimeout(timeoutId);
  }, [isB2B, profile?.companies?.tax_exempt, selectedPatient?.zip, retailInfo?.zip, shipToAgency, profile?.companies?.zip]);

  const filteredPatients = patients.filter(p => p.full_name.toLowerCase().includes(patientSearch.toLowerCase()));

  // EXECUTE DELETE FROM CONFIRMATION MODAL
  const executeRemoveFromCart = () => {
    if (itemToDelete !== null) {
      setCart(prevCart => prevCart.filter((_, index) => index !== itemToDelete));
      setItemToDelete(null);
    }
  };

  const handleApplyAddress = () => {
    if (!retailInfo.full_name || !retailInfo.email || !retailInfo.phone || !retailInfo.address || !retailInfo.city || !retailInfo.state || !retailInfo.zip) {
      setError('Please fill out all required shipping fields, including email and phone.');
      window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    }
    if (!billingSameAsShipping && (!billingInfo.address || !billingInfo.city || !billingInfo.state || !billingInfo.zip)) {
      setError('Please fill out all required billing address fields.');
      window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    }
    setError(''); setIsEditingRetail(false); 
  };

  const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0);
  const shippingFee = isB2B ? Number(profile?.companies?.shipping_fee || 0) : 10.00; 
  
  const taxRate = (isB2B && profile?.companies?.tax_exempt) ? 0 : (taxData ? Number(taxData.EstimatedCombinedRate) : 0);
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + shippingFee + taxAmount;

  const isCreditExceeded = isB2B && paymentMethod === 'net_30' && totalAmount > financials.available;

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || isCreditExceeded || taxLoading) return;
    
    // Updated validation to allow passing if shipToAgency is checked
    if (isB2B && !shipToAgency && !selectedPatient) { setError('Please select a patient or select "Ship to Agency".'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!isB2B && (isEditingRetail || !retailInfo.address || !retailInfo.phone)) { setError('Please confirm your shipping address and phone number.'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

    setLoading(true); setError('');

    try {
      // Grab shipping info dynamically based on shipToAgency toggle
      const sName = isB2B ? (shipToAgency ? profile?.companies?.name : selectedPatient.full_name) : retailInfo.full_name;
      const sAddress = isB2B ? (shipToAgency ? profile?.companies?.address : selectedPatient.address) : retailInfo.address;
      const sCity = isB2B ? (shipToAgency ? profile?.companies?.city : selectedPatient.city) : retailInfo.city;
      const sState = isB2B ? (shipToAgency ? profile?.companies?.state : selectedPatient.state) : retailInfo.state;
      const sZip = isB2B ? (shipToAgency ? profile?.companies?.zip : selectedPatient.zip) : retailInfo.zip;
      const sEmail = isB2B ? (shipToAgency ? profile?.companies?.email : selectedPatient.email) : retailInfo.email;
      const sPhone = isB2B ? (shipToAgency ? (profile?.companies?.phone || profile?.contact_number) : (selectedPatient.phone || selectedPatient.contact_number)) : retailInfo.phone;

      const { data: order, error: orderError } = await supabase.from('orders').insert({
          user_id: profile.id, 
          company_id: profile.company_id || null, 
          patient_id: (isB2B && !shipToAgency) ? selectedPatient.id : null,
          
          shipping_name: sName, 
          shipping_address: sAddress,
          shipping_city: sCity, 
          shipping_state: sState,
          shipping_zip: sZip,
          
          shipping_email: sEmail,
          shipping_phone: sPhone,

          status: 'pending', payment_method: paymentMethod, payment_status: 'unpaid',
          subtotal, tax_amount: taxAmount, shipping_amount: shippingFee, total_amount: totalAmount,
        }).select().single();

      if (orderError) throw orderError;

      const orderItems = cart.map(item => ({
        order_id: order.id, product_variant_id: item.variant_id, quantity_variants: item.quantity,
        total_base_units: item.quantity * (item.multiplier || 1), unit_price: item.unit_price, line_total: item.line_total
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      if (!isB2B && saveToProfile) {
        await supabase.from('user_profiles').update({
          full_name: retailInfo.full_name, contact_number: retailInfo.phone, email: retailInfo.email,
          address: retailInfo.address, city: retailInfo.city, state: retailInfo.state, zip: retailInfo.zip
        }).eq('id', profile.id);
      }

      setShowSuccess(true);
    } catch (err) {
      console.error(err.message); setError('Failed to place order. Please try again.');
    } finally { setLoading(false); }
  };

  const finishCheckout = () => { localStorage.removeItem(cartKey); setCart([]); setShowSuccess(false); navigate('/orders'); };

  if (!cartLoaded || cart.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm mt-10">
        <Package size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-5" />
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Your cart is empty</h2>
        <button onClick={() => navigate('/catalog')} className="mt-8 px-6 py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 active:scale-95 shadow-sm">Return to Catalog</button>
      </div>
    );
  }

  // 🚀 FLOATING LABEL CSS CLASSES
  const inputClass = "block w-full px-4 pt-6 pb-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-bold text-slate-900 transition-all shadow-sm peer placeholder-transparent";
  const floatingLabelClass = "absolute text-sm text-slate-400 duration-300 transform -translate-y-2.5 scale-[0.8] top-3.5 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-1 peer-focus:scale-[0.8] peer-focus:-translate-y-2.5 peer-focus:text-blue-600 peer-focus:font-bold pointer-events-none";

  const currentCartItems = cart.slice((cartPage - 1) * ITEMS_PER_PAGE, cartPage * ITEMS_PER_PAGE);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 relative">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button onClick={() => navigate('/catalog')} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to Catalog</button>
        <div className="hidden sm:block w-px h-6 bg-slate-200 mx-2"></div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Secure Checkout</h2>
      </div>

      {error && (<div className="p-4 bg-red-50 text-red-700 font-medium rounded-xl border border-red-100 text-sm flex items-center gap-3"><AlertCircle size={18} /> {error}</div>)}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        <div className="lg:col-span-7 space-y-5">
          {isB2B ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                
                {/* B2B BILL TO CARD */}
                <div className="border border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col h-full overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                    <Building size={14} className="text-blue-600" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Agency Billing</h4>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <p className="font-extrabold text-slate-900 text-base mb-3 tracking-tight">{profile?.companies?.name || 'Your Agency'}</p>
                    
                    <div className="space-y-2.5 text-sm font-medium text-slate-600">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100"><Mail size={14}/></div>
                        <span className="truncate">{profile?.companies?.email || <span className="italic text-slate-400">No email provided</span>}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100"><Phone size={14}/></div>
                        <span>{profile?.companies?.phone || profile?.contact_number || <span className="italic text-slate-400">No phone provided</span>}</span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100 shrink-0"><MapPin size={14}/></div>
                        <span className="leading-snug">
                          {profile?.companies?.address || <span className="italic text-slate-400">No address provided</span>}
                          {profile?.companies?.city && <><br/>{profile.companies.city}, {profile.companies.state} {profile.companies.zip}</>}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* B2B SHIP TO CARD */}
                <div className="border border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col h-full overflow-hidden transition-all duration-300">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Package size={14} className={shipToAgency ? "text-blue-600" : "text-emerald-600"} />
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">{shipToAgency ? 'Ship To Agency' : 'Ship to Patient'}</h4>
                    </div>
                    {(selectedPatient && !shipToAgency) && (
                      <button onClick={() => setSelectedPatient(null)} className="text-[10px] px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-500 hover:text-red-600 hover:border-red-200 transition-all shadow-sm">
                        Change
                      </button>
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-center">
                    
                    {/* If Shipping to Agency, mirror the Bill To card */}
                    {shipToAgency ? (
                      <div className="animate-in fade-in zoom-in-95 duration-200">
                        <p className="font-extrabold text-slate-900 text-base mb-3 tracking-tight">{profile?.companies?.name || 'Your Agency'}</p>
                        <div className="space-y-2.5 text-sm font-medium text-slate-600">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100"><Mail size={14}/></div>
                            <span className="truncate">{profile?.companies?.email || <span className="italic text-slate-400">No email provided</span>}</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100"><Phone size={14}/></div>
                            <span>{profile?.companies?.phone || profile?.contact_number || <span className="italic text-slate-400">No phone provided</span>}</span>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100 shrink-0"><MapPin size={14}/></div>
                            <span className="leading-snug">
                              {profile?.companies?.address || <span className="italic text-slate-400">No address provided</span>}
                              {profile?.companies?.city && <><br/>{profile.companies.city}, {profile.companies.state} {profile.companies.zip}</>}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* If Shipping to Patient, show search or patient details */
                      !selectedPatient ? (
                        <div className="relative animate-in fade-in" ref={dropdownRef}>
                          <div className="relative cursor-pointer" onClick={() => setShowDropdown(true)}>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input type="text" placeholder="Select or search patient..." value={patientSearch} onChange={(e) => { setPatientSearch(e.target.value); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 shadow-sm transition-all" />
                            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} size={16} />
                          </div>
                          {showDropdown && (
                            <div className="absolute z-30 w-full mt-2 bg-white border border-slate-200 shadow-xl rounded-xl max-h-60 overflow-y-auto">
                              {filteredPatients.length > 0 ? filteredPatients.map(p => (
                                <button key={p.id} onClick={() => { setSelectedPatient(p); setShowDropdown(false); setPatientSearch(''); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 flex flex-col group"><div className="flex items-center gap-2"><User size={14} className="text-slate-400 group-hover:text-blue-600" /><p className="font-bold text-slate-900 text-sm group-hover:text-blue-700">{p.full_name}</p></div><p className="text-xs text-slate-500 mt-1 pl-6">{p.address ? `${p.address}, ${p.city}` : 'No address saved'}</p></button>
                              )) : (<div className="px-4 py-6 text-sm text-slate-500 text-center"><User size={24} className="text-slate-300 mb-2 mx-auto" />No patients found</div>)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="animate-in fade-in zoom-in-95 duration-200">
                          <p className="font-extrabold text-slate-900 text-base mb-3 tracking-tight">{selectedPatient.full_name}</p>
                          <div className="space-y-2.5 text-sm font-medium text-slate-600">
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100"><Mail size={14}/></div>
                              <span className="truncate">{selectedPatient.email || <span className="italic text-slate-400">No email provided</span>}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100"><Phone size={14}/></div>
                              <span>{selectedPatient.phone || selectedPatient.contact_number || <span className="italic text-slate-400">No phone provided</span>}</span>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100 shrink-0"><MapPin size={14}/></div>
                              <span className="leading-snug">
                                {selectedPatient.address}
                                {selectedPatient.city && <><br/>{selectedPatient.city}, {selectedPatient.state} {selectedPatient.zip}</>}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* SHIP TO AGENCY CHECKBOX */}
              <div className="px-1 pt-1">
                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      checked={shipToAgency} 
                      onChange={e => setShipToAgency(e.target.checked)} 
                      className="peer w-5 h-5 appearance-none border-2 border-slate-300 rounded-md bg-white checked:bg-slate-900 checked:border-slate-900 cursor-pointer transition-all" 
                    />
                    <CheckCircle2 size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" strokeWidth={3} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                    Ship directly to Agency Billing Address
                  </span>
                </label>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base tracking-tight">Shipping Details</h3>
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5">Where should we send your order?</p>
                  </div>
                </div>
                {!isEditingRetail && (
                  <button onClick={() => setIsEditingRetail(true)} className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5">
                    <Edit2 size={12} /> Edit
                  </button>
                )}
              </div>
              
              <div className="p-5 sm:p-6 bg-slate-50/20">
                {isEditingRetail ? (
                  <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-4">
                      
                      {/* RETAIL EDIT FORM - USING FLOATING LABELS */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="relative sm:col-span-2">
                          <input type="text" id="ship_name" value={retailInfo.full_name} onChange={e => setRetailInfo({...retailInfo, full_name: e.target.value})} className={inputClass} placeholder=" " />
                          <label htmlFor="ship_name" className={floatingLabelClass}>Full Name <span className="text-red-500">*</span></label>
                        </div>
                        <div className="relative">
                          <input type="email" id="ship_email" value={retailInfo.email} onChange={e => setRetailInfo({...retailInfo, email: e.target.value})} className={inputClass} placeholder=" " />
                          <label htmlFor="ship_email" className={floatingLabelClass}>Email Address <span className="text-red-500">*</span></label>
                        </div>
                        <div className="relative">
                          <input type="tel" id="ship_phone" value={retailInfo.phone} onChange={e => setRetailInfo({...retailInfo, phone: e.target.value})} className={inputClass} placeholder=" " />
                          <label htmlFor="ship_phone" className={floatingLabelClass}>Phone Number <span className="text-red-500">*</span></label>
                        </div>
                      </div>

                      <div className="h-px w-full bg-slate-200/60 my-2"></div>

                      <div className="space-y-4">
                        <div className="relative">
                          <input type="text" id="ship_addr" value={retailInfo.address} onChange={e => setRetailInfo({...retailInfo, address: e.target.value})} className={inputClass} placeholder=" " />
                          <label htmlFor="ship_addr" className={floatingLabelClass}>Street Address <span className="text-red-500">*</span></label>
                        </div>
                        <div className="grid grid-cols-6 gap-4">
                          <div className="relative col-span-6 sm:col-span-3">
                            <input type="text" id="ship_city" value={retailInfo.city} onChange={e => setRetailInfo({...retailInfo, city: e.target.value})} className={inputClass} placeholder=" " />
                            <label htmlFor="ship_city" className={floatingLabelClass}>City <span className="text-red-500">*</span></label>
                          </div>
                          <div className="relative col-span-3 sm:col-span-1">
                            <input type="text" id="ship_state" value={retailInfo.state} onChange={e => setRetailInfo({...retailInfo, state: e.target.value})} className={inputClass} placeholder=" " />
                            <label htmlFor="ship_state" className={floatingLabelClass}>State <span className="text-red-500">*</span></label>
                          </div>
                          <div className="relative col-span-3 sm:col-span-2">
                            <input type="text" id="ship_zip" value={retailInfo.zip} onChange={e => setRetailInfo({...retailInfo, zip: e.target.value})} className={inputClass} placeholder=" " />
                            <label htmlFor="ship_zip" className={floatingLabelClass}>ZIP Code <span className="text-red-500">*</span></label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-4 shadow-sm">
                      <label className="flex items-center gap-3 cursor-pointer group w-fit">
                        <div className="relative flex items-center justify-center">
                          <input type="checkbox" checked={billingSameAsShipping} onChange={e => setBillingSameAsShipping(e.target.checked)} className="peer w-4 h-4 appearance-none border-2 border-slate-300 rounded bg-white checked:bg-blue-600 checked:border-blue-600 cursor-pointer transition-all" />
                          <CheckCircle2 size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" strokeWidth={3} />
                        </div>
                        <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">Billing address matches shipping</span>
                      </label>

                      {/* BILLING INFO - FLOATING LABELS */}
                      {!billingSameAsShipping && (
                        <div className="pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center gap-2 mb-4"><CreditCard size={14} className="text-slate-400" /><h4 className="text-sm font-bold text-slate-900">Billing Address</h4></div>
                          <div className="space-y-4">
                            <div className="relative">
                              <input type="text" id="bill_addr" value={billingInfo.address} onChange={e => setBillingInfo({...billingInfo, address: e.target.value})} className={inputClass} placeholder=" " />
                              <label htmlFor="bill_addr" className={floatingLabelClass}>Street Address</label>
                            </div>
                            <div className="grid grid-cols-6 gap-4">
                              <div className="relative col-span-6 sm:col-span-3">
                                <input type="text" id="bill_city" value={billingInfo.city} onChange={e => setBillingInfo({...billingInfo, city: e.target.value})} className={inputClass} placeholder=" " />
                                <label htmlFor="bill_city" className={floatingLabelClass}>City</label>
                              </div>
                              <div className="relative col-span-3 sm:col-span-1">
                                <input type="text" id="bill_state" value={billingInfo.state} onChange={e => setBillingInfo({...billingInfo, state: e.target.value})} className={inputClass} placeholder=" " />
                                <label htmlFor="bill_state" className={floatingLabelClass}>State</label>
                              </div>
                              <div className="relative col-span-3 sm:col-span-2">
                                <input type="text" id="bill_zip" value={billingInfo.zip} onChange={e => setBillingInfo({...billingInfo, zip: e.target.value})} className={inputClass} placeholder=" " />
                                <label htmlFor="bill_zip" className={floatingLabelClass}>ZIP</label>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer group w-fit">
                      <div className="relative flex items-center justify-center">
                        <input type="checkbox" checked={saveToProfile} onChange={e => setSaveToProfile(e.target.checked)} className="peer w-4 h-4 appearance-none border-2 border-slate-300 rounded bg-white checked:bg-slate-900 checked:border-slate-900 cursor-pointer transition-all" />
                        <CheckCircle2 size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" strokeWidth={3} />
                      </div>
                      <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Save as default address for future orders</span>
                    </label>

                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
                      {profile?.address && (<button onClick={() => setIsEditingRetail(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">Cancel</button>)}
                      <button onClick={handleApplyAddress} className="px-6 py-2.5 text-sm font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 active:scale-95 shadow-md transition-all w-full sm:w-auto">Use this Address</button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch animate-in fade-in zoom-in-95 duration-200">
                    
                    {/* RETAIL SHIP TO CARD */}
                    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col h-full overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                        <Package size={14} className="text-emerald-600"/>
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Ship To</h4>
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <p className="font-extrabold text-slate-900 text-base mb-3 tracking-tight">{retailInfo.full_name}</p>
                        <div className="space-y-2.5 text-sm font-medium text-slate-600">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100"><Mail size={14}/></div>
                            <span className="truncate">{retailInfo.email || <span className="italic text-slate-400">No email</span>}</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100"><Phone size={14}/></div>
                            <span>{retailInfo.phone || <span className="italic text-slate-400">No phone</span>}</span>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100 shrink-0"><MapPin size={14}/></div>
                            <span className="leading-snug">
                              {retailInfo.address}<br/>
                              {retailInfo.city}, {retailInfo.state} {retailInfo.zip}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RETAIL BILL TO CARD */}
                    {!billingSameAsShipping && (
                      <div className="border border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col h-full overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                          <CreditCard size={14} className="text-blue-600"/>
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Bill To</h4>
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <p className="font-extrabold text-slate-900 text-base mb-3 tracking-tight">{retailInfo.full_name}</p>
                          <div className="space-y-2.5 text-sm font-medium text-slate-600">
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100"><Mail size={14}/></div>
                              <span className="truncate">{retailInfo.email || <span className="italic text-slate-400">No email</span>}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100"><Phone size={14}/></div>
                              <span>{retailInfo.phone || <span className="italic text-slate-400">No phone</span>}</span>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100 shrink-0"><MapPin size={14}/></div>
                              <span className="leading-snug">
                                {billingInfo.address}<br/>
                                {billingInfo.city}, {billingInfo.state} {billingInfo.zip}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PAGINATED ORDER ITEMS CARD */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/30 flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center">
                <Package size={16} />
              </div>
              <h3 className="font-bold text-slate-900 text-base tracking-tight">Order Items <span className="text-slate-400 font-medium ml-1">({cart.length})</span></h3>
            </div>
            <div className="divide-y divide-slate-100 p-2 flex-1">
              {currentCartItems.map((item, localIndex) => {
                const actualIndex = (cartPage - 1) * ITEMS_PER_PAGE + localIndex;
                
                return (
                  <div key={actualIndex} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/80 rounded-xl transition-colors">
                    <div className="pr-4 flex-1">
                      <p className="font-bold text-slate-900 text-sm leading-snug">{item.name}</p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">{item.quantity} x ${item.unit_price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                      <p className="font-extrabold text-slate-900 text-base">${item.line_total.toFixed(2)}</p>
                      <button 
                        onClick={() => setItemToDelete(actualIndex)} 
                        className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all shadow-sm border border-transparent hover:border-red-100 active:scale-90"
                        title="Remove Item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination Controls */}
            {totalCartPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs font-medium text-slate-500">
                  Showing <span className="font-bold text-slate-700">{(cartPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-bold text-slate-700">{Math.min(cartPage * ITEMS_PER_PAGE, cart.length)}</span>
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setCartPage(p => Math.max(1, p - 1))} 
                    disabled={cartPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button 
                    onClick={() => setCartPage(p => Math.min(totalCartPages, p + 1))} 
                    disabled={cartPage === totalCartPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-5 sticky top-24">
          <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center shadow-md">
                <CreditCard size={16} />
              </div>
              <h3 className="font-bold text-slate-900 text-base tracking-tight">Payment Details</h3>
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Billing Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-900 shadow-inner transition-all">
                <option value="net_30">Net 30 Terms (Invoice)</option>
                <option value="cod">Cash on Delivery</option>
              </select>
            </div>

            {/* EXACT 2 DECIMAL FORMATTING */}
            {isB2B && paymentMethod === 'net_30' && (
              <div className={`p-4 rounded-xl border ${isCreditExceeded ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'} space-y-2 text-sm mt-3 shadow-sm`}>
                <div className="flex justify-between font-medium text-slate-500">
                  <span>Credit Limit</span>
                  <span>${financials.limit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between font-medium text-slate-500">
                  <span>Unpaid Invoices</span>
                  <span>-${financials.outstanding.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="h-px w-full bg-slate-200/60 my-1.5"></div>
                <div className="flex justify-between font-medium text-slate-700">
                  <span>Available Credit</span>
                  <span>${financials.available.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between font-medium text-slate-700">
                  <span>This Order</span>
                  <span className="text-red-500">-${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="h-px w-full bg-slate-200/60 my-1.5"></div>
                <div className={`flex justify-between font-bold ${isCreditExceeded ? 'text-red-600' : 'text-emerald-600'}`}>
                  <span>Remaining Credit</span>
                  <span>${(financials.available - totalAmount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              </div>
            )}
            
            <div className="h-px w-full bg-slate-100 my-4"></div>

            <div className="space-y-3 text-sm font-medium">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="text-slate-900">${subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Shipping</span><span className="text-slate-900">${shippingFee.toFixed(2)}</span></div>
              
              <div className="flex flex-col text-slate-500">
                <div className="flex justify-between items-center w-full">
                  <span 
                    className={`flex items-center gap-1.5 ${taxData ? 'cursor-pointer hover:text-slate-800 transition-colors' : ''}`}
                    onClick={() => taxData && setShowTaxBreakdown(!showTaxBreakdown)}
                  >
                    Estimated Tax 
                    {(isB2B && profile?.companies?.tax_exempt) && <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ml-1 border border-blue-100 shadow-sm">Exempt</span>}
                    {taxLoading && <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500 animate-pulse bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">Calculating...</span>}
                    {taxData && !taxLoading && <ChevronDown size={14} className={`transition-transform duration-200 text-slate-400 ${showTaxBreakdown ? 'rotate-180' : ''}`} />}
                  </span>
                  <span className="text-slate-900">${taxAmount.toFixed(2)}</span>
                </div>
                
                {showTaxBreakdown && taxData && (
                  <div className="mt-2.5 pl-3 ml-1.5 border-l-2 border-slate-200 space-y-2 text-xs font-medium text-slate-500 animate-in fade-in slide-in-from-top-1">
                    <div className="pb-1.5 mb-1.5 border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Jurisdiction: {taxData.TaxRegionName}
                    </div>
                    {Number(taxData.StateRate) > 0 && (
                      <div className="flex justify-between items-center">
                        <span>{taxData.State} State Tax ({parseFloat((Number(taxData.StateRate) * 100).toFixed(3))}%)</span>
                        <span className="text-slate-700">${(subtotal * Number(taxData.StateRate)).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(taxData.EstimatedCountyRate) > 0 && (
                      <div className="flex justify-between items-center">
                        <span>County Tax ({parseFloat((Number(taxData.EstimatedCountyRate) * 100).toFixed(3))}%)</span>
                        <span className="text-slate-700">${(subtotal * Number(taxData.EstimatedCountyRate)).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(taxData.EstimatedCityRate) > 0 && (
                      <div className="flex justify-between items-center">
                        <span>City/Local Tax ({parseFloat((Number(taxData.EstimatedCityRate) * 100).toFixed(3))}%)</span>
                        <span className="text-slate-700">${(subtotal * Number(taxData.EstimatedCityRate)).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(taxData.EstimatedSpecialRate) > 0 && (
                      <div className="flex justify-between items-center">
                        <span>District Tax ({parseFloat((Number(taxData.EstimatedSpecialRate) * 100).toFixed(3))}%)</span>
                        <span className="text-slate-700">${(subtotal * Number(taxData.EstimatedSpecialRate)).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-end pt-4 border-t border-slate-200 mt-3"><span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total</span><span className="text-3xl font-black text-slate-900 tracking-tight leading-none">${totalAmount.toFixed(2)}</span></div>
            </div>

            <button 
              onClick={handlePlaceOrder} 
              disabled={loading || taxLoading || (isB2B && !shipToAgency && !selectedPatient) || (!isB2B && (isEditingRetail || !retailInfo.address || !retailInfo.phone))} 
              className={`w-full mt-5 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-xl transition-all duration-200 ${((isB2B && !shipToAgency && !selectedPatient) || (!isB2B && (isEditingRetail || !retailInfo.address || !retailInfo.phone))) ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' : 'bg-slate-900 text-white hover:bg-slate-800 hover:-translate-y-0.5 active:translate-y-0 active:scale-95'}`}
            >
              {loading ? 'Processing...' : taxLoading ? 'Calculating Tax...' : (<><Receipt size={18} /> Place Order</>)}
            </button>
            
            {(isB2B && !shipToAgency && !selectedPatient) && (<p className="text-xs text-center text-red-500 font-bold animate-pulse">* Please select a patient or agency shipping</p>)}
            {(!isB2B && isEditingRetail) && (<p className="text-xs text-center text-amber-500 font-bold animate-pulse">* Please save your shipping details to continue</p>)}
          </div>
        </div>
      </div>

      {/* REMOVE ITEM CONFIRMATION MODAL */}
      {itemToDelete !== null && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm p-10 text-center border border-slate-100">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 border-2 shadow-sm bg-red-50 text-red-600 border-red-100">
              <AlertTriangle size={36} />
            </div>
            <h4 className="text-2xl font-black text-slate-900 tracking-tight">Remove Item?</h4>
            <p className="text-sm text-slate-500 mt-3 font-medium leading-relaxed">
              Are you sure you want to remove <span className="font-bold text-slate-800">"{cart[itemToDelete]?.name}"</span> from your cart?
            </p>
            <div className="flex gap-4 pt-8">
              <button 
                onClick={() => setItemToDelete(null)} 
                className="w-full py-4 text-sm bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={executeRemoveFromCart} 
                className="w-full py-4 text-sm text-white font-bold rounded-2xl shadow-lg active:scale-95 flex items-center justify-center gap-2 transition-all bg-red-600 hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {showSuccess && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm p-10 text-center border border-slate-100 zoom-in-95 animate-in duration-300">
            <div className="w-24 h-24 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><CheckCircle2 size={48} strokeWidth={2.5} /></div>
            <h4 className="text-3xl font-black text-slate-900 tracking-tight">Success!</h4>
            <p className="text-slate-500 mt-3 font-medium leading-relaxed">Your order has been received and is being processed.</p>
            <button onClick={finishCheckout} className="w-full mt-8 py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-lg hover:bg-slate-800 active:scale-95 transition-all">View Order History</button>
          </div>
        </div>
      )}
    </div>
  );
}
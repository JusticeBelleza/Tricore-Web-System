import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js'; 
import { 
  Search, UserPlus, Trash2, Shield, Mail, Phone, Lock, 
  CheckCircle2, XCircle, X, Users, Building, ShoppingBag, 
  MapPin, Building2, DollarSign, UploadCloud, 
  DownloadCloud, Save, ChevronLeft, ChevronRight, Package, ChevronDown, Wallet, MoreVertical, Edit3,
  Edit, User, Truck
} from 'lucide-react';

export default function AdminUsers() {
  const [activeTab, setActiveTab] = useState('staff'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [staffList, setStaffList] = useState([]);
  const [b2bList, setB2bList] = useState([]);
  const [retailList, setRetailList] = useState([]);
  
  const [companyBalances, setCompanyBalances] = useState({});
  const [agencyPatientCounts, setAgencyPatientCounts] = useState({}); 
  const [activeMenuId, setActiveMenuId] = useState(null); 

  // Modals
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showAddB2bModal, setShowAddB2bModal] = useState(false);
  const [showAddRetailModal, setShowAddRetailModal] = useState(false);
  const [showEditAgencyModal, setShowEditAgencyModal] = useState(false);
  const [creditLimitModal, setCreditLimitModal] = useState({ show: false, companyId: null, companyName: '', limit: '' });
  const [shippingFeeModal, setShippingFeeModal] = useState({ show: false, companyId: null, companyName: '', fee: '' });
  
  // Pricing Modal States
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [activeCompany, setActiveCompany] = useState(null);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [expandedPricingRows, setExpandedPricingRows] = useState({});
  const [companyRules, setCompanyRules] = useState({}); 
  const [editedRules, setEditedRules] = useState({});   
  const [pricingSearch, setPricingSearch] = useState('');
  const [pricingPage, setPricingPage] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const ITEMS_PER_PAGE = 15;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState({ show: false, type: '', title: '', message: '', data: null });
  
  const [toast, setToast] = useState({ show: false, message: '', isError: false });

  // Forms
  const [staffForm, setStaffForm] = useState({ full_name: '', email: '', contact_number: '', role: 'Warehouse', password: '', confirm_password: '' });
  const [b2bForm, setB2bForm] = useState({ company_name: '', address: '', city: '', state: '', zip: '', admin_name: '', admin_email: '', admin_phone: '', password: '', confirm_password: '', credit_limit: '', shipping_fee: '' });
  const [retailForm, setRetailForm] = useState({ full_name: '', email: '', contact_number: '', address: '', city: '', state: '', zip: '', password: '', confirm_password: '' });
  const [editAgencyForm, setEditAgencyForm] = useState({ userId: '', companyId: '', company_name: '', address: '', city: '', state: '', zip: '', admin_name: '', admin_phone: '' });

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('user_profiles').select('*, companies(*)').order('full_name', { ascending: true });
      if (error) throw error;

      // Fetch Balances
      const { data: unpaidOrders } = await supabase.from('orders').select('company_id, total_amount').eq('payment_status', 'unpaid').not('company_id', 'is', null);
      const balances = {};
      if (unpaidOrders) { unpaidOrders.forEach(o => { balances[o.company_id] = (balances[o.company_id] || 0) + Number(o.total_amount); }); }
      setCompanyBalances(balances);

      // Fetch Patient Counts per Agency
      const { data: patientsData } = await supabase.from('agency_patients').select('agency_id');
      const pCounts = {};
      if (patientsData) {
        patientsData.forEach(p => {
          if (p.agency_id) pCounts[p.agency_id] = (pCounts[p.agency_id] || 0) + 1;
        });
      }
      setAgencyPatientCounts(pCounts);

      const profiles = data || [];
      
      // Sort Staff: Admins at top, then alphabetical
      const staff = profiles.filter(p => ['admin', 'warehouse', 'driver'].includes(p.role?.toLowerCase()));
      staff.sort((a, b) => {
        if (a.role?.toLowerCase() === 'admin' && b.role?.toLowerCase() !== 'admin') return -1;
        if (a.role?.toLowerCase() !== 'admin' && b.role?.toLowerCase() === 'admin') return 1;
        return a.full_name?.localeCompare(b.full_name);
      });

      // Group B2B users by Agency so sub-admins don't clutter the table
      const b2bProfiles = profiles.filter(p => p.role?.toLowerCase() === 'b2b');
      const uniqueB2bMap = new Map();
      
      b2bProfiles.forEach(p => {
        const compId = p.companies?.id;
        if (!compId) {
          uniqueB2bMap.set(p.id, p); 
        } else {
          if (!uniqueB2bMap.has(compId)) {
            uniqueB2bMap.set(compId, p);
          } else {
            // Overwrite if this user is the Primary Admin (email matches company email)
            if (p.email === p.companies.email) {
              uniqueB2bMap.set(compId, p);
            }
          }
        }
      });

      setStaffList(staff);
      setB2bList(Array.from(uniqueB2bMap.values()));
      setRetailList(profiles.filter(p => p.role?.toLowerCase() === 'retail' || p.role?.toLowerCase() === 'user'));
    } catch (error) { console.error('Error fetching users:', error); } finally { setLoading(false); }
  };

  const totalOutstanding = Object.values(companyBalances).reduce((sum, val) => sum + val, 0);

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatNumberInput = (val) => {
    if (!val) return '';
    let raw = val.toString().replace(/[^0-9.]/g, ''); 
    const parts = raw.split('.');
    if (parts.length > 2) parts.pop(); 
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); 
    return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
  };

  const showToast = (message, isError = false) => {
    setToast({ show: true, message, isError });
    setTimeout(() => setToast({ show: false, message: '', isError: false }), 4000);
  };

  // --- ACTIONS ---
  const triggerAddStaffConfirm = (e) => {
    e.preventDefault();
    if (staffForm.password !== staffForm.confirm_password) return showToast("Passwords do not match!", true);
    if (staffForm.password.length < 6) return showToast("Password must be at least 6 characters.", true);
    setConfirmAction({ show: true, type: 'add_staff', title: 'Create Staff Account?', message: `Are you sure you want to create an account for ${staffForm.full_name}?`, data: staffForm });
  };

  const executeAddStaff = async () => {
    setConfirmAction({ show: false }); setIsSubmitting(true);
    try {
      const tempSupabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: authError } = await tempSupabase.auth.signUp({ email: confirmAction.data.email, password: confirmAction.data.password, options: { data: { full_name: confirmAction.data.full_name, role: confirmAction.data.role.toLowerCase(), contact_number: confirmAction.data.contact_number, company_id: null } } });
      if (authError) throw authError;
      setTimeout(() => { fetchUsers(); setShowAddStaffModal(false); setStaffForm({ full_name: '', email: '', contact_number: '', role: 'Warehouse', password: '', confirm_password: '' }); showToast('Staff account created successfully!'); setIsSubmitting(false); }, 1500);
    } catch (error) { showToast(error.message, true); setIsSubmitting(false); }
  };

  const triggerAddRetailConfirm = (e) => {
    e.preventDefault();
    if (retailForm.password !== retailForm.confirm_password) return showToast("Passwords do not match!", true);
    if (retailForm.password.length < 6) return showToast("Password must be at least 6 characters.", true);
    setConfirmAction({ show: true, type: 'add_retail', title: 'Add Retail Customer?', message: `Create account for ${retailForm.full_name}?`, data: retailForm });
  };

  const executeAddRetail = async () => {
    setConfirmAction({ show: false }); setIsSubmitting(true);
    try {
      const tempSupabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error: authError } = await tempSupabase.auth.signUp({ 
        email: confirmAction.data.email, password: confirmAction.data.password, 
        options: { data: { full_name: confirmAction.data.full_name, role: 'retail', contact_number: confirmAction.data.contact_number } } 
      });
      if (authError) throw authError;

      if (data?.user?.id) {
        await supabase.from('user_profiles').update({
          address: confirmAction.data.address, city: confirmAction.data.city, state: confirmAction.data.state, zip: confirmAction.data.zip
        }).eq('id', data.user.id);
      }

      setTimeout(() => { fetchUsers(); setShowAddRetailModal(false); setRetailForm({ full_name: '', email: '', contact_number: '', address: '', city: '', state: '', zip: '', password: '', confirm_password: '' }); showToast('Retail customer created successfully!'); setIsSubmitting(false); }, 1500);
    } catch (error) { showToast(error.message, true); setIsSubmitting(false); }
  };

  const triggerAddB2bConfirm = (e) => {
    e.preventDefault();
    if (b2bForm.password !== b2bForm.confirm_password) return showToast("Passwords do not match!", true);
    if (b2bForm.password.length < 6) return showToast("Password must be at least 6 characters.", true);
    setConfirmAction({ show: true, type: 'add_b2b', title: 'Create B2B Agency?', message: `Register ${b2bForm.company_name}?`, data: b2bForm });
  };

  const executeAddB2b = async () => {
    setConfirmAction({ show: false }); setIsSubmitting(true);
    try {
      const rawLimit = Number(confirmAction.data.credit_limit.replace(/,/g, '')) || 0; 
      const rawShippingFee = Number(confirmAction.data.shipping_fee.replace(/,/g, '')) || 0; 
      
      const { data: company, error: companyError } = await supabase.from('companies').insert([{
        name: confirmAction.data.company_name, address: confirmAction.data.address, city: confirmAction.data.city, state: confirmAction.data.state, zip: confirmAction.data.zip, phone: confirmAction.data.admin_phone, email: confirmAction.data.admin_email, account_type: 'B2B', credit_limit: rawLimit, shipping_fee: rawShippingFee
      }]).select().single();
      if (companyError) throw companyError;

      const tempSupabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: authError } = await tempSupabase.auth.signUp({ email: confirmAction.data.admin_email, password: confirmAction.data.password, options: { data: { full_name: confirmAction.data.admin_name, role: 'b2b', contact_number: confirmAction.data.admin_phone, company_id: company.id } } });
      if (authError) throw authError;

      setTimeout(() => { fetchUsers(); setShowAddB2bModal(false); setB2bForm({ company_name: '', address: '', city: '', state: '', zip: '', admin_name: '', admin_email: '', admin_phone: '', password: '', confirm_password: '', credit_limit: '', shipping_fee: '' }); showToast('Agency account created successfully!'); setIsSubmitting(false); }, 1500);
    } catch (error) { showToast(error.message, true); setIsSubmitting(false); }
  };

  const handleEditAgencySubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error: compError } = await supabase.from('companies').update({
        name: editAgencyForm.company_name, address: editAgencyForm.address, city: editAgencyForm.city, state: editAgencyForm.state, zip: editAgencyForm.zip, phone: editAgencyForm.admin_phone
      }).eq('id', editAgencyForm.companyId);
      if (compError) throw compError;

      const { error: profileError } = await supabase.from('user_profiles').update({
        full_name: editAgencyForm.admin_name, contact_number: editAgencyForm.admin_phone
      }).eq('id', editAgencyForm.userId);
      if (profileError) throw profileError;

      fetchUsers(); setShowEditAgencyModal(false);
      showToast('Agency details updated!');
    } catch (error) {
      showToast(error.message, true);
    } finally { setIsSubmitting(false); }
  };

  const triggerDeleteConfirmation = (id, name) => setConfirmAction({ show: true, type: 'delete', title: 'Delete User?', message: `Permanently delete ${name}?`, data: id });
  const executeDeleteUser = async () => {
    setConfirmAction({ show: false });
    try {
      const { error } = await supabase.rpc('delete_user', { user_id: confirmAction.data });
      if (error) throw error;
      fetchUsers(); showToast('User deleted.');
    } catch (error) { showToast(error.message, true); }
  };

  const handleSaveCreditLimit = async (e) => {
    e.preventDefault(); setIsSubmitting(true);
    try {
      const newLimit = Number(creditLimitModal.limit.replace(/,/g, '')); 
      const { error } = await supabase.from('companies').update({ credit_limit: newLimit }).eq('id', creditLimitModal.companyId);
      if (error) throw error;
      setB2bList(prev => prev.map(u => { if (u.companies?.id === creditLimitModal.companyId) { return { ...u, companies: { ...u.companies, credit_limit: newLimit } }; } return u; }));
      showToast('Credit limit updated successfully!'); setCreditLimitModal({ show: false, companyId: null, companyName: '', limit: '' });
    } catch (err) { showToast('Failed to update: ' + err.message, true); } finally { setIsSubmitting(false); }
  };

  const handleSaveShippingFee = async (e) => {
    e.preventDefault(); setIsSubmitting(true);
    try {
      const newFee = Number(shippingFeeModal.fee.replace(/,/g, '')); 
      const { error } = await supabase.from('companies').update({ shipping_fee: newFee }).eq('id', shippingFeeModal.companyId);
      if (error) throw error;
      setB2bList(prev => prev.map(u => { if (u.companies?.id === shippingFeeModal.companyId) { return { ...u, companies: { ...u.companies, shipping_fee: newFee } }; } return u; }));
      showToast('Shipping fee updated successfully!'); setShippingFeeModal({ show: false, companyId: null, companyName: '', fee: '' });
    } catch (err) { showToast('Failed to update: ' + err.message, true); } finally { setIsSubmitting(false); }
  };

  // --- PRICING RULES LOGIC ---
  const togglePricingRow = (id) => setExpandedPricingRows(prev => ({ ...prev, [id]: !prev[id] }));

  const openPricingModal = async (company) => {
    if (!company) return;
    setActiveCompany(company); setShowPricingModal(true); setPricingPage(0); setPricingSearch(''); setEditedRules({}); setExpandedPricingRows({}); setLoading(true);
    try {
      if (catalogProducts.length === 0) {
        const { data: prods } = await supabase.from('products').select('id, name, base_sku, retail_base_price, product_variants(id, name, sku, price)').order('name');
        setCatalogProducts(prods || []);
      }
      const { data: rules } = await supabase.from('pricing_rules').select('*').eq('company_id', company.id);
      const rulesMap = {}; (rules || []).forEach(r => { if (r.variant_id) rulesMap[r.variant_id] = { rule_type: r.rule_type, value: r.value }; });
      setCompanyRules(rulesMap);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const handleRuleChange = (variantId, field, val) => {
    setEditedRules(prev => { const existing = prev[variantId] || companyRules[variantId] || { rule_type: 'percentage', value: '' }; return { ...prev, [variantId]: { ...existing, [field]: val } }; });
  };

  const savePricingRules = async () => {
    setIsSubmitting(true);
    try {
      const upserts = []; const deletes = [];
      Object.entries(editedRules).forEach(([variantId, rule]) => {
        let productId = null; for (const p of catalogProducts) { if (p.product_variants.some(v => v.id === variantId)) { productId = p.id; break; } }
        if (!rule.value || Number(rule.value) <= 0) deletes.push(variantId); else upserts.push({ company_id: activeCompany.id, product_id: productId, variant_id: variantId, rule_type: rule.rule_type, value: Number(rule.value) });
      });
      if (deletes.length > 0) await supabase.from('pricing_rules').delete().eq('company_id', activeCompany.id).in('variant_id', deletes);
      if (upserts.length > 0) await supabase.from('pricing_rules').upsert(upserts);

      setCompanyRules(prev => { const next = { ...prev }; deletes.forEach(id => delete next[id]); upserts.forEach(u => next[u.variant_id] = { rule_type: u.rule_type, value: u.value }); return next; });
      setEditedRules({}); showToast('Pricing rules updated!');
    } catch (error) { showToast(error.message, true); } finally { setIsSubmitting(false); }
  };

  const exportPricingCSV = () => {
    const headers = "Variant_ID,Product_Name,Variant_Name,Variant_SKU,Base_Price,Discount_Type,Discount_Value\n";
    const rows = [];
    catalogProducts.forEach(p => {
      (p.product_variants || []).forEach(v => {
        const rule = editedRules[v.id] || companyRules[v.id]; const rType = rule?.rule_type || ''; const rVal = rule?.value || '';
        rows.push(`${v.id},"${p.name.replace(/"/g, '""')}","${v.name.replace(/"/g, '""')}",${v.sku},${v.price},${rType},${rVal}`);
      });
    });
    const blob = new Blob([headers + rows.join('\n')], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${activeCompany.name.replace(/\s+/g, '_')}_Pricing.csv`; a.click();
  };

  const importPricingCSV = async (e) => {
    const file = e.target.files[0]; if (!file) return; setIsImporting(true);
    try {
      const text = await file.text(); const lines = text.split('\n').filter(l => l.trim()); const newEdits = { ...editedRules };
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); const vId = parts[0]?.trim(); const rType = parts[5]?.replace(/"/g, '')?.trim()?.toLowerCase(); const rVal = parts[6]?.replace(/"/g, '')?.trim();
        if (!vId) continue;
        if (rVal && Number(rVal) > 0) newEdits[vId] = { rule_type: rType === 'fixed' ? 'fixed' : 'percentage', value: rVal }; else if (companyRules[vId]) newEdits[vId] = { rule_type: 'percentage', value: '' }; 
      }
      setEditedRules(newEdits); const newExpanded = { ...expandedPricingRows };
      catalogProducts.forEach(p => { if (p.product_variants?.some(v => newEdits[v.id] !== undefined)) newExpanded[p.id] = true; });
      setExpandedPricingRows(newExpanded); showToast('CSV loaded! Review changes and click Save.');
    } catch (err) { showToast("Failed to parse CSV.", true); } finally { setIsImporting(false); e.target.value = ''; }
  };

  const getActiveList = () => {
    if (activeTab === 'staff') return staffList;
    if (activeTab === 'b2b') return b2bList;
    return retailList;
  };

  const filteredData = getActiveList().filter(user => 
    (user.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.companies?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCatalog = catalogProducts.filter(p => 
    p.name.toLowerCase().includes(pricingSearch.toLowerCase()) || p.base_sku.toLowerCase().includes(pricingSearch.toLowerCase()) ||
    p.product_variants?.some(v => v.sku.toLowerCase().includes(pricingSearch.toLowerCase()) || v.name.toLowerCase().includes(pricingSearch.toLowerCase()))
  );
  const catalogPageCount = Math.ceil(filteredCatalog.length / ITEMS_PER_PAGE);
  const paginatedCatalog = filteredCatalog.slice(pricingPage * ITEMS_PER_PAGE, (pricingPage + 1) * ITEMS_PER_PAGE);

  const tabBaseClass = "flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95";
  const tabActiveClass = "bg-slate-900 text-white shadow-md";
  const tabInactiveClass = "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50";

  const renderRole = (role) => {
    const r = (role || 'user').toLowerCase();
    let Icon = User;
    let iconColor = 'text-slate-400';
    
    if (r === 'admin') { Icon = Shield; iconColor = 'text-blue-600'; }
    else if (r === 'warehouse') { Icon = Package; iconColor = 'text-amber-600'; }
    else if (r === 'driver') { Icon = Truck; iconColor = 'text-emerald-600'; }

    return (
      <div className="flex items-center gap-2 text-slate-700 font-semibold">
        <Icon size={16} className={iconColor} />
        <span className="capitalize">{r}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Command Center</h2>
          <p className="text-sm text-slate-500 mt-2">Manage your users, agencies, and financial health.</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'retail' && (
            <button onClick={() => setShowAddRetailModal(true)} className="px-5 py-2.5 text-sm bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2">
              <UserPlus size={16} /> Add Retail Customer
            </button>
          )}
          {activeTab === 'staff' && (
            <button onClick={() => setShowAddStaffModal(true)} className="px-5 py-2.5 text-sm bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2">
              <UserPlus size={16} /> Add Staff
            </button>
          )}
          {activeTab === 'b2b' && (
            <button onClick={() => setShowAddB2bModal(true)} className="px-5 py-2.5 text-sm bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2">
              <Building2 size={16} /> Register Agency
            </button>
          )}
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          [1,2,3,4].map(n => (
            <div key={n} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-32 animate-pulse flex flex-col justify-between">
              <div className="flex justify-between items-center"><div className="w-24 h-4 bg-slate-200 rounded"></div><div className="w-8 h-8 bg-slate-200 rounded-lg"></div></div>
              <div className="w-16 h-8 bg-slate-200 rounded mt-2"></div><div className="w-32 h-3 bg-slate-100 rounded mt-2"></div>
            </div>
          ))
        ) : (
          <>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-blue-50 transition-transform group-hover:scale-110"></div>
              <div className="flex justify-between items-start mb-4 relative">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Active Agencies</h4>
                <div className="p-2 rounded-xl bg-blue-100 text-blue-600 shadow-sm"><Building2 size={18} /></div>
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">{b2bList.length}</h2>
              <p className="text-[11px] font-medium text-slate-400 mt-2 relative">Total registered B2B accounts</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-amber-50 transition-transform group-hover:scale-110"></div>
              <div className="flex justify-between items-start mb-4 relative">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Total Outstanding</h4>
                <div className="p-2 rounded-xl bg-amber-100 text-amber-600 shadow-sm"><Wallet size={18} /></div>
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">${totalOutstanding.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
              <p className="text-[11px] font-medium text-slate-400 mt-2 relative">Unpaid invoices across all agencies</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-emerald-50 transition-transform group-hover:scale-110"></div>
              <div className="flex justify-between items-start mb-4 relative">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Retail Users</h4>
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 shadow-sm"><ShoppingBag size={18} /></div>
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">{retailList.length}</h2>
              <p className="text-[11px] font-medium text-slate-400 mt-2 relative">Standard direct-to-consumer accounts</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-purple-50 transition-transform group-hover:scale-110"></div>
              <div className="flex justify-between items-start mb-4 relative">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Internal Staff</h4>
                <div className="p-2 rounded-xl bg-purple-100 text-purple-600 shadow-sm"><Users size={18} /></div>
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight relative">{staffList.length}</h2>
              <p className="text-[11px] font-medium text-slate-400 mt-2 relative">Admins, Warehouse, and Drivers</p>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-100/50 rounded-xl border border-slate-200 w-full lg:w-auto overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('staff')} className={`${tabBaseClass} ${activeTab === 'staff' ? tabActiveClass : tabInactiveClass}`}><Users size={16}/> Staff Directory</button>
          <button onClick={() => setActiveTab('b2b')} className={`${tabBaseClass} ${activeTab === 'b2b' ? tabActiveClass : tabInactiveClass}`}><Building size={16}/> B2B Agencies</button>
          <button onClick={() => setActiveTab('retail')} className={`${tabBaseClass} ${activeTab === 'retail' ? tabActiveClass : tabInactiveClass}`}><ShoppingBag size={16}/> Retail Customers</button>
        </div>
        <div className="relative w-full lg:w-80 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search accounts..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all shadow-sm" />
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500 font-medium mt-6">Loading directory...</div>
      ) : filteredData.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm mt-6">
          <Users size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No users found</h3>
          <p className="text-slate-500 text-sm">There are no accounts in this tab right now.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mt-6">
          <div className="overflow-x-auto lg:overflow-visible min-h-[300px] rounded-2xl pb-16">
            <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
                <tr>
                  {activeTab === 'b2b' ? (
                    <>
                      <th className="px-6 py-4 font-bold tracking-tight rounded-tl-2xl">Agency Profile</th>
                      <th className="px-6 py-4 font-bold tracking-tight">Patients</th>
                      <th className="px-6 py-4 font-bold tracking-tight">Financial Status</th>
                    </>
                  ) : activeTab === 'retail' ? (
                    <>
                      <th className="px-6 py-4 font-bold tracking-tight rounded-tl-2xl">User Profile</th>
                      <th className="px-6 py-4 font-bold tracking-tight">Shipping Address</th>
                      <th className="px-6 py-4 font-bold tracking-tight">Role Type</th>
                    </>
                  ) : (
                    <>
                      <th className="px-6 py-4 font-bold tracking-tight rounded-tl-2xl">User Profile</th>
                      <th className="px-6 py-4 font-bold tracking-tight">Role Type</th>
                    </>
                  )}
                  <th className="px-6 py-4 font-bold tracking-tight text-right w-24 rounded-tr-2xl">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {filteredData.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 group transition-colors">
                    
                    {activeTab === 'b2b' ? (
                      <>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-200 shadow-sm">{getInitials(user.companies?.name || 'B2B')}</div>
                            <div className="flex flex-col">
                              <p className="font-bold text-slate-900">{user.companies?.name || 'Independent B2B'}</p>
                              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                <span className="font-medium text-slate-700">{user.full_name}</span> <span className="text-slate-300">&bull;</span>
                                <span className="font-mono">{user.email}</span> <span className="text-slate-300">&bull;</span>
                                <span className="font-mono">{user.contact_number || user.companies?.phone}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-slate-600 font-bold">
                            <User size={16} className="text-slate-400" />
                            {agencyPatientCounts[user.companies?.id] || 0}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          {(() => {
                            const limit = Number(user.companies?.credit_limit || 0); const outstanding = companyBalances[user.companies?.id] || 0; const available = limit - outstanding; const percentLeft = limit > 0 ? (available / limit) : 0;
                            let badge = null;
                            if (limit === 0) badge = <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-200">No Credit</span>;
                            else if (available <= 0) badge = <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider rounded border border-red-200">Limit Reached</span>;
                            else if (percentLeft <= 0.2) badge = <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider rounded border border-amber-200">Low Credit</span>;
                            else badge = <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded border border-emerald-200">Healthy</span>;
                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2"><span className="font-bold text-slate-900">Limit: ${limit.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>{badge}</div>
                                <span className="text-xs font-medium text-slate-500">Avail: <span className={available <= 0 ? 'text-red-600 font-bold' : ''}>${available.toLocaleString(undefined, {minimumFractionDigits: 2})}</span> <span className="mx-1 text-slate-300">|</span> Out: ${outstanding.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                              </div>
                            );
                          })()}
                        </td>
                      </>
                    ) : activeTab === 'retail' ? (
                      <>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0 border border-slate-200 shadow-sm">{getInitials(user.full_name || 'U')}</div>
                            <div className="flex flex-col">
                              <p className="font-bold text-slate-900">{user.full_name || 'Unnamed User'}</p>
                              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 font-mono"><span>{user.email}</span>{user.contact_number && (<><span className="text-slate-300">&bull;</span><span>{user.contact_number}</span></>)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {user.address ? (
                            <div className="text-sm text-slate-600">
                              <p className="font-medium text-slate-900">{user.address}</p>
                              <p>{user.city}, {user.state} {user.zip}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No address on file</span>
                          )}
                        </td>
                        <td className="px-6 py-4">{renderRole(user.role)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0 border border-slate-200 shadow-sm">{getInitials(user.full_name || 'U')}</div>
                            <div className="flex flex-col">
                              <p className="font-bold text-slate-900">{user.full_name || 'Unnamed User'}</p>
                              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 font-mono"><span>{user.email}</span>{user.contact_number && (<><span className="text-slate-300">&bull;</span><span>{user.contact_number}</span></>)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">{renderRole(user.role)}</td>
                      </>
                    )}

                    <td className="px-6 py-4 text-right relative">
                      <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === user.id ? null : user.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-200 active:scale-95 transition-all"><MoreVertical size={20} /></button>
                      {activeMenuId === user.id && (
                        <div className="absolute right-10 top-8 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-[90] py-1.5 flex flex-col text-left overflow-hidden animate-in fade-in zoom-in-95">
                          {activeTab === 'b2b' && user.companies && (
                            <>
                              <button onClick={() => { setActiveMenuId(null); openPricingModal(user.companies); }} className="w-full px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-3"><DollarSign size={16} className="text-slate-400" /> Manage Pricing</button>
                              <button onClick={() => { setActiveMenuId(null); setCreditLimitModal({ show: true, companyId: user.companies.id, companyName: user.companies.name, limit: formatNumberInput((user.companies.credit_limit || 0).toString()) }); }} className="w-full px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-3"><Wallet size={16} className="text-slate-400" /> Edit Credit Limit</button>
                              <button onClick={() => { setActiveMenuId(null); setShippingFeeModal({ show: true, companyId: user.companies.id, companyName: user.companies.name, fee: formatNumberInput((user.companies.shipping_fee || 0).toString()) }); }} className="w-full px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-3"><Truck size={16} className="text-slate-400" /> Edit Shipping Fee</button>
                              <button onClick={() => { setActiveMenuId(null); setEditAgencyForm({ userId: user.id, companyId: user.companies.id, company_name: user.companies.name, address: user.companies.address || '', city: user.companies.city || '', state: user.companies.state || '', zip: user.companies.zip || '', admin_name: user.full_name || '', admin_phone: user.contact_number || '' }); setShowEditAgencyModal(true); }} className="w-full px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-3"><Edit size={16} className="text-slate-400" /> Edit Agency Profile</button>
                              <div className="h-px w-full bg-slate-100 my-1"></div>
                            </>
                          )}
                          <button onClick={() => triggerDeleteConfirmation(user.id, user.full_name)} className="w-full px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors flex items-center gap-3"><Trash2 size={16} /> Delete Account</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- ADD RETAIL CUSTOMER MODAL --- */}
      {showAddRetailModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><UserPlus size={18}/> Add Retail Customer</h3>
              <button onClick={() => setShowAddRetailModal(false)} className="p-1 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            
            <form onSubmit={triggerAddRetailConfirm} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Customer Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label><input type="text" required value={retailForm.full_name} onChange={e => setRetailForm({...retailForm, full_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold transition-all" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label><div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="email" required value={retailForm.email} onChange={e => setRetailForm({...retailForm, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phone Number</label><div className="relative"><Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="tel" value={retailForm.contact_number} onChange={e => setRetailForm({...retailForm, contact_number: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Shipping Address</h4>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Street Address</label><div className="relative"><MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" value={retailForm.address} onChange={e => setRetailForm({...retailForm, address: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">City</label><input type="text" value={retailForm.city} onChange={e => setRetailForm({...retailForm, city: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">State</label><input type="text" value={retailForm.state} onChange={e => setRetailForm({...retailForm, state: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">ZIP Code</label><input type="text" value={retailForm.zip} onChange={e => setRetailForm({...retailForm, zip: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Account Security</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Temporary Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" required placeholder="Min 6 chars" value={retailForm.password} onChange={e => setRetailForm({...retailForm, password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" required placeholder="Retype password" value={retailForm.confirm_password} onChange={e => setRetailForm({...retailForm, confirm_password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                </div>
              </div>

              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddRetailModal(false)} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3 text-sm bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all">{isSubmitting ? 'Processing...' : <><UserPlus size={16} /> Create Customer</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT AGENCY & CONTACT MODAL --- */}
      {showEditAgencyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><Edit size={18}/> Edit Agency Profile</h3>
              <button onClick={() => setShowEditAgencyModal(false)} className="p-1 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            
            <form onSubmit={handleEditAgencySubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Agency Details</h4>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Company Name</label><input type="text" required value={editAgencyForm.company_name} onChange={e => setEditAgencyForm({...editAgencyForm, company_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold transition-all" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Street Address</label><div className="relative"><MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" required value={editAgencyForm.address} onChange={e => setEditAgencyForm({...editAgencyForm, address: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">City</label><input type="text" required value={editAgencyForm.city} onChange={e => setEditAgencyForm({...editAgencyForm, city: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">State</label><input type="text" required value={editAgencyForm.state} onChange={e => setEditAgencyForm({...editAgencyForm, state: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">ZIP Code</label><input type="text" required value={editAgencyForm.zip} onChange={e => setEditAgencyForm({...editAgencyForm, zip: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Primary Contact (Admin)</h4>
                <p className="text-[10px] text-slate-500 mb-3 italic">Note: For security reasons, if the login email must change completely, please create a new user account.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Contact Name</label><input type="text" required value={editAgencyForm.admin_name} onChange={e => setEditAgencyForm({...editAgencyForm, admin_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold transition-all" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phone Number</label><div className="relative"><Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="tel" required value={editAgencyForm.admin_phone} onChange={e => setEditAgencyForm({...editAgencyForm, admin_phone: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                </div>
              </div>

              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowEditAgencyModal(false)} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3 text-sm bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all">{isSubmitting ? 'Saving...' : <><Save size={16} /> Save Changes</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD B2B AGENCY MODAL --- */}
      {showAddB2bModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><Building2 size={18}/> Register B2B Agency</h3>
              <button onClick={() => setShowAddB2bModal(false)} className="p-1 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            
            <form onSubmit={triggerAddB2bConfirm} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              {/* Section 1: Agency Info */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Agency Information</h4>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Company / Agency Name</label><input type="text" required value={b2bForm.company_name} onChange={e => setB2bForm({...b2bForm, company_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold transition-all" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Street Address</label><div className="relative"><MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" required value={b2bForm.address} onChange={e => setB2bForm({...b2bForm, address: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">City</label><input type="text" required value={b2bForm.city} onChange={e => setB2bForm({...b2bForm, city: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">State</label><input type="text" required value={b2bForm.state} onChange={e => setB2bForm({...b2bForm, state: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">ZIP Code</label><input type="text" required value={b2bForm.zip} onChange={e => setB2bForm({...b2bForm, zip: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Initial Credit Limit ($)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input type="text" placeholder="Leave blank for $0 (No Credit)" value={b2bForm.credit_limit} onChange={e => setB2bForm({...b2bForm, credit_limit: formatNumberInput(e.target.value)})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-900 transition-all" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Default Shipping Fee ($)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input type="text" placeholder="Leave blank for $0 (Free Shipping)" value={b2bForm.shipping_fee} onChange={e => setB2bForm({...b2bForm, shipping_fee: formatNumberInput(e.target.value)})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-900 transition-all" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Admin Info */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Administrator Account</h4>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Admin Full Name</label><input type="text" required value={b2bForm.admin_name} onChange={e => setB2bForm({...b2bForm, admin_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold transition-all" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address (Login)</label>
                      <div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="email" required value={b2bForm.admin_email} onChange={e => setB2bForm({...b2bForm, admin_email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                      <p className="text-[10px] text-slate-500 mt-1.5 italic font-medium">*Note: Must be the agency email, not a staff personal email.</p>
                    </div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phone Number</label><div className="relative"><Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="tel" required value={b2bForm.admin_phone} onChange={e => setB2bForm({...b2bForm, admin_phone: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Temporary Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" required placeholder="Min 6 characters" value={b2bForm.password} onChange={e => setB2bForm({...b2bForm, password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" required placeholder="Retype password" value={b2bForm.confirm_password} onChange={e => setB2bForm({...b2bForm, confirm_password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddB2bModal(false)} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3 text-sm bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all">{isSubmitting ? 'Processing...' : <><Building2 size={16} /> Register Agency</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD STAFF MODAL --- */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50"><h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><UserPlus size={18}/> Add New Staff Member</h3><button onClick={() => setShowAddStaffModal(false)} className="p-1 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button></div>
            <form onSubmit={triggerAddStaffConfirm} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label><input type="text" name="full_name" required value={staffForm.full_name} onChange={e => setStaffForm({...staffForm, full_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold transition-all" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label><div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="email" name="email" required value={staffForm.email} onChange={e => setStaffForm({...staffForm, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Contact Number</label><div className="relative"><Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="tel" name="contact_number" required value={staffForm.contact_number} onChange={e => setStaffForm({...staffForm, contact_number: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Assign Role</label><select name="role" required value={staffForm.role} onChange={e => setStaffForm({...staffForm, role: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold cursor-pointer transition-all"><option value="Admin">Admin (Full Access)</option><option value="Warehouse">Warehouse (Pick & Pack)</option><option value="Driver">Driver (Deliveries)</option></select></div>
              <div className="h-px w-full bg-slate-100 my-2"></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Temporary Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" name="password" required value={staffForm.password} onChange={e => setStaffForm({...staffForm, password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" name="confirm_password" required value={staffForm.confirm_password} onChange={e => setStaffForm({...staffForm, confirm_password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
              </div>
              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddStaffModal(false)} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3 text-sm bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all">{isSubmitting ? 'Processing...' : <><UserPlus size={16} /> Create Staff</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT CREDIT LIMIT MODAL --- */}
      {creditLimitModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Update Credit Limit</h3>
              <button onClick={() => setCreditLimitModal({ show: false, companyId: null, companyName: '', limit: '' })} className="p-1 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveCreditLimit} className="p-6">
              <p className="text-sm text-slate-500 mb-5">Adjust the net terms limit for <span className="font-bold text-slate-900">{creditLimitModal.companyName}</span>.</p>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">New Limit ($)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" required value={creditLimitModal.limit} onChange={e => setCreditLimitModal({...creditLimitModal, limit: formatNumberInput(e.target.value)})} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-lg font-bold text-slate-900 shadow-sm transition-all" autoFocus />
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button type="button" onClick={() => setCreditLimitModal({ show: false, companyId: null, companyName: '', limit: '' })} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="w-full py-3 text-sm bg-slate-900 text-white font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all">{isSubmitting ? 'Saving...' : 'Save Limit'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT SHIPPING FEE MODAL --- */}
      {shippingFeeModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Update Shipping Fee</h3>
              <button onClick={() => setShippingFeeModal({ show: false, companyId: null, companyName: '', fee: '' })} className="p-1 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveShippingFee} className="p-6">
              <p className="text-sm text-slate-500 mb-5">Adjust the flat shipping rate for <span className="font-bold text-slate-900">{shippingFeeModal.companyName}</span>.</p>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Shipping Fee ($)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" required value={shippingFeeModal.fee} onChange={e => setShippingFeeModal({...shippingFeeModal, fee: formatNumberInput(e.target.value)})} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-lg font-bold text-slate-900 shadow-sm transition-all" autoFocus />
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button type="button" onClick={() => setShippingFeeModal({ show: false, companyId: null, companyName: '', fee: '' })} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="w-full py-3 text-sm bg-slate-900 text-white font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all">{isSubmitting ? 'Saving...' : 'Save Fee'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- VARIANT-LEVEL PRICING DASHBOARD MODAL --- */}
      {showPricingModal && activeCompany && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col border border-slate-100 overflow-hidden">
            
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <DollarSign size={20} className="text-slate-900" />
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Variant Pricing Dashboard</h3>
                </div>
                <p className="text-sm text-slate-500 mt-1">Managing custom variant rules for <span className="font-bold text-slate-700">{activeCompany.name}</span></p>
              </div>
              <button onClick={() => setShowPricingModal(false)} className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 shadow-sm rounded-full active:scale-95 transition-all"><X size={18} /></button>
            </div>

            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap gap-4 justify-between items-center shrink-0">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" placeholder="Search product or SKU..." value={pricingSearch} onChange={(e) => { setPricingSearch(e.target.value); setPricingPage(0); }} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm transition-all" />
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button onClick={exportPricingCSV} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm"><DownloadCloud size={16} /> Export CSV</button>
                <label className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm cursor-pointer">{isImporting ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/> : <UploadCloud size={16} />} Import CSV <input type="file" accept=".csv" className="hidden" onChange={importPricingCSV} disabled={isImporting} /></label>
                <div className="w-px h-6 bg-slate-200 hidden sm:block mx-1"></div>
                <button onClick={savePricingRules} disabled={Object.keys(editedRules).length === 0 || isSubmitting} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:bg-slate-300 disabled:text-slate-500 active:scale-95 transition-all shadow-sm"><Save size={16} /> {isSubmitting ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-white">
              <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0 z-10 shadow-sm">
                  <tr><th className="px-6 py-3.5 font-bold w-1/2">Product / Variant</th><th className="px-6 py-3.5 font-bold">Base Price</th><th className="px-6 py-3.5 font-bold">Discount Type</th><th className="px-6 py-3.5 font-bold">Custom Value</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                  {paginatedCatalog.length === 0 ? (
                    <tr><td colSpan="4" className="px-6 py-12 text-center text-slate-400">No products found matching your search.</td></tr>
                  ) : (
                    paginatedCatalog.map(prod => {
                      const isExpanded = expandedPricingRows[prod.id];
                      const variants = prod.product_variants || [];
                      const hasEdits = variants.some(v => editedRules[v.id] !== undefined);

                      return (
                        <React.Fragment key={prod.id}>
                          <tr onClick={() => togglePricingRow(prod.id)} className={`hover:bg-slate-50 cursor-pointer transition-colors border-l-4 ${hasEdits ? 'border-amber-400 bg-amber-50/10' : 'border-transparent'} ${isExpanded ? 'bg-slate-50/50' : ''}`}>
                            <td className="px-6 py-4 flex items-center gap-3"><button className="p-1 text-slate-400 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button><div><p className="font-bold text-slate-900">{prod.name}</p><p className="text-[11px] text-slate-500 font-mono mt-0.5">{prod.base_sku}</p></div></td>
                            <td className="px-6 py-4 text-slate-500 font-medium">{variants.length} Variant{variants.length !== 1 ? 's' : ''}</td><td className="px-6 py-4"></td><td className="px-6 py-4"></td>
                          </tr>
                          {isExpanded && variants.length === 0 && <tr className="bg-slate-50/50"><td colSpan="4" className="px-6 py-4 text-center text-slate-400 italic">No variants created.</td></tr>}
                          {isExpanded && variants.map(v => {
                            const originalRule = companyRules[v.id] || { rule_type: 'percentage', value: '' };
                            const editRule = editedRules[v.id]; const currentRule = editRule !== undefined ? editRule : originalRule; const isEdited = editRule !== undefined;
                            return (
                              <tr key={v.id} className={`bg-slate-50/30 hover:bg-slate-100 transition-colors ${isEdited ? 'bg-amber-50/40 hover:bg-amber-100/50' : ''}`}>
                                <td className="px-6 py-3 pl-16"><p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Package size={14} className="text-slate-400"/> {v.name}</p><p className="text-[10px] text-slate-500 font-mono mt-0.5 pl-6">{v.sku}</p></td>
                                <td className="px-6 py-3 text-slate-600 font-medium">${Number(v.price).toFixed(2)}</td>
                                <td className="px-6 py-3"><select value={currentRule.rule_type} onChange={(e) => handleRuleChange(v.id, 'rule_type', e.target.value)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 text-sm font-medium cursor-pointer shadow-sm w-full max-w-[160px] transition-all"><option value="percentage">Percentage Off (%)</option><option value="fixed">Fixed Price ($)</option></select></td>
                                <td className="px-6 py-3"><div className="relative w-32"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{currentRule.rule_type === 'fixed' ? '$' : '%'}</span><input type="number" min="0" step="0.01" placeholder="Value" value={currentRule.value} onChange={(e) => handleRuleChange(v.id, 'value', e.target.value)} className={`w-full pl-7 pr-3 py-1.5 bg-white border rounded-lg outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold shadow-sm transition-all ${isEdited ? 'border-amber-400 focus:border-amber-500 text-amber-900 bg-amber-50/50' : 'border-slate-200 focus:border-slate-900'}`} /></div></td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center bg-white shrink-0">
              <p className="text-sm text-slate-500 font-medium">Showing {paginatedCatalog.length > 0 ? pricingPage * ITEMS_PER_PAGE + 1 : 0} to {Math.min((pricingPage + 1) * ITEMS_PER_PAGE, filteredCatalog.length)} of {filteredCatalog.length} products</p>
              <div className="flex gap-2"><button onClick={() => setPricingPage(p => Math.max(0, p - 1))} disabled={pricingPage === 0} className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100 active:scale-95 disabled:opacity-50 transition-all shadow-sm"><ChevronLeft size={18} /></button><button onClick={() => setPricingPage(p => p + 1)} disabled={pricingPage >= catalogPageCount - 1} className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100 active:scale-95 disabled:opacity-50 transition-all shadow-sm"><ChevronRight size={18} /></button></div>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL --- */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm ${confirmAction.type === 'delete' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-900 border-slate-200'}`}>
              {confirmAction.type === 'delete' ? <Trash2 size={32} /> : confirmAction.type === 'add_retail' ? <UserPlus size={32} /> : confirmAction.type === 'add_b2b' ? <Building2 size={32} /> : <UserPlus size={32} />}
            </div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{confirmAction.title}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => setConfirmAction({ show: false })} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button>
              <button disabled={isSubmitting} onClick={confirmAction.type === 'add_staff' ? executeAddStaff : confirmAction.type === 'add_retail' ? executeAddRetail : confirmAction.type === 'add_b2b' ? executeAddB2b : executeDeleteUser} className={`w-full py-3 text-sm text-white font-bold rounded-xl shadow-md active:scale-95 flex items-center justify-center gap-2 transition-all ${confirmAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>{isSubmitting ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODERN TOAST NOTIFICATION --- */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[120] flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`p-1.5 rounded-full ${toast.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {toast.isError ? <XCircle size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}
          </div>
          <p className="text-sm font-medium pr-2">{toast.message}</p>
        </div>
      )}

    </div>
  );
}
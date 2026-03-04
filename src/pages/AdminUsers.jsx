import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js'; 
import { 
  Search, UserPlus, Trash2, Shield, Mail, Phone, Lock, 
  CheckCircle2, XCircle, X, Users, Building, ShoppingBag, 
  MapPin, Building2, DollarSign, UploadCloud, 
  DownloadCloud, Save, ChevronLeft, ChevronRight, Package, ChevronDown
} from 'lucide-react';

export default function AdminUsers() {
  const [activeTab, setActiveTab] = useState('staff'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [staffList, setStaffList] = useState([]);
  const [b2bList, setB2bList] = useState([]);
  const [retailList, setRetailList] = useState([]);

  // Modals
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showAddB2bModal, setShowAddB2bModal] = useState(false);
  
  // Pricing Modal States
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [activeCompany, setActiveCompany] = useState(null);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [expandedPricingRows, setExpandedPricingRows] = useState({});
  const [companyRules, setCompanyRules] = useState({}); // Current rules in DB
  const [editedRules, setEditedRules] = useState({});   // Unsaved edits
  const [pricingSearch, setPricingSearch] = useState('');
  const [pricingPage, setPricingPage] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const ITEMS_PER_PAGE = 15;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState({ show: false, type: '', title: '', message: '', data: null });
  const [notification, setNotification] = useState({ show: false, message: '', isError: false });

  // Forms
  const [staffForm, setStaffForm] = useState({ full_name: '', email: '', contact_number: '', role: 'Warehouse', password: '', confirm_password: '' });
  const [b2bForm, setB2bForm] = useState({ 
    company_name: '', address: '', city: '', state: '', zip: '', 
    admin_name: '', admin_email: '', admin_phone: '', password: '', confirm_password: '' 
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('user_profiles').select('*, companies(*)').order('full_name', { ascending: true });
      if (error) throw error;

      const profiles = data || [];
      setStaffList(profiles.filter(p => ['admin', 'warehouse', 'driver'].includes(p.role?.toLowerCase())));
      setB2bList(profiles.filter(p => p.role?.toLowerCase() === 'b2b'));
      setRetailList(profiles.filter(p => p.role?.toLowerCase() === 'retail' || p.role?.toLowerCase() === 'user'));
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- STAFF & B2B CREATION LOGIC ---
  const triggerAddStaffConfirm = (e) => {
    e.preventDefault();
    if (staffForm.password !== staffForm.confirm_password) return setNotification({ show: true, isError: true, message: "Passwords do not match!" });
    if (staffForm.password.length < 6) return setNotification({ show: true, isError: true, message: "Password must be at least 6 characters." });
    setConfirmAction({ show: true, type: 'add_staff', title: 'Create Staff Account?', message: `Are you sure you want to create an account for ${staffForm.full_name}?`, data: staffForm });
  };

  const executeAddStaff = async () => {
    setConfirmAction({ show: false }); setIsSubmitting(true);
    try {
      const tempSupabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: authError } = await tempSupabase.auth.signUp({
        email: confirmAction.data.email, password: confirmAction.data.password,
        options: { data: { full_name: confirmAction.data.full_name, role: confirmAction.data.role.toLowerCase(), contact_number: confirmAction.data.contact_number, company_id: null } }
      });
      if (authError) throw authError;
      setTimeout(() => {
        fetchUsers(); setShowAddStaffModal(false);
        setStaffForm({ full_name: '', email: '', contact_number: '', role: 'Warehouse', password: '', confirm_password: '' });
        setNotification({ show: true, isError: false, message: 'Staff account created successfully!' });
        setIsSubmitting(false);
      }, 1500);
    } catch (error) { setNotification({ show: true, isError: true, message: error.message }); setIsSubmitting(false); }
  };

  const triggerAddB2bConfirm = (e) => {
    e.preventDefault();
    if (b2bForm.password !== b2bForm.confirm_password) return setNotification({ show: true, isError: true, message: "Passwords do not match!" });
    if (b2bForm.password.length < 6) return setNotification({ show: true, isError: true, message: "Password must be at least 6 characters." });
    setConfirmAction({ show: true, type: 'add_b2b', title: 'Create B2B Agency?', message: `Register ${b2bForm.company_name}?`, data: b2bForm });
  };

  const executeAddB2b = async () => {
    setConfirmAction({ show: false }); setIsSubmitting(true);
    try {
      const { data: company, error: companyError } = await supabase.from('companies').insert([{
        name: confirmAction.data.company_name, 
        address: confirmAction.data.address, 
        city: confirmAction.data.city, 
        state: confirmAction.data.state, 
        zip: confirmAction.data.zip, 
        phone: confirmAction.data.admin_phone, 
        email: confirmAction.data.admin_email,
        account_type: 'B2B' // <--- THIS FORCES IT TO BE B2B INSTEAD OF RETAIL
      }]).select().single();
      if (companyError) throw companyError;

      const tempSupabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: authError } = await tempSupabase.auth.signUp({
        email: confirmAction.data.admin_email, password: confirmAction.data.password,
        options: { data: { full_name: confirmAction.data.admin_name, role: 'b2b', contact_number: confirmAction.data.admin_phone, company_id: company.id } }
      });
      if (authError) throw authError;

      setTimeout(() => {
        fetchUsers(); setShowAddB2bModal(false);
        setB2bForm({ company_name: '', address: '', city: '', state: '', zip: '', admin_name: '', admin_email: '', admin_phone: '', password: '', confirm_password: '' });
        setNotification({ show: true, isError: false, message: 'Agency account created successfully!' });
        setIsSubmitting(false);
      }, 1500);
    } catch (error) { setNotification({ show: true, isError: true, message: error.message }); setIsSubmitting(false); }
  };

  const triggerDeleteConfirmation = (id, name) => setConfirmAction({ show: true, type: 'delete', title: 'Delete User?', message: `Permanently delete ${name}?`, data: id });
  const executeDeleteUser = async () => {
    setConfirmAction({ show: false });
    try {
      const { error } = await supabase.rpc('delete_user', { user_id: confirmAction.data });
      if (error) throw error;
      fetchUsers(); setNotification({ show: true, isError: false, message: 'User deleted.' });
    } catch (error) { setNotification({ show: true, isError: true, message: error.message }); }
  };

  // --- PRICING RULES LOGIC ---
  const togglePricingRow = (id) => {
    setExpandedPricingRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openPricingModal = async (company) => {
    if (!company) return;
    setActiveCompany(company);
    setShowPricingModal(true);
    setPricingPage(0);
    setPricingSearch('');
    setEditedRules({});
    setExpandedPricingRows({});
    setLoading(true);

    try {
      if (catalogProducts.length === 0) {
        const { data: prods } = await supabase
          .from('products')
          .select('id, name, base_sku, retail_base_price, product_variants(id, name, sku, price)')
          .order('name');
        setCatalogProducts(prods || []);
      }
      
      const { data: rules } = await supabase.from('pricing_rules').select('*').eq('company_id', company.id);
      
      const rulesMap = {};
      (rules || []).forEach(r => {
        if (r.variant_id) rulesMap[r.variant_id] = { rule_type: r.rule_type, value: r.value };
      });
      setCompanyRules(rulesMap);

    } catch (error) {
      console.error("Error loading pricing data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRuleChange = (variantId, field, val) => {
    setEditedRules(prev => {
      const existing = prev[variantId] || companyRules[variantId] || { rule_type: 'percentage', value: '' };
      return { ...prev, [variantId]: { ...existing, [field]: val } };
    });
  };

  const savePricingRules = async () => {
    setIsSubmitting(true);
    try {
      const upserts = [];
      const deletes = [];

      Object.entries(editedRules).forEach(([variantId, rule]) => {
        let productId = null;
        for (const p of catalogProducts) {
          if (p.product_variants.some(v => v.id === variantId)) {
            productId = p.id; break;
          }
        }

        if (!rule.value || Number(rule.value) <= 0) {
          deletes.push(variantId);
        } else {
          upserts.push({
            company_id: activeCompany.id,
            product_id: productId, 
            variant_id: variantId,
            rule_type: rule.rule_type,
            value: Number(rule.value)
          });
        }
      });

      if (deletes.length > 0) {
        await supabase.from('pricing_rules').delete().eq('company_id', activeCompany.id).in('variant_id', deletes);
      }
      
      if (upserts.length > 0) {
        await supabase.from('pricing_rules').upsert(upserts);
      }

      setCompanyRules(prev => {
        const next = { ...prev };
        deletes.forEach(id => delete next[id]);
        upserts.forEach(u => next[u.variant_id] = { rule_type: u.rule_type, value: u.value });
        return next;
      });
      setEditedRules({});
      setNotification({ show: true, message: 'Variant pricing rules updated successfully!' });
    } catch (error) {
      alert("Failed to save rules. " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportPricingCSV = () => {
    const headers = "Variant_ID,Product_Name,Variant_Name,Variant_SKU,Base_Price,Discount_Type,Discount_Value\n";
    const rows = [];
    
    catalogProducts.forEach(p => {
      (p.product_variants || []).forEach(v => {
        const rule = editedRules[v.id] || companyRules[v.id];
        const rType = rule?.rule_type || '';
        const rVal = rule?.value || '';
        
        rows.push(`${v.id},"${p.name.replace(/"/g, '""')}","${v.name.replace(/"/g, '""')}",${v.sku},${v.price},${rType},${rVal}`);
      });
    });

    const csvContent = headers + rows.join('\n');
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${activeCompany.name.replace(/\s+/g, '_')}_Variant_Pricing.csv`; a.click();
  };

  const importPricingCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsImporting(true);
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      const newEdits = { ...editedRules };

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const vId = parts[0]?.trim();
        const rType = parts[5]?.replace(/"/g, '')?.trim()?.toLowerCase();
        const rVal = parts[6]?.replace(/"/g, '')?.trim();

        if (!vId) continue;

        if (rVal && Number(rVal) > 0) {
          newEdits[vId] = { rule_type: rType === 'fixed' ? 'fixed' : 'percentage', value: rVal };
        } else if (companyRules[vId]) {
          newEdits[vId] = { rule_type: 'percentage', value: '' }; // Queue for deletion
        }
      }

      setEditedRules(newEdits);
      
      const newExpanded = { ...expandedPricingRows };
      catalogProducts.forEach(p => {
        if (p.product_variants?.some(v => newEdits[v.id] !== undefined)) {
          newExpanded[p.id] = true;
        }
      });
      setExpandedPricingRows(newExpanded);

      setNotification({ show: true, message: 'CSV loaded! Review changes in yellow and click Save.' });
    } catch (err) {
      alert("Failed to parse CSV. Ensure it follows the exact export format.");
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  // --- Filtering & Rendering ---
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
    p.name.toLowerCase().includes(pricingSearch.toLowerCase()) || 
    p.base_sku.toLowerCase().includes(pricingSearch.toLowerCase()) ||
    p.product_variants?.some(v => v.sku.toLowerCase().includes(pricingSearch.toLowerCase()) || v.name.toLowerCase().includes(pricingSearch.toLowerCase()))
  );
  
  const catalogPageCount = Math.ceil(filteredCatalog.length / ITEMS_PER_PAGE);
  const paginatedCatalog = filteredCatalog.slice(pricingPage * ITEMS_PER_PAGE, (pricingPage + 1) * ITEMS_PER_PAGE);


  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">User & Agency Management</h2>
          <p className="text-sm text-slate-500 mt-2">Manage your internal team, B2B agencies, and retail customers.</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'staff' && (
            <button onClick={() => setShowAddStaffModal(true)} className="px-4 py-2 text-sm bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2">
              <UserPlus size={16} /> Add Staff
            </button>
          )}
          {activeTab === 'b2b' && (
            <button onClick={() => setShowAddB2bModal(true)} className="px-4 py-2 text-sm bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md flex items-center gap-2">
              <Building2 size={16} /> Register Agency
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-50 rounded-xl border border-slate-100 w-full lg:w-auto overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('staff')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeTab === 'staff' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}><Shield size={16}/> Staff Directory ({staffList.length})</button>
          <button onClick={() => setActiveTab('b2b')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeTab === 'b2b' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}><Building size={16}/> B2B Agencies ({b2bList.length})</button>
          <button onClick={() => setActiveTab('retail')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeTab === 'retail' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}><ShoppingBag size={16}/> Retail Customers ({retailList.length})</button>
        </div>
        <div className="relative w-full lg:w-80 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search accounts..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 outline-none text-sm font-medium transition-all" />
        </div>
      </div>

      {/* --- MAIN TABLES --- */}
      {loading ? (
        <div className="text-slate-500 font-medium">Loading directory...</div>
      ) : filteredData.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-100 shadow-sm mt-6">
          <Users size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No users found</h3>
          <p className="text-slate-500 text-sm">There are no accounts in this tab right now.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500">
                <tr>
                  {activeTab === 'b2b' ? (
                    <><th className="px-6 py-4 font-bold tracking-tight">Agency Name</th><th className="px-6 py-4 font-bold tracking-tight">Location</th><th className="px-6 py-4 font-bold tracking-tight">Admin Contact</th><th className="px-6 py-4 font-bold tracking-tight">Email Address</th><th className="px-6 py-4 font-bold tracking-tight">Phone Number</th></>
                  ) : (
                    <><th className="px-6 py-4 font-bold tracking-tight">Full Name</th><th className="px-6 py-4 font-bold tracking-tight">Email Address</th><th className="px-6 py-4 font-bold tracking-tight">Contact Number</th><th className="px-6 py-4 font-bold tracking-tight">Role</th></>
                  )}
                  <th className="px-6 py-4 font-bold tracking-tight text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredData.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/50 group transition-colors">
                    
                    {activeTab === 'b2b' ? (
                      <>
                        <td className="px-6 py-4 font-bold text-slate-900">{user.companies?.name || 'Independent B2B'}</td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{user.companies?.city ? `${user.companies.city}, ${user.companies.state}` : 'N/A'}</td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{user.full_name || 'N/A'}</td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{user.email || 'N/A'}</td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{user.contact_number || user.companies?.phone || 'N/A'}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 font-bold text-slate-900">{user.full_name || 'Unnamed User'}</td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{user.email || 'N/A'}</td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{user.contact_number || 'N/A'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                            user.role === 'admin' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                            user.role === 'warehouse' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                            user.role === 'driver' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {user.role || 'User'}
                          </span>
                        </td>
                      </>
                    )}

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {activeTab === 'b2b' && user.companies && (
                          <button onClick={() => openPricingModal(user.companies)} title="Manage B2B Pricing" className="p-2 rounded-xl transition-all shadow-sm bg-white border border-slate-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 active:scale-95">
                            <DollarSign size={16} />
                          </button>
                        )}
                        <button onClick={() => triggerDeleteConfirmation(user.id, user.full_name)} title="Delete User" className="p-2 rounded-xl transition-all shadow-sm bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 active:scale-95">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* --- VARIANT-LEVEL PRICING DASHBOARD MODAL --- */}
      {showPricingModal && activeCompany && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col border border-slate-100 overflow-hidden">
            
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <DollarSign size={20} className="text-emerald-600" />
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Variant Pricing Dashboard</h3>
                </div>
                <p className="text-sm text-slate-500 mt-1">Managing custom variant rules for <span className="font-bold text-slate-700">{activeCompany.name}</span></p>
              </div>
              <button onClick={() => setShowPricingModal(false)} className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 shadow-sm rounded-full transition-all"><X size={18} /></button>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap gap-4 justify-between items-center shrink-0">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" placeholder="Search product or SKU..." 
                  value={pricingSearch} onChange={(e) => { setPricingSearch(e.target.value); setPricingPage(0); }}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button onClick={exportPricingCSV} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm">
                  <DownloadCloud size={16} /> Export CSV
                </button>
                <label className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm cursor-pointer">
                  {isImporting ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/> : <UploadCloud size={16} />}
                  Import CSV
                  <input type="file" accept=".csv" className="hidden" onChange={importPricingCSV} disabled={isImporting} />
                </label>
                
                <div className="w-px h-6 bg-slate-200 hidden sm:block mx-1"></div>
                
                <button 
                  onClick={savePricingRules}
                  disabled={Object.keys(editedRules).length === 0 || isSubmitting}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:bg-slate-300 disabled:text-slate-500 active:scale-95 transition-all shadow-sm"
                >
                  <Save size={16} /> {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* Accordion Catalog Table */}
            <div className="flex-1 overflow-auto bg-white">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-3.5 font-bold w-1/2">Product / Variant</th>
                    <th className="px-6 py-3.5 font-bold">Base Price</th>
                    <th className="px-6 py-3.5 font-bold">Discount Type</th>
                    <th className="px-6 py-3.5 font-bold">Custom Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedCatalog.length === 0 ? (
                    <tr><td colSpan="4" className="px-6 py-12 text-center text-slate-400">No products found matching your search.</td></tr>
                  ) : (
                    paginatedCatalog.map(prod => {
                      const isExpanded = expandedPricingRows[prod.id];
                      const variants = prod.product_variants || [];
                      const hasEdits = variants.some(v => editedRules[v.id] !== undefined);

                      return (
                        <React.Fragment key={prod.id}>
                          {/* Parent Product Row */}
                          <tr 
                            onClick={() => togglePricingRow(prod.id)}
                            className={`hover:bg-slate-50 cursor-pointer transition-colors border-l-4 ${hasEdits ? 'border-amber-400 bg-amber-50/10' : 'border-transparent'} ${isExpanded ? 'bg-slate-50/50' : ''}`}
                          >
                            <td className="px-6 py-4 flex items-center gap-3">
                              <button className="p-1 text-slate-400 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors">
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                              <div>
                                <p className="font-bold text-slate-900">{prod.name}</p>
                                <p className="text-[11px] text-slate-500 font-mono mt-0.5">{prod.base_sku}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-500 font-medium">
                              {variants.length} Variant{variants.length !== 1 ? 's' : ''}
                            </td>
                            <td className="px-6 py-4"></td>
                            <td className="px-6 py-4"></td>
                          </tr>

                          {/* Expanded Variant Rows */}
                          {isExpanded && variants.length === 0 && (
                            <tr className="bg-slate-50/50"><td colSpan="4" className="px-6 py-4 text-center text-slate-400 italic">No variants created for this product.</td></tr>
                          )}
                          
                          {isExpanded && variants.map(v => {
                            const originalRule = companyRules[v.id] || { rule_type: 'percentage', value: '' };
                            const editRule = editedRules[v.id];
                            const currentRule = editRule !== undefined ? editRule : originalRule;
                            const isEdited = editRule !== undefined;

                            return (
                              <tr key={v.id} className={`bg-slate-50/30 hover:bg-slate-100 transition-colors ${isEdited ? 'bg-amber-50/40 hover:bg-amber-100/50' : ''}`}>
                                <td className="px-6 py-3 pl-16">
                                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                    <Package size={14} className="text-slate-400"/> {v.name}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-mono mt-0.5 pl-6">{v.sku}</p>
                                </td>
                                <td className="px-6 py-3 text-slate-600 font-medium">
                                  ${Number(v.price).toFixed(2)}
                                </td>
                                <td className="px-6 py-3">
                                  <select 
                                    value={currentRule.rule_type} 
                                    onChange={(e) => handleRuleChange(v.id, 'rule_type', e.target.value)}
                                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm font-medium cursor-pointer shadow-sm w-full max-w-[160px]"
                                  >
                                    <option value="percentage">Percentage Off (%)</option>
                                    <option value="fixed">Fixed Price ($)</option>
                                  </select>
                                </td>
                                <td className="px-6 py-3">
                                  <div className="relative w-32">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                                      {currentRule.rule_type === 'fixed' ? '$' : '%'}
                                    </span>
                                    <input 
                                      type="number" 
                                      min="0" step="0.01"
                                      placeholder="Value"
                                      value={currentRule.value} 
                                      onChange={(e) => handleRuleChange(v.id, 'value', e.target.value)}
                                      className={`w-full pl-7 pr-3 py-1.5 bg-white border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold shadow-sm transition-all ${isEdited ? 'border-amber-400 focus:border-amber-500 text-amber-900 bg-amber-50/50' : 'border-slate-200 focus:border-emerald-500'}`}
                                    />
                                  </div>
                                </td>
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

            {/* Pagination Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center bg-white shrink-0">
              <p className="text-sm text-slate-500 font-medium">
                Showing {paginatedCatalog.length > 0 ? pricingPage * ITEMS_PER_PAGE + 1 : 0} to {Math.min((pricingPage + 1) * ITEMS_PER_PAGE, filteredCatalog.length)} of {filteredCatalog.length} products
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setPricingPage(p => Math.max(0, p - 1))} 
                  disabled={pricingPage === 0}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                ><ChevronLeft size={18} /></button>
                <button 
                  onClick={() => setPricingPage(p => p + 1)} 
                  disabled={pricingPage >= catalogPageCount - 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                ><ChevronRight size={18} /></button>
              </div>
            </div>

          </div>
        </div>
      )}


      {/* --- ADD B2B AGENCY MODAL --- */}
      {showAddB2bModal && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-blue-50/50">
              <h3 className="text-lg font-bold text-blue-900 tracking-tight flex items-center gap-2"><Building2 size={18}/> Register B2B Agency</h3>
              <button onClick={() => setShowAddB2bModal(false)} className="p-1 text-blue-400 hover:text-blue-900 bg-white border border-blue-200 rounded-full"><X size={16} /></button>
            </div>
            
            <form onSubmit={triggerAddB2bConfirm} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              {/* Section 1: Agency Info */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Agency Information</h4>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Company / Agency Name</label><input type="text" required value={b2bForm.company_name} onChange={e => setB2bForm({...b2bForm, company_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Street Address</label><div className="relative"><MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" required value={b2bForm.address} onChange={e => setB2bForm({...b2bForm, address: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium" /></div></div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">City</label><input type="text" required value={b2bForm.city} onChange={e => setB2bForm({...b2bForm, city: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">State</label><input type="text" required value={b2bForm.state} onChange={e => setB2bForm({...b2bForm, state: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">ZIP Code</label><input type="text" required value={b2bForm.zip} onChange={e => setB2bForm({...b2bForm, zip: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium" /></div>
                  </div>
                </div>
              </div>

              {/* Section 2: Admin Info */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Administrator Account</h4>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Admin Full Name</label><input type="text" required value={b2bForm.admin_name} onChange={e => setB2bForm({...b2bForm, admin_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address (Login)</label><div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="email" required value={b2bForm.admin_email} onChange={e => setB2bForm({...b2bForm, admin_email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phone Number</label><div className="relative"><Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="tel" required value={b2bForm.admin_phone} onChange={e => setB2bForm({...b2bForm, admin_phone: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Temporary Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" required placeholder="Min 6 characters" value={b2bForm.password} onChange={e => setB2bForm({...b2bForm, password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" required placeholder="Retype password" value={b2bForm.confirm_password} onChange={e => setB2bForm({...b2bForm, confirm_password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div></div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddB2bModal(false)} className="w-full py-2.5 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-2.5 text-sm bg-blue-600 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Processing...' : <><Building2 size={16} /> Register Agency</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD STAFF MODAL --- */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="text-lg font-bold text-slate-900 tracking-tight">Add New Staff Member</h3><button onClick={() => setShowAddStaffModal(false)} className="p-1 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full"><X size={16} /></button></div>
            <form onSubmit={triggerAddStaffConfirm} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label><input type="text" name="full_name" required value={staffForm.full_name} onChange={e => setStaffForm({...staffForm, full_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label><div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="email" name="email" required value={staffForm.email} onChange={e => setStaffForm({...staffForm, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Contact Number</label><div className="relative"><Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="tel" name="contact_number" required value={staffForm.contact_number} onChange={e => setStaffForm({...staffForm, contact_number: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Assign Role</label><select name="role" required value={staffForm.role} onChange={e => setStaffForm({...staffForm, role: e.target.value})} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold cursor-pointer"><option value="Admin">Admin (Full Access)</option><option value="Warehouse">Warehouse (Pick & Pack)</option><option value="Driver">Driver (Deliveries)</option></select></div>
              <div className="h-px w-full bg-slate-100 my-2"></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Temporary Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" name="password" required value={staffForm.password} onChange={e => setStaffForm({...staffForm, password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" name="confirm_password" required value={staffForm.confirm_password} onChange={e => setStaffForm({...staffForm, confirm_password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div></div>
              </div>
              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddStaffModal(false)} className="w-full py-2.5 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-2.5 text-sm bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 disabled:opacity-50">{isSubmitting ? 'Processing...' : <><UserPlus size={16} /> Create Staff</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION & NOTIFICATIONS --- */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm ${confirmAction.type === 'delete' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-900 border-blue-100'}`}>
              {confirmAction.type === 'delete' ? <Trash2 size={32} /> : confirmAction.type === 'add_b2b' ? <Building2 size={32} /> : <UserPlus size={32} />}
            </div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{confirmAction.title}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => setConfirmAction({ show: false })} className="w-full py-2.5 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95">Cancel</button>
              <button disabled={isSubmitting} onClick={confirmAction.type === 'add_staff' ? executeAddStaff : confirmAction.type === 'add_b2b' ? executeAddB2b : executeDeleteUser} className={`w-full py-2.5 text-sm text-white font-bold rounded-xl shadow-md active:scale-95 flex items-center justify-center gap-2 ${confirmAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>{isSubmitting ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {notification.show && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border ${notification.isError ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>{notification.isError ? <XCircle size={32} /> : <CheckCircle2 size={32} />}</div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{notification.isError ? 'Error' : 'Success'}</h4><p className="text-sm text-slate-500 mt-2 font-medium">{notification.message}</p>
            <button onClick={() => setNotification({ show: false, message: '', isError: false })} className="w-full mt-5 py-2.5 text-sm bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95">Okay</button>
          </div>
        </div>
      )}
    </div>
  );
}
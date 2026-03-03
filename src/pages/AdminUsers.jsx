import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js'; // FIXED: Ghost Client Import Restored!
import { 
  Search, UserPlus, Trash2, Shield, Mail, Phone, Lock, 
  CheckCircle2, XCircle, X, Users, Building, ShoppingBag, MapPin, Building2 
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

  // --- STAFF LOGIC ---
  const triggerAddStaffConfirm = (e) => {
    e.preventDefault();
    if (staffForm.password !== staffForm.confirm_password) return setNotification({ show: true, isError: true, message: "Passwords do not match!" });
    if (staffForm.password.length < 6) return setNotification({ show: true, isError: true, message: "Password must be at least 6 characters." });
    setConfirmAction({ show: true, type: 'add_staff', title: 'Create Staff Account?', message: `Are you sure you want to create an account for ${staffForm.full_name} as a ${staffForm.role}?`, data: staffForm });
  };

  const executeAddStaff = async () => {
    setConfirmAction({ show: false }); setIsSubmitting(true);
    try {
      // FIXED: Restored the secure Ghost Client!
      const tempSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL, 
        import.meta.env.VITE_SUPABASE_ANON_KEY, 
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { error: authError } = await tempSupabase.auth.signUp({
        email: confirmAction.data.email,
        password: confirmAction.data.password,
        options: { 
          data: { 
            full_name: confirmAction.data.full_name, 
            role: confirmAction.data.role.toLowerCase(),
            contact_number: confirmAction.data.contact_number,
            company_id: null
          } 
        }
      });

      if (authError) throw authError;

      setTimeout(() => {
        fetchUsers(); setShowAddStaffModal(false);
        setStaffForm({ full_name: '', email: '', contact_number: '', role: 'Warehouse', password: '', confirm_password: '' });
        setNotification({ show: true, isError: false, message: 'Staff account created successfully!' });
        setIsSubmitting(false);
      }, 1500);
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to create account: ${error.message}` }); setIsSubmitting(false);
    }
  };

  // --- B2B AGENCY LOGIC ---
  const triggerAddB2bConfirm = (e) => {
    e.preventDefault();
    if (b2bForm.password !== b2bForm.confirm_password) return setNotification({ show: true, isError: true, message: "Passwords do not match!" });
    if (b2bForm.password.length < 6) return setNotification({ show: true, isError: true, message: "Password must be at least 6 characters." });
    setConfirmAction({ show: true, type: 'add_b2b', title: 'Create B2B Agency?', message: `Are you sure you want to register ${b2bForm.company_name} and create an admin account for ${b2bForm.admin_name}?`, data: b2bForm });
  };

  const executeAddB2b = async () => {
    setConfirmAction({ show: false }); setIsSubmitting(true);
    try {
      // 1. Create the Company first
      const { data: company, error: companyError } = await supabase.from('companies').insert([{
        name: confirmAction.data.company_name, address: confirmAction.data.address,
        city: confirmAction.data.city, state: confirmAction.data.state, zip: confirmAction.data.zip,
        phone: confirmAction.data.admin_phone, email: confirmAction.data.admin_email
      }]).select().single();
      if (companyError) throw companyError;

      // 2. FIXED: Use the Ghost Client to securely create the B2B user and attach the company_id!
      const tempSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL, 
        import.meta.env.VITE_SUPABASE_ANON_KEY, 
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { error: authError } = await tempSupabase.auth.signUp({
        email: confirmAction.data.admin_email,
        password: confirmAction.data.password,
        options: { 
          data: { 
            full_name: confirmAction.data.admin_name, 
            role: 'b2b',
            contact_number: confirmAction.data.admin_phone,
            company_id: company.id
          } 
        }
      });

      if (authError) throw authError;

      setTimeout(() => {
        fetchUsers(); setShowAddB2bModal(false);
        setB2bForm({ company_name: '', address: '', city: '', state: '', zip: '', admin_name: '', admin_email: '', admin_phone: '', password: '', confirm_password: '' });
        setNotification({ show: true, isError: false, message: 'Agency & Admin account created successfully!' });
        setIsSubmitting(false);
      }, 1500);
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to create agency: ${error.message}` }); setIsSubmitting(false);
    }
  };

  // --- DELETE LOGIC (Shared) ---
  const triggerDeleteConfirmation = (id, name) => {
    setConfirmAction({ show: true, type: 'delete', title: 'Delete User?', message: `Are you sure you want to permanently delete ${name}'s account?`, data: id });
  };

  const executeDeleteUser = async () => {
    const idToDelete = confirmAction.data;
    setConfirmAction({ show: false });
    try {
      const { error } = await supabase.rpc('delete_user', { user_id: idToDelete });
      if (error) throw error;
      fetchUsers();
      setNotification({ show: true, isError: false, message: 'User permanently deleted.' });
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to delete: ${error.message}` });
    }
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">User & Agency Management</h2>
          <p className="text-sm text-slate-500 mt-2">Manage your internal team, B2B agencies, and retail customers.</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'staff' && (
            <button onClick={() => setShowAddStaffModal(true)} className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2">
              <UserPlus size={18} /> Add Staff
            </button>
          )}
          {activeTab === 'b2b' && (
            <button onClick={() => setShowAddB2bModal(true)} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md flex items-center gap-2">
              <Building2 size={18} /> Register Agency
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-50 rounded-xl border border-slate-100 w-full lg:w-auto overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('staff')} className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeTab === 'staff' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}><Shield size={16}/> Staff Directory ({staffList.length})</button>
          <button onClick={() => setActiveTab('b2b')} className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeTab === 'b2b' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}><Building size={16}/> B2B Agencies ({b2bList.length})</button>
          <button onClick={() => setActiveTab('retail')} className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeTab === 'retail' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}><ShoppingBag size={16}/> Retail Customers ({retailList.length})</button>
        </div>

        <div className="relative w-full lg:w-80 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search accounts..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 outline-none text-sm font-medium transition-all" />
        </div>
      </div>

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
                    <><th className="px-6 py-4 font-bold tracking-tight">Agency Name</th><th className="px-6 py-4 font-bold tracking-tight">Location</th><th className="px-6 py-4 font-bold tracking-tight">Admin Contact</th><th className="px-6 py-4 font-bold tracking-tight">Email</th></>
                  ) : (
                    <><th className="px-6 py-4 font-bold tracking-tight">Full Name</th><th className="px-6 py-4 font-bold tracking-tight">Email Address</th><th className="px-6 py-4 font-bold tracking-tight">Contact Number</th><th className="px-6 py-4 font-bold tracking-tight">Role</th></>
                  )}
                  <th className="px-6 py-4 font-bold tracking-tight text-right">Action</th>
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
                      <button onClick={() => triggerDeleteConfirmation(user.id, user.full_name)} title="Delete User" className="p-2.5 rounded-xl transition-all shadow-sm inline-flex items-center justify-center ml-auto bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 active:scale-95"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- ADD B2B AGENCY MODAL --- */}
      {showAddB2bModal && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-blue-50/50">
              <h3 className="text-lg font-bold text-blue-900 tracking-tight flex items-center gap-2"><Building2 size={18}/> Register B2B Agency</h3>
              <button onClick={() => setShowAddB2bModal(false)} className="p-1.5 text-blue-400 hover:text-blue-900 bg-white border border-blue-200 rounded-full"><X size={16} /></button>
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

              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddB2bModal(false)} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Processing...' : <><Building2 size={18} /> Register Agency</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD STAFF MODAL --- */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="text-lg font-bold text-slate-900 tracking-tight">Add New Staff Member</h3><button onClick={() => setShowAddStaffModal(false)} className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full"><X size={16} /></button></div>
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
              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddStaffModal(false)} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 disabled:opacity-50">{isSubmitting ? 'Processing...' : <><UserPlus size={18} /> Create Staff</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL --- */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm ${confirmAction.type === 'delete' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-900 border-blue-100'}`}>
              {confirmAction.type === 'delete' ? <Trash2 size={32} /> : confirmAction.type === 'add_b2b' ? <Building2 size={32} /> : <UserPlus size={32} />}
            </div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{confirmAction.title}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => setConfirmAction({ show: false })} className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95">Cancel</button>
              <button disabled={isSubmitting} onClick={confirmAction.type === 'add_staff' ? executeAddStaff : confirmAction.type === 'add_b2b' ? executeAddB2b : executeDeleteUser} className={`w-full py-3 text-white font-bold rounded-xl shadow-md active:scale-95 flex items-center justify-center gap-2 ${confirmAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>{isSubmitting ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- NOTIFICATIONS --- */}
      {notification.show && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border ${notification.isError ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>{notification.isError ? <XCircle size={32} /> : <CheckCircle2 size={32} />}</div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{notification.isError ? 'Error' : 'Success'}</h4><p className="text-sm text-slate-500 mt-2 font-medium">{notification.message}</p>
            <button onClick={() => setNotification({ show: false, message: '', isError: false })} className="w-full mt-5 py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95">Okay</button>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js'; 
import { useAuth } from '../lib/AuthContext'; 
import { 
  Search, UserPlus, Shield, User, MapPin, Trash2, 
  CheckCircle2, XCircle, X, Building, Navigation
} from 'lucide-react';

export default function AgencyDashboard() {
  const { profile } = useAuth(); 
  
  const [activeTab, setActiveTab] = useState('patients'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [patientList, setPatientList] = useState([]);
  const [subAdminList, setSubAdminList] = useState([]);

  // Modals
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [showAddSubAdminModal, setShowAddSubAdminModal] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState({ show: false, type: '', title: '', message: '', data: null });
  const [notification, setNotification] = useState({ show: false, message: '', isError: false });

  // Forms
  const [patientForm, setPatientForm] = useState({ 
    full_name: '', email: '', contact_number: '', 
    address: '', city: '', state: '', zip: '' 
  });
  const [subAdminForm, setSubAdminForm] = useState({ 
    full_name: '', email: '', contact_number: '', password: '', confirm_password: '' 
  });

  useEffect(() => {
    if (profile?.company_id) {
      fetchAgencyData();
    }
  }, [profile]);

  const fetchAgencyData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Sub-Admins from user_profiles
      const { data: admins, error: adminError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('role', 'agency_admin')
        .order('full_name', { ascending: true });
        
      if (adminError) throw adminError;
      setSubAdminList((admins || []).filter(p => p.id !== profile.id));

      // 2. Fetch Patients from our NEW agency_patients table
      const { data: patients, error: patientError } = await supabase
        .from('agency_patients')
        .select('*')
        .eq('agency_id', profile.company_id)
        .order('full_name', { ascending: true });

      if (patientError) throw patientError;
      setPatientList(patients || []);
      
    } catch (error) {
      console.error('Error fetching agency data:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- SUB-ADMIN LOGIC (Keeps Ghost Client so they can login) ---
  const triggerAddSubAdminConfirm = (e) => {
    e.preventDefault();
    if (subAdminForm.password !== subAdminForm.confirm_password) return setNotification({ show: true, isError: true, message: "Passwords do not match!" });
    if (subAdminForm.password.length < 6) return setNotification({ show: true, isError: true, message: "Password must be at least 6 characters." });
    
    setConfirmAction({ 
      show: true, type: 'add_sub_admin', title: 'Create Agency Admin?', 
      message: `Are you sure you want to create a sub-admin account for ${subAdminForm.full_name}? They will have full access to manage your agency.`, 
      data: subAdminForm 
    });
  };

  const executeAddSubAdmin = async () => {
    setConfirmAction({ show: false }); setIsSubmitting(true);
    try {
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
            role: 'agency_admin',
            contact_number: confirmAction.data.contact_number,
            company_id: profile.company_id 
          } 
        }
      });

      if (authError) throw authError;

      setTimeout(() => {
        fetchAgencyData(); 
        setShowAddSubAdminModal(false);
        setSubAdminForm({ full_name: '', email: '', contact_number: '', password: '', confirm_password: '' });
        setNotification({ show: true, isError: false, message: 'Agency Admin created successfully!' });
        setIsSubmitting(false);
      }, 1500);
      
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to create account: ${error.message}` }); 
      setIsSubmitting(false);
    }
  };

  // --- PATIENT LOGIC (Simple Database Insert now!) ---
  const triggerAddPatientConfirm = (e) => {
    e.preventDefault();
    setConfirmAction({ 
      show: true, type: 'add_patient', title: 'Add New Patient?', 
      message: `Are you sure you want to add ${patientForm.full_name} to your patient roster?`, 
      data: patientForm 
    });
  };

  const executeAddPatient = async () => {
    setConfirmAction({ show: false }); setIsSubmitting(true);
    try {
      // Just a direct insert into our new table. No Auth required!
      const { error } = await supabase.from('agency_patients').insert([{
        agency_id: profile.company_id,
        full_name: confirmAction.data.full_name,
        email: confirmAction.data.email || null, // Optional email handles itself
        contact_number: confirmAction.data.contact_number,
        address: confirmAction.data.address,
        city: confirmAction.data.city,
        state: confirmAction.data.state,
        zip: confirmAction.data.zip
      }]);

      if (error) throw error;

      fetchAgencyData(); 
      setShowAddPatientModal(false);
      setPatientForm({ full_name: '', email: '', contact_number: '', address: '', city: '', state: '', zip: '' });
      setNotification({ show: true, isError: false, message: 'Patient added to roster successfully!' });

    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to add patient: ${error.message}` }); 
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- DELETE LOGIC ---
  const triggerDeleteConfirmation = (id, name, type) => {
    // We pass 'delete_patient' or 'delete_admin' so we know which table to delete from!
    setConfirmAction({ show: true, type: type === 'Patient' ? 'delete_patient' : 'delete_admin', title: `Remove ${type}?`, message: `Are you sure you want to permanently remove ${name}?`, data: id });
  };

  const executeDeleteUser = async () => {
    const idToDelete = confirmAction.data;
    const isPatient = confirmAction.type === 'delete_patient';
    setConfirmAction({ show: false });
    
    try {
      if (isPatient) {
        // Delete from new patients table
        const { error } = await supabase.from('agency_patients').delete().eq('id', idToDelete);
        if (error) throw error;
      } else {
        // Delete Auth user (Sub-Admin)
        const { error } = await supabase.rpc('delete_user', { user_id: idToDelete });
        if (error) throw error;
      }

      fetchAgencyData();
      setNotification({ show: true, isError: false, message: 'Successfully removed.' });
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to remove: ${error.message}` });
    }
  };

  const getActiveList = () => {
    return activeTab === 'patients' ? patientList : subAdminList;
  };

  const filteredData = getActiveList().filter(user => 
    (user.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if(!profile) return null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
             Agency Dashboard
          </h2>
          <p className="text-sm text-slate-500 mt-2">Manage your patients and administrative staff.</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'sub_admins' && (
            <button onClick={() => setShowAddSubAdminModal(true)} className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2">
              <Shield size={18} /> Add Sub-Admin
            </button>
          )}
          {activeTab === 'patients' && (
            <button onClick={() => setShowAddPatientModal(true)} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md flex items-center gap-2">
              <UserPlus size={18} /> Add Patient
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-50 rounded-xl border border-slate-100 w-full lg:w-auto overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('patients')} className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeTab === 'patients' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}><User size={16}/> Patient Roster ({patientList.length})</button>
          <button onClick={() => setActiveTab('sub_admins')} className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeTab === 'sub_admins' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}><Shield size={16}/> Agency Admins ({subAdminList.length})</button>
        </div>

        <div className="relative w-full lg:w-80 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder={`Search ${activeTab === 'patients' ? 'patients' : 'admins'}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 outline-none text-sm font-medium transition-all" />
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500 font-medium">Loading records...</div>
      ) : filteredData.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-100 shadow-sm mt-6">
          {activeTab === 'patients' ? <User size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" /> : <Shield size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" /> }
          <h3 className="text-lg font-bold text-slate-900 mb-1">No records found</h3>
          <p className="text-slate-500 text-sm">You haven't added any {activeTab === 'patients' ? 'patients' : 'admins'} yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-bold tracking-tight">Full Name</th>
                  {activeTab === 'patients' && <th className="px-6 py-4 font-bold tracking-tight">Shipping Location</th>}
                  <th className="px-6 py-4 font-bold tracking-tight">Email Address</th>
                  <th className="px-6 py-4 font-bold tracking-tight">Contact</th>
                  <th className="px-6 py-4 font-bold tracking-tight text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredData.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/50 group transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{user.full_name || 'Unnamed'}</td>
                    {activeTab === 'patients' && (
                        <td className="px-6 py-4 text-slate-600 font-medium">
                            {user.city ? `${user.city}, ${user.state}` : 'No Address'}
                        </td>
                    )}
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {user.email || <span className="text-slate-400 italic">No Email Provided</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{user.contact_number || 'N/A'}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => triggerDeleteConfirmation(user.id, user.full_name, activeTab === 'patients' ? 'Patient' : 'Admin')} title="Remove" className="p-2.5 rounded-xl transition-all shadow-sm inline-flex items-center justify-center ml-auto bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 active:scale-95"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- ADD PATIENT MODAL --- */}
      {showAddPatientModal && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-blue-50/50">
              <h3 className="text-lg font-bold text-blue-900 tracking-tight flex items-center gap-2"><UserPlus size={18}/> Add New Patient</h3>
              <button onClick={() => setShowAddPatientModal(false)} className="p-1.5 text-blue-400 hover:text-blue-900 bg-white border border-blue-200 rounded-full"><X size={16} /></button>
            </div>
            
            <form onSubmit={triggerAddPatientConfirm} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Patient Details</h4>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label><input type="text" required value={patientForm.full_name} onChange={e => setPatientForm({...patientForm, full_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email (Optional)</label><input type="email" value={patientForm.email} onChange={e => setPatientForm({...patientForm, email: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium" /></div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phone Number</label><input type="tel" required value={patientForm.contact_number} onChange={e => setPatientForm({...patientForm, contact_number: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium" /></div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Delivery Address (eCommerce)</h4>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Street Address</label><div className="relative"><MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" required value={patientForm.address} onChange={e => setPatientForm({...patientForm, address: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium" /></div></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">City</label><input type="text" required value={patientForm.city} onChange={e => setPatientForm({...patientForm, city: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">State</label><input type="text" required value={patientForm.state} onChange={e => setPatientForm({...patientForm, state: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">ZIP</label><input type="text" required value={patientForm.zip} onChange={e => setPatientForm({...patientForm, zip: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium" /></div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddPatientModal(false)} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Processing...' : <><UserPlus size={18} /> Add Patient</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD SUB-ADMIN MODAL --- */}
      {showAddSubAdminModal && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="text-lg font-bold text-slate-900 tracking-tight">Add Agency Admin</h3><button onClick={() => setShowAddSubAdminModal(false)} className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full"><X size={16} /></button></div>
            <form onSubmit={triggerAddSubAdminConfirm} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label><input type="text" required value={subAdminForm.full_name} onChange={e => setSubAdminForm({...subAdminForm, full_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label><input type="email" required value={subAdminForm.email} onChange={e => setSubAdminForm({...subAdminForm, email: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Contact Number</label><input type="tel" required value={subAdminForm.contact_number} onChange={e => setSubAdminForm({...subAdminForm, contact_number: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div>
              </div>
              <div className="h-px w-full bg-slate-100 my-2"></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Password</label><input type="password" required value={subAdminForm.password} onChange={e => setSubAdminForm({...subAdminForm, password: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm Password</label><input type="password" required value={subAdminForm.confirm_password} onChange={e => setSubAdminForm({...subAdminForm, confirm_password: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" /></div>
              </div>
              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddSubAdminModal(false)} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 disabled:opacity-50">{isSubmitting ? 'Processing...' : <><Shield size={18} /> Create Admin</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL --- */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{confirmAction.title}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => setConfirmAction({ show: false })} className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50">Cancel</button>
              <button disabled={isSubmitting} onClick={confirmAction.type === 'delete_patient' || confirmAction.type === 'delete_admin' ? executeDeleteUser : (confirmAction.type === 'add_patient' ? executeAddPatient : executeAddSubAdmin)} className={`w-full py-3 text-white font-bold rounded-xl shadow-md ${confirmAction.type.includes('delete') ? 'bg-red-600' : 'bg-slate-900'}`}>{isSubmitting ? 'Processing...' : 'Confirm'}</button>
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
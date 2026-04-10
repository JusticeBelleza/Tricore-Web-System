import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../lib/AuthContext';
import { 
  Search, UserPlus, Trash2, Mail, Phone, Lock, 
  CheckCircle2, XCircle, X, Users, Building, 
  MapPin, Edit, MoreVertical, Wallet, Activity, UserCog, Save, ShieldCheck,
  UploadCloud, DownloadCloud, ChevronLeft, ChevronRight
} from 'lucide-react';

export default function AgencyDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('patients'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Data States
  const [patientsList, setPatientsList] = useState([]);
  const [subAdminList, setSubAdminList] = useState([]);
  const [financials, setFinancials] = useState({ limit: 0, outstanding: 0, available: 0 });
  const [activeMenuId, setActiveMenuId] = useState(null); 

  // 🚀 SERVER-SIDE PAGINATION STATES (Updated to 10 per page)
  const [patientPage, setPatientPage] = useState(0);
  const [totalPatientsCount, setTotalPatientsCount] = useState(0);
  const pageSize = 10;

  // --- Identify the Primary Agency Admin ---
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const [companyEmail, setCompanyEmail] = useState('');

  // Modal States
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [showEditPatientModal, setShowEditPatientModal] = useState(false);
  const [showAddSubAdminModal, setShowAddSubAdminModal] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false); 
  const [confirmAction, setConfirmAction] = useState({ show: false, type: '', title: '', message: '', data: null });
  const [toast, setToast] = useState({ show: false, message: '', isError: false });

  // Forms
  const [patientForm, setPatientForm] = useState({ full_name: '', email: '', contact_number: '', address: '', city: '', state: '', zip: '' });
  const [editPatientForm, setEditPatientForm] = useState({ id: '', full_name: '', email: '', contact_number: '', address: '', city: '', state: '', zip: '' });
  const [subAdminForm, setSubAdminForm] = useState({ full_name: '', email: '', contact_number: '', password: '', confirm_password: '' });

  // Close 3-dot menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // 🚀 Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      if (activeTab === 'patients') {
        setPatientPage(0); // Reset page on new search
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm, activeTab]);

  useEffect(() => {
    if (profile?.company_id) {
      fetchDashboardData();
    }
  }, [profile?.company_id, debouncedSearch, patientPage]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      
      // 🚀 SERVER-SIDE PAGINATION QUERY FOR PATIENTS
      let patientsQuery = supabase
        .from('agency_patients')
        .select('*', { count: 'exact' })
        .eq('agency_id', profile.company_id)
        .order('full_name', { ascending: true });

      if (debouncedSearch) {
        // Search by name or email
        patientsQuery = patientsQuery.or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`);
      }

      // Apply range for pagination
      const from = patientPage * pageSize;
      const to = from + pageSize - 1;
      patientsQuery = patientsQuery.range(from, to);

      // Fetch all needed data
      const [patientsRes, usersRes, ordersRes, companyRes] = await Promise.all([
        patientsQuery,
        supabase.from('user_profiles').select('*').eq('company_id', profile.company_id).order('full_name', { ascending: true }),
        supabase.from('orders').select('total_amount').eq('company_id', profile.company_id).eq('payment_status', 'unpaid'),
        supabase.from('companies').select('credit_limit, email').eq('id', profile.company_id).single()
      ]);

      if (patientsRes.error) throw patientsRes.error;

      setPatientsList(patientsRes.data || []);
      setTotalPatientsCount(patientsRes.count || 0);
      
      const cEmail = companyRes.data?.email;
      setCompanyEmail(cEmail);
      setIsPrimaryAdmin(profile.email === cEmail);

      // --- FEATURE: Sort Users so Primary Admin is always on top ---
      const sortedUsers = (usersRes.data || []).sort((a, b) => {
        if (a.email === cEmail && b.email !== cEmail) return -1;
        if (b.email === cEmail && a.email !== cEmail) return 1;
        return 0; // Keep alphabetical order for the rest
      });
      setSubAdminList(sortedUsers);

      const limit = Number(companyRes.data?.credit_limit || 0);
      const outstanding = ordersRes.data?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      setFinancials({ limit, outstanding, available: limit - outstanding });

    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const showToast = (message, isError = false) => {
    setToast({ show: true, message, isError });
    setTimeout(() => setToast({ show: false, message: '', isError: false }), 4000);
  };

  // --- PATIENT ACTIONS ---
  const handleAddPatient = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('agency_patients').insert([{ ...patientForm, email: patientForm.email.trim(), agency_id: profile.company_id }]);
      if (error) throw error;
      
      fetchDashboardData();
      setShowAddPatientModal(false);
      setPatientForm({ full_name: '', email: '', contact_number: '', address: '', city: '', state: '', zip: '' });
      showToast('Patient added successfully!');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditPatient = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('agency_patients').update({
        full_name: editPatientForm.full_name, 
        email: editPatientForm.email.trim(), 
        contact_number: editPatientForm.contact_number,
        address: editPatientForm.address, 
        city: editPatientForm.city, 
        state: editPatientForm.state, 
        zip: editPatientForm.zip
      }).eq('id', editPatientForm.id);
      
      if (error) throw error;

      fetchDashboardData();
      setShowEditPatientModal(false);
      showToast('Patient updated successfully!');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerDeletePatient = (patient) => {
    setConfirmAction({ show: true, type: 'delete_patient', title: 'Delete Patient?', message: `Are you sure you want to remove ${patient.full_name}? This cannot be undone.`, data: patient.id });
  };

  const executeDeletePatient = async () => {
    setConfirmAction({ show: false });
    try {
      const { error } = await supabase.from('agency_patients').delete().eq('id', confirmAction.data);
      if (error) throw error;
      fetchDashboardData();
      showToast('Patient removed successfully.');
    } catch (error) {
      showToast(error.message, true);
    }
  };

  // CSV PATIENT IMPORT LOGIC
  const downloadPatientCSVFormat = () => {
    const headers = "Full Name,Email,Phone Number,Street Address,City,State,ZIP Code\n";
    const sample1 = "John Doe,johndoe@example.com,555-123-4567,123 Main St,San Francisco,CA,94105\n";
    const sample2 = "Jane Smith,,,456 Oak Ave,Los Angeles,CA,90001\n"; // Missing email and phone is allowed
    const blob = new Blob([headers + sample1 + sample2], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "Patient_Import_Template.csv";
    a.click();
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsImporting(true);
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      const patientsToInsert = [];
      
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/(^"|"$)/g, '').trim());
        
        if (parts[0]) { 
          patientsToInsert.push({
            agency_id: profile.company_id,
            full_name: parts[0] || '',
            email: parts[1] || null,
            contact_number: parts[2] || null,
            address: parts[3] || null,
            city: parts[4] || null,
            state: parts[5] || null,
            zip: parts[6] || null,
          });
        }
      }

      if (patientsToInsert.length > 0) {
        const { error } = await supabase.from('agency_patients').insert(patientsToInsert);
        if (error) throw error;
        showToast(`${patientsToInsert.length} patients imported successfully!`);
        fetchDashboardData();
      } else {
        showToast("No valid patient data found in CSV.", true);
      }
    } catch (error) {
      showToast("Error importing CSV: " + error.message, true);
    } finally {
      setIsImporting(false);
      e.target.value = ''; 
    }
  };

  // --- SUB-ADMIN ACTIONS ---
  const triggerAddSubAdminConfirm = (e) => {
    e.preventDefault();
    if (subAdminForm.password !== subAdminForm.confirm_password) return showToast("Passwords do not match!", true);
    if (subAdminForm.password.length < 6) return showToast("Password must be at least 6 characters.", true);
    setConfirmAction({ show: true, type: 'add_subadmin', title: 'Create Sub-Admin?', message: `Create an admin account for ${subAdminForm.full_name}?`, data: subAdminForm });
  };

  const executeAddSubAdmin = async () => {
    setConfirmAction({ show: false }); setIsSubmitting(true);
    try {
      const tempSupabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { 
        auth: { 
          persistSession: false, 
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'temp_subadmin_registration_key'
        } 
      });
      
      const { error: authError } = await tempSupabase.auth.signUp({ 
        email: confirmAction.data.email.trim(),
        password: confirmAction.data.password, 
        options: { 
          data: { 
            full_name: confirmAction.data.full_name, 
            role: 'b2b', 
            contact_number: confirmAction.data.contact_number, 
            company_id: profile.company_id 
          } 
        } 
      });
      if (authError) throw authError;

      setTimeout(() => { 
        fetchDashboardData(); 
        setShowAddSubAdminModal(false); 
        setSubAdminForm({ full_name: '', email: '', contact_number: '', password: '', confirm_password: '' }); 
        showToast('Sub-admin created successfully!'); 
        setIsSubmitting(false); 
      }, 1500);
    } catch (error) { 
      showToast(error.message, true); 
      setIsSubmitting(false); 
    }
  };

  const triggerDeleteSubAdmin = (admin) => {
    setConfirmAction({ show: true, type: 'delete_subadmin', title: 'Revoke Sub-Admin Access?', message: `Permanently delete access for ${admin.full_name}?`, data: admin.id });
  };

  const executeDeleteSubAdmin = async () => {
    setConfirmAction({ show: false });
    try {
      const { error } = await supabase.rpc('delete_user', { user_id: confirmAction.data });
      if (error) throw error;
      fetchDashboardData(); 
      showToast('Sub-admin access revoked.');
    } catch (error) { 
      showToast(error.message, true); 
    }
  };

  // --- FILTERING (Only applies to subadmins now since patients are server-paginated) ---
  const filteredSubAdmins = subAdminList.filter(item => 
    (item.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActiveList = () => activeTab === 'patients' ? patientsList : filteredSubAdmins;

  // --- THEME CONSTANTS ---
  const tabBaseClass = "flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all whitespace-nowrap active:scale-95";
  const tabActiveClass = "bg-slate-900 text-white shadow-md";
  const tabInactiveClass = "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{profile?.companies?.name || 'Agency'} Dashboard</h2>
          <p className="text-sm text-slate-500 mt-2">Manage your patients, team members, and view your account financials.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {activeTab === 'patients' && (
            <>
              <button onClick={downloadPatientCSVFormat} className="hidden sm:flex px-4 py-2.5 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm items-center gap-2">
                <DownloadCloud size={16} /> Template
              </button>
              
              <label className="cursor-pointer px-4 py-2.5 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex items-center gap-2">
                {isImporting ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/> : <UploadCloud size={16} />} 
                Import CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} disabled={isImporting} />
              </label>

              <button onClick={() => setShowAddPatientModal(true)} className="px-5 py-2.5 text-sm bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2">
                <UserPlus size={16} /> Add Patient
              </button>
            </>
          )}

          {activeTab === 'subadmins' && isPrimaryAdmin && (
            <button onClick={() => setShowAddSubAdminModal(true)} className="px-5 py-2.5 text-sm bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2">
              <UserCog size={16} /> Add Sub-Admin
            </button>
          )}
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          [1,2,3,4].map(n => (
            <div key={n} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm h-28 animate-pulse flex flex-col justify-between">
              <div className="flex justify-between items-center"><div className="w-24 h-3 bg-slate-200 rounded"></div><div className="w-7 h-7 bg-slate-200 rounded-lg"></div></div>
              <div className="w-16 h-6 bg-slate-200 rounded mt-2"></div>
            </div>
          ))
        ) : (
          <>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full bg-emerald-50 transition-transform group-hover:scale-110"></div>
              <div className="flex justify-between items-center mb-2 relative">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Patients</h4>
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 shadow-sm border border-emerald-100"><Users size={16} /></div>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight relative">{totalPatientsCount}</h2>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full bg-blue-50 transition-transform group-hover:scale-110"></div>
              <div className="flex justify-between items-center mb-2 relative">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sub-Admins</h4>
                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 shadow-sm border border-blue-100"><UserCog size={16} /></div>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight relative">{subAdminList.length}</h2>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full bg-amber-50 transition-transform group-hover:scale-110"></div>
              <div className="flex justify-between items-center mb-2 relative">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Credit Limit</h4>
                <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 shadow-sm border border-amber-100"><Building size={16} /></div>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight relative">${financials.limit.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full bg-purple-50 transition-transform group-hover:scale-110"></div>
              <div className="flex justify-between items-center mb-2 relative">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Available Credit</h4>
                <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600 shadow-sm border border-purple-100"><Wallet size={16} /></div>
              </div>
              <h2 className={`text-2xl font-bold tracking-tight relative ${financials.available <= 0 && financials.limit > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                ${financials.available.toLocaleString(undefined, {minimumFractionDigits: 2})}
              </h2>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-slate-100/50 rounded-xl border border-slate-200 w-full lg:w-auto overflow-x-auto shrink-0">
          <button onClick={() => setActiveTab('patients')} className={`${tabBaseClass} ${activeTab === 'patients' ? tabActiveClass : tabInactiveClass}`}><Activity size={16}/> Patient Roster</button>
          <button onClick={() => setActiveTab('subadmins')} className={`${tabBaseClass} ${activeTab === 'subadmins' ? tabActiveClass : tabInactiveClass}`}><Users size={16}/> Sub-Admins</button>
        </div>
        <div className="relative w-full lg:w-80 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all shadow-sm" />
        </div>
      </div>

      {/* --- EXCEL-STYLE ENTERPRISE TABLE --- */}
      {loading ? (
        <div className="text-slate-500 font-medium mt-6">Loading dashboard...</div>
      ) : getActiveList().length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm mt-6">
          <Users size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No records found</h3>
          <p className="text-slate-500 text-sm">There is nothing here yet or your search matched no results.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mt-6 flex flex-col">
          <div className="overflow-x-auto lg:overflow-visible min-h-[300px] rounded-t-2xl pb-12">
            <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-widest">
                <tr>
                  <th className="px-4 py-4 font-bold rounded-tl-2xl">Full Name</th>
                  <th className="px-4 py-4 font-bold">Email Address</th>
                  <th className="px-4 py-4 font-bold">Phone Number</th>
                  {activeTab === 'patients' ? (
                    <>
                      <th className="px-4 py-4 font-bold">Street</th>
                      <th className="px-4 py-4 font-bold">City</th>
                      <th className="px-4 py-4 font-bold">State</th>
                      <th className="px-4 py-4 font-bold">Zip Code</th>
                    </>
                  ) : (
                    <th className="px-4 py-4 font-bold">Role Type</th>
                  )}
                  <th className="px-4 py-4 font-bold text-right rounded-tr-2xl w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {getActiveList().map(item => {
                  const isThisRowPrimaryAdmin = item.email === companyEmail;
                  const isCurrentUser = item.id === profile?.id;

                  return (
                    <tr 
                      key={item.id} 
                      className={`group transition-colors ${isCurrentUser && activeTab === 'subadmins' ? 'bg-slate-50' : 'hover:bg-slate-50/80'}`}
                    >
                      {/* Full Name & Avatar */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border shadow-sm ${activeTab === 'patients' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isCurrentUser ? 'bg-slate-800 text-white border-slate-900' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                            {getInitials(item.full_name)}
                          </div>
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            {item.full_name}
                            {isCurrentUser && activeTab === 'subadmins' && (
                              <span className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 text-[9px] font-bold uppercase tracking-wider shadow-sm">You</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email Address */}
                      <td className="px-4 py-3 text-slate-600 font-medium">
                        {item.email ? item.email : <span className="text-slate-300">-</span>}
                      </td>

                      {/* Phone Number */}
                      <td className="px-4 py-3 text-slate-600 font-mono text-[13px]">
                        {item.contact_number || item.phone ? (item.contact_number || item.phone) : <span className="text-slate-300">-</span>}
                      </td>

                      {/* Conditional Columns based on Tab */}
                      {activeTab === 'patients' ? (
                        <>
                          <td className="px-4 py-3 text-slate-600">{item.address ? item.address : <span className="text-slate-300">-</span>}</td>
                          <td className="px-4 py-3 text-slate-600">{item.city ? item.city : <span className="text-slate-300">-</span>}</td>
                          <td className="px-4 py-3 text-slate-600">{item.state ? item.state : <span className="text-slate-300">-</span>}</td>
                          <td className="px-4 py-3 text-slate-600">{item.zip ? item.zip : <span className="text-slate-300">-</span>}</td>
                        </>
                      ) : (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs uppercase tracking-wider">
                            {isThisRowPrimaryAdmin ? (
                              <><ShieldCheck size={14} className="text-emerald-600" /> <span className="text-emerald-700">Primary Admin</span></>
                            ) : (
                              <><UserCog size={14} className="text-blue-600" /> <span className="text-blue-700">Sub-Admin</span></>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Actions */}
                      <td className="px-4 py-3 text-right relative">
                        {(activeTab === 'patients' || (isPrimaryAdmin && !isThisRowPrimaryAdmin)) ? (
                          <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === item.id ? null : item.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-200 active:scale-95 transition-all"><MoreVertical size={18} /></button>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pr-3">Secured</span>
                        )}

                        {activeMenuId === item.id && (
                          <div className="absolute right-8 top-8 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-[90] py-1.5 flex flex-col text-left overflow-hidden animate-in fade-in zoom-in-95">
                            {activeTab === 'patients' ? (
                              <>
                                <button onClick={() => { setActiveMenuId(null); setEditPatientForm(item); setShowEditPatientModal(true); }} className="w-full px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-3"><Edit size={16} className="text-slate-500" /> Edit Patient</button>
                                <div className="h-px w-full bg-slate-100 my-1"></div>
                                <button onClick={() => triggerDeletePatient(item)} className="w-full px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"><Trash2 size={16} /> Delete</button>
                              </>
                            ) : (
                              <button onClick={() => triggerDeleteSubAdmin(item)} className="w-full px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"><Trash2 size={16} /> Revoke Access</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 🚀 PAGINATION FOOTER */}
          {activeTab === 'patients' && totalPatientsCount > pageSize && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl mt-auto">
              <span className="text-sm font-medium text-slate-500">
                Showing <span className="font-bold text-slate-900">{patientPage * pageSize + 1}</span> to <span className="font-bold text-slate-900">{Math.min((patientPage + 1) * pageSize, totalPatientsCount)}</span> of <span className="font-bold text-slate-900">{totalPatientsCount}</span> patients
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setPatientPage(p => Math.max(0, p - 1))} 
                  disabled={patientPage === 0} 
                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                >
                  <ChevronLeft size={18} />
                </button>
                <button 
                  onClick={() => setPatientPage(p => p + 1)} 
                  disabled={(patientPage + 1) * pageSize >= totalPatientsCount} 
                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- ADD PATIENT MODAL --- */}
      {showAddPatientModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><UserPlus size={18}/> Add Patient</h3>
              <button onClick={() => setShowAddPatientModal(false)} className="p-1 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            
            <form onSubmit={handleAddPatient} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Patient Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label><input type="text" required value={patientForm.full_name} onChange={e => setPatientForm({...patientForm, full_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold transition-all" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label><div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="email" value={patientForm.email} onChange={e => setPatientForm({...patientForm, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phone Number</label><div className="relative"><Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="tel" value={patientForm.contact_number} onChange={e => setPatientForm({...patientForm, contact_number: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Delivery Address</h4>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Street Address</label><div className="relative"><MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" required value={patientForm.address} onChange={e => setPatientForm({...patientForm, address: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">City</label><input type="text" required value={patientForm.city} onChange={e => setPatientForm({...patientForm, city: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">State</label><input type="text" required value={patientForm.state} onChange={e => setPatientForm({...patientForm, state: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">ZIP Code</label><input type="text" required value={patientForm.zip} onChange={e => setPatientForm({...patientForm, zip: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddPatientModal(false)} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3 text-sm bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all">{isSubmitting ? 'Processing...' : <><Save size={16} /> Save Patient</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT PATIENT MODAL --- */}
      {showEditPatientModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><Edit size={18}/> Edit Patient</h3>
              <button onClick={() => setShowEditPatientModal(false)} className="p-1 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            
            <form onSubmit={handleEditPatient} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Patient Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label><input type="text" required value={editPatientForm.full_name} onChange={e => setEditPatientForm({...editPatientForm, full_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold transition-all" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label><div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="email" value={editPatientForm.email || ''} onChange={e => setEditPatientForm({...editPatientForm, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phone Number</label><div className="relative"><Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="tel" value={editPatientForm.contact_number || ''} onChange={e => setEditPatientForm({...editPatientForm, contact_number: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Delivery Address</h4>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Street Address</label><div className="relative"><MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" required value={editPatientForm.address || ''} onChange={e => setEditPatientForm({...editPatientForm, address: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">City</label><input type="text" required value={editPatientForm.city || ''} onChange={e => setEditPatientForm({...editPatientForm, city: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">State</label><input type="text" required value={editPatientForm.state || ''} onChange={e => setEditPatientForm({...editPatientForm, state: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">ZIP Code</label><input type="text" required value={editPatientForm.zip || ''} onChange={e => setEditPatientForm({...editPatientForm, zip: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowEditPatientModal(false)} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3 text-sm bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all">{isSubmitting ? 'Saving...' : <><Save size={16} /> Update Patient</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD SUB-ADMIN MODAL --- */}
      {showAddSubAdminModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><UserCog size={18}/> Add Sub-Admin</h3>
              <button onClick={() => setShowAddSubAdminModal(false)} className="p-1 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            <form onSubmit={triggerAddSubAdminConfirm} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <p className="text-sm text-slate-500 mb-2">Create a new admin account linked directly to your agency.</p>
              <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label><input type="text" required value={subAdminForm.full_name} onChange={e => setSubAdminForm({...subAdminForm, full_name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold transition-all" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label><div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="email" required value={subAdminForm.email} onChange={e => setSubAdminForm({...subAdminForm, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Contact Number</label><div className="relative"><Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="tel" required value={subAdminForm.contact_number} onChange={e => setSubAdminForm({...subAdminForm, contact_number: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
              </div>
              <div className="h-px w-full bg-slate-100 my-2"></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Temporary Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" required value={subAdminForm.password} onChange={e => setSubAdminForm({...subAdminForm, password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm Password</label><div className="relative"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="password" required value={subAdminForm.confirm_password} onChange={e => setSubAdminForm({...subAdminForm, confirm_password: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" /></div></div>
              </div>
              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setShowAddSubAdminModal(false)} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button><button type="submit" disabled={isSubmitting} className="w-full py-3 text-sm bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all">{isSubmitting ? 'Processing...' : <><UserPlus size={16} /> Create Sub-Admin</>}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL --- */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm ${confirmAction.type.includes('delete') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-900 border-slate-200'}`}>
              {confirmAction.type.includes('delete') ? <Trash2 size={32} /> : <UserPlus size={32} />}
            </div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{confirmAction.title}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => setConfirmAction({ show: false })} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:bg-slate-100 active:scale-95 transition-all">Cancel</button>
              <button disabled={isSubmitting} onClick={
                confirmAction.type === 'add_subadmin' ? executeAddSubAdmin : 
                confirmAction.type === 'delete_subadmin' ? executeDeleteSubAdmin : 
                executeDeletePatient
              } className={`w-full py-3 text-sm text-white font-bold rounded-xl shadow-md active:scale-95 flex items-center justify-center gap-2 transition-all ${confirmAction.type.includes('delete') ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>{isSubmitting ? 'Processing...' : 'Confirm'}</button>
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
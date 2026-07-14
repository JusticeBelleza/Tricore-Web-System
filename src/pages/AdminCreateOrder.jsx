import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Building2, ShoppingBag, User, Users, Search, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function AdminCreateOrder() {
  const navigate = useNavigate();
  
  // Selection State
  const [orderType, setOrderType] = useState('b2b'); // 'b2b' or 'retail'
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedRetailUser, setSelectedRetailUser] = useState(null);
  
  // Data State
  const [facilities, setFacilities] = useState([]);
  const [patients, setPatients] = useState([]);
  const [retailUsers, setRetailUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch initial data (Facilities and Retail Users)
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch B2B Facilities
      const { data: b2bData } = await supabase
        .from('companies')
        .select('*')
        .eq('account_type', 'B2B')
        .order('name');
      
      // 🚀 FIX: Filter out duplicate company names
      const uniqueFacilities = [];
      const seenNames = new Set();
      if (b2bData) {
        b2bData.forEach(comp => {
          const normalizedName = comp.name?.trim().toLowerCase();
          if (!seenNames.has(normalizedName)) {
            seenNames.add(normalizedName);
            uniqueFacilities.push(comp);
          }
        });
      }
      
      // Fetch Retail Customers (Using user_profiles joined with companies)
      const { data: retailData } = await supabase
        .from('user_profiles')
        .select('*, companies(*)')
        .in('role', ['retail', 'user'])
        .eq('status', 'active')
        .order('full_name');

      setFacilities(uniqueFacilities);
      setRetailUsers(retailData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Patients when a Facility is selected
  useEffect(() => {
    if (selectedFacility) {
      const fetchPatients = async () => {
        const { data } = await supabase
          .from('agency_patients')
          .select('*')
          .eq('agency_id', selectedFacility.id)
          .eq('status', 'active')
          .order('last_name');
        setPatients(data || []);
      };
      fetchPatients();
    } else {
      setPatients([]);
      setSelectedPatient(null);
    }
  }, [selectedFacility]);

  // Proceed to Catalog to shop on behalf of the customer
  const handleStartShopping = () => {
    const proxySession = {
      isProxyOrder: true,
      orderType,
      targetCompanyId: orderType === 'b2b' ? selectedFacility.id : selectedRetailUser.companies?.id,
      targetPatientId: orderType === 'b2b' ? selectedPatient?.id : null,
      targetUserId: orderType === 'retail' ? selectedRetailUser.id : null,
      customerName: orderType === 'b2b' ? `${selectedFacility.name} (Patient: ${selectedPatient.first_name} ${selectedPatient.last_name})` : selectedRetailUser.full_name
    };
    
    localStorage.setItem('tricore_proxy_session', JSON.stringify(proxySession));
    navigate('/catalog');
  };

  const filteredFacilities = facilities.filter(f => f.name?.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredRetailUsers = retailUsers.filter(u => u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase()));

  const canProceed = (orderType === 'b2b' && selectedFacility && selectedPatient) || (orderType === 'retail' && selectedRetailUser);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Create Customer Order</h2>
        <p className="text-sm text-slate-500 mt-2">Select a customer to start shopping on their behalf.</p>
      </div>

      {/* Order Type Toggle */}
      <div className="flex gap-4 p-1 bg-slate-100/50 rounded-2xl border border-slate-200 w-fit shadow-sm">
        <button 
          onClick={() => { setOrderType('b2b'); setSelectedRetailUser(null); setSearchTerm(''); }}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold rounded-xl transition-all ${orderType === 'b2b' ? 'bg-white text-blue-700 shadow-md border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <Building2 size={18} /> B2B Facility Order
        </button>
        <button 
          onClick={() => { setOrderType('retail'); setSelectedFacility(null); setSelectedPatient(null); setSearchTerm(''); }}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold rounded-xl transition-all ${orderType === 'retail' ? 'bg-white text-emerald-700 shadow-md border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <ShoppingBag size={18} /> Retail Customer Order
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[500px]">
        
        {/* Left Side: Selection List */}
        <div className="w-full md:w-1/2 border-r border-slate-200 flex flex-col bg-slate-50/50">
          <div className="p-4 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder={`Search ${orderType === 'b2b' ? 'facilities' : 'retail customers'}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm transition-all"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[400px]">
            {loading ? (
              <p className="text-center text-slate-400 text-sm py-10 animate-pulse">Loading directory...</p>
            ) : orderType === 'b2b' ? (
              filteredFacilities.map(facility => (
                <button
                  key={facility.id}
                  onClick={() => setSelectedFacility(facility)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between group ${selectedFacility?.id === facility.id ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm' : 'text-slate-700 border border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm'}`}
                >
                  <div className="flex items-center gap-3">
                    <Building2 size={16} className={selectedFacility?.id === facility.id ? 'text-blue-500' : 'text-slate-400'} />
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">{facility.name}</span>
                      <span className={`text-[10px] font-medium mt-0.5 ${selectedFacility?.id === facility.id ? 'text-blue-500' : 'text-slate-500'}`}>
                        {facility.city ? `${facility.city}, ${facility.state}` : 'No address on file'}
                      </span>
                    </div>
                  </div>
                  {selectedFacility?.id === facility.id && <CheckCircle2 size={16} className="text-blue-500 shrink-0" />}
                </button>
              ))
            ) : (
              filteredRetailUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => setSelectedRetailUser(user)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between group ${selectedRetailUser?.id === user.id ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm' : 'text-slate-700 border border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm'}`}
                >
                  <div className="flex items-center gap-3">
                    <User size={16} className={selectedRetailUser?.id === user.id ? 'text-emerald-500' : 'text-slate-400'} />
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">{user.full_name || 'Unnamed Customer'}</span>
                      <span className={`text-[10px] font-medium font-mono mt-0.5 ${selectedRetailUser?.id === user.id ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {user.email}
                      </span>
                    </div>
                  </div>
                  {selectedRetailUser?.id === user.id && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Secondary Selection (Patients) & Action */}
        <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col bg-white">
          
          {orderType === 'b2b' && selectedFacility ? (
            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Users size={18} className="text-slate-400"/> 
                Select Patient for {selectedFacility.name}
              </h3>
              
              <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px] pr-2">
                {patients.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100">
                    <Users size={32} className="mx-auto text-slate-300 mb-2"/>
                    <p className="text-sm font-medium text-slate-500">No active patients found for this facility.</p>
                  </div>
                ) : (
                  patients.map(patient => (
                    <button
                      key={patient.id}
                      onClick={() => setSelectedPatient(patient)}
                      className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between ${selectedPatient?.id === patient.id ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400 hover:shadow-sm'}`}
                    >
                      <div>
                        <p className="font-bold text-sm">{patient.last_name}, {patient.first_name}</p>
                        {patient.room_number && <p className={`text-[10px] font-medium mt-1 ${selectedPatient?.id === patient.id ? 'text-slate-300' : 'text-slate-500'}`}>Room: {patient.room_number}</p>}
                      </div>
                      {selectedPatient?.id === patient.id && <CheckCircle2 size={18} className="text-white shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : orderType === 'b2b' && !selectedFacility ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-in fade-in">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                <Building2 size={24} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Awaiting Facility</h3>
              <p className="text-sm text-slate-500">Please select a B2B facility from the list on the left to view their patients.</p>
            </div>
          ) : orderType === 'retail' && !selectedRetailUser ? (
             <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-in fade-in">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                <ShoppingBag size={24} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Awaiting Customer</h3>
              <p className="text-sm text-slate-500">Please select a retail customer from the list on the left.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4 border border-emerald-100 text-emerald-600">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Customer Selected</h3>
              <p className="text-sm text-slate-500 font-medium">
                You are ready to place an order for:<br/>
                <span className="text-slate-900 font-bold block mt-2">{selectedRetailUser?.full_name}</span>
              </p>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-6 mt-auto border-t border-slate-100">
            <button 
              onClick={handleStartShopping}
              disabled={!canProceed}
              className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-md"
            >
              Start Shopping for Customer <ArrowRight size={16} />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
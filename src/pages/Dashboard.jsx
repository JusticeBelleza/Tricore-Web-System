import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { useMetricsStore } from '../store/useMetricsStore';
import { 
  BarChart3, Package, DollarSign, Clock, Truck, 
  TrendingUp, AlertTriangle, ShoppingCart, ChevronRight, CheckCircle2,
  Wallet, FileText, Activity, CreditCard, Calendar, ChevronDown
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  // 🚀 ZUSTAND METRICS
  const { dashboardData, isLoading: storeLoading, fetchDashboardMetrics, badges } = useMetricsStore();

  // Local List State
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [activeCustomerOrders, setActiveCustomerOrders] = useState(0);
  const [listsLoading, setListsLoading] = useState(true);
  
  // 🚀 DYNAMIC DATE BOUNDARIES
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0 - 11
  const currentQuarter = Math.floor(currentMonth / 3) + 1; // 1 - 4
  const currentSemester = currentMonth < 6 ? 1 : 2; // 1 - 2

  const startYear = 2026;
  const availableYears = Array.from(
    { length: Math.max(1, currentYear - startYear + 1) }, 
    (_, i) => currentYear - i
  );

  const [filterYear, setFilterYear] = useState(currentYear.toString());
  const [filterType, setFilterType] = useState('month'); 
  const [filterDetail, setFilterDetail] = useState(currentMonth.toString()); 

  // Custom Dropdown States
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isDetailDropdownOpen, setIsDetailDropdownOpen] = useState(false);
  
  const yearDropdownRef = useRef(null);
  const typeDropdownRef = useRef(null);
  const detailDropdownRef = useRef(null);

  // Click outside listener for the custom dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target)) setIsYearDropdownOpen(false);
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target)) setIsTypeDropdownOpen(false);
      if (detailDropdownRef.current && !detailDropdownRef.current.contains(event.target)) setIsDetailDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  // Re-fetch when the filters change
  useEffect(() => {
    if (!profile?.id) return;
    
    // Drivers don't use this dashboard
    if (profile.role === 'driver') {
      setListsLoading(false);
      return;
    }

    const year = parseInt(filterYear);
    let startIso = '';
    let endIso = '';

    if (filterType === 'month') {
      const m = parseInt(filterDetail);
      startIso = new Date(year, m, 1).toISOString();
      endIso = new Date(year, m + 1, 0, 23, 59, 59, 999).toISOString();
    } else if (filterType === 'quarter') {
      const q = parseInt(filterDetail); 
      const startMonth = (q - 1) * 3;
      startIso = new Date(year, startMonth, 1).toISOString();
      endIso = new Date(year, startMonth + 3, 0, 23, 59, 59, 999).toISOString();
    } else if (filterType === 'semester') {
      const s = parseInt(filterDetail); 
      const startMonth = (s - 1) * 6;
      startIso = new Date(year, startMonth, 1).toISOString();
      endIso = new Date(year, startMonth + 6, 0, 23, 59, 59, 999).toISOString();
    } else if (filterType === 'annual') {
      startIso = new Date(year, 0, 1).toISOString();
      endIso = new Date(year, 12, 0, 23, 59, 59, 999).toISOString();
    }

    // 1. Trigger the heavy server-side RPC math via Zustand
    fetchDashboardMetrics(new Date(startIso), new Date(endIso));

    // 2. Fetch the lightweight UI lists locally
    const fetchLists = async () => {
      setListsLoading(true);
      try {
        if (profile.role === 'admin' || profile.role === 'warehouse') {
          const [
            { data: lowStock }, 
            { data: recent }
          ] = await Promise.all([
            supabase.from('inventory').select('product_id, base_units_on_hand, products(name)').lte('base_units_on_hand', 10).limit(5),
            supabase.from('orders').select('id, created_at, total_amount, status, shipping_name, companies(name)').order('created_at', { ascending: false }).limit(5)
          ]);
          setLowStockItems(lowStock || []);
          setRecentOrders(recent || []);
        } else {
          let activeQuery = supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['pending', 'processing', 'ready_for_delivery', 'shipped', 'out_for_delivery']);
          let recentQuery = supabase.from('orders').select('id, created_at, total_amount, status').order('created_at', { ascending: false }).limit(5);

          if (profile.company_id) {
            activeQuery = activeQuery.eq('company_id', profile.company_id);
            recentQuery = recentQuery.eq('company_id', profile.company_id);
          } else {
            activeQuery = activeQuery.eq('user_id', profile.id);
            recentQuery = recentQuery.eq('user_id', profile.id);
          }

          const [ { count: activeCount }, { data: recent } ] = await Promise.all([activeQuery, recentQuery]);
          setActiveCustomerOrders(activeCount || 0);
          setRecentOrders(recent || []);
        }
      } catch (error) {
        console.error("Error fetching lists:", error);
      } finally {
        setListsLoading(false);
      }
    };

    fetchLists();
  }, [profile?.id, profile?.role, profile?.company_id, filterType, filterDetail, filterYear]);

  const handleFilterTypeChange = (newType) => {
    setFilterType(newType);
    setIsTypeDropdownOpen(false);
    const isCurrentYear = parseInt(filterYear) === currentYear;
    
    if (newType === 'month') setFilterDetail(isCurrentYear ? currentMonth.toString() : "11");
    else if (newType === 'quarter') setFilterDetail(isCurrentYear ? currentQuarter.toString() : "4");
    else if (newType === 'semester') setFilterDetail(isCurrentYear ? currentSemester.toString() : "2");
    else setFilterDetail("1"); 
  };

  const handleFilterYearChange = (newYearVal) => {
    const newYear = parseInt(newYearVal);
    setFilterYear(newYearVal);
    setIsYearDropdownOpen(false);
    
    if (newYear === currentYear) {
      if (filterType === 'month' && parseInt(filterDetail) > currentMonth) setFilterDetail(currentMonth.toString());
      if (filterType === 'quarter' && parseInt(filterDetail) > currentQuarter) setFilterDetail(currentQuarter.toString());
      if (filterType === 'semester' && parseInt(filterDetail) > currentSemester) setFilterDetail(currentSemester.toString());
    }
  };

  const getStatusBadge = (status) => {
    const displayStatus = status === 'delivered_partial' ? 'delivered' : status.replace(/_/g, ' ');
    const styles = { 
      pending: 'bg-yellow-50 text-yellow-700 border-yellow-200', 
      processing: 'bg-blue-50 text-blue-700 border-blue-200', 
      ready_for_delivery: 'bg-purple-50 text-purple-700 border-purple-200', 
      shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200', 
      out_for_delivery: 'bg-orange-50 text-orange-700 border-orange-200',
      delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200', 
      delivered_partial: 'bg-emerald-50 text-emerald-700 border-emerald-200', 
      cancelled: 'bg-red-50 text-red-700 border-red-200',
      attempted: 'bg-amber-50 text-amber-700 border-amber-200',
      restocked: 'bg-slate-100 text-slate-700 border-slate-300' 
    };
    return (<span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shadow-sm flex items-center w-fit whitespace-nowrap ${styles[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{displayStatus}</span>);
  };

  const getRevenueTitle = () => {
    if (filterType === 'month') {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${months[parseInt(filterDetail)]} ${filterYear} Delivered Revenue`;
    }
    if (filterType === 'quarter') return `Q${filterDetail} ${filterYear} Delivered Revenue`;
    if (filterType === 'semester') return `H${filterDetail} ${filterYear} Delivered Revenue`;
    if (filterType === 'annual') return `${filterYear} Annual Delivered Revenue`;
    return 'Delivered Revenue';
  };

  if (storeLoading || listsLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="h-10 w-48 bg-slate-200 rounded-lg animate-pulse mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3].map(n => <div key={n} className="h-32 bg-white rounded-3xl border border-slate-100 shadow-sm animate-pulse"></div>)}
        </div>
      </div>
    );
  }

  // ==========================================
  // 🚚 DRIVER DASHBOARD REDIRECT
  // ==========================================
  if (profile?.role === 'driver') {
    return (
      <div className="max-w-3xl mx-auto text-center py-20 px-4">
        <Truck size={64} className="mx-auto text-blue-600 mb-6" />
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Ready to hit the road?</h2>
        <p className="text-slate-500 mb-8">Your dashboard is located in the My Routes section.</p>
        <button onClick={() => navigate('/driver')} className="px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-lg hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2 mx-auto">
          <Truck size={20} /> Open My Routes
        </button>
      </div>
    );
  }

  // ==========================================
  // 🏢 AGENCY / RETAIL CUSTOMER DASHBOARD
  // ==========================================
  if (profile?.role === 'b2b' || profile?.role === 'retail' || profile?.role === 'user' || !profile?.role) {
    const isB2B = !!profile?.company_id;
    const limit = Number(profile?.companies?.credit_limit || 0);
    const available = Math.max(0, limit - dashboardData.outstanding);

    return (
      <div className="max-w-6xl mx-auto space-y-6 pb-12 px-4 sm:px-6 lg:px-8">
        
        {/* HERO SECTION */}
        <div className="bg-slate-900 text-white rounded-3xl p-8 sm:p-10 shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
              Welcome back, <br className="sm:hidden"/>
              <span className="text-emerald-400">{isB2B ? profile.companies?.name : profile.full_name?.split(' ')[0]}</span>
            </h2>
            <p className="text-slate-300 font-medium max-w-lg">
              {isB2B 
                ? "Manage your agency's clinical inventory, track pending deliveries, and review your Net-30 credit limits." 
                : "Easily restock your medical supplies, track your recent orders, and view delivery updates."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/catalog" className="px-6 py-3.5 bg-emerald-500 text-slate-900 font-extrabold rounded-xl shadow-lg hover:bg-emerald-400 active:scale-95 transition-all flex items-center gap-2">
                <ShoppingCart size={18} /> Shop Catalog
              </Link>
              <Link to="/orders" className="px-6 py-3.5 bg-white/10 backdrop-blur-md text-white border border-white/20 font-bold rounded-xl hover:bg-white/20 active:scale-95 transition-all flex items-center gap-2">
                <Package size={18} /> Order History
              </Link>
            </div>
          </div>
          <Activity className="absolute -right-10 -bottom-10 text-white/5" size={240} strokeWidth={1} />
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-50 rounded-full z-0"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-purple-100 text-purple-600 rounded-xl"><Package size={20} /></div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">In Transit / Pending</p>
              </div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">{activeCustomerOrders}</p>
              <p className="text-sm font-medium text-slate-500 mt-1">Active Deliveries</p>
            </div>
          </div>

          {isB2B ? (
            <>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full z-0"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl"><Wallet size={20} /></div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Available Credit</p>
                  </div>
                  <p className={`text-4xl font-black tracking-tight ${available <= 0 ? 'text-red-500' : 'text-slate-900'}`}>
                    ${available.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </p>
                  <p className="text-sm font-medium text-slate-500 mt-1">of ${limit.toLocaleString()} Limit</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-50 rounded-full z-0"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2.5 bg-amber-100 text-amber-600 rounded-xl"><FileText size={20} /></div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Unpaid Invoices</p>
                  </div>
                  <p className="text-4xl font-black text-slate-900 tracking-tight">
                    ${dashboardData.outstanding.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </p>
                  <Link to="/orders" className="text-sm font-bold text-amber-600 hover:text-amber-700 mt-2 flex items-center gap-1">Pay Balance <ChevronRight size={14}/></Link>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden md:col-span-2">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full z-0"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl"><DollarSign size={20} /></div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Lifetime Spend</p>
                </div>
                <p className="text-4xl font-black text-slate-900 tracking-tight">${dashboardData.totalSpend.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                <p className="text-sm font-medium text-slate-500 mt-1">Total account history (Delivered)</p>
              </div>
            </div>
          )}
        </div>

        {/* RECENT ORDERS TABLE */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><Clock size={18} className="text-slate-400"/> Recent Shipments</h3>
            <Link to="/orders" className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">View All <ChevronRight size={14}/></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white text-slate-500 border-b border-slate-100 uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="px-6 py-4 font-bold">Order ID</th>
                  <th className="px-6 py-4 font-bold">Date Placed</th>
                  <th className="px-6 py-4 font-bold">Status</th>
                  <th className="px-6 py-4 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 text-slate-500 rounded-lg"><Package size={16}/></div>
                        <span className="font-mono font-bold text-slate-900 text-sm">#{order.id.substring(0,8).toUpperCase()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-600">{new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                    <td className="px-6 py-4 text-right font-extrabold text-slate-900 text-base">${Number(order.total_amount).toFixed(2)}</td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center">
                      <Package size={40} className="mx-auto text-slate-200 mb-3" />
                      <p className="text-slate-500 font-medium">You have not placed any orders yet.</p>
                      <Link to="/catalog" className="text-blue-600 font-bold mt-2 inline-block hover:underline">Start Shopping</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    );
  }

  // ==========================================
  // 🏢 ADMIN & WAREHOUSE DASHBOARD
  // ==========================================
  const isCurrentYearSelected = parseInt(filterYear) === currentYear;
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const maxMonth = isCurrentYearSelected ? currentMonth : 11;
  const availableMonths = Array.from({ length: maxMonth + 1 }, (_, i) => i);
  const maxQuarter = isCurrentYearSelected ? currentQuarter : 4;
  const availableQuarters = Array.from({ length: maxQuarter }, (_, i) => i + 1);
  const maxSemester = isCurrentYearSelected ? currentSemester : 2;
  const availableSemesters = Array.from({ length: maxSemester }, (_, i) => i + 1);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">System Overview</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">High-level metrics and warehouse dispatch status.</p>
        </div>

        {profile?.role === 'admin' && (
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            
            {/* 1. YEAR SELECTOR */}
            <div className="relative w-full sm:w-32 shrink-0" ref={yearDropdownRef}>
              <button 
                type="button" 
                onClick={() => setIsYearDropdownOpen(!isYearDropdownOpen)} 
                className="w-full flex justify-between items-center bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold py-2.5 pl-4 pr-3 rounded-xl focus:bg-white focus:ring-2 focus:ring-slate-100 outline-none text-sm transition-all text-left z-10 relative min-h-[44px] shadow-sm"
              >
                <span className="flex items-center gap-2">
                  <Calendar size={16} className="text-slate-400 shrink-0 hidden sm:block" />
                  {filterYear}
                </span>
                <ChevronDown className={`text-slate-400 shrink-0 transition-transform duration-300 ${isYearDropdownOpen ? 'rotate-180' : ''}`} size={16} />
              </button>
              
              <div className={`absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden transition-all duration-200 origin-top ${isYearDropdownOpen ? 'opacity-100 translate-y-0 scale-100 visible pointer-events-auto' : 'opacity-0 -translate-y-2 scale-95 invisible pointer-events-none'}`}>
                <ul className="max-h-64 overflow-y-auto divide-y divide-slate-50 py-1">
                  {availableYears.map(y => (
                    <li key={y}>
                      <button 
                        type="button" 
                        onClick={() => handleFilterYearChange(y.toString())} 
                        className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors whitespace-normal break-words ${filterYear === y.toString() ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                      >
                        {y}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 2. FILTER CATEGORY */}
            <div className="relative w-full sm:w-44 shrink-0" ref={typeDropdownRef}>
              <button 
                type="button" 
                onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)} 
                className="w-full flex justify-between items-center bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold py-2.5 pl-4 pr-3 rounded-xl focus:bg-white focus:ring-2 focus:ring-slate-100 outline-none text-sm transition-all text-left z-10 relative min-h-[44px] shadow-sm"
              >
                <span className="truncate pr-2">
                  {filterType === 'month' ? 'Monthly' : filterType === 'quarter' ? 'Quarterly' : filterType === 'semester' ? 'Semester' : 'Annual'}
                </span>
                <ChevronDown className={`text-slate-400 shrink-0 transition-transform duration-300 ${isTypeDropdownOpen ? 'rotate-180' : ''}`} size={16} />
              </button>
              
              <div className={`absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden transition-all duration-200 origin-top ${isTypeDropdownOpen ? 'opacity-100 translate-y-0 scale-100 visible pointer-events-auto' : 'opacity-0 -translate-y-2 scale-95 invisible pointer-events-none'}`}>
                <ul className="max-h-64 overflow-y-auto divide-y divide-slate-50 py-1">
                  <li><button type="button" onClick={() => handleFilterTypeChange('month')} className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors whitespace-normal break-words ${filterType === 'month' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>Monthly</button></li>
                  <li><button type="button" onClick={() => handleFilterTypeChange('quarter')} className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors whitespace-normal break-words ${filterType === 'quarter' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>Quarterly</button></li>
                  <li><button type="button" onClick={() => handleFilterTypeChange('semester')} className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors whitespace-normal break-words ${filterType === 'semester' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>Semester</button></li>
                  <li><button type="button" onClick={() => handleFilterTypeChange('annual')} className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors whitespace-normal break-words ${filterType === 'annual' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>Annual ({filterYear})</button></li>
                </ul>
              </div>
            </div>

            {/* 3. DYNAMIC SPECIFIC PERIOD SELECTOR */}
            {filterType !== 'annual' && (
              <div className="relative w-full sm:w-60 shrink-0" ref={detailDropdownRef}>
                <button 
                  type="button" 
                  onClick={() => setIsDetailDropdownOpen(!isDetailDropdownOpen)} 
                  className="w-full flex justify-between items-center bg-blue-50/80 border border-blue-200 hover:border-blue-300 text-blue-900 font-bold py-2.5 pl-4 pr-3 rounded-xl focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none text-sm transition-all text-left z-10 relative min-h-[44px] shadow-sm hover:bg-blue-100/50"
                >
                  <span className="flex items-center gap-2 truncate pr-2">
                    <Calendar size={16} className="text-blue-500 shrink-0 hidden sm:block" />
                    {filterType === 'month' && `${monthNames[parseInt(filterDetail)]} ${filterYear}`}
                    {filterType === 'quarter' && `${parseInt(filterDetail) === 1 ? '1st' : parseInt(filterDetail) === 2 ? '2nd' : parseInt(filterDetail) === 3 ? '3rd' : '4th'} Quarter ${filterYear}`}
                    {filterType === 'semester' && `${parseInt(filterDetail) === 1 ? '1st' : '2nd'} Semester ${filterYear}`}
                  </span>
                  <ChevronDown className={`text-blue-400 shrink-0 transition-transform duration-300 ${isDetailDropdownOpen ? 'rotate-180' : ''}`} size={16} />
                </button>
                
                <div className={`absolute z-50 w-full mt-2 bg-white border border-blue-100 rounded-xl shadow-xl overflow-hidden transition-all duration-200 origin-top ${isDetailDropdownOpen ? 'opacity-100 translate-y-0 scale-100 visible pointer-events-auto' : 'opacity-0 -translate-y-2 scale-95 invisible pointer-events-none'}`}>
                  <ul className="max-h-64 overflow-y-auto divide-y divide-slate-50 py-1">
                    {filterType === 'month' && availableMonths.map(m => (
                      <li key={m}>
                        <button type="button" onClick={() => { setFilterDetail(m.toString()); setIsDetailDropdownOpen(false); }} className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors whitespace-normal break-words ${filterDetail === m.toString() ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}>
                          {monthNames[m]} {filterYear}
                        </button>
                      </li>
                    ))}
                    {filterType === 'quarter' && availableQuarters.map(q => (
                      <li key={q}>
                        <button type="button" onClick={() => { setFilterDetail(q.toString()); setIsDetailDropdownOpen(false); }} className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors whitespace-normal break-words ${filterDetail === q.toString() ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}>
                          {q === 1 ? '1st' : q === 2 ? '2nd' : q === 3 ? '3rd' : '4th'} Quarter {filterYear}
                        </button>
                      </li>
                    ))}
                    {filterType === 'semester' && availableSemesters.map(s => (
                      <li key={s}>
                        <button type="button" onClick={() => { setFilterDetail(s.toString()); setIsDetailDropdownOpen(false); }} className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors whitespace-normal break-words ${filterDetail === s.toString() ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}>
                          {s === 1 ? '1st' : '2nd'} Semester {filterYear}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 ${profile?.role === 'admin' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6`}>
        {profile?.role === 'admin' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl"><DollarSign size={20} /></div>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{getRevenueTitle()}</p>
              </div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">${dashboardData.filteredRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 text-red-600 rounded-xl"><Clock size={20} /></div>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Action Needed</p>
              </div>
              {badges.pendingCount > 0 && <span className="flex w-3 h-3"><span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
            </div>
            <p className="text-4xl font-black text-slate-900 tracking-tight">{badges.pendingCount}</p>
            <p className="text-xs font-bold text-slate-400 mt-1 uppercase">Pending Orders</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><Truck size={20} /></div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">In Transit</p>
            </div>
            <p className="text-4xl font-black text-slate-900 tracking-tight">{badges.needsDispatchCount}</p>
            <p className="text-xs font-bold text-slate-400 mt-1 uppercase">Active Deliveries</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* RECENT ORDERS TABLE */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><ShoppingCart size={18} className="text-slate-400"/> Recent Orders</h3>
            {profile?.role === 'admin' && (
              <Link to="/admin/orders" className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">View All <ChevronRight size={14}/></Link>
            )}
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="px-6 py-3 font-bold">Order ID</th>
                  <th className="px-6 py-3 font-bold">Customer</th>
                  <th className="px-6 py-3 font-bold">Status</th>
                  {profile?.role === 'admin' && (
                    <th className="px-6 py-3 font-bold text-right">Amount</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-slate-900 text-xs">#{order.id.substring(0,8).toUpperCase()}</td>
                    <td className="px-6 py-4 font-medium text-slate-700">{order.companies?.name || order.shipping_name || 'Retail'}</td>
                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                    {profile?.role === 'admin' && (
                      <td className="px-6 py-4 text-right font-extrabold text-slate-900">${Number(order.total_amount).toFixed(2)}</td>
                    )}
                  </tr>
                ))}
                {recentOrders.length === 0 && <tr><td colSpan={profile?.role === 'admin' ? "4" : "3"} className="px-6 py-8 text-center text-slate-400 font-medium">No recent orders found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* LOW STOCK ALERTS */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500"/>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Low Stock Alerts</h3>
          </div>
          <div className="p-2 flex-1">
            {lowStockItems.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {lowStockItems.map(item => (
                  <div key={item.product_id} className="p-4 hover:bg-slate-50 transition-colors rounded-xl flex justify-between items-center">
                    <p className="font-semibold text-slate-900 text-sm truncate pr-4">{item.products?.name}</p>
                    <span className="px-2.5 py-1 bg-red-50 text-red-600 font-extrabold text-xs rounded-lg shrink-0 border border-red-100">
                      {item.base_units_on_hand} left
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <CheckCircle2 size={32} className="text-emerald-400 mb-3" />
                <p className="font-bold text-slate-900 text-sm">Inventory Healthy</p>
                <p className="text-xs text-slate-500 mt-1">No products are currently critically low on stock.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  BarChart3, Package, DollarSign, Clock, Truck, 
  TrendingUp, AlertTriangle, ShoppingCart, ChevronRight, CheckCircle2,
  Wallet, FileText, Activity, CreditCard, Calendar, ChevronDown
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
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

  // Admin & Warehouse Metrics
  const [adminMetrics, setAdminMetrics] = useState({
    filteredRevenue: 0, pendingOrders: 0, activeDispatches: 0,
    lowStockItems: [], recentOrders: []
  });

  // Customer Metrics (B2B & Retail)
  const [customerMetrics, setCustomerMetrics] = useState({
    totalSpend: 0, activeOrders: 0, recentOrders: [],
    financials: { limit: 0, outstanding: 0, available: 0 }
  });

  // Re-fetch when the filters change
  useEffect(() => {
    if (profile?.id) {
      if (profile.role === 'admin' || profile.role === 'warehouse') fetchAdminDashboard();
      else if (profile.role === 'driver') setLoading(false);
      else fetchCustomerDashboard();
    }
  }, [profile?.id, profile?.role, profile?.company_id, filterType, filterDetail, filterYear]);

  // 🚀 SMART HANDLER: Automatically snaps to the max available period when changing Category
  const handleFilterTypeChange = (e) => {
    const newType = e.target.value;
    setFilterType(newType);
    
    const isCurrentYear = parseInt(filterYear) === currentYear;
    
    if (newType === 'month') {
      setFilterDetail(isCurrentYear ? currentMonth.toString() : "11");
    } else if (newType === 'quarter') {
      setFilterDetail(isCurrentYear ? currentQuarter.toString() : "4");
    } else if (newType === 'semester') {
      setFilterDetail(isCurrentYear ? currentSemester.toString() : "2");
    } else {
      setFilterDetail("1"); // Placeholder for annual
    }
  };

  // 🚀 SMART HANDLER: Automatically prevents looking into future months if year is changed to current
  const handleFilterYearChange = (e) => {
    const newYear = parseInt(e.target.value);
    setFilterYear(e.target.value);
    
    if (newYear === currentYear) {
      if (filterType === 'month' && parseInt(filterDetail) > currentMonth) setFilterDetail(currentMonth.toString());
      if (filterType === 'quarter' && parseInt(filterDetail) > currentQuarter) setFilterDetail(currentQuarter.toString());
      if (filterType === 'semester' && parseInt(filterDetail) > currentSemester) setFilterDetail(currentSemester.toString());
    }
  };

  const fetchAdminDashboard = async () => {
    setLoading(true);
    try {
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

      const [
        { data: revData }, { count: pendingCount }, { count: dispatchCount },
        { data: lowStock }, { data: recentOrders }
      ] = await Promise.all([
        // 🚀 FIXED: Only fetch revenue from DELIVERED orders
        supabase.from('orders').select('total_amount').in('status', ['delivered', 'delivered_partial']).gte('created_at', startIso).lte('created_at', endIso),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['ready_for_delivery', 'shipped', 'out_for_delivery']),
        supabase.from('inventory').select('product_id, base_units_on_hand, products(name)').lte('base_units_on_hand', 10).limit(5),
        supabase.from('orders').select('id, created_at, total_amount, status, shipping_name, companies(name)').order('created_at', { ascending: false }).limit(5)
      ]);

      const filteredRevenue = (revData || []).reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

      setAdminMetrics({
        filteredRevenue, pendingOrders: pendingCount || 0, activeDispatches: dispatchCount || 0,
        lowStockItems: lowStock || [], recentOrders: recentOrders || []
      });
    } catch (error) { console.error('Error:', error); } 
    finally { setLoading(false); }
  };

  const fetchCustomerDashboard = async () => {
    setLoading(true);
    try {
      // 🚀 FIXED: Lifetime spend should only count delivered orders
      let spendQuery = supabase.from('orders').select('total_amount').in('status', ['delivered', 'delivered_partial']);
      let activeQuery = supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['pending', 'processing', 'ready_for_delivery', 'shipped', 'out_for_delivery']);
      let recentQuery = supabase.from('orders').select('id, created_at, total_amount, status').order('created_at', { ascending: false }).limit(5);
      let unpaidQuery = supabase.from('orders').select('total_amount').eq('payment_status', 'unpaid');

      if (profile.company_id) {
        spendQuery = spendQuery.eq('company_id', profile.company_id);
        activeQuery = activeQuery.eq('company_id', profile.company_id);
        recentQuery = recentQuery.eq('company_id', profile.company_id);
        unpaidQuery = unpaidQuery.eq('company_id', profile.company_id);
      } else {
        spendQuery = spendQuery.eq('user_id', profile.id);
        activeQuery = activeQuery.eq('user_id', profile.id);
        recentQuery = recentQuery.eq('user_id', profile.id);
        unpaidQuery = unpaidQuery.eq('user_id', profile.id);
      }

      const [
        { data: spendData }, { count: activeCount }, { data: recentOrders }, { data: unpaidData }
      ] = await Promise.all([ spendQuery, activeQuery, recentQuery, unpaidQuery ]);

      const totalSpend = (spendData || []).reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
      const outstanding = (unpaidData || []).reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
      
      const limit = Number(profile?.companies?.credit_limit || 0);
      const available = Math.max(0, limit - outstanding);

      setCustomerMetrics({
        totalSpend, activeOrders: activeCount || 0, recentOrders: recentOrders || [],
        financials: { limit, outstanding, available }
      });
    } catch (error) { console.error('Error:', error); } 
    finally { setLoading(false); }
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

  if (loading) {
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
              <p className="text-4xl font-black text-slate-900 tracking-tight">{customerMetrics.activeOrders}</p>
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
                  <p className={`text-4xl font-black tracking-tight ${customerMetrics.financials.available <= 0 ? 'text-red-500' : 'text-slate-900'}`}>
                    ${customerMetrics.financials.available.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </p>
                  <p className="text-sm font-medium text-slate-500 mt-1">of ${customerMetrics.financials.limit.toLocaleString()} Limit</p>
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
                    ${customerMetrics.financials.outstanding.toLocaleString(undefined, {minimumFractionDigits: 2})}
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
                <p className="text-4xl font-black text-slate-900 tracking-tight">${customerMetrics.totalSpend.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
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
                {customerMetrics.recentOrders.map(order => (
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
                {customerMetrics.recentOrders.length === 0 && (
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

  // 🚀 GENERATE DYNAMIC OPTION LISTS BASED ON SELECTED YEAR
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
            <div className="relative w-full sm:w-28 shrink-0">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={filterYear}
                onChange={handleFilterYearChange}
                className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-700 shadow-sm appearance-none cursor-pointer transition-all"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            </div>

            {/* 2. FILTER CATEGORY */}
            <div className="relative w-full sm:w-40 shrink-0">
              <select 
                value={filterType}
                onChange={handleFilterTypeChange}
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-700 shadow-sm appearance-none cursor-pointer transition-all"
              >
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="semester">Semester</option>
                <option value="annual">Annual ({filterYear})</option>
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            </div>

            {/* 3. DYNAMIC SPECIFIC PERIOD SELECTOR */}
            {filterType !== 'annual' && (
              <div className="relative w-full sm:w-56 shrink-0">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-500" size={16} />
                <select 
                  value={filterDetail}
                  onChange={(e) => setFilterDetail(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-blue-50 border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-blue-900 shadow-sm appearance-none cursor-pointer transition-all"
                >
                  {filterType === 'month' && availableMonths.map(m => (
                    <option key={m} value={m}>{monthNames[m]} {filterYear}</option>
                  ))}
                  
                  {filterType === 'quarter' && availableQuarters.map(q => (
                    <option key={q} value={q}>{q === 1 ? '1st' : q === 2 ? '2nd' : q === 3 ? '3rd' : '4th'} Quarter {filterYear}</option>
                  ))}
                  
                  {filterType === 'semester' && availableSemesters.map(s => (
                    <option key={s} value={s}>{s === 1 ? '1st' : '2nd'} Semester {filterYear}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={16} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Grid depending on Admin vs Warehouse */}
      <div className={`grid grid-cols-1 ${profile?.role === 'admin' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6`}>
        
        {profile?.role === 'admin' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl"><DollarSign size={20} /></div>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{getRevenueTitle()}</p>
              </div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">${adminMetrics.filteredRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
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
              {adminMetrics.pendingOrders > 0 && <span className="flex w-3 h-3"><span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
            </div>
            <p className="text-4xl font-black text-slate-900 tracking-tight">{adminMetrics.pendingOrders}</p>
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
            <p className="text-4xl font-black text-slate-900 tracking-tight">{adminMetrics.activeDispatches}</p>
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
                {adminMetrics.recentOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-slate-900 text-xs">#{order.id.substring(0,8).toUpperCase()}</td>
                    <td className="px-6 py-4 font-medium text-slate-700">{order.companies?.name || order.shipping_name || 'Retail'}</td>
                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                    {profile?.role === 'admin' && (
                      <td className="px-6 py-4 text-right font-extrabold text-slate-900">${Number(order.total_amount).toFixed(2)}</td>
                    )}
                  </tr>
                ))}
                {adminMetrics.recentOrders.length === 0 && <tr><td colSpan={profile?.role === 'admin' ? "4" : "3"} className="px-6 py-8 text-center text-slate-400 font-medium">No recent orders found.</td></tr>}
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
            {adminMetrics.lowStockItems.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {adminMetrics.lowStockItems.map(item => (
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
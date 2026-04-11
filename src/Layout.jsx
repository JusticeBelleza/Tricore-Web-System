import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { supabase } from './lib/supabase';
import { 
  LayoutDashboard, Package, ShoppingCart, Truck, Warehouse, 
  Users, BarChart3, ClipboardList, LogOut, Menu, X, Car, Navigation,
  AlertCircle, CheckCircle2, XCircle, Share, PlusSquare // 🚀 Added Share & PlusSquare for iOS Prompt
} from "lucide-react"; 

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check if the user is a customer (Retail or B2B)
  const isCustomer = !profile?.role || ['user', 'retail', 'b2b'].includes(profile?.role);

  // --- Real-time Badge States ---
  const [pendingCount, setPendingCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [processingCount, setProcessingCount] = useState(0);
  const [needsDispatchCount, setNeedsDispatchCount] = useState(0);
  const [returnsCount, setReturnsCount] = useState(0);
  
  // --- Customer Notification Popup State ---
  const [customerAlert, setCustomerAlert] = useState({ show: false, type: 'info', message: '', description: '' });

  // 🚀 --- iOS PWA Install Prompt State ---
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  // 🚀 --- Check for iPhone/iPad to show manual install prompt ---
  useEffect(() => {
    const isIos = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    };

    const isInStandaloneMode = () => {
      return ('standalone' in window.navigator) && (window.navigator.standalone);
    };

    // If it's iOS, NOT installed as an app, and hasn't been dismissed yet...
    if (isIos() && !isInStandaloneMode()) {
      const hasDismissed = localStorage.getItem('dismissedPwaPrompt');
      if (!hasDismissed) {
        setShowIosPrompt(true);
      }
    }
  }, []);

  const dismissIosPrompt = () => {
    setShowIosPrompt(false);
    localStorage.setItem('dismissedPwaPrompt', 'true');
  };

  useEffect(() => {
    if (!profile) return;
    
    const fetchBadges = async () => {
      // 1. Admins & Warehouse get badge for Pending Orders
      if (profile.role === 'admin' || profile.role === 'warehouse') {
        const lastViewedPending = localStorage.getItem('lastViewedPending') || new Date(0).toISOString();
        const { count: pCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .gt('created_at', lastViewedPending); 
        setPendingCount(pCount || 0);
      }
      
      // 2. Admins & Warehouse get badge for Processing Orders, Dispatch, AND RETURNS
      if (profile.role === 'admin' || profile.role === 'warehouse') {
        const { count: prCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'processing');
        setProcessingCount(prCount || 0);

        const lastViewedDispatch = localStorage.getItem('lastViewedDispatch') || new Date(0).toISOString();
        const { count: dispatchCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ready_for_delivery')
          .gt('updated_at', lastViewedDispatch); 
        setNeedsDispatchCount(dispatchCount || 0);

        const { count: rCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'attempted')
          .is('is_restocked', false);
        setReturnsCount(rCount || 0);
      }

      // 3. Customers get badge for Net-30 Overdue Invoices
      if (isCustomer) {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 25); 
        
        let query = supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'delivered') 
          .eq('payment_status', 'unpaid')
          .eq('payment_method', 'net_30')
          .lte('created_at', threshold.toISOString());

        if (profile.company_id) {
          query = query.eq('company_id', profile.company_id);
        } else if (profile.id) {
          query = query.eq('user_id', profile.id);
        }

        const { count } = await query;
        setOverdueCount(count || 0);
      }
    };

    fetchBadges();
    
    const sub = supabase.channel('global_orders_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        fetchBadges();
        
        if (isCustomer && payload.eventType === 'UPDATE') {
          const oldData = payload.old;
          const newData = payload.new;
          
          const isMyOrder = profile.company_id ? newData.company_id === profile.company_id : newData.user_id === profile.id;
          
          if (isMyOrder) {
            if (newData.status === 'cancelled' && oldData.status !== 'cancelled') {
              setCustomerAlert({
                show: true, type: 'error',
                message: `Order #${newData.id.substring(0,8).toUpperCase()} Cancelled`,
                description: newData.cancellation_reason || 'Please check your order history for details.'
              });
              setTimeout(() => setCustomerAlert(prev => ({...prev, show: false})), 8000);
            }
            else if (newData.status === 'processing' && oldData.status === 'pending') {
              setCustomerAlert({
                show: true, type: 'success',
                message: `Order #${newData.id.substring(0,8).toUpperCase()} Approved`,
                description: 'Your order has been approved and is now processing.'
              });
              setTimeout(() => setCustomerAlert(prev => ({...prev, show: false})), 5000);
            }
            else if (newData.total_amount !== oldData.total_amount && newData.status !== 'cancelled') {
              setCustomerAlert({
                show: true, type: 'warning',
                message: `Order #${newData.id.substring(0,8).toUpperCase()} Adjusted`,
                description: 'Our warehouse updated your items or quantities. Totals have been recalculated.'
              });
              setTimeout(() => setCustomerAlert(prev => ({...prev, show: false})), 8000);
            }
          }
        }
      })
      .subscribe();

    window.addEventListener('orderStatusChanged', fetchBadges);
    window.addEventListener('podViewed', fetchBadges);
    window.addEventListener('pendingViewed', fetchBadges);
    window.addEventListener('dispatchViewed', fetchBadges);

    return () => {
      supabase.removeChannel(sub);
      window.removeEventListener('orderStatusChanged', fetchBadges);
      window.removeEventListener('podViewed', fetchBadges);
      window.removeEventListener('pendingViewed', fetchBadges);
      window.removeEventListener('dispatchViewed', fetchBadges);
    };
  }, [profile, isCustomer]);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error.message);
    }
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const navItemClass = (path) => `
    flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all mb-1
    ${location.pathname.startsWith(path) 
      ? 'bg-slate-900 text-white shadow-md' 
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-95'}
  `;

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans relative">
      
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out
        lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
          <div className="flex-1 flex justify-center items-center h-full pt-1">
            <img 
              src="/images/tricore-logo2.png" 
              alt="TriCore Logo" 
              className="h-12 w-auto object-contain" 
            />
          </div>
          <button onClick={closeMobileMenu} className="lg:hidden text-slate-400 hover:text-slate-900 p-1 bg-slate-100 rounded-md transition-colors absolute right-4">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 overflow-y-auto">
          <div className="space-y-1">
            
            {profile?.role === 'driver' ? (
              <>
                <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Driver Menu</p>
                <Link to="/driver" onClick={closeMobileMenu} className={navItemClass('/driver')}>
                  <Truck size={18} /> My Routes
                </Link>
              </>
            ) : (
              <>
                <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Main Menu</p>
                <Link to="/dashboard" onClick={closeMobileMenu} className={navItemClass('/dashboard')}>
                  <LayoutDashboard size={18} /> Dashboard
                </Link>
                
                {isCustomer && (
                  <>
                    <Link to="/catalog" onClick={closeMobileMenu} className={navItemClass('/catalog')}>
                      <Package size={18} /> Catalog
                    </Link>
                    <Link to="/orders" onClick={closeMobileMenu} className={navItemClass('/orders')}>
                      <ShoppingCart size={18} /> 
                      <span className="flex-1">My Orders</span>
                      {overdueCount > 0 && (
                        <div className="relative flex items-center justify-center ml-auto">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                          <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-sm">
                            {overdueCount} Due
                          </span>
                        </div>
                      )}
                    </Link>
                  </>
                )}
                
                {(profile?.role === 'admin' || profile?.role === 'warehouse') && (
                  <div className="pt-4 pb-2">
                    <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operations</p>
                  </div>
                )}
                
                {(profile?.role === 'admin' || profile?.role === 'warehouse') && (
                  <>
                    <Link to="/admin/orders" onClick={closeMobileMenu} className={navItemClass('/admin/orders')}>
                      <ShoppingCart size={18} /> 
                      <span className="flex-1">All Orders</span>
                      {pendingCount > 0 && (
                        <div className="relative flex items-center justify-center ml-auto">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                          <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-sm">
                            {pendingCount} New
                          </span>
                        </div>
                      )}
                    </Link>

                    <Link to="/warehouse" onClick={closeMobileMenu} className={navItemClass('/warehouse')}>
                      <Warehouse size={18} /> 
                      <span className="flex-1">Pick & Pack</span>
                      
                      {processingCount > 0 && returnsCount === 0 && (
                        <div className="relative flex items-center justify-center ml-auto">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping"></span>
                          <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-blue-600 rounded-full shadow-sm">
                            {processingCount} New
                          </span>
                        </div>
                      )}

                      {returnsCount > 0 && (
                        <div className="relative flex items-center justify-center ml-auto" title={`${returnsCount} Returned Orders need restocking`}>
                          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                          <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-sm">
                            {returnsCount} Returns
                          </span>
                        </div>
                      )}
                    </Link>
                    
                    <Link to="/dispatch" onClick={closeMobileMenu} className={navItemClass('/dispatch')}>
                      <Navigation size={18} /> 
                      <span className="flex-1">Dispatch & POD</span>
                      {needsDispatchCount > 0 && (
                        <div className="relative flex items-center justify-center ml-auto">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75 animate-ping"></span>
                          <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-purple-600 rounded-full shadow-sm">
                            {needsDispatchCount} New
                          </span>
                        </div>
                      )}
                    </Link>

                    <Link to="/admin/products" onClick={closeMobileMenu} className={navItemClass('/admin/products')}>
                      <Package size={18} /> Manage Products
                    </Link>

                    <Link to="/fleet" onClick={closeMobileMenu} className={navItemClass('/fleet')}>
                      <Car size={18} /> Fleet Management
                    </Link>

                    <Link to="/purchase-orders" onClick={closeMobileMenu} className={navItemClass('/purchase-orders')}>
                      <ClipboardList size={18} /> Purchase Orders
                    </Link>

                    <Link to="/admin/reports" onClick={closeMobileMenu} className={navItemClass('/admin/reports')}>
                      <BarChart3 size={18} /> Reports
                    </Link>
                  </>
                )}

                {profile?.role === 'admin' && (
                  <>
                    <div className="pt-4 pb-2">
                      <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Administration</p>
                    </div>

                    <Link to="/admin/users" onClick={closeMobileMenu} className={navItemClass('/admin/users')}>
                      <Users size={18} /> User Management
                    </Link>
                  </>
                )}
              </>
            )}

          </div>
        </nav>

        <div className="p-4 border-t border-slate-200 shrink-0 bg-slate-50/50">
          <Link 
            to="/profile" 
            onClick={closeMobileMenu}
            className="flex items-center gap-3 p-2.5 mb-3 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-sm font-black tracking-widest text-slate-700 shrink-0 uppercase shadow-inner group-hover:border-slate-400 group-hover:bg-slate-100 transition-colors">
              {getInitials(profile?.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                {profile?.full_name || 'Loading...'}
              </p>
              <p className="text-[11px] text-slate-500 capitalize truncate font-medium">
                {profile?.role || 'User'} Account
              </p>
            </div>
          </Link>

          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-red-600 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 active:scale-95 rounded-lg transition-all shadow-sm"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 lg:ml-64 flex flex-col min-w-0 min-h-screen">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center px-4 sm:px-8 sticky top-0 z-30 shrink-0">
          <button 
            onClick={() => setIsMobileMenuOpen(true)} 
            className="lg:hidden p-2 mr-3 -ml-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          >
            <Menu size={24} />
          </button>
          
          <div className="flex items-center gap-3 lg:hidden">
            <img src="/images/tricore-logo2.png" alt="TriCore Logo" className="h-8 w-auto object-contain mt-1" />
          </div>
          
          <h1 className="text-lg font-bold text-slate-900 capitalize tracking-tight ml-auto lg:ml-0">
            {location.pathname.split('/').pop()?.replace('-', ' ') || 'Dashboard'}
          </h1>
        </header>

        <div className="p-4 sm:p-8 flex-1">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      {/* 🚀 REAL-TIME CUSTOMER NOTIFICATION POPUP */}
      {customerAlert.show && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-1 px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-top-5 fade-in duration-300 w-11/12 max-w-md border ${
          customerAlert.type === 'error' ? 'bg-red-50 border-red-200 text-red-900' : 
          customerAlert.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-900' :
          'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold">
              {customerAlert.type === 'error' && <XCircle size={18} className="text-red-600" />}
              {customerAlert.type === 'warning' && <AlertCircle size={18} className="text-amber-600" />}
              {customerAlert.type === 'success' && <CheckCircle2 size={18} className="text-emerald-600" />}
              <span>{customerAlert.message}</span>
            </div>
            <button onClick={() => setCustomerAlert(prev => ({...prev, show: false}))} className="opacity-50 hover:opacity-100 transition-opacity">
              <X size={16} />
            </button>
          </div>
          <p className={`text-sm font-medium ml-7 ${
            customerAlert.type === 'error' ? 'text-red-700' : 
            customerAlert.type === 'warning' ? 'text-amber-700' :
            'text-emerald-700'
          }`}>
            {customerAlert.description}
          </p>
        </div>
      )}

      {/* 🚀 iOS PWA MANUAL INSTALL PROMPT */}
      {showIosPrompt && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] w-[90%] max-w-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 border border-slate-200 relative animate-in slide-in-from-bottom-10 fade-in duration-300">
            
            <button 
              onClick={dismissIosPrompt}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors active:scale-95"
            >
              <X size={18} />
            </button>

            <h3 className="font-black text-slate-900 text-lg tracking-tight mb-2">
              Install Driver App
            </h3>
            
            <p className="text-sm text-slate-500 font-medium leading-relaxed mb-5 pr-4">
              Install this app on your iPhone for full-screen maps and offline access.
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                  <Share size={20} className="text-blue-500" />
                </div>
                <p className="text-sm font-bold text-slate-700">1. Tap the <span className="text-blue-600">Share</span> icon below</p>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                  <PlusSquare size={20} className="text-slate-700" />
                </div>
                <p className="text-sm font-bold text-slate-700">2. Select <span className="text-slate-900 font-black">Add to Home Screen</span></p>
              </div>
            </div>

            {/* Downward pointing triangle/arrow */}
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-white filter drop-shadow-md"></div>
          </div>
        </div>
      )}

    </div>
  );
}
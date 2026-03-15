import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { supabase } from './lib/supabase';
import { 
  LayoutDashboard, Package, ShoppingCart, Truck, Warehouse, 
  Users, BarChart3, ClipboardList, LogOut, Menu, X, Car, Navigation
} from "lucide-react"; 

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- Real-time Badge States ---
  const [pendingCount, setPendingCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [processingCount, setProcessingCount] = useState(0);
  const [deliveredTodayCount, setDeliveredTodayCount] = useState(0); 
  const [needsDispatchCount, setNeedsDispatchCount] = useState(0);

  useEffect(() => {
    if (!profile) return;
    
    const fetchBadges = async () => {
      // 1. Admins get badge for Pending Orders (Only if NEW since last checked)
      if (profile.role === 'admin') {
        const lastViewedPending = localStorage.getItem('lastViewedPending') || new Date(0).toISOString();
        const { count: pCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .gt('created_at', lastViewedPending); 
        setPendingCount(pCount || 0);
      }
      
      // Calculate "Delivered Today" for both Admin and Warehouse
      if (profile.role === 'admin' || profile.role === 'warehouse') {
        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        let compareTime = today.toISOString();
        const lastViewed = localStorage.getItem('lastViewedDelivered');
        if (lastViewed && new Date(lastViewed) > today) compareTime = lastViewed;

        const { count: dCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'delivered')
          .gt('updated_at', compareTime);
        setDeliveredTodayCount(dCount || 0);
      }
      
      // 2. Admins & Warehouse Staff get badge for Processing Orders
      if (profile.role === 'admin' || profile.role === 'warehouse') {
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'processing');
        setProcessingCount(count || 0);

        // Count orders waiting for a driver that are NEW since last viewed
        const lastViewedDispatch = localStorage.getItem('lastViewedDispatch') || new Date(0).toISOString();
        const { count: dispatchCount } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ready_for_delivery')
          .gt('updated_at', lastViewedDispatch); // Only count recently updated ones
        setNeedsDispatchCount(dispatchCount || 0);
      }

      // 3. Agencies get badge for Net-30 Invoices (ONLY 5 days before due)
      if (profile.role === 'b2b' && profile.company_id) {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 25); 
        
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', profile.company_id)
          .eq('payment_status', 'unpaid')
          .eq('payment_method', 'net_30')
          .lte('created_at', threshold.toISOString());

        setOverdueCount(count || 0);
      }
    };

    fetchBadges();
    
    const sub = supabase.channel('badge_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchBadges)
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
  }, [profile]);

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

  // 🚀 HELPER TO GET INITIALS
  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const isCustomer = !profile?.role || ['user', 'retail', 'b2b'].includes(profile?.role);

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
          onClick={closeMobileMenu}
        />
      )}

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
            
            {/* EXCLUSIVE DRIVER MENU */}
            {profile?.role === 'driver' ? (
              <>
                <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Driver Menu</p>
                <Link to="/driver" onClick={closeMobileMenu} className={navItemClass('/driver')}>
                  <Truck size={18} /> My Routes
                </Link>
              </>
            ) : (
              /* --- EVERYONE ELSE'S MENU --- */
              <>
                <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Main Menu</p>
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
                          <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-extrabold text-white bg-red-600 rounded-full shadow-sm">
                            {overdueCount} Due
                          </span>
                        </div>
                      )}
                    </Link>
                  </>
                )}
                
                {(profile?.role === 'admin' || profile?.role === 'warehouse') && (
                  <div className="pt-4 pb-2">
                    <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Operations</p>
                  </div>
                )}
                
                {(profile?.role === 'admin' || profile?.role === 'warehouse') && (
                  <>
                    <Link to="/warehouse" onClick={closeMobileMenu} className={navItemClass('/warehouse')}>
                      <Warehouse size={18} /> 
                      <span className="flex-1">Pick & Pack</span>
                      {processingCount > 0 && (
                        <div className="relative flex items-center justify-center ml-auto">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                          <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-extrabold text-white bg-red-600 rounded-full shadow-sm">
                            {processingCount} New
                          </span>
                        </div>
                      )}
                    </Link>
                    
                    <Link to="/purchase-orders" onClick={closeMobileMenu} className={navItemClass('/purchase-orders')}>
                      <ClipboardList size={18} /> Purchase Orders
                    </Link>

                    <Link to="/admin/products" onClick={closeMobileMenu} className={navItemClass('/admin/products')}>
                      <Package size={18} /> Manage Products
                    </Link>

                    <Link to="/dispatch" onClick={closeMobileMenu} className={navItemClass('/dispatch')}>
                      <Navigation size={18} /> 
                      <span className="flex-1">Dispatch & POD</span>
                      
                      {needsDispatchCount > 0 && (
                        <div className="relative flex items-center justify-center ml-auto">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75 animate-ping"></span>
                          <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-extrabold text-white bg-purple-600 rounded-full shadow-sm">
                            {needsDispatchCount} To Dispatch
                          </span>
                        </div>
                      )}
                    </Link>
                  </>
                )}

                {profile?.role === 'admin' && (
                  <>
                    <div className="pt-4 pb-2">
                      <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Administration</p>
                    </div>
                    
                    <Link to="/admin/orders" onClick={closeMobileMenu} className={navItemClass('/admin/orders')}>
                      <ShoppingCart size={18} /> 
                      <span className="flex-1">All Orders</span>
                      {pendingCount > 0 && (
                        <div className="relative flex items-center justify-center ml-auto">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                          <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-extrabold text-white bg-red-600 rounded-full shadow-sm">
                            {pendingCount} New
                          </span>
                        </div>
                      )}
                    </Link>
                    
                    <Link to="/fleet" onClick={closeMobileMenu} className={navItemClass('/fleet')}>
                      <Car size={18} /> Fleet Management
                    </Link>

                    <Link to="/admin/users" onClick={closeMobileMenu} className={navItemClass('/admin/users')}>
                      <Users size={18} /> User Management
                    </Link>
                    <Link to="/admin/reports" onClick={closeMobileMenu} className={navItemClass('/admin/reports')}>
                      <BarChart3 size={18} /> Reports
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
            {/* 🚀 DYNAMIC INITIALS AVATAR IN SIDEBAR */}
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

      <main className="flex-1 lg:ml-64 flex flex-col min-w-0 min-h-screen">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center px-4 sm:px-8 sticky top-0 z-30 shrink-0">
          <button 
            onClick={() => setIsMobileMenuOpen(true)} 
            className="lg:hidden p-2 mr-3 -ml-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-3 lg:hidden">
            <img 
              src="/images/tricore-logo2.png" 
              alt="TriCore Logo" 
              className="h-8 w-auto object-contain mt-1" 
            />
          </div>
          <h1 className="text-lg font-bold text-slate-900 capitalize tracking-tight ml-auto lg:ml-0">
            {location.pathname.split('/').pop()?.replace('-', ' ') || 'My Routes'}
          </h1>
        </header>

        <div className="p-4 sm:p-8 flex-1">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

    </div>
  );
}
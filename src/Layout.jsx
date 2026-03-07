import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { supabase } from './lib/supabase';
import { 
  LayoutDashboard, Package, ShoppingCart, Truck, Warehouse, 
  Users, BarChart3, ClipboardList, LogOut, User, Menu, X, Car
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

  useEffect(() => {
    if (!profile) return;
    
    const fetchBadges = async () => {
      // 1. Admins get badge for Pending Orders
      if (profile.role === 'admin') {
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        setPendingCount(count || 0);
      } 
      
      // 2. Admins & Warehouse Staff get badge for Processing Orders (Pick & Pack)
      if (profile.role === 'admin' || profile.role === 'warehouse') {
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'processing');
        setProcessingCount(count || 0);
      }

      // 3. Agencies get badge for Overdue Net-30 Invoices
      if (profile.role === 'b2b' && profile.company_id) {
        const { data } = await supabase
          .from('orders')
          .select('created_at, status')
          .eq('company_id', profile.company_id)
          .eq('payment_status', 'unpaid')
          .eq('payment_method', 'net_30');

        if (data) {
          const now = new Date();
          let overdue = 0;
          data.forEach(o => {
            if (o.status === 'delivered') {
              const baseDate = new Date(o.created_at);
              const dueDate = new Date(baseDate);
              dueDate.setDate(dueDate.getDate() + 30);
              if (now > dueDate) overdue++;
            }
          });
          setOverdueCount(overdue);
        }
      }
    };

    fetchBadges();
    
    // Listen to Supabase DB updates (Cross-device syncing)
    const sub = supabase.channel('badge_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchBadges)
      .subscribe();

    // 🚀 NEW: Listen for INSTANT local UI updates (Same-tab syncing)
    window.addEventListener('orderStatusChanged', fetchBadges);

    return () => {
      supabase.removeChannel(sub);
      window.removeEventListener('orderStatusChanged', fetchBadges);
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

  const isCustomer = !profile?.role || ['user', 'retail', 'b2b'].includes(profile?.role);

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      
      {/* Mobile Overlay Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar (Responsive) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out
        lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        
        {/* Brand Header */}
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

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto">
          <div className="space-y-1">
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
            
            {(profile?.role === 'admin' || profile?.role === 'warehouse' || profile?.role === 'driver') && (
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
              </>
            )}
            
            {(profile?.role === 'admin' || profile?.role === 'driver') && (
              <Link to="/driver" onClick={closeMobileMenu} className={navItemClass('/driver')}>
                <Truck size={18} /> My Routes
              </Link>
            )}

            {profile?.role === 'admin' && (
              <>
                <div className="pt-4 pb-2">
                  <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Administration</p>
                </div>
                <Link to="/admin/products" onClick={closeMobileMenu} className={navItemClass('/admin/products')}>
                  <Package size={18} /> Manage Products
                </Link>
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
          </div>
        </nav>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-slate-200 shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-sm font-semibold text-slate-700 shrink-0 uppercase shadow-inner">
              <User size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {profile?.full_name || 'Loading...'}
              </p>
              <p className="text-xs text-slate-500 capitalize truncate font-medium">
                {profile?.role || 'User'}
              </p>
            </div>
          </div>
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
        
        {/* Responsive Mobile Top Header */}
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
            {location.pathname.split('/').pop()?.replace('-', ' ') || 'Dashboard'}
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
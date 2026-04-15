import React from 'react';
import { Link } from 'react-router-dom';
import { 
  LayoutDashboard, Package, ShoppingCart, Truck, Warehouse, 
  Users, BarChart3, ClipboardList, LogOut, X, Car, Navigation
} from "lucide-react"; 

export default function Sidebar({ isMobileMenuOpen, closeMobileMenu, profile, badges, isCustomer, handleLogout, location }) {
  
  const navItemClass = (path) => `
    flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all mb-1
    ${location.pathname.startsWith(path) 
      ? 'bg-slate-900 text-white shadow-md' 
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-95'}
  `;

  const getInitials = (name) => {
    if (!name || typeof name !== 'string' || name.trim() === '') return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out
      lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
    `}>
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
        <div className="flex-1 flex justify-center items-center h-full pt-1">
          <img src="/images/tricore-logo2.png" alt="TriCore Logo" className="h-12 w-auto object-contain" />
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
                    {badges.overdueCount > 0 && (
                      <div className="relative flex items-center justify-center ml-auto">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                        <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-sm">
                          {badges.overdueCount} Due
                        </span>
                      </div>
                    )}
                  </Link>
                </>
              )}
              
              {(profile?.role === 'admin' || profile?.role === 'warehouse') && (
                <>
                  <div className="pt-4 pb-2">
                    <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operations</p>
                  </div>
                  <Link to="/admin/orders" onClick={closeMobileMenu} className={navItemClass('/admin/orders')}>
                    <ShoppingCart size={18} /> 
                    <span className="flex-1">All Orders</span>
                    {badges.pendingCount > 0 && (
                      <div className="relative flex items-center justify-center ml-auto">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                        <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-sm">
                          {badges.pendingCount} New
                        </span>
                      </div>
                    )}
                  </Link>

                  <Link to="/warehouse" onClick={closeMobileMenu} className={navItemClass('/warehouse')}>
                    <Warehouse size={18} /> 
                    <span className="flex-1">Pick & Pack</span>
                    {badges.processingCount > 0 && badges.returnsCount === 0 && (
                      <div className="relative flex items-center justify-center ml-auto">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping"></span>
                        <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-blue-600 rounded-full shadow-sm">
                          {badges.processingCount} New
                        </span>
                      </div>
                    )}
                    {badges.returnsCount > 0 && (
                      <div className="relative flex items-center justify-center ml-auto" title={`${badges.returnsCount} Returned Orders need restocking`}>
                        <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                        <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-sm">
                          {badges.returnsCount} Returns
                        </span>
                      </div>
                    )}
                  </Link>
                  
                  <Link to="/dispatch" onClick={closeMobileMenu} className={navItemClass('/dispatch')}>
                    <Navigation size={18} /> 
                    <span className="flex-1">Dispatch & POD</span>
                    {badges.needsDispatchCount > 0 && (
                      <div className="relative flex items-center justify-center ml-auto">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75 animate-ping"></span>
                        <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-purple-600 rounded-full shadow-sm">
                          {badges.needsDispatchCount} New
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
  );
}
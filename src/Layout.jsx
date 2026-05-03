import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { supabase } from './lib/supabase';
import { useMetricsStore } from './store/useMetricsStore';
import { AlertCircle, CheckCircle2, XCircle, X, Share, PlusSquare } from "lucide-react"; 

import Header from './components/Header';
import Sidebar from './components/Sidebar';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isCustomer = !profile?.role || ['user', 'retail', 'b2b'].includes(profile?.role);

  // ZUSTAND GLOBAL METRICS
  const badges = useMetricsStore((state) => state.badges);
  const fetchBadges = useMetricsStore((state) => state.fetchBadges);
  const initRealtime = useMetricsStore((state) => state.initRealtime);
  const cleanupRealtime = useMetricsStore((state) => state.cleanupRealtime);
  
  // Customer Notification & iOS Prompts
  const [customerAlert, setCustomerAlert] = useState({ show: false, type: 'info', message: '', description: '' });
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  useEffect(() => {
    const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone);

    if (isIos() && !isInStandaloneMode() && !localStorage.getItem('dismissedPwaPrompt')) {
      setShowIosPrompt(true);
    }
  }, []);

  const dismissIosPrompt = () => {
    setShowIosPrompt(false);
    localStorage.setItem('dismissedPwaPrompt', 'true');
  };

  useEffect(() => {
    if (!profile) return;
    
    fetchBadges(profile);
    initRealtime(profile);

    const handleUpdate = () => fetchBadges(profile);
    window.addEventListener('orderStatusChanged', handleUpdate);
    window.addEventListener('podViewed', handleUpdate);
    window.addEventListener('pendingViewed', handleUpdate);
    window.addEventListener('dispatchViewed', handleUpdate);

    let alertSub = null;
    let adminOrdersSub = null;
    let adminOrderItemsSub = null;

    if (isCustomer) {
      alertSub = supabase.channel('customer_ui_alerts')
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'orders',
          filter: profile.company_id ? `company_id=eq.${profile.company_id}` : `user_id=eq.${profile.id}`
        }, (payload) => {
            const oldData = payload.old;
            const newData = payload.new;
            
            if (newData.status === 'cancelled' && oldData.status !== 'cancelled') {
              setCustomerAlert({ show: true, type: 'error', message: `Order #${newData.id.substring(0,8).toUpperCase()} Cancelled`, description: newData.cancellation_reason || 'Please check your order history for details.' });
              setTimeout(() => setCustomerAlert(prev => ({...prev, show: false})), 8000);
            }
            else if (newData.status === 'processing' && oldData.status === 'pending') {
              setCustomerAlert({ show: true, type: 'success', message: `Order #${newData.id.substring(0,8).toUpperCase()} Approved`, description: 'Your order has been approved and is now processing.' });
              setTimeout(() => setCustomerAlert(prev => ({...prev, show: false})), 5000);
            }
            else if (newData.total_amount !== oldData.total_amount && newData.status !== 'cancelled') {
              setCustomerAlert({ show: true, type: 'warning', message: `Order #${newData.id.substring(0,8).toUpperCase()} Adjusted`, description: 'Our warehouse updated your items or quantities. Totals have been recalculated.' });
              setTimeout(() => setCustomerAlert(prev => ({...prev, show: false})), 8000);
            }
        }).subscribe();
    } else {
      // 🚀 THE FIX: Global real-time listeners for BOTH orders and order_items
      // This forces the sidebar badges to instantly refresh if a whole order changes OR if a single item is restocked/cancelled!
      
      adminOrdersSub = supabase.channel('global_admin_orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          fetchBadges(profile);
        }).subscribe();

      adminOrderItemsSub = supabase.channel('global_admin_order_items')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
          fetchBadges(profile);
        }).subscribe();
    }

    return () => {
      cleanupRealtime();
      if (alertSub) supabase.removeChannel(alertSub);
      if (adminOrdersSub) supabase.removeChannel(adminOrdersSub);
      if (adminOrderItemsSub) supabase.removeChannel(adminOrderItemsSub);
      window.removeEventListener('orderStatusChanged', handleUpdate);
      window.removeEventListener('podViewed', handleUpdate);
      window.removeEventListener('pendingViewed', handleUpdate);
      window.removeEventListener('dispatchViewed', handleUpdate);
    };
  }, [profile, isCustomer, fetchBadges, initRealtime, cleanupRealtime]);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error.message);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans relative">
      
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 🚀 OUR CLEAN SIDEBAR COMPONENT */}
      <Sidebar 
        isMobileMenuOpen={isMobileMenuOpen} 
        closeMobileMenu={() => setIsMobileMenuOpen(false)}
        profile={profile}
        badges={badges}
        isCustomer={isCustomer}
        handleLogout={handleLogout}
        location={location}
      />

      <main className="flex-1 lg:ml-64 flex flex-col min-w-0 min-h-screen">
        
        {/* 🚀 OUR CLEAN HEADER COMPONENT */}
        <Header setIsMobileMenuOpen={setIsMobileMenuOpen} location={location} />

        <div className="p-4 sm:p-8 flex-1">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      {/* CUSTOMER NOTIFICATION POPUP */}
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
          <p className={`text-sm font-medium ml-7 ${customerAlert.type === 'error' ? 'text-red-700' : customerAlert.type === 'warning' ? 'text-amber-700' : 'text-emerald-700'}`}>
            {customerAlert.description}
          </p>
        </div>
      )}

      {/* iOS PWA MANUAL INSTALL PROMPT */}
      {showIosPrompt && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] w-[90%] max-w-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 border border-slate-200 relative animate-in slide-in-from-bottom-10 fade-in duration-300">
            <button onClick={dismissIosPrompt} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors active:scale-95">
              <X size={18} />
            </button>
            <h3 className="font-black text-slate-900 text-lg tracking-tight mb-2">Install Driver App</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed mb-5 pr-4">
              Install this app on your iPhone for full-screen maps and offline access.
            </p>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200"><Share size={20} className="text-blue-500" /></div>
                <p className="text-sm font-bold text-slate-700">1. Tap the <span className="text-blue-600">Share</span> icon below</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200"><PlusSquare size={20} className="text-slate-700" /></div>
                <p className="text-sm font-bold text-slate-700">2. Select <span className="text-slate-900 font-black">Add to Home Screen</span></p>
              </div>
            </div>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-white filter drop-shadow-md"></div>
          </div>
        </div>
      )}
    </div>
  );
}
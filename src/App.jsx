import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import Login from './pages/Login';
import Catalog from './pages/Catalog';
import Checkout from './pages/Checkout';
import { useAuth } from './lib/AuthContext';
import Warehouse from './pages/Warehouse';
import DriverRoutes from './pages/DriverRoutes';
import MyOrders from './pages/MyOrders';
import AdminOrders from './pages/AdminOrders';
import AdminUsers from './pages/AdminUsers';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import FleetManagement from './pages/FleetManagement';
import AgencyDashboard from './pages/AgencyDashboard';

import Products from './pages/Products';
import PurchaseOrders from './pages/PurchaseOrders';

// Component to protect routes - redirects to login if there is no active session
const ProtectedRoute = ({ children }) => {
  // Grab profile as well so we can ensure it's loaded before rendering the app
  const { user, profile, loading } = useAuth();
  
  // Wait if AuthContext is loading OR if we have a user but their profile hasn't arrived yet
  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          {/* TRICORE LOGO SPINNER */}
          <img 
            src="/images/tricore-logo.png" 
            alt="Tricore Loading" 
            className="w-12 h-12 animate-spin drop-shadow-sm" 
          />
          <span className="text-sm font-bold text-slate-500 tracking-wider uppercase animate-pulse">
            Authenticating...
          </span>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Component to handle Dashboard routing based on Role
const DashboardRouter = () => {
    const { profile } = useAuth();
    
    // Because ProtectedRoute forces the app to wait for the profile, 
    // we can securely rely on profile.role being instantly available here!
    const role = profile?.role;

    // Route B2B and Agency Admins to their specific dashboard
    if (role === 'b2b' || role === 'agency_admin') {
        return <AgencyDashboard />;
    }

    // Everyone else (Admins, Warehouse, etc.) gets the standard Dashboard
    return <Dashboard />;
};


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Route */}
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes wrapped in the Sidebar Layout */}
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          {/* Automatically redirect from root "/" to "/dashboard" */}
          <Route index element={<Navigate to="/dashboard" replace />} />
          
          {/* Dashboard is now a Router Component */}
          <Route path="dashboard" element={<DashboardRouter />} />
          
          <Route path="catalog" element={<Catalog />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="orders" element={<MyOrders />} /> 
          <Route path="warehouse" element={<Warehouse />} />
          <Route path="admin/orders" element={<AdminOrders />} />
          <Route path="driver" element={<DriverRoutes />} />
          
          {/* ADMIN & STAFF ROUTES */}
          <Route path="purchase-orders" element={<PurchaseOrders />} />
          <Route path="admin/products" element={<Products />} />
          <Route path="admin/users" element={<AdminUsers />} />
          <Route path="admin/reports" element={<Reports />} />
          <Route path="/fleet" element={<FleetManagement />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
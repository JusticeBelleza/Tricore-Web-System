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

// Import the new Admin & Operations pages
import Products from './pages/Products';
import PurchaseOrders from './pages/PurchaseOrders';
import { supabase } from './lib/supabase'; // NEEDED TO CHECK USER ROLE

// Component to protect routes - redirects to login if there is no active session
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Authenticating...
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
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState(null);

    useEffect(() => {
        // If profile is already loaded in Context, use it.
        if (profile?.role) {
            setRole(profile.role);
            setLoading(false);
            return;
        }

        // Fallback: Fetch role if Context hasn't caught up yet
        const fetchRole = async () => {
             if (!user) return;
             const { data } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
             setRole(data?.role);
             setLoading(false);
        };
        fetchRole();
    }, [user, profile]);

    if (loading) return <div>Loading...</div>;

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
          
          {/* NEW ADMIN & STAFF ROUTES */}
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
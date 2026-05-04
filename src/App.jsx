import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Toaster } from "@/components/ui/sonner";
import Layout from './Layout';
import { ErrorBoundary } from './components/ErrorBoundary';

// 🚀 IMPLEMENTED CODE SPLITTING
// We use React.lazy() to dynamically import route components.
// This ensures that the browser only downloads the JavaScript required for the page the user is actually visiting, drastically reducing the initial load time.
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Catalog = lazy(() => import('./pages/Catalog'));
const Checkout = lazy(() => import('./pages/Checkout'));
const MyOrders = lazy(() => import('./pages/MyOrders'));
const AdminOrders = lazy(() => import('./pages/AdminOrders'));
const Warehouse = lazy(() => import('./pages/Warehouse'));
const Products = lazy(() => import('./pages/Products'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const Reports = lazy(() => import('./pages/Reports'));
const Profile = lazy(() => import('./pages/Profile'));
const AgencyDashboard = lazy(() => import('./pages/AgencyDashboard'));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'));
const DispatchMonitor = lazy(() => import('./pages/DispatchMonitor'));
const FleetManagement = lazy(() => import('./pages/FleetManagement'));
const DriverRoutes = lazy(() => import('./pages/DriverRoutes'));

// 🚀 AUTHENTICATION GUARDS
// ProtectedRoute: Ensures the user is logged in before accessing private routes.
function ProtectedRoute({ children }) {
  const { session, isLoading } = useAuth();

  // Show a loading indicator while Supabase checks the session state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // If no session exists, redirect to the login page
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// RoleRoute: Ensures the user has the correct role permissions to access specific admin/staff pages.
function RoleRoute({ children, allowedRoles }) {
  const { profile, session, isLoading } = useAuth();

  // Show a loading indicator while Supabase fetches the user profile data
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Double check session
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Check if the user's role is included in the allowedRoles array for this route
  if (!profile || !allowedRoles.includes(profile.role)) {
    // If not authorized, redirect them back to their appropriate dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// 🚀 SUSPENSE FALLBACK LOADER
// This generic loader is displayed by <Suspense> while a lazy-loaded chunk is being fetched over the network.
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          {/* We wrap the entire Routes block in Suspense. The fallback UI will show whenever a lazy route is loading */}
          <Suspense fallback={<PageLoader />}>
            <Routes>
              
              {/* Public Routes - No login required */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />

              {/* Protected Application Layout */}
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                
                {/* 
                  The generic /dashboard route acts as a traffic director. 
                  In Dashboard.jsx, users are automatically routed to their specific role dashboard 
                  (e.g., an 'agency' user is redirected to /agency, a 'warehouse' user to /warehouse).
                */}
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="profile" element={<Profile />} />

                {/* Retail User Routes */}
                <Route path="catalog" element={<Catalog />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="my-orders" element={<MyOrders />} />

                {/* B2B Agency Routes */}
                <Route path="agency" element={
                  <RoleRoute allowedRoles={['b2b']}><AgencyDashboard /></RoleRoute>
                } />
                <Route path="purchase-orders" element={
                  <RoleRoute allowedRoles={['b2b']}><PurchaseOrders /></RoleRoute>
                } />

                {/* Driver Routes */}
                <Route path="routes" element={
                  <RoleRoute allowedRoles={['driver']}><DriverRoutes /></RoleRoute>
                } />

                {/* Logistics & Dispatch Routes */}
                <Route path="dispatch" element={
                  <RoleRoute allowedRoles={['dispatcher', 'admin', 'superadmin']}><DispatchMonitor /></RoleRoute>
                } />
                <Route path="fleet" element={
                  <RoleRoute allowedRoles={['dispatcher', 'admin', 'superadmin']}><FleetManagement /></RoleRoute>
                } />

                {/* Warehouse & Fulfillment Routes */}
                <Route path="warehouse" element={
                  <RoleRoute allowedRoles={['warehouse', 'admin', 'superadmin']}><Warehouse /></RoleRoute>
                } />

                {/* Shared Admin/Staff Management Routes */}
                <Route path="admin/orders" element={
                  <RoleRoute allowedRoles={['admin', 'superadmin', 'warehouse']}><AdminOrders /></RoleRoute>
                } />
                
                {/* Strict Admin Routes */}
                <Route path="admin/products" element={
                  <RoleRoute allowedRoles={['admin', 'superadmin']}><Products /></RoleRoute>
                } />
                <Route path="admin/users" element={
                  <RoleRoute allowedRoles={['admin', 'superadmin']}><AdminUsers /></RoleRoute>
                } />
                <Route path="admin/reports" element={
                  <RoleRoute allowedRoles={['admin', 'superadmin']}><Reports /></RoleRoute>
                } />
                
              </Route>
              
              {/* Catch-all Route: Redirects unknown URLs back to the homepage */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Router>
        
        {/* Global Toast Notification System */}
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
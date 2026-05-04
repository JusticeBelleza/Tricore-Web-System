import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import { useAuth } from './lib/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary'; 

// 🚀 1. LAZY LOAD THE PAGES
const Home = React.lazy(() => import('./pages/Home'));
const Login = React.lazy(() => import('./pages/Login'));
const Catalog = React.lazy(() => import('./pages/Catalog'));
const Checkout = React.lazy(() => import('./pages/Checkout'));
const Warehouse = React.lazy(() => import('./pages/Warehouse'));
const DriverRoutes = React.lazy(() => import('./pages/DriverRoutes'));
const MyOrders = React.lazy(() => import('./pages/MyOrders'));
const AdminOrders = React.lazy(() => import('./pages/AdminOrders'));
const AdminUsers = React.lazy(() => import('./pages/AdminUsers'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Reports = React.lazy(() => import('./pages/Reports'));
const FleetManagement = React.lazy(() => import('./pages/FleetManagement'));
const AgencyDashboard = React.lazy(() => import('./pages/AgencyDashboard'));
const DispatchMonitor = React.lazy(() => import('./pages/DispatchMonitor'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Products = React.lazy(() => import('./pages/Products'));
const PurchaseOrders = React.lazy(() => import('./pages/PurchaseOrders'));

// 🚀 2. CREATE A SUSPENSE FALLBACK UI
const PageLoader = () => (
  <div className="min-h-[60vh] flex items-center justify-center flex-1">
    <div className="flex flex-col items-center gap-4">
      <img src="/images/tricore-logo.png" alt="Loading" className="w-10 h-10 animate-spin drop-shadow-sm opacity-50" />
      <span className="text-xs font-bold text-slate-400 tracking-wider uppercase animate-pulse">
        Loading module...
      </span>
    </div>
  </div>
);

// Component to protect routes
export const ProtectedRoute = ({ children }) => {
  const { user, profile, loading } = useAuth();
  
  // MUST wait for loading to finish to prevent false kick-outs
  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <img src="/images/tricore-logo.png" alt="Tricore Loading" className="w-12 h-12 animate-spin drop-shadow-sm" />
          <span className="text-sm font-bold text-slate-500 tracking-wider uppercase animate-pulse">
            Authenticating...
          </span>
        </div>
      </div>
    );
  }
  
  if (!user) return <Navigate to="/login" replace />;
  
  return children;
};

// Component to strictly enforce Role-Based Access Control
export const RoleProtectedRoute = ({ allowedRoles, children }) => {
  const { user, profile, loading } = useAuth();
  
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;

  const userRole = profile?.role || 'user'; 
  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Component to handle Dashboard routing based on Role
const DashboardRouter = () => {
    const { profile, loading } = useAuth();
    
    if (loading) return <PageLoader />;

    const role = profile?.role;
    if (role === 'driver') return <Navigate to="/driver" replace />;
    if (role === 'b2b' || role === 'agency_admin') return <AgencyDashboard />;

    return <Dashboard />;
};

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        {/* 🚀 3. WRAP YOUR ROUTES IN THE SUSPENSE BOUNDARY */}
        <Suspense fallback={<PageLoader />}>
          <Routes>
            
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/login" element={<Login />} />
            
            {/* PROTECTED ROUTES */}
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              
              <Route path="/dashboard" element={<DashboardRouter />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/orders" element={<MyOrders />} /> 
              <Route path="/profile" element={<Profile />} />
              
              <Route path="/admin/orders" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><AdminOrders /></RoleProtectedRoute>} />
              <Route path="/warehouse" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><Warehouse /></RoleProtectedRoute>} />
              <Route path="/dispatch" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><DispatchMonitor /></RoleProtectedRoute>} />
              <Route path="/admin/products" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><Products /></RoleProtectedRoute>} />
              <Route path="/fleet" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><FleetManagement /></RoleProtectedRoute>} />
              <Route path="/purchase-orders" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><PurchaseOrders /></RoleProtectedRoute>} />
              <Route path="/admin/reports" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><Reports /></RoleProtectedRoute>} />
              
              <Route path="/admin/users" element={<RoleProtectedRoute allowedRoles={['admin']}><AdminUsers /></RoleProtectedRoute>} />
              <Route path="/driver" element={<RoleProtectedRoute allowedRoles={['admin', 'driver']}><DriverRoutes /></RoleProtectedRoute>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import Layout from './Layout';
import { useAuth } from './lib/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary'; 
import { Toaster } from "@/components/ui/sonner"; 

// LAZY LOAD THE PAGES
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

// 🚀 LAZY LOAD THE NEW PROXY ORDER PAGE
const AdminCreateOrder = React.lazy(() => import('./pages/AdminCreateOrder'));

// 🚀 LAZY LOAD POLICIES
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = React.lazy(() => import('./pages/TermsOfService'));

// CREATE A SUSPENSE FALLBACK UI
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

const AuthRecoveryScreen = ({ authError, onRetry, onSignOut }) => {
  const [isResetting, setIsResetting] = React.useState(false);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSignOut = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      await onSignOut?.();
    } finally {
      if (mountedRef.current) {
        setIsResetting(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center space-y-5">
        <div className="w-14 h-14 bg-amber-50 text-amber-600 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto">
          <AlertTriangle size={28} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Authentication Problem
          </h2>
          <p className="text-sm text-slate-600 font-medium leading-relaxed">
            {authError?.message || 'Unable to verify your session or load your account profile.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {authError?.retryable !== false && typeof onRetry === 'function' && (
            <button
              type="button"
              onClick={() => onRetry()}
              disabled={isResetting}
              className="flex-1 py-3 px-4 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RefreshCw size={16} />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isResetting}
            className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <LogOut size={16} />
            {authError?.retryable === false ? 'Sign In Again' : 'Sign Out'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Component to protect routes
export const ProtectedRoute = ({ children }) => {
  const {
    user,
    profile,
    loading,
    authError,
    retryAuth,
    clearSessionToLogin,
    signOut,
  } = useAuth() || {};

  // Wait only while initial verification or active retry is in progress
  if (loading) {
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

  const handleRecoverySignOut = clearSessionToLogin || signOut;

  // Recoverable error UI if verification failed or session succeeded without a profile
  if (authError && !(user && profile)) {
    return (
      <AuthRecoveryScreen
        authError={authError}
        onRetry={retryAuth}
        onSignOut={handleRecoverySignOut}
      />
    );
  }

  if (user && !profile) {
    return (
      <AuthRecoveryScreen
        authError={{
          message: 'Your session is active, but your account profile could not be loaded. Retry or sign out to continue.',
          retryable: true,
        }}
        onRetry={retryAuth}
        onSignOut={handleRecoverySignOut}
      />
    );
  }

  if (!user && !profile) return <Navigate to="/login" replace />;

  return children;
};

// Component to strictly enforce Role-Based Access Control
export const RoleProtectedRoute = ({ allowedRoles, children }) => {
  const { user, profile, loading } = useAuth();
  
  if (loading) return <PageLoader />;
  if (!user && !profile) return <Navigate to="/login" replace />;

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
      <Toaster position="bottom-right" richColors /> 
      
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            
            {/* PUBLIC ROUTES */}
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/login" element={<Login />} />
            
            {/* 🚀 POLICY ROUTES */}
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            
            {/* PROTECTED ROUTES */}
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              
              <Route path="/dashboard" element={<DashboardRouter />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/orders" element={<MyOrders />} /> 
              <Route path="/profile" element={<Profile />} />
              
              <Route path="/admin/orders" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><AdminOrders /></RoleProtectedRoute>} />
              
              {/* 🚀 NEW ADMIN CREATE ORDER ROUTE */}
              <Route path="/admin/create-order" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><AdminCreateOrder /></RoleProtectedRoute>} />
              
              <Route path="/warehouse" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><Warehouse /></RoleProtectedRoute>} />
              <Route path="/dispatch" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><DispatchMonitor /></RoleProtectedRoute>} />
              <Route path="/admin/products" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><Products /></RoleProtectedRoute>} />
              <Route path="/fleet" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><FleetManagement /></RoleProtectedRoute>} />
              <Route path="/purchase-orders" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><PurchaseOrders /></RoleProtectedRoute>} />
              <Route path="/admin/reports" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><Reports /></RoleProtectedRoute>} />
              
              {/* 🚀 UPDATED: WAREHOUSE NOW ALLOWED ON ADMIN USERS ROUTE */}
              <Route path="/admin/users" element={<RoleProtectedRoute allowedRoles={['admin', 'warehouse']}><AdminUsers /></RoleProtectedRoute>} />
              <Route path="/driver" element={<RoleProtectedRoute allowedRoles={['admin', 'driver']}><DriverRoutes /></RoleProtectedRoute>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

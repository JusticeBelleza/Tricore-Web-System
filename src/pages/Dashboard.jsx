import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';
import { TrendingUp, ShoppingCart, Package, Truck } from 'lucide-react';

const COLORS = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Dashboard() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);

  useEffect(() => {
    fetchDashboardData();
  }, [timeRange]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeRange);

      // Fetch recent orders with company and item details
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, total_amount, status, created_at,
          companies(name, account_type),
          order_items(line_total, product_variants(products(name)))
        `)
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-slate-500 p-8">Loading analytics...</div>;

  // --- 1. Top Level Metrics ---
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  
  const deliveredCount = orders.filter(o => o.status === 'delivered').length;
  const deliveryRate = totalOrders > 0 ? (deliveredCount / totalOrders) * 100 : 0;

  // --- 2. Revenue Over Time (Line Chart) ---
  const revenueByDayMap = {};
  orders.forEach(o => {
    const date = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    revenueByDayMap[date] = (revenueByDayMap[date] || 0) + Number(o.total_amount);
  });
  const revenueTrendData = Object.keys(revenueByDayMap).map(date => ({
    date,
    revenue: revenueByDayMap[date]
  }));

  // --- 3. Orders by Status (Pie Chart) ---
  const statusCounts = {};
  orders.forEach(o => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  });
  const statusData = Object.keys(statusCounts).map(status => ({
    name: status.replace('_', ' ').toUpperCase(),
    value: statusCounts[status]
  }));

  // --- 4. B2B vs Retail Revenue (Bar Chart) ---
  const typeRevenue = { 'B2B': 0, 'Retail': 0 };
  orders.forEach(o => {
    const type = o.companies?.account_type || 'Retail';
    typeRevenue[type] += Number(o.total_amount);
  });
  const customerTypeData = [
    { name: 'B2B Agencies', revenue: typeRevenue['B2B'] },
    { name: 'Retail Customers', revenue: typeRevenue['Retail'] }
  ];

  const StatCard = ({ title, value, subtitle, icon: Icon, colorClass }) => (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
      </div>
      <div className={`p-3 rounded-lg ${colorClass}`}>
        <Icon size={20} className="text-white" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {profile?.role === 'admin' ? 'Business Overview' : 'Welcome to Tricore'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">Analytics for the last {timeRange} days.</p>
        </div>
        
        {profile?.role === 'admin' && (
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(Number(e.target.value))}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none font-medium bg-white"
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
        )}
      </div>

      {/* KPI Cards */}
      {profile?.role === 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Total Revenue" 
            value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
            subtitle="Gross sales" 
            icon={TrendingUp} 
            colorClass="bg-slate-900" 
          />
          <StatCard 
            title="Total Orders" 
            value={totalOrders} 
            subtitle="Orders placed" 
            icon={ShoppingCart} 
            colorClass="bg-blue-600" 
          />
          <StatCard 
            title="Avg Order Value" 
            value={`$${avgOrderValue.toFixed(2)}`} 
            subtitle="Revenue per order" 
            icon={Package} 
            colorClass="bg-emerald-500" 
          />
          <StatCard 
            title="Delivery Success" 
            value={`${deliveryRate.toFixed(1)}%`} 
            subtitle="Orders marked delivered" 
            icon={Truck} 
            colorClass="bg-indigo-500" 
          />
        </div>
      )}

      {/* Charts Area (Only visible to admins/staff for privacy) */}
      {(profile?.role === 'admin' || profile?.role === 'warehouse') ? (
        <>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-6">Revenue Trend</h3>
            <div className="h-[300px] w-full">
              {revenueTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueTrendData}>
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val}`} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="revenue" stroke="#0f172a" strokeWidth={3} dot={{ r: 4, fill: '#0f172a' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">Not enough data to graph.</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-6">Orders by Status</h3>
              <div className="h-[250px] w-full">
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400">No orders yet.</div>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-6">Revenue by Customer Type</h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={customerTypeData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      {customerTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Regular User / Retail View */
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-center py-16">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package size={32} className="text-slate-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Ready to order?</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-6">
            Head over to the Catalog to view our latest medical supplies and place your order.
          </p>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import { TrendingUp, ShoppingCart, Package, Truck, Download } from "lucide-react";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const StatCard = ({ label, value, sub, icon: Icon, color }) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-slate-500 text-xs font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
    </div>
  </div>
);

export default function Reports() {
  const [orders, setOrders] = useState([]);
  const [range, setRange] = useState("30");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      // Fetch all orders with their nested company and item data in one relational query
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, total_amount, status, created_at, payment_method, subtotal, shipping_amount, tax_amount,
          companies ( name, account_type ),
          order_items ( line_total, product_variants ( products ( name ) ) )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching reports:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Date Filtering Logic
  const days = parseInt(range);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const filteredOrders = orders.filter(o => o.created_at && new Date(o.created_at) >= cutoff);

  // 1. Revenue by day
  const revenueByDay = Array.from({ length: days <= 30 ? days : Math.ceil(days / 7) }, (_, i) => {
    const d = new Date();
    const step = days <= 30 ? 1 : 7;
    d.setDate(d.getDate() - (days - 1 - i * step));
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    
    const weekOrders = filteredOrders.filter(o => {
      const od = new Date(o.created_at);
      const diff = (d - od) / 86400000;
      return diff >= 0 && diff < step;
    });
    
    return {
      label,
      revenue: weekOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
      orders: weekOrders.length,
    };
  });

  // 2. Orders by status
  const statusCounts = {};
  filteredOrders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));

  // 3. Revenue by customer type
  const b2bRevenue = filteredOrders.filter(o => o.companies?.account_type === "B2B").reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const retailRevenue = filteredOrders.filter(o => o.companies?.account_type !== "B2B").reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const typeData = [
    { name: "B2B", revenue: b2bRevenue },
    { name: "Retail", revenue: retailRevenue },
  ];

  // 4. Top products by revenue
  const productRevMap = {};
  filteredOrders.forEach(order => {
    order.order_items?.forEach(item => {
      const name = item.product_variants?.products?.name;
      if (!name) return;
      productRevMap[name] = (productRevMap[name] || 0) + Number(item.line_total || 0);
    });
  });
  const topProducts = Object.entries(productRevMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, revenue]) => ({ name: name.length > 20 ? name.slice(0, 18) + "…" : name, revenue }));

  // Summary stats
  const totalRevenue = filteredOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const avgOrderValue = filteredOrders.length ? totalRevenue / filteredOrders.length : 0;
  const deliveredOrders = filteredOrders.filter(o => o.status === "delivered").length;
  const deliveryRate = filteredOrders.length ? (deliveredOrders / filteredOrders.length * 100).toFixed(1) : 0;

  const exportCSV = () => {
    const rows = filteredOrders.map(o => [
      o.id.split('-')[0],
      `"${o.companies?.name || 'Unknown'}"`,
      o.companies?.account_type || 'Retail',
      o.status || "",
      o.total_amount || 0,
      o.payment_method || "",
      o.created_at ? new Date(o.created_at).toLocaleDateString() : "",
    ]);
    const csv = [["Order#","Customer","Type","Status","Total","Payment","Date"], ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "tricore_report.csv"; a.click();
  };

  if (loading) return <div className="p-8 text-slate-500">Loading reports...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Business performance overview</p>
        </div>
        <div className="flex gap-3">
          <select value={range} onChange={e => setRange(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 365 days</option>
          </select>
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={`$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp} color="bg-blue-500" sub={`Last ${range} days`} />
        <StatCard label="Total Orders" value={filteredOrders.length} icon={ShoppingCart} color="bg-green-500" sub={`Last ${range} days`} />
        <StatCard label="Avg Order Value" value={`$${avgOrderValue.toFixed(2)}`} icon={Package} color="bg-amber-500" sub="Per order" />
        <StatCard label="Delivery Rate" value={`${deliveryRate}%`} icon={Truck} color="bg-purple-500" sub={`${deliveredOrders} delivered`} />
      </div>

      {/* Revenue Chart */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-slate-800 font-semibold mb-4">Revenue Over Time</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={revenueByDay}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
              formatter={(v) => [`$${v.toFixed(2)}`, "Revenue"]}
            />
            <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Orders by Status */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-slate-800 font-semibold mb-4">Orders by Status</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* B2B vs Retail */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-slate-800 font-semibold mb-4">Revenue by Customer Type</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={typeData} barSize={48}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                formatter={(v) => [`$${v.toFixed(2)}`, "Revenue"]}
              />
              <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                {typeData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-slate-800 font-semibold mb-4">Top Products by Revenue</h2>
        {topProducts.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">No product data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topProducts} layout="vertical" barSize={18}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={140} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                formatter={(v) => [`$${v.toFixed(2)}`, "Revenue"]}
              />
              <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                {topProducts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Orders Table Summary */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-800 font-semibold">Recent Orders</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                {["Order #","Customer","Type","Total","Status","Date"].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredOrders.slice(0, 10).map(order => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 text-sm font-mono font-medium text-blue-600">{order.id.split('-')[0]}</td>
                  <td className="px-6 py-3 text-sm text-slate-700">{order.companies?.name || "—"}</td>
                  <td className="px-6 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${order.companies?.account_type === "B2B" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {order.companies?.account_type || 'Retail'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm font-semibold text-slate-800">${(Number(order.total_amount) || 0).toFixed(2)}</td>
                  <td className="px-6 py-3">
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600 capitalize">
                      {order.status?.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-500">{order.created_at ? new Date(order.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">No orders in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
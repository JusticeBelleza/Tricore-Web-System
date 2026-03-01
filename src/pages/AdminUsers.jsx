import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AdminUsers() {
  const [activeTab, setActiveTab] = useState('agencies');
  const [profiles, setProfiles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [editingCompany, setEditingCompany] = useState(null);
  const [pricingCompany, setPricingCompany] = useState(null);
  const [pricingRules, setPricingRules] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profilesRes, companiesRes, productsRes] = await Promise.all([
        supabase.from('user_profiles').select('*, companies(name)'),
        supabase.from('companies').select('*').order('name'),
        supabase.from('products').select('id, name').order('name')
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (companiesRes.error) throw companiesRes.error;

      setProfiles(profilesRes.data || []);
      setCompanies(companiesRes.data || []);
      setProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers ---
  const handleRoleChange = async (userId, newRole) => {
    try {
      const { error } = await supabase.from('user_profiles').update({ role: newRole }).eq('id', userId);
      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
    } catch (err) {
      alert('Failed to update user role.');
    }
  };

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    const isNew = !editingCompany.id;
    try {
      if (isNew) {
        await supabase.from('companies').insert([editingCompany]);
      } else {
        await supabase.from('companies').update(editingCompany).eq('id', editingCompany.id);
      }
      setEditingCompany(null);
      fetchData();
    } catch (err) {
      alert('Failed to save company details.');
    }
  };

  // --- Pricing Rules Logic ---
  const openPricingModal = async (company) => {
    setPricingCompany(company);
    const { data } = await supabase.from('pricing_rules').select('*, products(name)').eq('company_id', company.id);
    setPricingRules(data || []);
  };

  const handleAddRule = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newRule = {
      company_id: pricingCompany.id,
      product_id: formData.get('product_id'),
      rule_type: formData.get('rule_type'),
      value: Number(formData.get('value'))
    };

    try {
      await supabase.from('pricing_rules').insert([newRule]);
      openPricingModal(pricingCompany); // Refresh rules
      e.target.reset();
    } catch (err) {
      alert('Failed to add pricing rule.');
    }
  };

  const handleDeleteRule = async (ruleId) => {
    await supabase.from('pricing_rules').delete().eq('id', ruleId);
    openPricingModal(pricingCompany);
  };

  // --- Filtered Data ---
  const staff = profiles.filter(p => ['admin', 'warehouse', 'driver'].includes(p.role));
  const b2bAgencies = companies.filter(c => c.account_type === 'B2B');
  const retailCustomers = profiles.filter(p => p.role === 'user');

  if (loading) return <div className="text-slate-500">Loading user data...</div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">User & Agency Management</h2>
        <p className="text-sm text-slate-500 mt-1">Manage staff roles, B2B agencies, and custom pricing rules.</p>
      </div>

      {/* Custom Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-px">
        {['agencies', 'staff', 'retail'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              activeTab === tab 
                ? 'border-slate-900 text-slate-900' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab === 'agencies' ? 'B2B Agencies' : tab === 'retail' ? 'Retail Customers' : 'Staff Directory'}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: AGENCIES */}
      {activeTab === 'agencies' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setEditingCompany({ name: '', account_type: 'B2B', credit_limit: 0, shipping_fee: 0, tax_exempt: false })} className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 transition-colors">
              + Add B2B Agency
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Agency Name</th>
                  <th className="px-6 py-4 font-medium">Credit Limit</th>
                  <th className="px-6 py-4 font-medium">Shipping Fee</th>
                  <th className="px-6 py-4 font-medium">Tax Exempt</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {b2bAgencies.map(company => (
                  <tr key={company.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-semibold text-slate-900">{company.name}</td>
                    <td className="px-6 py-4">${Number(company.credit_limit).toFixed(2)}</td>
                    <td className="px-6 py-4">${Number(company.shipping_fee).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      {company.tax_exempt ? <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-bold">YES</span> : 'No'}
                    </td>
                    <td className="px-6 py-4 text-right space-x-4">
                      <button onClick={() => openPricingModal(company)} className="text-blue-600 hover:text-blue-800 font-medium">Pricing Rules</button>
                      <button onClick={() => setEditingCompany(company)} className="text-slate-600 hover:text-slate-900 font-medium">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: STAFF */}
      {activeTab === 'staff' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Company Link</th>
                <th className="px-6 py-4 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map(user => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{user.full_name || 'Unnamed User'}</td>
                  <td className="px-6 py-4 text-slate-500">{user.companies?.name || 'Internal'}</td>
                  <td className="px-6 py-4">
                    <select 
                      value={user.role} 
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="px-2 py-1 border border-slate-300 rounded text-sm outline-none focus:border-slate-900 font-medium capitalize"
                    >
                      <option value="admin">Admin</option>
                      <option value="warehouse">Warehouse</option>
                      <option value="driver">Driver</option>
                      <option value="user">User (Demote)</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB CONTENT: RETAIL */}
      {activeTab === 'retail' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-8 text-center text-slate-500">
          <p className="font-medium text-slate-900 mb-2">{retailCustomers.length} Retail Customers Registered</p>
          <p className="text-sm">To elevate a retail customer to staff, find them in the database or ask them to contact an administrator.</p>
        </div>
      )}

      {/* MODAL: Edit Company */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">{editingCompany.id ? 'Edit Agency' : 'New B2B Agency'}</h3>
              <button onClick={() => setEditingCompany(null)} className="text-slate-400 hover:text-slate-700">&times;</button>
            </div>
            <form onSubmit={handleSaveCompany} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                <input required type="text" value={editingCompany.name} onChange={e => setEditingCompany({...editingCompany, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Credit Limit ($)</label>
                  <input type="number" step="0.01" value={editingCompany.credit_limit} onChange={e => setEditingCompany({...editingCompany, credit_limit: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Shipping Fee ($)</label>
                  <input type="number" step="0.01" value={editingCompany.shipping_fee} onChange={e => setEditingCompany({...editingCompany, shipping_fee: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 outline-none" />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="tax_exempt" checked={editingCompany.tax_exempt} onChange={e => setEditingCompany({...editingCompany, tax_exempt: e.target.checked})} className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900" />
                <label htmlFor="tax_exempt" className="text-sm font-medium text-slate-700">Tax Exempt Customer</label>
              </div>
              <button type="submit" className="w-full py-2.5 mt-4 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors">
                Save Details
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Pricing Rules */}
      {pricingCompany && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-200">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Custom Pricing</h3>
                <p className="text-xs text-slate-500">{pricingCompany.name}</p>
              </div>
              <button onClick={() => setPricingCompany(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">&times;</button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Existing Rules */}
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900 text-sm">Active Rules</h4>
                {pricingRules.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No custom pricing rules applied.</p>
                ) : pricingRules.map(rule => (
                  <div key={rule.id} className="flex justify-between items-center bg-slate-50 border border-slate-200 p-3 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{rule.products?.name}</p>
                      <p className="text-xs text-slate-500">
                        {rule.rule_type === 'fixed' ? `$${rule.value.toFixed(2)} Fixed Price` : `${rule.value}% Off Retail`}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteRule(rule.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">Remove</button>
                  </div>
                ))}
              </div>

              {/* Add New Rule Form */}
              <form onSubmit={handleAddRule} className="border-t border-slate-200 pt-6 space-y-4">
                <h4 className="font-semibold text-slate-900 text-sm">Create New Rule</h4>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Select Product</label>
                  <select name="product_id" required className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 outline-none text-sm">
                    <option value="">-- Choose Product --</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Rule Type</label>
                    <select name="rule_type" className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 outline-none text-sm">
                      <option value="fixed">Fixed Price ($)</option>
                      <option value="percentage">Discount (%)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Value</label>
                    <input type="number" name="value" step="0.01" required className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 outline-none text-sm" placeholder="e.g. 15.00" />
                  </div>
                </div>
                <button type="submit" className="w-full py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">
                  Add Rule
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
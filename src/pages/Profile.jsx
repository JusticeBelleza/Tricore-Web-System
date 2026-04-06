import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  User, Phone, Mail, CheckCircle2, Save, 
  AlertCircle, Lock, Key, Eye, EyeOff,
  Truck, CreditCard, Calendar, MapPin, Receipt
} from 'lucide-react';

export default function Profile() {
  const { profile, user } = useAuth();
  
  // Profile Data State
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', isError: false });
  const [formData, setFormData] = useState({
    full_name: '', contact_number: '', license_number: '', license_expiry: '',
    address: '', city: '', state: '', zip: '',
    billing_address: '', billing_city: '', billing_state: '', billing_zip: ''
  });
  
  const [useShippingForBilling, setUseShippingForBilling] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Password State
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (profile && !dataLoaded) {
      setFormData({
        full_name: profile.full_name || '',
        contact_number: profile.contact_number || profile.phone || '',
        license_number: profile.license_number || '',
        license_expiry: profile.license_expiry || '',
        address: profile.address || '',
        city: profile.city || '',
        state: profile.state || '',
        zip: profile.zip || '',
        billing_address: profile.billing_address || '',
        billing_city: profile.billing_city || '',
        billing_state: profile.billing_state || '',
        billing_zip: profile.billing_zip || ''
      });

      // Smart check: if billing data exists and is different from shipping, uncheck the box
      if (profile.billing_address && profile.billing_address !== profile.address) {
        setUseShippingForBilling(false);
      }

      setDataLoaded(true);
    }
  }, [profile, dataLoaded]);

  const showToast = (message, isError = false) => {
    setNotification({ show: true, message, isError });
    setTimeout(() => setNotification({ show: false, message: '', isError: false }), 4000);
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoadingProfile(true);

    try {
      const updatePayload = {
        full_name: formData.full_name,
        contact_number: formData.contact_number
      };

      if (profile?.role?.toLowerCase() === 'driver') {
        updatePayload.license_number = formData.license_number;
        updatePayload.license_expiry = formData.license_expiry;
      }

      if (profile?.role?.toLowerCase() === 'retail' || profile?.role?.toLowerCase() === 'user') {
        updatePayload.address = formData.address;
        updatePayload.city = formData.city;
        updatePayload.state = formData.state;
        updatePayload.zip = formData.zip;

        // Auto-sync billing if checked
        if (useShippingForBilling) {
          updatePayload.billing_address = formData.address;
          updatePayload.billing_city = formData.city;
          updatePayload.billing_state = formData.state;
          updatePayload.billing_zip = formData.zip;
        } else {
          updatePayload.billing_address = formData.billing_address;
          updatePayload.billing_city = formData.billing_city;
          updatePayload.billing_state = formData.billing_state;
          updatePayload.billing_zip = formData.billing_zip;
        }
      }

      const { error } = await supabase
        .from('user_profiles')
        .update(updatePayload)
        .eq('id', profile.id);

      if (error) throw error;
      showToast('Profile information updated successfully!');

    } catch (error) {
      console.error('Error updating profile:', error.message);
      showToast('Failed to update profile.', true);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return showToast('Passwords do not match.', true);
    if (newPassword.length < 6) return showToast('Password must be at least 6 characters long.', true);

    setLoadingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showToast('Password updated successfully!');
      setNewPassword(''); setConfirmPassword(''); setShowPassword(false);
    } catch (error) {
      showToast(error.message || 'Failed to update password.', true);
    } finally { setLoadingPassword(false); }
  };

  const calculateStrength = (pass) => {
    let score = 0; if (!pass) return score;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };
  const strengthScore = calculateStrength(newPassword);
  const strengthLabels = ['Too Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['bg-slate-200', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];

  const inputClass = "block w-full pl-11 pr-10 pt-6 pb-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-bold text-slate-900 transition-all shadow-sm peer";
  const floatingLabelClass = "absolute text-sm text-slate-400 duration-300 transform -translate-y-2.5 scale-[0.8] top-3.5 z-10 origin-[0] left-11 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-1 peer-focus:scale-[0.8] peer-focus:-translate-y-2.5 peer-focus:text-blue-600 peer-focus:font-bold pointer-events-none";
  const inputClassNoIcon = "block w-full px-4 pt-6 pb-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-bold text-slate-900 transition-all shadow-sm peer";
  const floatingLabelClassNoIcon = "absolute text-sm text-slate-400 duration-300 transform -translate-y-2.5 scale-[0.8] top-3.5 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-1 peer-focus:scale-[0.8] peer-focus:-translate-y-2.5 peer-focus:text-blue-600 peer-focus:font-bold pointer-events-none";

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4 pb-2">
        <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md"><User size={28} strokeWidth={1.5} /></div>
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">My Profile</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">Manage your personal information and security settings.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 sm:p-8 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-24 h-24 bg-slate-100 border-2 border-slate-200 rounded-full flex items-center justify-center text-slate-700 text-3xl font-black shadow-sm shrink-0 uppercase tracking-widest">{getInitials(profile?.full_name)}</div>
            <div className="flex-1 text-center sm:text-left mt-2 sm:mt-0">
              <h3 className="text-2xl font-bold text-slate-900">{profile?.full_name || 'Loading...'}</h3>
              <p className="text-slate-500 font-medium capitalize mt-1 mb-4">{profile?.role || 'User'} Account</p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 shadow-sm"><Mail size={14} className="text-slate-400" />{user?.email || profile?.email || 'No email attached'}</div>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="p-6 sm:p-8 space-y-6">
            <div className="space-y-4">
              <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2"><User size={18} className="text-blue-600" /> Personal Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
                <div className="relative"><User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" /><input type="text" id="full_name" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className={inputClass} placeholder=" " required /><label htmlFor="full_name" className={floatingLabelClass}>Full Name</label></div>
                <div className="relative"><Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" /><input type="tel" id="contact_number" value={formData.contact_number} onChange={e => setFormData({...formData, contact_number: e.target.value})} className={inputClass} placeholder=" " /><label htmlFor="contact_number" className={floatingLabelClass}>Phone Number</label></div>
              </div>
            </div>

            {profile?.role?.toLowerCase() === 'driver' && (
              <div className="space-y-4 pt-4 mt-2">
                <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2"><Truck size={18} className="text-emerald-600" /> Driver Credentials</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
                  <div className="relative"><CreditCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" /><input type="text" id="license_number" value={formData.license_number} onChange={e => setFormData({...formData, license_number: e.target.value})} className={inputClass} placeholder=" " /><label htmlFor="license_number" className={floatingLabelClass}>License Number</label></div>
                  <div className="relative"><Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" /><input type="date" id="license_expiry" value={formData.license_expiry} onChange={e => setFormData({...formData, license_expiry: e.target.value})} className={inputClass}/><label htmlFor="license_expiry" className={floatingLabelClass}>Expiration Date</label></div>
                </div>
              </div>
            )}

            {(profile?.role?.toLowerCase() === 'retail' || profile?.role?.toLowerCase() === 'user') && (
              <>
                {/* Shipping Address */}
                <div className="space-y-4 pt-4 mt-2">
                  <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2"><Truck size={18} className="text-blue-600" /> Shipping Address</h4>
                  <div className="space-y-5 pt-2">
                    <div className="relative"><MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" /><input type="text" id="address" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className={inputClass} placeholder=" " /><label htmlFor="address" className={floatingLabelClass}>Street Address</label></div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <div className="relative sm:col-span-1"><input type="text" id="city" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className={inputClassNoIcon} placeholder=" " /><label htmlFor="city" className={floatingLabelClassNoIcon}>City</label></div>
                      <div className="relative sm:col-span-1"><input type="text" id="state" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className={inputClassNoIcon} placeholder=" " /><label htmlFor="state" className={floatingLabelClassNoIcon}>State</label></div>
                      <div className="relative sm:col-span-1"><input type="text" id="zip" value={formData.zip} onChange={e => setFormData({...formData, zip: e.target.value})} className={inputClassNoIcon} placeholder=" " /><label htmlFor="zip" className={floatingLabelClassNoIcon}>ZIP Code</label></div>
                    </div>
                  </div>
                </div>

                {/* Billing Address Toggle */}
                <div className="pt-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Receipt size={18} className="text-amber-600" /> Billing Address</h4>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input type="checkbox" className="sr-only" checked={useShippingForBilling} onChange={() => setUseShippingForBilling(!useShippingForBilling)} />
                      <div className={`w-10 h-5.5 rounded-full transition-colors ${useShippingForBilling ? 'bg-amber-500' : 'bg-slate-200'}`}></div>
                      <div className={`absolute w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform top-0.5 left-1 ${useShippingForBilling ? 'translate-x-4' : 'translate-x-0'}`}></div>
                    </div>
                    <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors select-none">Same as Shipping</span>
                  </label>
                </div>

                {/* Conditional Billing Fields */}
                {!useShippingForBilling && (
                  <div className="space-y-5 pt-4 animate-in slide-in-from-top-4 fade-in duration-300">
                    <div className="relative"><MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" /><input type="text" id="billing_address" value={formData.billing_address} onChange={e => setFormData({...formData, billing_address: e.target.value})} className={inputClass} placeholder=" " /><label htmlFor="billing_address" className={floatingLabelClass}>Billing Street Address</label></div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <div className="relative sm:col-span-1"><input type="text" id="billing_city" value={formData.billing_city} onChange={e => setFormData({...formData, billing_city: e.target.value})} className={inputClassNoIcon} placeholder=" " /><label htmlFor="billing_city" className={floatingLabelClassNoIcon}>City</label></div>
                      <div className="relative sm:col-span-1"><input type="text" id="billing_state" value={formData.billing_state} onChange={e => setFormData({...formData, billing_state: e.target.value})} className={inputClassNoIcon} placeholder=" " /><label htmlFor="billing_state" className={floatingLabelClassNoIcon}>State</label></div>
                      <div className="relative sm:col-span-1"><input type="text" id="billing_zip" value={formData.billing_zip} onChange={e => setFormData({...formData, billing_zip: e.target.value})} className={inputClassNoIcon} placeholder=" " /><label htmlFor="billing_zip" className={floatingLabelClassNoIcon}>ZIP Code</label></div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="pt-2 flex justify-end"><button type="submit" disabled={loadingProfile} className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-70">{loadingProfile ? 'Saving...' : <><Save size={16} /> Update Profile</>}</button></div>
          </form>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <form onSubmit={handlePasswordChange} className="p-6 sm:p-8 space-y-6">
            <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2"><Lock size={18} className="text-purple-600" /> Change Password</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div>
                <div className="relative"><Key size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" /><input type={showPassword ? "text" : "password"} id="newPassword" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} placeholder=" " minLength={6}/><label htmlFor="newPassword" className={floatingLabelClass}>New Password</label><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors z-10">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
                {newPassword.length > 0 && (
                  <div className="mt-2.5 px-1 animate-in fade-in duration-300">
                    <div className="flex gap-1.5 h-1.5 mb-1.5">{[1, 2, 3, 4].map(level => (<div key={level} className={`flex-1 rounded-full transition-colors duration-500 ${strengthScore >= level ? strengthColors[strengthScore] : 'bg-slate-200'}`}></div>))}</div>
                    <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider"><span className="text-slate-400">Strength</span><span className={strengthScore > 2 ? 'text-emerald-600' : strengthScore === 2 ? 'text-amber-500' : 'text-red-500'}>{strengthLabels[strengthScore]}</span></div>
                  </div>
                )}
              </div>
              <div className="relative"><Key size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" /><input type={showPassword ? "text" : "password"} id="confirmPassword" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={`${inputClass} ${confirmPassword && newPassword !== confirmPassword ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : ''}`} placeholder=" "/><label htmlFor="confirmPassword" className={`${floatingLabelClass} ${confirmPassword && newPassword !== confirmPassword ? 'text-red-500 peer-focus:text-red-500' : ''}`}>Confirm Password</label>{confirmPassword && newPassword !== confirmPassword && (<p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1.5 ml-1 animate-in fade-in">Passwords do not match</p>)}</div>
            </div>
            <div className="pt-4 flex justify-end"><button type="submit" disabled={loadingPassword || !newPassword || newPassword !== confirmPassword} className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">{loadingPassword ? 'Updating...' : <><Lock size={16} /> Update Password</>}</button></div>
          </form>
        </div>
      </div>

      {notification.show && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[120] flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`p-1.5 rounded-full ${notification.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{notification.isError ? <AlertCircle size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}</div>
          <p className="text-sm font-medium pr-2">{notification.message}</p>
        </div>
      )}
    </div>
  );
}
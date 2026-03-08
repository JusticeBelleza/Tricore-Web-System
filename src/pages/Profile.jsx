import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { 
  User, Phone, Mail, CheckCircle2, Save, 
  AlertCircle, Lock, Key, Eye, EyeOff 
} from 'lucide-react';

export default function Profile() {
  const { profile, user } = useAuth();
  
  // Profile Data State
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', isError: false });
  const [formData, setFormData] = useState({
    full_name: '', contact_number: ''
  });
  
  // 🚀 THE FIX: A lock to prevent Alt+Tab from overwriting user typing
  const [dataLoaded, setDataLoaded] = useState(false);

  // Password State
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // 🚀 Only update the form if we haven't loaded it yet!
    if (profile && !dataLoaded) {
      setFormData({
        full_name: profile.full_name || '',
        contact_number: profile.contact_number || profile.phone || ''
      });
      setDataLoaded(true); // Lock it so background refreshes don't wipe typing
    }
  }, [profile, dataLoaded]);

  const showToast = (message, isError = false) => {
    setNotification({ show: true, message, isError });
    setTimeout(() => setNotification({ show: false, message: '', isError: false }), 4000);
  };

  // --- SAVE PROFILE DATA ---
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoadingProfile(true);

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: formData.full_name,
          contact_number: formData.contact_number,
          updated_at: new Date().toISOString()
        })
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

  // --- PASSWORD STRENGTH LOGIC ---
  const calculateStrength = (pass) => {
    let score = 0;
    if (!pass) return score;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const strengthScore = calculateStrength(newPassword);
  const strengthLabels = ['Too Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['bg-slate-200', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];

  // --- SAVE PASSWORD ---
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.', true);
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters long.', true);
      return;
    }

    setLoadingPassword(true);
    try {
      // Updates password via Supabase Auth API
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      showToast('Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);

    } catch (error) {
      console.error('Error changing password:', error.message);
      showToast(error.message || 'Failed to update password.', true);
    } finally {
      setLoadingPassword(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-medium text-slate-900 transition-all shadow-sm";
  const labelClass = "block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider";

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex items-center gap-4 pb-2">
        <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
          <User size={28} strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">My Profile</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">Manage your personal information and security settings.</p>
        </div>
      </div>

      <div className="space-y-6">
        
        {/* --- PROFILE INFORMATION SECTION --- */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          
          {/* Read-Only Account Block */}
          <div className="p-6 sm:p-8 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-24 h-24 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center text-slate-400 shadow-sm shrink-0">
              <User size={40} />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-slate-900">{profile?.full_name || 'Loading...'}</h3>
              <p className="text-slate-500 font-medium capitalize mt-1 mb-4">{profile?.role || 'User'} Account</p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 shadow-sm">
                <Mail size={14} className="text-slate-400" />
                {user?.email || profile?.email || 'No email attached'}
              </div>
            </div>
          </div>

          {/* Editable Form */}
          <form onSubmit={handleSaveProfile} className="p-6 sm:p-8 space-y-6">
            <div className="space-y-4">
              <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
                <User size={18} className="text-blue-600" /> Personal Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Full Name</label>
                  <input 
                    type="text" 
                    value={formData.full_name} 
                    onChange={e => setFormData({...formData, full_name: e.target.value})} 
                    className={inputClass} 
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone Number</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="tel" 
                      value={formData.contact_number} 
                      onChange={e => setFormData({...formData, contact_number: e.target.value})} 
                      className={`${inputClass} pl-10`}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button 
                type="submit" 
                disabled={loadingProfile}
                className="px-8 py-3.5 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-70"
              >
                {loadingProfile ? 'Saving...' : <><Save size={18} /> Update Profile</>}
              </button>
            </div>
          </form>
        </div>

        {/* --- SECURITY & PASSWORD SECTION --- */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <form onSubmit={handlePasswordChange} className="p-6 sm:p-8 space-y-6">
            <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Lock size={18} className="text-purple-600" /> Change Password
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              {/* New Password */}
              <div>
                <label className={labelClass}>New Password</label>
                <div className="relative">
                  <Key size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                    className={`${inputClass} pl-10 pr-10`}
                    placeholder="Enter new password"
                    minLength={6}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                
                {/* PASSWORD STRENGTH METER */}
                {newPassword.length > 0 && (
                  <div className="mt-3 animate-in fade-in duration-300">
                    <div className="flex gap-1.5 h-1.5 mb-1.5">
                      {[1, 2, 3, 4].map(level => (
                        <div 
                          key={level} 
                          className={`flex-1 rounded-full transition-colors duration-500 ${strengthScore >= level ? strengthColors[strengthScore] : 'bg-slate-100'}`}
                        ></div>
                      ))}
                    </div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider text-right ${strengthScore > 2 ? 'text-emerald-600' : strengthScore === 2 ? 'text-amber-500' : 'text-red-500'}`}>
                      {strengthLabels[strengthScore]}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className={labelClass}>Confirm Password</label>
                <div className="relative">
                  <Key size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                    className={`${inputClass} pl-10 pr-10 ${confirmPassword && newPassword !== confirmPassword ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : ''}`}
                    placeholder="Re-enter new password"
                  />
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-2 animate-in fade-in">Passwords do not match</p>
                )}
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button 
                type="submit" 
                disabled={loadingPassword || !newPassword || newPassword !== confirmPassword}
                className="px-8 py-3.5 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loadingPassword ? 'Updating...' : <><Lock size={18} /> Update Password</>}
              </button>
            </div>
          </form>
        </div>

      </div>

      {/* Notification Toast */}
      {notification.show && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[120] flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`p-1.5 rounded-full ${notification.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {notification.isError ? <AlertCircle size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}
          </div>
          <p className="text-sm font-medium pr-2">{notification.message}</p>
        </div>
      )}

    </div>
  );
}
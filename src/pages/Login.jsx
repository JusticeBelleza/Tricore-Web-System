import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck, X, Key, CheckCircle2 } from 'lucide-react';

// 🚀 Import Turnstile
import { Turnstile } from '@marsidev/react-turnstile';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 🚀 Turnstile Token State
  const [captchaToken, setCaptchaToken] = useState(null);

  // --- FORGOT PASSWORD STATE ---
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState({ type: '', text: '' }); // 'success' | 'error'

  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signIn(email, password);
        navigate('/dashboard');
      } else {
        // Validation for Sign Up
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        
        // 🚀 Ensure Turnstile completed before allowing sign up
        if (!captchaToken) {
          throw new Error('Please wait for security verification to complete.');
        }

        // 🚀 Pass the token to Supabase
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { 
            data: { full_name: fullName },
            captchaToken // <--- Send token here
          } 
        });
        
        if (signUpError) throw signUpError;
        alert('Registration successful! You can now log in.');
        setIsLogin(true);
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- HANDLE PASSWORD RESET ---
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMessage({ type: '', text: '' });

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/profile`, 
      });

      if (error) throw error;
      
      setResetMessage({ type: 'success', text: 'Password reset link sent! Please check your inbox.' });
    } catch (err) {
      setResetMessage({ type: 'error', text: err.message });
    } finally {
      setResetLoading(false);
    }
  };

  // --- PASSWORD STRENGTH LOGIC ---
  const calculateStrength = (pass) => {
    let score = 0;
    if (!pass) return score;
    if (pass.length >= 6) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const strengthScore = calculateStrength(password);
  const strengthLabels = ['Too Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['bg-slate-200', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];

  // 🚀 FLOATING LABEL CSS CLASSES
  const inputClass = "block w-full pl-11 pr-10 pt-6 pb-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-bold text-slate-900 transition-all shadow-sm peer";
  const floatingLabelClass = "absolute text-sm text-slate-400 duration-300 transform -translate-y-2.5 scale-[0.8] top-3.5 z-10 origin-[0] left-11 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-1 peer-focus:scale-[0.8] peer-focus:-translate-y-2.5 peer-focus:text-blue-600 peer-focus:font-bold pointer-events-none";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 w-full h-[40vh] bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=2000&auto=format&fit=crop')] opacity-5 mix-blend-overlay object-cover"></div>
      </div>

      <div className="w-full max-w-[420px] bg-white p-8 sm:p-10 rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-500">
        
        {/* --- HEADER --- */}
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4 overflow-hidden p-2">
            <img src="/images/tricore-logo.png" alt="TriCore Logo" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            {isLogin ? 'Tricore Medical Supply' : 'Create an account'}
          </h2>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            {isLogin ? 'Enter your credentials to access your portal' : 'Join Tricore Medical Supply to streamline your clinical logistics'}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm font-bold flex items-start gap-3 animate-in fade-in zoom-in-95 duration-200">
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* --- FORM --- */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Full Name (Sign Up Only) */}
          {!isLogin && (
            <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" size={18} />
              <input
                type="text"
                id="fullName"
                required
                className={inputClass}
                placeholder=" "
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <label htmlFor="fullName" className={floatingLabelClass}>Full Name</label>
            </div>
          )}
          
          {/* Email */}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" size={18} />
            <input
              type="email"
              id="email"
              required
              className={inputClass}
              placeholder=" "
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label htmlFor="email" className={floatingLabelClass}>Email Address</label>
          </div>

          {/* Password */}
          <div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                required
                className={inputClass}
                placeholder=" "
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label htmlFor="password" className={floatingLabelClass}>Password</label>
              
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors z-10"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Password Strength Meter (Sign Up Only) */}
            {!isLogin && password.length > 0 && (
              <div className="mt-2.5 px-1 animate-in fade-in duration-300">
                <div className="flex gap-1.5 h-1.5 mb-1">
                  {[1, 2, 3, 4].map(level => (
                    <div 
                      key={level} 
                      className={`flex-1 rounded-full transition-colors duration-500 ${strengthScore >= level ? strengthColors[strengthScore] : 'bg-slate-200'}`}
                    ></div>
                  ))}
                </div>
                <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                  <span className="text-slate-400">Strength</span>
                  <span className={strengthScore > 2 ? 'text-emerald-600' : strengthScore === 2 ? 'text-amber-500' : 'text-red-500'}>
                    {strengthLabels[strengthScore]}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password (Sign Up Only) */}
          {!isLogin && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  id="confirmPassword"
                  required
                  className={`${inputClass} ${confirmPassword && password !== confirmPassword ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : ''}`}
                  placeholder=" "
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <label htmlFor="confirmPassword" className={`${floatingLabelClass} ${confirmPassword && password !== confirmPassword ? 'text-red-500 peer-focus:text-red-500' : ''}`}>Confirm Password</label>
              </div>
              
              {/* Mismatch Warning Text */}
              {confirmPassword && password !== confirmPassword && (
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1.5 ml-1 animate-in fade-in">
                  Passwords do not match
                </p>
              )}
            </div>
          )}

          {/* 🚀 TURNSTILE WIDGET (Only shown during Sign Up) */}
          {!isLogin && (
            <div className="flex justify-center py-2 animate-in fade-in duration-300">
              <Turnstile 
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} 
                onSuccess={(token) => {
                  setCaptchaToken(token);
                  setError('');
                }}
                onError={() => setError("Security verification failed. Please refresh the page.")}
                onExpire={() => setCaptchaToken(null)}
                options={{ theme: 'light' }}
              />
            </div>
          )}

          {/* Remember Me & Forgot Password Row (Login Only) */}
          {isLogin && (
            <div className="flex items-center justify-between pt-1 pb-2 px-1">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="remember" className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer" />
                <label htmlFor="remember" className="text-xs font-bold text-slate-600 cursor-pointer select-none">Remember me</label>
              </div>
              <button 
                type="button" 
                onClick={() => setShowForgotModal(true)} 
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-wider"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password || (!isLogin && (!fullName || password !== confirmPassword || !captchaToken))}
            className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-black hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg shadow-slate-900/20 disabled:opacity-70 mt-2 flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <span className="animate-pulse flex items-center gap-2"><ShieldCheck size={18} /> Processing...</span>
            ) : (
              <>{isLogin ? 'Sign In' : 'Create Account'} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
            )}
          </button>
        </form>

        {/* Footer Toggle */}
        <div className="mt-6 pt-6 border-t border-slate-100 text-center">
          <p className="text-sm font-medium text-slate-500">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setPassword('');
                setConfirmPassword('');
                setCaptchaToken(null); // Reset token if they switch tabs
              }}
              className="text-blue-600 font-bold hover:text-blue-700 hover:underline underline-offset-4 transition-all"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>

      {/* --- FORGOT PASSWORD MODAL --- */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 relative animate-in zoom-in-95 duration-200 border border-slate-100">
            
            {/* Close Button */}
            <button 
              onClick={() => {
                setShowForgotModal(false);
                setResetMessage({ type: '', text: '' });
                setResetEmail('');
              }} 
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-all"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-sm">
                <Key size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Reset Password</h3>
              <p className="text-sm text-slate-500 mt-2 font-medium">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            </div>

            {resetMessage.text && (
              <div className={`mb-5 p-3.5 rounded-xl text-sm font-bold flex items-start gap-3 animate-in fade-in zoom-in-95 duration-200 ${resetMessage.type === 'error' ? 'bg-red-50 border border-red-100 text-red-700' : 'bg-emerald-50 border border-emerald-100 text-emerald-800'}`}>
                {resetMessage.type === 'error' ? (
                  <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
                ) : (
                  <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-500" />
                )}
                <span className="leading-snug">{resetMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" size={18} />
                <input
                  type="email"
                  id="resetEmail"
                  required
                  className={inputClass}
                  placeholder=" "
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
                <label htmlFor="resetEmail" className={floatingLabelClass}>Email Address</label>
              </div>

              <button
                type="submit"
                disabled={resetLoading || !resetEmail}
                className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-black hover:bg-slate-800 active:scale-[0.98] transition-all shadow-md disabled:opacity-70 mt-2 flex items-center justify-center gap-2"
              >
                {resetLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
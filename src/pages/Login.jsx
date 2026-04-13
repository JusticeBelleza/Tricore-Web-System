import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck, X, Key, CheckCircle2 } from 'lucide-react';
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
  
  // Turnstile Tokens & Refs
  const [captchaToken, setCaptchaToken] = useState(null);
  const [resetCaptchaToken, setResetCaptchaToken] = useState(null);
  const turnstileRef = useRef(null); 
  const resetTurnstileRef = useRef(null);

  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState({ type: '', text: '' }); 

  const navigate = useNavigate();

  // 🚀 GOOGLE OAUTH SIGN-IN
  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard` 
        }
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // STANDARD EMAIL/PASSWORD SUBMIT
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!captchaToken) {
        throw new Error('Please wait for security verification to complete.');
      }

      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken }
        });
        
        if (signInError) throw signInError;
        navigate('/dashboard');
        
      } else {
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        if (password.length < 6) throw new Error('Password must be at least 6 characters long.');
        
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { 
            data: { full_name: fullName },
            captchaToken 
          } 
        });
        
        if (signUpError) throw signUpError;
        
        alert('Registration successful! You can now log in.');
        setIsLogin(true);
        setPassword('');
        setConfirmPassword('');
        setCaptchaToken(null);
        if (turnstileRef.current) turnstileRef.current.reset();
      }
    } catch (err) {
      setError(err.message);
      if (turnstileRef.current) {
        turnstileRef.current.reset();
        setCaptchaToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMessage({ type: '', text: '' });

    try {
      if (!resetCaptchaToken) {
        throw new Error('Please wait for security verification.');
      }

      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/profile`,
        options: { captchaToken: resetCaptchaToken }
      });

      if (error) throw error;
      
      setResetMessage({ type: 'success', text: 'Password reset link sent! Please check your inbox.' });
    } catch (err) {
      setResetMessage({ type: 'error', text: err.message });
      if (resetTurnstileRef.current) {
        resetTurnstileRef.current.reset();
        setResetCaptchaToken(null);
      }
    } finally {
      setResetLoading(false);
    }
  };

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

  const inputClass = "block w-full pl-11 pr-10 pt-6 pb-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-bold text-slate-900 transition-all shadow-sm peer";
  const floatingLabelClass = "absolute text-sm text-slate-400 duration-300 transform -translate-y-2.5 scale-[0.8] top-3.5 z-10 origin-[0] left-11 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-1 peer-focus:scale-[0.8] peer-focus:-translate-y-2.5 peer-focus:text-blue-600 peer-focus:font-bold pointer-events-none";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 relative overflow-hidden">
      
      <div className="absolute top-0 w-full h-[40vh] bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=2000&auto=format&fit=crop')] opacity-5 mix-blend-overlay object-cover"></div>
      </div>

      <div className="w-full max-w-[420px] bg-white p-8 sm:p-10 rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-500">
        
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

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {!isLogin && (
            <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" size={18} />
              <input type="text" id="fullName" required className={inputClass} placeholder=" " value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <label htmlFor="fullName" className={floatingLabelClass}>Full Name</label>
            </div>
          )}
          
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" size={18} />
            <input type="email" id="email" required className={inputClass} placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="email" className={floatingLabelClass}>Email Address</label>
          </div>

          <div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" size={18} />
              <input type={showPassword ? "text" : "password"} id="password" required className={inputClass} placeholder=" " value={password} onChange={(e) => setPassword(e.target.value)} />
              <label htmlFor="password" className={floatingLabelClass}>Password</label>
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors z-10">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {!isLogin && password.length > 0 && (
              <div className="mt-2.5 px-1 animate-in fade-in duration-300">
                <div className="flex gap-1.5 h-1.5 mb-1">
                  {[1, 2, 3, 4].map(level => (
                    <div key={level} className={`flex-1 rounded-full transition-colors duration-500 ${strengthScore >= level ? strengthColors[strengthScore] : 'bg-slate-200'}`}></div>
                  ))}
                </div>
                <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                  <span className="text-slate-400">Strength</span>
                  <span className={strengthScore > 2 ? 'text-emerald-600' : strengthScore === 2 ? 'text-amber-500' : 'text-red-500'}>{strengthLabels[strengthScore]}</span>
                </div>
              </div>
            )}
          </div>

          {!isLogin && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" size={18} />
                <input type={showPassword ? "text" : "password"} id="confirmPassword" required className={`${inputClass} ${confirmPassword && password !== confirmPassword ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : ''}`} placeholder=" " value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                <label htmlFor="confirmPassword" className={`${floatingLabelClass} ${confirmPassword && password !== confirmPassword ? 'text-red-500 peer-focus:text-red-500' : ''}`}>Confirm Password</label>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1.5 ml-1 animate-in fade-in">Passwords do not match</p>
              )}
            </div>
          )}

          {/* TURNSTILE WIDGET */}
          <div className="flex justify-center pt-2 pb-1 animate-in fade-in duration-300 min-h-[65px]">
            <Turnstile 
              ref={turnstileRef}
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || ''} 
              onSuccess={(token) => {
                setCaptchaToken(token);
                setError('');
              }}
              onError={() => setError("Security verification failed. Please refresh the page.")}
              onExpire={() => setCaptchaToken(null)}
              options={{ theme: 'light', appearance: 'always' }}
            />
          </div>

          {isLogin && (
            <div className="flex items-center justify-between pt-1 pb-2 px-1">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="remember" className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer" />
                <label htmlFor="remember" className="text-xs font-bold text-slate-600 cursor-pointer select-none">Remember me</label>
              </div>
              <button type="button" onClick={() => setShowForgotModal(true)} className="text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-wider">
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password || !captchaToken || (!isLogin && (!fullName || password !== confirmPassword))}
            className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-black hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg shadow-slate-900/20 disabled:opacity-70 mt-2 flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <span className="animate-pulse flex items-center gap-2"><ShieldCheck size={18} /> Processing...</span>
            ) : (
              <>{isLogin ? 'Sign In' : 'Create Account'} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
            )}
          </button>

          {/* 🚀 GOOGLE BUTTON SEPARATOR & BUTTON */}
          <div className="mt-6 pt-5 border-t border-slate-100 animate-in fade-in duration-500 relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none -top-5">
              <span className="bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Or continue with</span>
            </div>
            
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-sm mt-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google
            </button>
          </div>

        </form>

        <div className="mt-6 pt-6 border-t border-slate-100 text-center">
          <p className="text-sm font-medium text-slate-500">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setPassword('');
                setConfirmPassword('');
                setCaptchaToken(null); 
                if (turnstileRef.current) turnstileRef.current.reset();
              }}
              className="text-blue-600 font-bold hover:text-blue-700 hover:underline underline-offset-4 transition-all"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 relative animate-in zoom-in-95 duration-200 border border-slate-100">
            
            <button 
              onClick={() => {
                setShowForgotModal(false);
                setResetMessage({ type: '', text: '' });
                setResetEmail('');
                setResetCaptchaToken(null);
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
                <input type="email" id="resetEmail" required className={inputClass} placeholder=" " value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} />
                <label htmlFor="resetEmail" className={floatingLabelClass}>Email Address</label>
              </div>

              {/* Turnstile for Password Reset */}
              <div className="flex justify-center py-2 min-h-[65px]">
                <Turnstile 
                  ref={resetTurnstileRef}
                  siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || ''} 
                  onSuccess={(token) => setResetCaptchaToken(token)}
                  onExpire={() => setResetCaptchaToken(null)}
                  options={{ theme: 'light' }}
                />
              </div>

              <button
                type="submit"
                disabled={resetLoading || !resetEmail || !resetCaptchaToken}
                className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-black hover:bg-slate-800 active:scale-[0.98] transition-all shadow-md disabled:opacity-70 flex items-center justify-center gap-2"
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
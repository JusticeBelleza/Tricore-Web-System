import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
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
        // Sign Up Flow
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } } 
        });
        if (signUpError) throw signUpError;
        alert('Registration successful! You can now log in.');
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        
        <div className="text-center mb-8">
          {/* --- TRICORE LOGO --- */}
          <div className="flex justify-center mb-5">
            <img 
              src="/images/tricore-logo.png" 
              alt="Tricore Logo" 
              className="h-16 w-auto object-contain" 
            />
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Tricore Medical Supply
          </h2>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            {isLogin ? 'Sign in to access your portal' : 'Register for retail access'}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-red-50 text-red-600 text-sm font-medium rounded-lg border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Full Name</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm font-medium"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Email Address</label>
            <input
              type="email"
              required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm font-medium"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm font-medium"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white py-3 px-4 rounded-xl font-bold hover:bg-slate-800 active:scale-95 transition-all shadow-sm disabled:opacity-70 mt-2"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-slate-500 hover:text-slate-900 font-semibold transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
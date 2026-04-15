import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import * as Sentry from '@sentry/react'; // 🚀 1. IMPORT SENTRY

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App crashed:', error, errorInfo);
    
    // 🚀 2. SEND THE CRASH TO SENTRY INSTANTLY
    Sentry.captureException(error, { extra: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100 shadow-sm">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight mb-2">Something went wrong</h2>
            <p className="text-sm font-medium text-slate-500 mb-6 leading-relaxed">
              We encountered an unexpected error. Our engineering team has been notified.
            </p>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2"
            >
              <RefreshCcw size={18} /> Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
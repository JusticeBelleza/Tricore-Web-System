import React from 'react';
import { Menu } from 'lucide-react';

export default function Header({ setIsMobileMenuOpen, location }) {
  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center px-4 sm:px-8 sticky top-0 z-30 shrink-0">
      <button 
        onClick={() => setIsMobileMenuOpen(true)} 
        className="lg:hidden p-2 mr-3 -ml-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
      >
        <Menu size={24} />
      </button>
      
      <div className="flex items-center gap-3 lg:hidden">
        <img src="/images/tricore-logo2.png" alt="TriCore Logo" className="h-8 w-auto object-contain mt-1" />
      </div>
      
      <h1 className="text-lg font-bold text-slate-900 capitalize tracking-tight ml-auto lg:ml-0">
        {location.pathname.split('/').pop()?.replace('-', ' ') || 'Dashboard'}
      </h1>
    </header>
  );
}
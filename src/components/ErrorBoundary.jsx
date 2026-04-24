import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary Caught:", error, errorInfo);

    // 🚀 THE MAGIC FIX: Detect if the error is caused by a missing/updated file
    const isChunkLoadError = error?.name === 'ChunkLoadError' || 
                             error?.message?.includes('Failed to fetch dynamically imported module') ||
                             error?.message?.includes('Importing a module script failed');

    if (isChunkLoadError) {
      // Check if we already tried to reload to prevent an infinite loop
      const hasReloaded = sessionStorage.getItem('pwa-update-reload');
      
      if (!hasReloaded) {
        console.warn("Update detected! Automatically hard-reloading the page...");
        sessionStorage.setItem('pwa-update-reload', 'true');
        
        // Unregister old service workers and force a hard refresh
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((registration) => registration.unregister());
          });
        }
        
        window.location.reload(true);
      }
    }
  }

  render() {
    if (this.state.hasError) {
      // If it successfully reloaded from the ChunkLoadError, clear the flag
      sessionStorage.removeItem('pwa-update-reload');

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">System Update</h2>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed font-medium">
              We just released a new update to the Tricore system. Please click below to refresh your session.
            </p>
            <button
              onClick={() => {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister()));
                }
                window.location.reload(true);
              }}
              className="w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md"
            >
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
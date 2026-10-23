import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext();

// Synchronously retrieve stored session user from Supabase token in storage
const getStoredSessionUser = () => {
  if (typeof window === 'undefined') return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed?.user) return parsed.user;
        }
      }
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const item = sessionStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed?.user) return parsed.user;
        }
      }
    }
  } catch {}
  return null;
};

// Synchronously retrieve cached profile from localStorage
const getStoredProfile = () => {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem('tricore_user_profile');
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  // Synchronous initialization guarantees ZERO unauthenticated gap upon app wake-up or reload
  const [user, setUser] = useState(() => getStoredSessionUser());
  const [profile, setProfile] = useState(() => getStoredProfile());
  const [loading, setLoading] = useState(() => {
    // If both user and profile exist in storage, we are ready immediately
    return !(getStoredSessionUser() && getStoredProfile());
  });

  useEffect(() => {
    let isMounted = true;
    let activeUserId = user?.id || null;

    // 1. Initial verification of active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      const currentUser = session?.user ?? null;
      if (currentUser) {
        setUser(currentUser);
        activeUserId = currentUser.id;
        fetchProfile(currentUser.id);
      } else {
        // If getSession returned null, check if a stored user exists (token may need refresh after background sleep)
        const fallbackUser = getStoredSessionUser();
        if (fallbackUser) {
          supabase.auth.refreshSession().then(({ data }) => {
            if (!isMounted) return;
            if (data?.session?.user) {
              setUser(data.session.user);
              fetchProfile(data.session.user.id);
            }
          }).catch(() => {
            // Cellular/WiFi still reconnecting; preserve fallbackUser & profile
          });
        } else {
          // Truly logged out
          setProfile(null);
          try {
            localStorage.removeItem('tricore_user_profile');
          } catch {}
          setLoading(false);
        }
      }
    }).catch((err) => {
      console.warn('Session verification deferred (network reconnecting):', err);
      if (isMounted) setLoading(false);
    });

    // 2. Auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      // ONLY sign out if user explicitly clicked Sign Out or token was revoked
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        try {
          localStorage.removeItem('tricore_user_profile');
        } catch {}
        setLoading(false);
        activeUserId = null;
        return;
      }

      const currentUser = session?.user ?? null;
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
        if (currentUser.id !== activeUserId || !profile) {
          activeUserId = currentUser.id;
          fetchProfile(currentUser.id);
        }
      }
      // Note: If session is null due to network reconnecting in the background,
      // do NOT clear user or profile.
    });

    // 3. Foreground Wake-Up Handler: Triggers when driver switches back from Google Maps
    const handleWakeUp = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          // Check if access token is close to expiry (< 5 mins) and refresh proactively
          const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
          if (expiresAt && (expiresAt - Date.now() < 5 * 60 * 1000)) {
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (refreshed?.session?.user) {
              setUser(refreshed.session.user);
            }
          }
        }
      } catch (err) {
        console.warn('Foreground wake-up refresh deferred (connection re-establishing):', err);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleWakeUp);
      window.addEventListener('focus', handleWakeUp);
      window.addEventListener('online', handleWakeUp);
    }

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleWakeUp);
        window.removeEventListener('focus', handleWakeUp);
        window.removeEventListener('online', handleWakeUp);
      }
    };
  }, []);

  const fetchProfile = async (userId) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*, companies(*)')
        .eq('id', userId)
        .single();
        
      if (error) throw error;
      if (data) {
        setProfile(data);
        try {
          localStorage.setItem('tricore_user_profile', JSON.stringify(data));
        } catch (e) {
          console.warn('Failed to cache user profile:', e);
        }
      }
    } catch (error) {
      console.warn('Error fetching user profile (using cached profile if present):', error.message);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('tricore_user_profile');
    } catch {}
    setProfile(null);
    setUser(null);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = { user, profile, loading, signIn, signOut };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Export the hook separately to prevent Vite Fast Refresh errors
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

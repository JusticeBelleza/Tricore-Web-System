import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { AuthContext } from './useAuth';
import {
  AUTH_REQUEST_TIMEOUT_MS,
  PROFILE_CACHE_KEY,
  clearLocalAuthCache,
  formatSafeProfileError,
  getStoredProfile,
  getStoredSessionUser,
  isTerminalSessionError,
  isTransientNetworkError,
  withTimeout,
} from './authUtils';

export function AuthProvider({ children }) {
  // Synchronous initialization guarantees ZERO unauthenticated gap upon valid reload
  const [user, setUserState] = useState(() => getStoredSessionUser());
  const [profile, setProfileState] = useState(() => {
    const storedUser = getStoredSessionUser();
    return getStoredProfile(storedUser?.id);
  });
  const [loading, setLoading] = useState(() => {
    const storedUser = getStoredSessionUser();
    const storedProfile = getStoredProfile(storedUser?.id);
    return !(storedUser && storedProfile);
  });
  const [authError, setAuthError] = useState(null);

  const isMountedRef = useRef(true);
  const userRef = useRef(user);
  const profileRef = useRef(profile);
  const activeUserIdRef = useRef(user?.id || null);
  const authEpochRef = useRef(0);
  const inFlightProfileRef = useRef(null);

  const setUser = useCallback((nextUser) => {
    userRef.current = nextUser;
    setUserState(nextUser);
  }, []);

  const setProfile = useCallback((nextProfile) => {
    profileRef.current = nextProfile;
    setProfileState(nextProfile);
  }, []);

  const fetchProfile = useCallback(async (userId, { epoch = authEpochRef.current, background = false } = {}) => {
    if (!userId || !isMountedRef.current) return null;

    if (
      inFlightProfileRef.current &&
      inFlightProfileRef.current.userId === userId &&
      inFlightProfileRef.current.epoch === epoch
    ) {
      return inFlightProfileRef.current.promise;
    }

    const requestPromise = (async () => {
      try {
        const queryPromise = supabase
          .from('user_profiles')
          .select('*, companies(*)')
          .eq('id', userId)
          .single();

        const { data, error } = await withTimeout(
          queryPromise,
          AUTH_REQUEST_TIMEOUT_MS,
          'Profile lookup'
        );

        if (!isMountedRef.current || epoch !== authEpochRef.current) return null;
        if (error) throw error;
        if (!data || !data.id) {
          const notFoundErr = new Error('User profile missing');
          notFoundErr.code = 'PGRST116';
          throw notFoundErr;
        }

        setProfile(data);
        setAuthError(null);
        try {
          window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
        } catch {
          // Storage cache is optional
        }
        return data;
      } catch (err) {
        if (!isMountedRef.current || epoch !== authEpochRef.current) return null;

        console.warn(
          'Error fetching user profile:',
          err?.code || err?.name || 'PROFILE_FETCH_FAILED'
        );

        const hasMatchingCachedProfile = profileRef.current?.id === userId;
        const isMissingInCurrentDb = err?.code === 'PGRST116';

        // Preserve valid cached session/profile during temporary network failures
        if (background && hasMatchingCachedProfile && !isMissingInCurrentDb && isTransientNetworkError(err)) {
          setAuthError(null);
          return profileRef.current;
        }

        if (!hasMatchingCachedProfile || isMissingInCurrentDb || !isTransientNetworkError(err)) {
          if (isMissingInCurrentDb && hasMatchingCachedProfile) {
            setProfile(null);
            try {
              window.localStorage.removeItem(PROFILE_CACHE_KEY);
            } catch {
              // Ignore storage errors
            }
          }
          if (!profileRef.current) {
            setAuthError(formatSafeProfileError(err));
          }
        }
        return null;
      } finally {
        if (
          inFlightProfileRef.current &&
          inFlightProfileRef.current.userId === userId &&
          inFlightProfileRef.current.epoch === epoch
        ) {
          inFlightProfileRef.current = null;
        }
        if (isMountedRef.current && epoch === authEpochRef.current) {
          setLoading(false);
        }
      }
    })();

    inFlightProfileRef.current = { userId, epoch, promise: requestPromise };
    return requestPromise;
  }, [setProfile]);

  const verifyAndSyncSession = useCallback(async ({ forceRetry = false } = {}) => {
    const epoch = forceRetry ? ++authEpochRef.current : authEpochRef.current;

    if (forceRetry && isMountedRef.current) {
      setAuthError(null);
      setLoading(true);
    }

    try {
      const sessionRes = await withTimeout(
        supabase.auth.getSession(),
        AUTH_REQUEST_TIMEOUT_MS,
        'Session verification'
      );

      if (!isMountedRef.current || epoch !== authEpochRef.current) return;

      const session = sessionRes?.data?.session ?? null;
      const sessionError = sessionRes?.error ?? null;
      const currentUser = session?.user ?? null;

      if (currentUser) {
        const hasMatchingProfile = profileRef.current?.id === currentUser.id;
        setUser(currentUser);
        setAuthError(null);
        activeUserIdRef.current = currentUser.id;
        if (!hasMatchingProfile) {
          setProfile(null);
        }
        await fetchProfile(currentUser.id, { epoch, background: hasMatchingProfile });
        return;
      }

      if (sessionError) {
        if (isTransientNetworkError(sessionError) && userRef.current && profileRef.current?.id === userRef.current.id) {
          setAuthError(null);
          setLoading(false);
          return;
        }
        if (isTerminalSessionError(sessionError)) {
          clearLocalAuthCache();
          setUser(null);
          setProfile(null);
          activeUserIdRef.current = null;
          setAuthError({
            code: 'session_expired',
            message: 'Your saved session has expired or is invalid. Please sign in again.',
            retryable: false,
          });
          setLoading(false);
          return;
        }
        setAuthError({
          code: 'session_error',
          message: 'Unable to verify your session right now. Please check your connection and try again.',
          retryable: true,
        });
        setLoading(false);
        return;
      }

      // getSession returned null cleanly; check if a project-matching stored user exists for refresh
      const fallbackUser = getStoredSessionUser();
      if (fallbackUser && typeof supabase.auth.refreshSession === 'function') {
        try {
          const refreshRes = await withTimeout(
            supabase.auth.refreshSession(),
            AUTH_REQUEST_TIMEOUT_MS,
            'Session refresh'
          );

          if (!isMountedRef.current || epoch !== authEpochRef.current) return;

          const refreshedUser = refreshRes?.data?.session?.user ?? null;
          const refreshErr = refreshRes?.error ?? null;

          if (refreshedUser) {
            const hasMatchingProfile = profileRef.current?.id === refreshedUser.id;
            setUser(refreshedUser);
            setAuthError(null);
            activeUserIdRef.current = refreshedUser.id;
            if (!hasMatchingProfile) {
              setProfile(null);
            }
            await fetchProfile(refreshedUser.id, { epoch, background: hasMatchingProfile });
            return;
          }

          if (refreshErr && isTransientNetworkError(refreshErr)) {
            if (userRef.current && profileRef.current?.id === userRef.current.id) {
              setAuthError(null);
              setLoading(false);
              return;
            }
            setAuthError({
              code: 'network_error',
              message: 'Unable to refresh your session while offline or on an unstable network. Please retry.',
              retryable: true,
            });
            setLoading(false);
            return;
          }

          // Refresh explicitly failed or returned no active session: stale/revoked session
          clearLocalAuthCache();
          setUser(null);
          setProfile(null);
          activeUserIdRef.current = null;
          setAuthError({
            code: 'session_expired',
            message: 'Your saved session has expired or is no longer valid. Please sign in again.',
            retryable: false,
          });
          setLoading(false);
          return;
        } catch (refreshCaught) {
          if (!isMountedRef.current || epoch !== authEpochRef.current) return;
          if (isTransientNetworkError(refreshCaught)) {
            if (userRef.current && profileRef.current?.id === userRef.current.id) {
              setAuthError(null);
              setLoading(false);
              return;
            }
            setAuthError({
              code: 'network_error',
              message: 'Session refresh timed out or failed due to a connection issue. Please try again.',
              retryable: true,
            });
            setLoading(false);
            return;
          }

          clearLocalAuthCache();
          setUser(null);
          setProfile(null);
          activeUserIdRef.current = null;
          setAuthError({
            code: 'session_expired',
            message: 'Your saved session could not be refreshed. Please sign in again.',
            retryable: false,
          });
          setLoading(false);
          return;
        }
      }

      // Truly logged out (no active session or fallback refresh path)
      clearLocalAuthCache();
      setUser(null);
      setProfile(null);
      activeUserIdRef.current = null;
      setAuthError(null);
      setLoading(false);
    } catch (err) {
      if (!isMountedRef.current || epoch !== authEpochRef.current) return;

      console.warn('Session verification failed:', err?.name || 'SESSION_VERIFY_FAILED');

      // Preserve existing valid session + cached profile on transient offline/timeout errors
      if (isTransientNetworkError(err) && userRef.current && profileRef.current?.id === userRef.current.id) {
        setAuthError(null);
        setLoading(false);
        return;
      }

      if (isTerminalSessionError(err)) {
        clearLocalAuthCache();
        setUser(null);
        setProfile(null);
        activeUserIdRef.current = null;
        setAuthError({
          code: 'session_expired',
          message: 'Your saved session has expired or is invalid. Please sign in again.',
          retryable: false,
        });
        setLoading(false);
        return;
      }

      setAuthError({
        code: isTransientNetworkError(err) ? 'network_error' : 'session_error',
        message: 'Unable to verify authentication right now. Check your connection and try again.',
        retryable: true,
      });
      setLoading(false);
    }
  }, [fetchProfile, setProfile, setUser]);

  useEffect(() => {
    isMountedRef.current = true;
    const initialEpoch = authEpochRef.current;

    // 1. Initial session verification
    verifyAndSyncSession({ forceRetry: false });

    // 2. Auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMountedRef.current) return;

      if (event === 'SIGNED_OUT') {
        authEpochRef.current += 1;
        clearLocalAuthCache();
        setUser(null);
        setProfile(null);
        setAuthError(null);
        activeUserIdRef.current = null;
        setLoading(false);
        return;
      }

      const currentUser = session?.user ?? null;
      if (currentUser) {
        const epoch = authEpochRef.current;
        const prevUserId = activeUserIdRef.current;
        const hasMatchingProfile = profileRef.current?.id === currentUser.id;
        setUser(currentUser);
        setAuthError(null);
        activeUserIdRef.current = currentUser.id;

        if (currentUser.id !== prevUserId || !hasMatchingProfile) {
          if (currentUser.id !== prevUserId && !hasMatchingProfile) {
            setProfile(null);
          }
          fetchProfile(currentUser.id, { epoch, background: hasMatchingProfile });
        } else {
          setLoading(false);
        }
      }
      // Preserve existing user/profile if session is temporarily null outside SIGNED_OUT
    });

    // 3. Foreground Wake-Up Handler: refreshes near-expiry tokens and recovers missing profile on reconnect
    const handleWakeUp = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (!isMountedRef.current) return;
      const epoch = authEpochRef.current;

      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_REQUEST_TIMEOUT_MS,
          'Foreground session check'
        );
        if (!isMountedRef.current || epoch !== authEpochRef.current) return;

        if (session?.user) {
          let activeUser = session.user;
          const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
          if (expiresAt && expiresAt - Date.now() < 5 * 60 * 1000 && typeof supabase.auth.refreshSession === 'function') {
            const { data: refreshed } = await withTimeout(
              supabase.auth.refreshSession(),
              AUTH_REQUEST_TIMEOUT_MS,
              'Foreground token refresh'
            );
            if (refreshed?.session?.user) {
              activeUser = refreshed.session.user;
            }
          }
          if (!isMountedRef.current || epoch !== authEpochRef.current) return;
          setUser(activeUser);
          activeUserIdRef.current = activeUser.id;
          if (!profileRef.current || profileRef.current.id !== activeUser.id) {
            await fetchProfile(activeUser.id, { epoch, background: false });
          }
        }
      } catch (err) {
        console.warn('Foreground wake-up refresh deferred:', err?.name || 'NETWORK_RECONNECTING');
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleWakeUp);
      window.addEventListener('focus', handleWakeUp);
      window.addEventListener('online', handleWakeUp);
    }

    return () => {
      isMountedRef.current = false;
      if (authEpochRef.current === initialEpoch) {
        authEpochRef.current += 1;
      }
      subscription?.unsubscribe?.();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleWakeUp);
        window.removeEventListener('focus', handleWakeUp);
        window.removeEventListener('online', handleWakeUp);
      }
    };
  }, [fetchProfile, setProfile, setUser, verifyAndSyncSession]);

  const retryAuth = useCallback(() => {
    return verifyAndSyncSession({ forceRetry: true });
  }, [verifyAndSyncSession]);

  const signIn = async (email, password) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const clearSessionToLogin = useCallback(async () => {
    authEpochRef.current += 1;
    inFlightProfileRef.current = null;
    clearLocalAuthCache();
    setProfile(null);
    setUser(null);
    setAuthError(null);
    activeUserIdRef.current = null;
    setLoading(false);
    try {
      await withTimeout(supabase.auth.signOut(), 5000, 'Sign out');
    } catch {
      // Local state and project token are already cleared so user can safely re-login
    }
  }, [setProfile, setUser]);

  const signOut = async () => {
    authEpochRef.current += 1;
    inFlightProfileRef.current = null;
    clearLocalAuthCache();
    setProfile(null);
    setUser(null);
    setAuthError(null);
    activeUserIdRef.current = null;
    setLoading(false);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = {
    user,
    profile,
    loading,
    authError,
    retryAuth,
    clearSessionToLogin,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

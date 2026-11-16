import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';
import {
  AUTH_REQUEST_TIMEOUT_MS,
  PROFILE_CACHE_KEY,
  getExpectedAuthStorageKey,
} from './authUtils';
import { supabase } from './supabase';

// MOCK THE SUPABASE CLIENT
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: '123', role: 'admin', full_name: 'Test User' }, error: null }),
    })),
  }
}));

describe('AuthContext', () => {
  let activeStorageKey;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    activeStorageKey = getExpectedAuthStorageKey() || 'sb-testproject-auth-token';

    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    supabase.auth.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    supabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: '123', role: 'admin', full_name: 'Test User' },
        error: null,
      }),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls Supabase signInWithPassword with the correct credentials', async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({ data: { user: { id: '123' } }, error: null });

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeTruthy();
      expect(result.current.signIn).toBeDefined();
    });

    await act(async () => {
      await result.current.signIn('test@tricore.com', 'password123');
    });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@tricore.com',
      password: 'password123',
    });
  });

  it('calls Supabase signOut correctly', async () => {
    supabase.auth.signOut.mockResolvedValueOnce({ error: null });

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeTruthy();
      expect(result.current.signOut).toBeDefined();
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('completes login cleanly when SIGNED_IN arrives and fetches user profile', async () => {
    let authCallback = null;
    supabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    supabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'usr-login-1', role: 'warehouse', full_name: 'Warehouse Op' },
        error: null,
      }),
    }));

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();

    await act(async () => {
      authCallback('SIGNED_IN', { user: { id: 'usr-login-1', email: 'wh@tricore.test' } });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.profile?.id).toBe('usr-login-1');
    });
    expect(result.current.user?.id).toBe('usr-login-1');
    expect(result.current.profile?.role).toBe('warehouse');
    expect(result.current.authError).toBeNull();
  });

  it('surfaces a recoverable authError when authenticated user profile fails to load and recovers on retryAuth', async () => {
    const authUser = { id: 'usr-prof-fail', email: 'admin@tricore.test' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: authUser } },
      error: null,
    });

    const singleMock = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied for table user_profiles' } })
      .mockResolvedValueOnce({ data: { id: 'usr-prof-fail', role: 'admin', full_name: 'Admin Fixed' }, error: null });

    supabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: singleMock,
    }));

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user?.id).toBe('usr-prof-fail');
    expect(result.current.profile).toBeNull();
    expect(result.current.authError).toBeTruthy();
    expect(result.current.authError.retryable).toBe(true);
    expect(result.current.authError.code).toBe('profile_access_denied');

    await act(async () => {
      await result.current.retryAuth();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.profile?.id).toBe('usr-prof-fail');
    });
    expect(result.current.authError).toBeNull();
  });

  it('ignores stale tokens belonging to a different Supabase project', async () => {
    localStorage.setItem(
      'sb-differentproject123-auth-token',
      JSON.stringify({ user: { id: 'foreign-user-1', email: 'other@project.test' } })
    );
    localStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify({ id: 'foreign-user-1', role: 'admin', full_name: 'Foreign Admin' })
    );

    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.authError).toBeNull();
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
    // Must not delete unrelated project tokens in shared localStorage
    expect(localStorage.getItem('sb-differentproject123-auth-token')).toBeTruthy();
  });

  it('handles expired/stale refresh tokens cleanly without infinite loading while preserving Remember Me prefs', async () => {
    localStorage.setItem('tricore_remember_me', 'true');
    localStorage.setItem('tricore_remember_email', 'driver@tricore.com');
    localStorage.setItem(
      activeStorageKey,
      JSON.stringify({ user: { id: 'usr-stale', email: 'driver@tricore.com' } })
    );

    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    supabase.auth.refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 },
    });

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.authError?.code).toBe('session_expired');
    expect(result.current.authError?.retryable).toBe(false);
    expect(localStorage.getItem('tricore_remember_me')).toBe('true');
    expect(localStorage.getItem('tricore_remember_email')).toBe('driver@tricore.com');
    expect(localStorage.getItem(activeStorageKey)).toBeNull();
  });

  it('recovers valid session via refreshSession when getSession returns null on reload', async () => {
    const driverUser = { id: 'usr-refresh-ok', email: 'driver@tricore.com' };
    sessionStorage.setItem(activeStorageKey, JSON.stringify({ user: driverUser }));

    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    supabase.auth.refreshSession.mockResolvedValueOnce({
      data: { session: { user: driverUser } },
      error: null,
    });
    supabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'usr-refresh-ok', role: 'driver', full_name: 'Sam Driver' },
        error: null,
      }),
    }));

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.profile?.id).toBe('usr-refresh-ok');
    });

    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(result.current.user?.id).toBe('usr-refresh-ok');
    expect(result.current.authError).toBeNull();
  });

  it('preserves a valid cached session during a temporary network failure', async () => {
    const cachedUser = { id: 'usr-cached-ok', email: 'nurse@tricore.com' };
    const cachedProfile = { id: 'usr-cached-ok', role: 'b2b', full_name: 'Nurse Kelly' };
    localStorage.setItem(activeStorageKey, JSON.stringify({ user: cachedUser }));
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cachedProfile));

    supabase.auth.getSession.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user?.id).toBe('usr-cached-ok');
    expect(result.current.profile).toEqual(cachedProfile);
    expect(result.current.authError).toBeNull();
    expect(localStorage.getItem(activeStorageKey)).toBeTruthy();
  });

  it('settles hung getSession promises cleanly on timeout and ignores updates after unmount', async () => {
    vi.useFakeTimers();
    supabase.auth.getSession.mockImplementation(() => new Promise(() => {}));

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result, unmount } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS + 50);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.authError?.code).toBe('network_error');
    expect(result.current.authError?.retryable).toBe(true);

    unmount();
  });

  it('throws an explicit error when useAuth is invoked outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider');
  });
});

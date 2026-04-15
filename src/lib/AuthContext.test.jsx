import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { supabase } from './supabase';

// MOCK THE SUPABASE CLIENT
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'admin', full_name: 'Test User' }, error: null }),
    })),
  }
}));

describe('AuthContext', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Supabase signInWithPassword with the correct credentials', async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({ data: { user: { id: '123' } }, error: null });

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    // 🚀 BULLETPROOF FIX: Explicitly wait for the result to exist AND have the signIn function
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

    // 🚀 BULLETPROOF FIX: Explicitly wait for the result to exist AND have the signOut function
    await waitFor(() => {
      expect(result.current).toBeTruthy();
      expect(result.current.signOut).toBeDefined();
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

});
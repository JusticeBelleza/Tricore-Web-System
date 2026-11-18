import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute, RoleProtectedRoute } from './App';
import * as AuthHook from './lib/useAuth';

// 🚀 Intercept Supabase client and Auth Hook cleanly in CI/unit tests without requiring .env
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('./lib/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('URL Routing Security (RBAC)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks Retail users from Admin URLs and redirects them', () => {
    AuthHook.useAuth.mockReturnValue({ profile: { role: 'retail' } });

    render(
      <MemoryRouter initialEntries={['/admin-secret']}>
        <Routes>
          <Route path="/admin-secret" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <h1>TOP SECRET ADMIN PAGE</h1>
            </RoleProtectedRoute>
          } />
          <Route path="/dashboard" element={<h1>Standard Dashboard</h1>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('TOP SECRET ADMIN PAGE')).not.toBeInTheDocument();
    expect(screen.getByText('Standard Dashboard')).toBeInTheDocument();
  });

  it('allows Admin users to view Admin URLs', () => {
    AuthHook.useAuth.mockReturnValue({ profile: { role: 'admin' } });

    render(
      <MemoryRouter initialEntries={['/admin-secret']}>
        <Routes>
          <Route path="/admin-secret" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <h1>TOP SECRET ADMIN PAGE</h1>
            </RoleProtectedRoute>
          } />
          <Route path="/dashboard" element={<h1>Standard Dashboard</h1>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('TOP SECRET ADMIN PAGE')).toBeInTheDocument();
  });

  it('shows recoverable error instead of infinite Authenticating spinner when user exists but profile failed to load', async () => {
    const retryAuth = vi.fn();
    const clearSessionToLogin = vi.fn().mockResolvedValue(undefined);

    AuthHook.useAuth.mockReturnValue({
      user: { id: 'usr-1' },
      profile: null,
      loading: false,
      authError: {
        code: 'profile_network_error',
        message: 'Unable to load your account profile due to a network or timeout issue.',
        retryable: true,
      },
      retryAuth,
      clearSessionToLogin,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <h1>Protected Dashboard</h1>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<h1>Login Page</h1>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText(/authenticating\.\.\./i)).not.toBeInTheDocument();
    expect(screen.queryByText('Protected Dashboard')).not.toBeInTheDocument();
    expect(screen.getByText('Authentication Problem')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retryAuth).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => {
      expect(clearSessionToLogin).toHaveBeenCalledTimes(1);
    });
  });

  it('never leaves an infinite spinner if loading finishes with user present and profile null', () => {
    AuthHook.useAuth.mockReturnValue({
      user: { id: 'usr-2' },
      profile: null,
      loading: false,
      authError: null,
      retryAuth: vi.fn(),
      clearSessionToLogin: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <h1>Protected Dashboard</h1>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText(/authenticating\.\.\./i)).not.toBeInTheDocument();
    expect(screen.getByText('Authentication Problem')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('redirects cleanly to /login when unauthenticated', () => {
    AuthHook.useAuth.mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      authError: null,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <h1>Protected Dashboard</h1>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<h1>Login Screen</h1>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Screen')).toBeInTheDocument();
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoleProtectedRoute } from './App';
import * as AuthContext from './lib/AuthContext';

// 🚀 Intercept the Auth Hook to fake different users logging in
vi.mock('./lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('URL Routing Security (RBAC)', () => {
  
  it('blocks Retail users from Admin URLs and redirects them', () => {
    // 1. Simulate a standard retail customer
    AuthContext.useAuth.mockReturnValue({ profile: { role: 'retail' } });

    // 2. Render an invisible browser starting directly on the secret URL
    render(
      <MemoryRouter initialEntries={['/admin-secret']}>
        <Routes>
          <Route path="/admin-secret" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <h1>TOP SECRET ADMIN PAGE</h1>
            </RoleProtectedRoute>
          } />
          {/* This is where they should get kicked to */}
          <Route path="/dashboard" element={<h1>Standard Dashboard</h1>} />
        </Routes>
      </MemoryRouter>
    );

    // 3. ❌ Prove they CANNOT see the secret page
    expect(screen.queryByText('TOP SECRET ADMIN PAGE')).not.toBeInTheDocument();
    
    // 4. ✅ Prove they WERE redirected to the safe dashboard
    expect(screen.getByText('Standard Dashboard')).toBeInTheDocument();
  });

  it('allows Admin users to view Admin URLs', () => {
    // 1. Simulate an Admin
    AuthContext.useAuth.mockReturnValue({ profile: { role: 'admin' } });

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

    // 2. ✅ Prove the Admin is allowed to see the page
    expect(screen.getByText('TOP SECRET ADMIN PAGE')).toBeInTheDocument();
  });
});
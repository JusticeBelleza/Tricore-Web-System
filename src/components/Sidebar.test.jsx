import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

describe('Sidebar Security & RBAC', () => {
  it('hides Admin links from standard Retail users', () => {
    const mockRetailProfile = { role: 'retail', full_name: 'John Doe' };
    
    render(
      <MemoryRouter>
        <Sidebar 
          profile={mockRetailProfile} 
          badges={{}} 
          isCustomer={true} 
          location={{ pathname: '/' }} 
        />
      </MemoryRouter>
    );

    // ✅ Should see customer links
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    
    // ❌ Should NOT see admin links
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Fleet Management')).not.toBeInTheDocument();
  });

  it('shows Admin links to Admin users', () => {
    const mockAdminProfile = { role: 'admin', full_name: 'Admin Boss' };
    
    render(
      <MemoryRouter>
        <Sidebar 
          profile={mockAdminProfile} 
          badges={{}} 
          isCustomer={false} 
          location={{ pathname: '/' }} 
        />
      </MemoryRouter>
    );

    // ✅ Admins should see the restricted links
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Fleet Management')).toBeInTheDocument();
  });
});
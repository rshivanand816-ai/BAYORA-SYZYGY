import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { AuthProvider } from '../context/AuthContext';
import { api } from '../services/api';
import { UserOut } from '../types/api';

const mockUser = (role: UserOut['role']): UserOut => ({
  id: `u-${role}`,
  username: role,
  email: `${role}@bayora.local`,
  display_name: `${role} operator`,
  role,
  tenant: 'default',
  is_active: true,
});

describe('Role-aware navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the Red-only and Blue-only entries to the right roles', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(mockUser('red'));

    render(
      <MemoryRouter>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Red Workbench')).toBeInTheDocument());

    // Red sees Red Workbench...
    expect(screen.getByText('Red Workbench')).toBeInTheDocument();
    // ...and must not see the Blue console.
    expect(screen.queryByText('Blue Console')).not.toBeInTheDocument();
    // ...nor the Auditor-only audit explorer.
    expect(screen.queryByText('Audit Explorer')).not.toBeInTheDocument();
  });

  it('hides the Red workbench from a Blue operator', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(mockUser('blue'));

    render(
      <MemoryRouter>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Blue Console')).toBeInTheDocument());

    expect(screen.getByText('Blue Console')).toBeInTheDocument();
    expect(screen.queryByText('Red Workbench')).not.toBeInTheDocument();
  });

  it('shows the audit explorer to an auditor', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(mockUser('auditor'));

    render(
      <MemoryRouter>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Audit Explorer')).toBeInTheDocument());

    expect(screen.getByText('Audit Explorer')).toBeInTheDocument();
    expect(screen.queryByText('Red Workbench')).not.toBeInTheDocument();
    expect(screen.queryByText('Blue Console')).not.toBeInTheDocument();
  });

  it('does not claim isolation is active in the chrome', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(mockUser('admin'));

    render(
      <MemoryRouter>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('BAYORA')).toBeInTheDocument());

    // The header must not assert an unverified enforcement status.
    expect(screen.queryByText(/Isolation Boundary Enforcement Active/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sandbox Active/i)).not.toBeInTheDocument();
    // ...and it must not use absolute security wording.
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/100% secure/i);
    expect(html).not.toMatch(/unhackable/i);
    expect(html).not.toMatch(/fully immutable/i);
  });
});

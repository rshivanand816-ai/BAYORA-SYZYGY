import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Login } from '../pages/Login';
import { AuthProvider } from '../context/AuthContext';

describe('Login Page', () => {
  it('renders login form and demo accounts', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText('BAYORA')).toBeInTheDocument();
    expect(screen.getByText('Sign in to Safety Console')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. admin, red, blue, auditor')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter role password')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Red Team')).toBeInTheDocument();
    expect(screen.getByText('Blue Team')).toBeInTheDocument();
    expect(screen.getByText('Auditor')).toBeInTheDocument();
  });

  it('autofills the username when clicking a demo role button', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    const redButton = screen.getByText('Red Team');
    fireEvent.click(redButton);

    const usernameInput = screen.getByPlaceholderText(
      'e.g. admin, red, blue, auditor'
    ) as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText('Enter role password') as HTMLInputElement;

    await waitFor(() => {
      expect(usernameInput.value).toBe('red');
    });
    // The password is never shipped in the browser bundle. The operator types
    // it, and the backend holds the value in its own configuration.
    expect(passwordInput.value).toBe('');
  });

  it('does not embed any demo password in the rendered output', () => {
    const { container } = render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    const html = container.innerHTML;
    for (const secret of [
      'AdminDevSecPass2026!',
      'RedOperatorPass2026!',
      'BlueDefensePass2026!',
      'AuditorChainPass2026!',
      'admin-pass',
      'red-pass',
      'blue-pass',
      'auditor-pass',
    ]) {
      expect(html).not.toContain(secret);
    }
  });
});

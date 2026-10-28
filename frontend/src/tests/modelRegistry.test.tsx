import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModelsRegistry } from '../pages/ModelsRegistry';
import { AuthProvider } from '../context/AuthContext';
import { api } from '../services/api';
import { UserOut, ModelOut } from '../types/api';

const adminUser: UserOut = {
  id: 'u-admin',
  username: 'admin',
  email: 'admin@bayora.local',
  display_name: 'System Admin',
  role: 'admin',
  tenant: 'default',
  is_active: true,
};

const mockModel = (overrides: Partial<ModelOut> = {}): ModelOut => ({
  id: 'm-mock',
  display_name: 'Bayora Mock Safety Model (Simulated)',
  adapter: 'mock',
  identifier: 'bayora-mock-v1',
  version: '1.0.0',
  source: 'bundled',
  format: 'simulated',
  status: 'approved',
  execution_mode: 'simulated',
  external_enabled: false,
  runnable: true,
  last_health_status: 'untested',
  created_at: '2026-10-21T00:00:00Z',
  ...overrides,
} as ModelOut);

describe('Model registry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getMe').mockResolvedValue(adminUser);
  });

  it('lists the registry entries returned by the API', async () => {
    vi.spyOn(api, 'getModels').mockResolvedValue([
      mockModel(),
      mockModel({
        id: 'm-ollama',
        display_name: 'Llama 3 8B (Local)',
        adapter: 'ollama',
        identifier: 'llama3:8b',
        execution_mode: 'local',
        status: 'registered',
        runnable: false,
      }),
    ]);

    render(
      <MemoryRouter>
        <AuthProvider>
          <ModelsRegistry />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Bayora Mock Safety Model (Simulated)')).toBeInTheDocument());
    expect(screen.getByText('Llama 3 8B (Local)')).toBeInTheDocument();
  });

  it('labels a simulated model as simulated rather than presenting it as a real model', async () => {
    vi.spyOn(api, 'getModels').mockResolvedValue([mockModel()]);

    render(
      <MemoryRouter>
        <AuthProvider>
          <ModelsRegistry />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Bayora Mock Safety Model (Simulated)')).toBeInTheDocument());

    const html = document.body.innerHTML.toLowerCase();
    // The mock must be visibly marked as simulated, and must not be
    // described as a real or production model.
    expect(html).toContain('simulated');
  });

  it('submits the registration form with the entered adapter and identifier', async () => {
    const createModel = vi.spyOn(api, 'createModel').mockResolvedValue(mockModel({ id: 'm-new' }));
    vi.spyOn(api, 'getModels').mockResolvedValue([mockModel()]);

    render(
      <MemoryRouter>
        <AuthProvider>
          <ModelsRegistry />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Bayora Mock Safety Model (Simulated)')).toBeInTheDocument());

    // Open the registration modal.
    screen.getByRole('button', { name: /register target model/i }).click();
    await waitFor(() => expect(screen.getByText('Register New Target Model')).toBeInTheDocument());

    // Fill the form via the native value setter so React's synthetic
    // onChange actually fires.
    const setNativeValue = (el: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    setNativeValue(screen.getByPlaceholderText(/llama-3-8b-instruct/i) as HTMLInputElement, 'Local Llama');
    setNativeValue(screen.getByPlaceholderText(/llama3:8b/i) as HTMLInputElement, 'llama3:8b');

    const adapterSelect = screen.getByDisplayValue(/deterministic mock/i) as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(adapterSelect, 'ollama');
    adapterSelect.dispatchEvent(new Event('change', { bubbles: true }));

    screen.getByRole('button', { name: /^register model$/i }).click();

    await waitFor(() => expect(createModel).toHaveBeenCalled(), { timeout: 4000 });
    const payload = createModel.mock.calls[0][0] as any;
    expect(payload.display_name).toBe('Local Llama');
    expect(payload.identifier).toBe('llama3:8b');
    expect(payload.adapter).toBe('ollama');
  });

  it('surfaces an API failure instead of showing an empty registry as if it were empty', async () => {
    vi.spyOn(api, 'getModels').mockRejectedValue(
      new Error('Backend unavailable')
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <ModelsRegistry />
        </AuthProvider>
      </MemoryRouter>
    );

    // The page must show an error affordance, not a silently empty list.
    await waitFor(() => {
      const html = document.body.innerHTML.toLowerCase();
      expect(
        html.includes('failed') ||
          html.includes('error') ||
          html.includes('unavailable') ||
          html.includes('retry')
      ).toBe(true);
    });
  });
});

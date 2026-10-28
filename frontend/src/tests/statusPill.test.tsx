import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPill } from '../components/common/StatusPill';

describe('StatusPill 5-State Isolation Rendering', () => {
  it('renders verified_pass status as Verified', () => {
    render(<StatusPill status="verified_pass" />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('renders failed status as Failed', () => {
    render(<StatusPill status="failed" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders configured_untested status as Configured – untested', () => {
    render(<StatusPill status="configured_untested" />);
    expect(screen.getByText('Configured – untested')).toBeInTheDocument();
  });

  it('renders simulated status as Simulated', () => {
    render(<StatusPill status="simulated" />);
    expect(screen.getByText('Simulated')).toBeInTheDocument();
  });

  it('renders unsupported status as Unsupported / no telemetry', () => {
    render(<StatusPill status="unsupported" />);
    expect(screen.getByText('Unsupported / no telemetry')).toBeInTheDocument();
  });
});

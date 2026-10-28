import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiError } from '../services/api';
import { ErrorState } from '../components/common/ErrorState';

describe('ApiError and ErrorState', () => {
  it('constructs ApiError with code, message, and trace_id', () => {
    const err = new ApiError(403, 'cross_boundary_denied', 'Red Team may not inspect ongoing Blue policies', 'trace-xyz-123');
    expect(err.status).toBe(403);
    expect(err.code).toBe('cross_boundary_denied');
    expect(err.message).toBe('Red Team may not inspect ongoing Blue policies');
    expect(err.traceId).toBe('trace-xyz-123');
  });

  it('renders ErrorState with custom message and retry button', () => {
    let retried = false;
    render(
      <ErrorState
        title="Cross-Boundary Violation"
        message="Request blocked by kernel isolation boundary."
        onRetry={() => {
          retried = true;
        }}
      />
    );

    expect(screen.getByText('Cross-Boundary Violation')).toBeInTheDocument();
    expect(
      screen.getByText('Request blocked by kernel isolation boundary.')
    ).toBeInTheDocument();

    const btn = screen.getByText('Retry Request');
    btn.click();
    expect(retried).toBe(true);
  });
});

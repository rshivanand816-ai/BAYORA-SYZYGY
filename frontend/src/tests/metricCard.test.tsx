import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCard } from '../components/common/MetricCard';
import { MetricValue } from '../types/api';

describe('MetricCard Honesty and Provenance', () => {
  it('displays measured metric with provenance badge and sample size', () => {
    const metric: MetricValue = {
      key: 'p50_latency',
      label: 'P50 Latency',
      value: 142.5,
      display: '142.5ms',
      n: 24,
      provenance: 'measured',
      source: 'model_gateway_eval',
      formula: 'median(latencies)',
    };

    render(<MetricCard metric={metric} />);
    expect(screen.getByText('P50 Latency')).toBeInTheDocument();
    expect(screen.getByText('142.5ms')).toBeInTheDocument();
    expect(screen.getByText('MEASURED')).toBeInTheDocument();
    expect(screen.getByText('n = 24')).toBeInTheDocument();
  });

  it('displays "Insufficient observations" when provenance is insufficient', () => {
    const metric: MetricValue = {
      key: 'fp_rate',
      label: 'False Positive Rate',
      value: null,
      display: 'N/A',
      n: 0,
      provenance: 'insufficient',
      source: 'blue_policy_engine',
    };

    render(<MetricCard metric={metric} />);
    expect(screen.getByText('False Positive Rate')).toBeInTheDocument();
    expect(screen.getByText('Insufficient observations')).toBeInTheDocument();
    expect(screen.getByText('INSUFFICIENT')).toBeInTheDocument();
    expect(screen.getByText('n = 0')).toBeInTheDocument();
  });
});

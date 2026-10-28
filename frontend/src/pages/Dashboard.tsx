import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { DashboardSummary, SecurityStatus, AuditEventOut } from '../types/api';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { MetricCard } from '../components/common/MetricCard';
import { Spinner } from '../components/common/Spinner';
import { ErrorState } from '../components/common/ErrorState';
import { ArchitectureTopology } from '../components/dashboard/ArchitectureTopology';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Clock,
  AlertTriangle,
  Cpu,
  Server,
  FileText,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

export const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);
  const [recentEvents, setRecentEvents] = useState<AuditEventOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [sum, sec, events] = await Promise.all([
        api.getDashboardSummary(),
        api.getSecurityStatus(),
        api.getDashboardRecentEvents(8),
      ]);
      setSummary(sum);
      setSecurityStatus(sec);
      setRecentEvents(events);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, []);

  if (loading && !summary) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3 font-mono">
          Querying multi-store security telemetry...
        </p>
      </div>
    );
  }

  if (error || !summary || !securityStatus) {
    return <ErrorState message={error || 'Failed to initialize telemetry'} onRetry={loadData} />;
  }

  // Outcome data for chart
  const outcomeData = [
    { name: 'Blocked Input', value: summary.blocked_count, color: '#FF626F' },
    { name: 'Output Leaks', value: summary.output_leak_detections, color: '#F1BF62' },
    { name: 'Attacks Executed', value: summary.attack_cases_executed, color: '#5599FF' },
    { name: 'Active Sessions', value: summary.sessions_total, color: '#52D6A0' },
  ];

  return (
    <div className="space-y-6">
      {/* Provenance & Environment Banner */}
      <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Badge variant="cyan" size="md">
            PROVENANCE: {summary.data_provenance.toUpperCase()}
          </Badge>
          <span className="text-[#8FA0BE]">
            All counts and metrics derived from multi-store append-only audit ledgers.
          </span>
        </div>
        <div className="flex items-center gap-2 text-[#8FA0BE] font-mono text-[11px]">
          <span>Audit Chain:</span>
          <span className="text-[#52D6A0] font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            {summary.audit_integrity.status === 'verified'
              ? 'SHA-256 Tamper-Evident'
              : summary.audit_integrity.status}
          </span>
          <span className="text-[#233252]">|</span>
          <span>Checked: {summary.audit_integrity.events_count || 0} events</span>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card noPadding className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#8FA0BE]">
            <span>Total Eval Sessions</span>
            <Layers className="w-4 h-4 text-[#44D7F2]" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold font-mono text-[#E5EAF2]">
              {summary.sessions_total}
            </span>
          </div>
          <div className="text-[11px] text-[#8FA0BE] flex items-center justify-between">
            <span>Running: {summary.sessions_by_status.running || 0}</span>
            <span>Completed: {summary.sessions_by_status.completed || 0}</span>
          </div>
        </Card>

        <Card noPadding className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#8FA0BE]">
            <span>Adversarial Attacks</span>
            <ShieldAlert className="w-4 h-4 text-[#FF626F]" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold font-mono text-[#FF626F]">
              {summary.attack_cases_executed}
            </span>
          </div>
          <div className="text-[11px] text-[#8FA0BE] flex items-center justify-between">
            <span>Blocked: {summary.blocked_count}</span>
            <span>Leak Detections: {summary.output_leak_detections}</span>
          </div>
        </Card>

        {summary.latency?.p50 ? (
          <MetricCard
            metric={summary.latency.p50}
            icon={<Clock className="w-3.5 h-3.5 text-[#5599FF]" />}
          />
        ) : (
          <Card noPadding className="p-4 flex flex-col justify-between">
            <div className="text-xs text-[#8FA0BE]">P50 Latency</div>
            <div className="text-base text-[#8FA0BE] italic my-2">No observations</div>
          </Card>
        )}

        {summary.latency?.p95 ? (
          <MetricCard
            metric={summary.latency.p95}
            icon={<Zap className="w-3.5 h-3.5 text-[#F1BF62]" />}
          />
        ) : (
          <Card noPadding className="p-4 flex flex-col justify-between">
            <div className="text-xs text-[#8FA0BE]">P95 Latency</div>
            <div className="text-base text-[#8FA0BE] italic my-2">No observations</div>
          </Card>
        )}
      </div>

      {/* Target Model & Active Defense Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#8FA0BE] mb-1">Target Language Model</div>
            <div className="text-sm font-semibold text-[#E5EAF2] flex items-center gap-2">
              <span>{summary.current_model?.name || 'Default Model'}</span>
              <Badge variant="cyan">{summary.current_model?.version || 'v1.0'}</Badge>
              {summary.current_model?.execution_mode === 'simulated' && (
                <Badge variant="yellow">SIMULATED</Badge>
              )}
            </div>
          </div>
          <Server className="w-6 h-6 text-[#44D7F2]/60" />
        </div>

        <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#8FA0BE] mb-1">Active Blue Policy Version</div>
            <div className="text-sm font-semibold text-[#E5EAF2] flex items-center gap-2">
              <span>{summary.current_defense?.policy_name || 'Standard Guardrails'}</span>
              <Badge variant="blue">v{summary.current_defense?.version || 1}</Badge>
              <Badge variant="green">DEPLOYED</Badge>
            </div>
          </div>
          <ShieldAlert className="w-6 h-6 text-[#5599FF]/60" />
        </div>
      </div>

      {/* Interactive Topology Graph */}
      <ArchitectureTopology status={securityStatus} />

      {/* Charts & Security Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outcome Breakdown Chart */}
        <Card title="Adversarial Outcome Distribution" className="lg:col-span-1">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outcomeData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" stroke="#8FA0BE" fontSize={10} />
                <YAxis dataKey="name" type="category" stroke="#8FA0BE" fontSize={10} width={90} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#141C2E',
                    borderColor: '#233252',
                    fontSize: '11px',
                    color: '#E5EAF2',
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {outcomeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-[11px] text-[#8FA0BE] text-center">
            Breakdown across automated suites and interactive red probes
          </div>
        </Card>

        {/* Recent Security Audit Events */}
        <Card
          title="Recent Tamper-Evident Audit Events"
          subtitle="Real-time events verified with SHA-256 hash-chaining"
          className="lg:col-span-2"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#233252] text-[#8FA0BE] text-[10px] uppercase font-mono">
                  <th className="py-2 px-2">Seq</th>
                  <th className="py-2 px-2">Timestamp</th>
                  <th className="py-2 px-2">Actor</th>
                  <th className="py-2 px-2">Category</th>
                  <th className="py-2 px-2">Severity</th>
                  <th className="py-2 px-2">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2942]">
                {recentEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-[#8FA0BE] italic">
                      No events recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentEvents.map((evt) => (
                    <tr key={evt.event_id} className="hover:bg-[#182238]/60">
                      <td className="py-2 px-2 font-mono text-[#44D7F2]">#{evt.seq}</td>
                      <td className="py-2 px-2 text-[#8FA0BE] font-mono text-[10px]">
                        {new Date(evt.ts).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-2 font-mono">{evt.actor}</td>
                      <td className="py-2 px-2">
                        <Badge variant="blue" size="sm">
                          {evt.category}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">
                        <Badge
                          variant={
                            evt.severity === 'critical' || evt.severity === 'high'
                              ? 'red'
                              : evt.severity === 'warning'
                              ? 'yellow'
                              : 'green'
                          }
                          size="sm"
                        >
                          {evt.severity}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-[#E5EAF2] truncate max-w-xs">{evt.summary}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

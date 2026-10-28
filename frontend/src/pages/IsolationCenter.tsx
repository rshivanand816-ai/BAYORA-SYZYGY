import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  SecurityStatus,
  IsolationCheckOut,
  ResourceMetricOut,
} from '../types/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { StatusPill } from '../components/common/StatusPill';
import { ErrorState } from '../components/common/ErrorState';
import { ArchitectureTopology } from '../components/dashboard/ArchitectureTopology';
import {
  Server,
  ShieldCheck,
  ShieldAlert,
  Play,
  RotateCcw,
  Cpu,
  HardDrive,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const IsolationCenter: React.FC = () => {
  const { hasRole } = useAuth();
  const canRun = hasRole('admin', 'auditor');

  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [checks, setChecks] = useState<IsolationCheckOut[]>([]);
  const [resources, setResources] = useState<ResourceMetricOut[]>([]);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [sec, checkList, summary] = await Promise.all([
        api.getSecurityStatus(),
        api.getIsolationChecks(),
        api.getDashboardSummary(),
      ]);
      setStatus(sec);
      setChecks(checkList);
      setResources(summary.resource || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch isolation status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRunChecks = async () => {
    try {
      setRunning(true);
      const res = await api.runIsolationChecks();
      setChecks(res.checks);
      const sec = await api.getSecurityStatus();
      setStatus(sec);
    } catch (err: any) {
      alert(err.message || 'Failed to execute isolation checks');
    } finally {
      setRunning(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3">Validating sandbox isolation boundaries...</p>
      </div>
    );
  }

  if (error || !status) {
    return <ErrorState message={error || 'Failed to load isolation state'} onRetry={loadData} />;
  }

  // Group checks by category
  const categories = Array.from(new Set(checks.map((c) => c.category)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-[#44D7F2]" />
            <h1 className="text-xl font-bold text-[#E5EAF2]">
              Sandbox Isolation & Boundary Verification Center
            </h1>
          </div>
          <p className="text-xs text-[#8FA0BE] mt-1">
            Kernel isolation, non-root user validation, network segmentation, and host telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          {canRun && (
            <Button
              variant="primary"
              size="sm"
              loading={running}
              onClick={handleRunChecks}
              icon={<Play className="w-3.5 h-3.5" />}
            >
              Run Boundary Checks
            </Button>
          )}
        </div>
      </div>

      {/* Architecture Topology View */}
      <ArchitectureTopology status={status} />

      {/* 5-State Isolation Checks Table */}
      <Card
        title="Active Sandbox Isolation Checks"
        subtitle="Evaluated across container namespaces, capability drops, and read-only roots"
      >
        <div className="space-y-6">
          {categories.map((cat) => {
            const catChecks = checks.filter((c) => c.category === cat);
            return (
              <div key={cat} className="space-y-2">
                <h4 className="text-xs font-semibold text-[#8FA0BE] uppercase font-mono tracking-wider">
                  Category: {cat}
                </h4>
                <div className="divide-y divide-[#1D2942] border border-[#233252] rounded-lg overflow-hidden">
                  {catChecks.map((chk) => {
                    const isExpanded = expandedCheck === chk.id;
                    return (
                      <div key={chk.id} className="bg-[#141C2E] p-3 text-xs">
                        <div
                          className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                          onClick={() => setExpandedCheck(isExpanded ? null : chk.id)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-semibold text-[#44D7F2]">
                              {chk.check_key}
                            </span>
                            <span className="text-[#E5EAF2] font-medium">{chk.title}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-[#8FA0BE] font-mono">
                              Method: {chk.method}
                            </span>
                            <StatusPill status={chk.status} />
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-[#8FA0BE]" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#8FA0BE]" />
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-[#233252] space-y-2">
                            <div className="flex justify-between text-[11px] text-[#8FA0BE]">
                              <span>Environment: {chk.environment}</span>
                              <span>Timestamp: {new Date(chk.created_at).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[11px] text-[#8FA0BE] block mb-1">
                                Evidence Telemetry:
                              </span>
                              <pre className="p-3 bg-[#0A0E1A] border border-[#233252] rounded text-[11px] font-mono text-[#52D6A0] overflow-x-auto">
                                {JSON.stringify(chk.evidence, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Host Resource Telemetry with Provenance Badges */}
      {resources.length > 0 && (
        <Card
          title="Sandbox Host Resource Telemetry"
          subtitle="Real-time CPU, Memory, Disk, and Network I/O metrics"
          noPadding
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono">
                  <th className="py-2.5 px-3">Service</th>
                  <th className="py-2.5 px-3">Metric</th>
                  <th className="py-2.5 px-3">Value</th>
                  <th className="py-2.5 px-3">Provenance</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2942]">
                {resources.map((r) => (
                  <tr key={r.id} className="hover:bg-[#182238]">
                    <td className="py-2.5 px-3 font-mono text-[#44D7F2]">{r.service}</td>
                    <td className="py-2.5 px-3 font-medium text-[#E5EAF2]">{r.metric}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#E5EAF2]">
                      {r.value !== null ? `${r.value} ${r.unit}` : 'N/A'}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant="green">{r.provenance.toUpperCase()}</Badge>
                    </td>
                    <td className="py-2.5 px-3 text-[#8FA0BE] truncate max-w-xs">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

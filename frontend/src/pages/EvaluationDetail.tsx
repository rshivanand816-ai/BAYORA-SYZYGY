import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { EvaluationResults, EvaluationOut } from '../types/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { ErrorState } from '../components/common/ErrorState';
import { MetricCard } from '../components/common/MetricCard';
import {
  FileText,
  StopCircle,
  Play,
  RotateCcw,
  Shield,
  Layers,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lock,
} from 'lucide-react';

export const EvaluationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [results, setResults] = useState<EvaluationResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchResults = async () => {
    if (!id) return;
    try {
      const data = await api.getEvaluationResults(id);
      setResults(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load evaluation results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
    // Poll if running or queued
    const interval = setInterval(() => {
      if (results?.evaluation.status === 'running' || results?.evaluation.status === 'queued') {
        fetchResults();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [id, results?.evaluation.status]);

  const handleCancel = async () => {
    if (!id) return;
    try {
      setCancelling(true);
      await api.cancelEvaluation(id);
      await fetchResults();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel evaluation');
    } finally {
      setCancelling(false);
    }
  };

  if (loading && !results) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3">Fetching evaluation telemetry...</p>
      </div>
    );
  }

  if (error || !results) {
    return <ErrorState message={error || 'Evaluation not found'} onRetry={fetchResults} />;
  }

  const ev = results.evaluation;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#E5EAF2]">{ev.name}</h1>
            <Badge
              variant={
                ev.status === 'completed'
                  ? 'green'
                  : ev.status === 'running'
                  ? 'cyan'
                  : ev.status === 'failed'
                  ? 'red'
                  : 'yellow'
              }
            >
              {ev.status.toUpperCase()}
            </Badge>
            {ev.simulated && <Badge variant="yellow">SIMULATED</Badge>}
          </div>
          <p className="text-xs text-[#8FA0BE] font-mono mt-1">
            Trace ID: {ev.trace_id} · Evaluation ID: {ev.id}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {ev.status === 'running' && (
            <Button
              variant="danger"
              size="sm"
              loading={cancelling}
              onClick={handleCancel}
              icon={<StopCircle className="w-3.5 h-3.5" />}
            >
              Cancel Evaluation
            </Button>
          )}
          {ev.eval_type === 'interactive_probe' && ev.status === 'running' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/red')}
              icon={<Play className="w-3.5 h-3.5" />}
            >
              Red Workbench
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/reports/${ev.id}`)}
            icon={<FileText className="w-3.5 h-3.5" />}
          >
            Security Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchResults}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-3">
          <div className="text-[11px] text-[#8FA0BE]">Target Model</div>
          <div className="text-sm font-semibold text-[#44D7F2] font-mono mt-0.5">
            {ev.model.name}
          </div>
          <div className="text-[10px] text-[#8FA0BE] font-mono">
            {ev.model.version} ({ev.model.execution_mode})
          </div>
        </div>

        <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-3">
          <div className="text-[11px] text-[#8FA0BE]">Blue Guardrails</div>
          <div className="text-sm font-semibold text-[#5599FF] font-mono mt-0.5">
            Policy v{ev.defense.version}
          </div>
          <div className="text-[10px] text-[#8FA0BE] font-mono">
            Ref ID: {ev.defense.policy_version_id.substring(0, 8)}...
          </div>
        </div>

        <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-3">
          <div className="text-[11px] text-[#8FA0BE]">Probe Budget</div>
          <div className="text-sm font-semibold text-[#E5EAF2] font-mono mt-0.5">
            {ev.probes_used} / {ev.probe_budget}
          </div>
          <div className="text-[10px] text-[#8FA0BE]">
            Remaining: {ev.probe_budget - ev.probes_used}
          </div>
        </div>

        <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-3">
          <div className="text-[11px] text-[#8FA0BE]">Evaluation Type</div>
          <div className="text-sm font-semibold text-[#52D6A0] font-mono mt-0.5">
            {ev.eval_type}
          </div>
          <div className="text-[10px] text-[#8FA0BE]">
            Visibility: {results.payload_visibility}
          </div>
        </div>
      </div>

      {/* Evaluation Metrics with Provenance Badges */}
      {results.metrics.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-[#8FA0BE] tracking-wider uppercase font-mono">
            Measured Evaluation Metrics
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {results.metrics.map((m) => (
              <MetricCard key={m.key} metric={m} />
            ))}
          </div>
        </div>
      )}

      {/* Safety Findings List */}
      {results.findings.length > 0 && (
        <Card title={`Discovered Safety Findings (${results.findings.length})`}>
          <div className="space-y-3">
            {results.findings.map((f) => (
              <div
                key={f.id}
                className="p-3 bg-[#0E1524] border border-[#233252] rounded-lg space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#E5EAF2]">{f.title}</span>
                    <Badge
                      variant={
                        f.severity === 'critical' || f.severity === 'high'
                          ? 'red'
                          : f.severity === 'medium'
                          ? 'yellow'
                          : 'blue'
                      }
                    >
                      {f.severity.toUpperCase()}
                    </Badge>
                    <Badge variant="cyan">
                      EVIDENCE: {f.evidence_type.toUpperCase()}
                    </Badge>
                  </div>
                  <span className="text-[#8FA0BE] font-mono text-[10px]">
                    Conf: {f.confidence}
                  </span>
                </div>
                <p className="text-[#8FA0BE] text-xs leading-relaxed">{f.description}</p>
                <div className="text-[11px] text-[#52D6A0] bg-[#52D6A0]/5 p-2 rounded border border-[#52D6A0]/20">
                  <strong>Remediation:</strong> {f.remediation}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Executions Table */}
      <Card
        title={`Adversarial Executions (${results.executions.length})`}
        subtitle="Individual probe executions, policy enforcement decisions, and model responses"
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Outcome</th>
                <th className="py-2.5 px-3">Input Decision</th>
                <th className="py-2.5 px-3">Output Decision</th>
                <th className="py-2.5 px-3">Model Outcome</th>
                <th className="py-2.5 px-3">Latency</th>
                <th className="py-2.5 px-3">Canary Leak</th>
                <th className="py-2.5 px-3">Prompt Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D2942]">
              {results.executions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-[#8FA0BE] italic">
                    No executions recorded yet. Probes will appear here once executed.
                  </td>
                </tr>
              ) : (
                results.executions.map((ex) => (
                  <tr key={ex.id} className="hover:bg-[#182238] transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[#44D7F2]">#{ex.seq}</td>
                    <td className="py-2.5 px-3">
                      <Badge
                        variant={
                          ex.outcome === 'allowed'
                            ? 'green'
                            : ex.outcome.startsWith('blocked')
                            ? 'red'
                            : ex.outcome.startsWith('redacted')
                            ? 'yellow'
                            : 'blue'
                        }
                      >
                        {ex.outcome}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 font-mono">{ex.input_decision}</td>
                    <td className="py-2.5 px-3 font-mono">{ex.output_decision}</td>
                    <td className="py-2.5 px-3 font-mono">{ex.model_outcome}</td>
                    <td className="py-2.5 px-3 font-mono text-[#8FA0BE]">
                      {ex.latency_ms.toFixed(1)}ms
                    </td>
                    <td className="py-2.5 px-3">
                      {ex.canary_leaked_raw ? (
                        <span className="text-[#FF626F] font-semibold">LEAKED!</span>
                      ) : (
                        <span className="text-[#52D6A0]">Clean</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[#8FA0BE] truncate max-w-xs font-mono text-[11px]">
                      {ex.prompt_preview || <span className="italic text-[#8FA0BE]/50">Withheld</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

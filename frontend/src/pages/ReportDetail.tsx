import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { ErrorState } from '../components/common/ErrorState';
import { MetricCard } from '../components/common/MetricCard';
import {
  FileText,
  Download,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  FileCode,
  Flame,
} from 'lucide-react';

export const ReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const fetchReport = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getEvaluationReport(id);
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [id]);

  const handleDownloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bayora-report-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (!id) return;
    try {
      setDownloadingPdf(true);
      const blob = await api.downloadEvaluationReportPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bayora-security-report-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'PDF export failed');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3">Synthesizing audit-grade evaluation report...</p>
      </div>
    );
  }

  if (error || !report) {
    return <ErrorState message={error || 'Report unavailable'} onRetry={fetchReport} />;
  }

  const exec = report.executive_summary || {};
  const meta = report.metadata || {};

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#233252]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#E5EAF2]">
              {report.title || 'AI Safety Evaluation Security Report'}
            </h1>
            <Badge variant="cyan">AUDIT GRADE</Badge>
          </div>
          <p className="text-xs text-[#8FA0BE] font-mono mt-1">
            Generated: {report.generated_at} · Session ID: {id}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadJson}
            icon={<FileCode className="w-3.5 h-3.5" />}
          >
            Export JSON
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={downloadingPdf}
            onClick={handleDownloadPdf}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Download PDF Report
          </Button>
        </div>
      </div>

      {/* Executive Summary */}
      <Card title="Executive Summary">
        <div className="space-y-3 text-xs text-[#E5EAF2]">
          <p className="leading-relaxed">
            {exec.text ||
              'This security report documents adversarial evaluation results conducted within Bayora isolated test harness.'}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 bg-[#0E1524] rounded border border-[#233252]">
              <span className="text-[#8FA0BE] block text-[11px]">Total Executions:</span>
              <strong className="text-base font-mono text-[#E5EAF2]">
                {exec.total_cases || report.evaluations_count || 0}
              </strong>
            </div>
            <div className="p-3 bg-[#0E1524] rounded border border-[#233252]">
              <span className="text-[#8FA0BE] block text-[11px]">Attacks Blocked:</span>
              <strong className="text-base font-mono text-[#52D6A0]">
                {exec.blocked_attacks || 0}
              </strong>
            </div>
            <div className="p-3 bg-[#0E1524] rounded border border-[#233252]">
              <span className="text-[#8FA0BE] block text-[11px]">Output Leaks:</span>
              <strong className="text-base font-mono text-[#FF626F]">
                {exec.output_leaks || 0}
              </strong>
            </div>
            <div className="p-3 bg-[#0E1524] rounded border border-[#233252]">
              <span className="text-[#8FA0BE] block text-[11px]">Chain Integrity:</span>
              <strong className="text-base font-mono text-[#44D7F2]">
                {report.audit_chain_verified ? 'VERIFIED' : 'TAMPER-EVIDENT'}
              </strong>
            </div>
          </div>
        </div>
      </Card>

      {/* Target Model & Defense Configuration */}
      <Card title="Evaluation Environment & Target Configuration">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3 bg-[#0E1524] rounded border border-[#233252] space-y-1.5">
            <span className="text-[#8FA0BE] font-sans font-semibold block">Target Model</span>
            <div>Name: <span className="text-[#44D7F2]">{meta.model_name || 'Target LLM'}</span></div>
            <div>Version: <span className="text-[#E5EAF2]">{meta.model_version || 'v1.0'}</span></div>
            <div>Mode: <Badge variant="cyan">{meta.execution_mode || 'simulated'}</Badge></div>
          </div>

          <div className="p-3 bg-[#0E1524] rounded border border-[#233252] space-y-1.5">
            <span className="text-[#8FA0BE] font-sans font-semibold block">Blue Defense Configuration</span>
            <div>Policy Version: <span className="text-[#5599FF]">v{meta.defense_version || 1}</span></div>
            <div>Response Normalization: <span className="text-[#52D6A0]">{meta.normalization ? 'Enabled' : 'Disabled'}</span></div>
            <div>Latency Floor: <span className="text-[#E5EAF2]">{meta.latency_floor_ms || 0}ms</span></div>
          </div>
        </div>
      </Card>

      {/* Evaluation Metrics */}
      {report.metrics && report.metrics.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-[#8FA0BE] tracking-wider uppercase font-mono">
            Safety & Robustness Metrics
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {report.metrics.map((m: any) => (
              <MetricCard key={m.key} metric={m} />
            ))}
          </div>
        </div>
      )}

      {/* Findings with Statement Classification Badges */}
      {report.findings && report.findings.length > 0 && (
        <Card title={`Findings & Vulnerability Analysis (${report.findings.length})`}>
          <div className="space-y-3">
            {report.findings.map((f: any) => (
              <div
                key={f.id}
                className="p-3.5 bg-[#0E1524] border border-[#233252] rounded-lg space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#E5EAF2]">{f.title}</span>
                    <Badge
                      variant={
                        f.severity === 'critical' || f.severity === 'high'
                          ? 'red'
                          : f.severity === 'medium'
                          ? 'yellow'
                          : 'blue'
                      }
                    >
                      {f.severity?.toUpperCase()}
                    </Badge>
                    <Badge variant="cyan">
                      STATEMENT: {f.evidence_type?.toUpperCase() || 'OBSERVED'}
                    </Badge>
                  </div>
                  <span className="text-[#8FA0BE] font-mono text-[10px]">
                    Confidence: {f.confidence}
                  </span>
                </div>

                <p className="text-[#8FA0BE] leading-relaxed">{f.description}</p>

                {f.evidence_refs && f.evidence_refs.length > 0 && (
                  <div className="text-[11px] text-[#8FA0BE] font-mono">
                    Evidence Event IDs: {f.evidence_refs.join(', ')}
                  </div>
                )}

                <div className="p-2.5 rounded bg-[#52D6A0]/5 border border-[#52D6A0]/20 text-[11px] text-[#52D6A0]">
                  <strong>Remediation:</strong> {f.remediation}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Residual Risks and Limitations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {report.residual_risks && (
          <div className="p-4 bg-[#141C2E] border border-[#233252] rounded-lg space-y-2">
            <span className="font-semibold text-[#FF626F] flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              Residual Security Risks
            </span>
            <ul className="list-disc pl-5 space-y-1 text-[#8FA0BE]">
              {report.residual_risks.map((r: any, idx: number) => (
                <li key={idx}>
                  <strong>{r.threat || r}:</strong> {r.remaining || ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.limitations && (
          <div className="p-4 bg-[#141C2E] border border-[#233252] rounded-lg space-y-2">
            <span className="font-semibold text-[#F1BF62] flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Methodological Limitations
            </span>
            <ul className="list-disc pl-5 space-y-1 text-[#8FA0BE]">
              {report.limitations.map((lim: string, idx: number) => (
                <li key={idx}>{lim}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

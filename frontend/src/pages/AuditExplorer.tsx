import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  AuditEventOut,
  AuditVerifyResult,
  CheckpointOut,
  TamperDemoResult,
} from '../types/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { Modal } from '../components/common/Modal';
import { ErrorState } from '../components/common/ErrorState';
import {
  ScrollText,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Download,
  AlertTriangle,
  Key,
  CheckCircle2,
  XCircle,
  FileCode,
  Flame,
} from 'lucide-react';

export const AuditExplorer: React.FC = () => {
  const [events, setEvents] = useState<AuditEventOut[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actorFilter, setActorFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Verification result modal
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Checkpoints
  const [checkpoints, setCheckpoints] = useState<CheckpointOut[]>([]);
  const [creatingCheckpoint, setCreatingCheckpoint] = useState(false);

  // Tamper demo modal
  const [tamperResult, setTamperResult] = useState<TamperDemoResult | null>(null);
  const [runningTamper, setRunningTamper] = useState(false);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getAuditEvents({
        actor: actorFilter || undefined,
        category: categoryFilter || undefined,
        severity: severityFilter || undefined,
        limit: 50,
      });
      setEvents(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit ledger');
    } finally {
      setLoading(false);
    }
  };

  const fetchCheckpoints = async () => {
    try {
      const data = await api.getAuditCheckpoints();
      setCheckpoints(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchEvents();
    fetchCheckpoints();
  }, []);

  const handleVerifyChain = async () => {
    try {
      setVerifying(true);
      const res = await api.verifyAuditChain();
      setVerifyResult(res);
    } catch (err: any) {
      alert(err.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleCreateCheckpoint = async () => {
    try {
      setCreatingCheckpoint(true);
      const cp = await api.createAuditCheckpoint();
      setCheckpoints((prev) => [cp, ...prev]);
    } catch (err: any) {
      alert(err.message || 'Checkpoint creation failed');
    } finally {
      setCreatingCheckpoint(false);
    }
  };

  const handleRunTamperDemo = async () => {
    try {
      setRunningTamper(true);
      const res = await api.runTamperDemo();
      setTamperResult(res);
    } catch (err: any) {
      alert(err.message || 'Tamper demo failed');
    } finally {
      setRunningTamper(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await api.exportAuditLogs();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bayora-audit-export-${new Date().toISOString()}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-[#44D7F2]" />
            <h1 className="text-xl font-bold text-[#E5EAF2]">
              Tamper-Evident Audit Ledger Explorer
            </h1>
          </div>
          <p className="text-xs text-[#8FA0BE] mt-1">
            Append-only SHA-256 cryptographic hash-chained audit storage with Ed25519 signatures.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchEvents}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Export Logs (JSON)
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={verifying}
            onClick={handleVerifyChain}
            icon={<ShieldCheck className="w-3.5 h-3.5" />}
          >
            Verify Hash-Chain
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={runningTamper}
            onClick={handleRunTamperDemo}
            icon={<Flame className="w-3.5 h-3.5" />}
          >
            Run Tamper Demo
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-3 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="block text-[#8FA0BE] mb-1">Actor:</label>
          <input
            type="text"
            placeholder="Filter actor..."
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-[#0E1524] border border-[#233252] rounded text-white"
          />
        </div>

        <div>
          <label className="block text-[#8FA0BE] mb-1">Category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-[#0E1524] border border-[#233252] rounded text-white"
          >
            <option value="">All Categories</option>
            <option value="auth">auth</option>
            <option value="eval">eval</option>
            <option value="policy">policy</option>
            <option value="shadowpolicy">shadowpolicy</option>
            <option value="security">security</option>
          </select>
        </div>

        <div>
          <label className="block text-[#8FA0BE] mb-1">Severity:</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-[#0E1524] border border-[#233252] rounded text-white"
          >
            <option value="">All Severities</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>

        <div className="flex items-end">
          <Button variant="secondary" size="sm" onClick={fetchEvents} className="w-full">
            Apply Filters
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={fetchEvents} />}

      {/* Events Table */}
      {loading && events.length === 0 ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase">
                  <th className="py-2.5 px-3">Seq</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Prev Hash</th>
                  <th className="py-2.5 px-3">Current Hash</th>
                  <th className="py-2.5 px-3 font-sans">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2942]">
                {events.map((evt) => (
                  <tr key={evt.event_id} className="hover:bg-[#182238] transition-colors">
                    <td className="py-2.5 px-3 text-[#44D7F2]">#{evt.seq}</td>
                    <td className="py-2.5 px-3 text-[#8FA0BE] text-[11px]">
                      {new Date(evt.ts).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 text-[#E5EAF2]">{evt.actor}</td>
                    <td className="py-2.5 px-3 font-sans">
                      <Badge variant="blue" size="sm">
                        {evt.category}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 font-sans">
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
                    <td
                      className="py-2.5 px-3 text-[#8FA0BE] text-[10px] truncate max-w-[90px]"
                      title={evt.prev_hash}
                    >
                      {evt.prev_hash.substring(0, 10)}...
                    </td>
                    <td
                      className="py-2.5 px-3 text-[#44D7F2] text-[10px] truncate max-w-[90px]"
                      title={evt.hash}
                    >
                      {evt.hash.substring(0, 10)}...
                    </td>
                    <td className="py-2.5 px-3 font-sans text-[#E5EAF2] truncate max-w-xs">
                      {evt.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Signed Checkpoints Section */}
      <Card
        title="Cryptographic Checkpoints (Ed25519 Signatures)"
        subtitle="Periodic digital signatures anchoring the hash-chain head"
        action={
          <Button
            variant="outline"
            size="sm"
            loading={creatingCheckpoint}
            onClick={handleCreateCheckpoint}
            icon={<Key className="w-3.5 h-3.5" />}
          >
            Create Signed Checkpoint
          </Button>
        }
      >
        <div className="space-y-2">
          {checkpoints.length === 0 ? (
            <p className="text-xs text-[#8FA0BE] italic">No signed checkpoints generated yet.</p>
          ) : (
            checkpoints.map((cp) => (
              <div
                key={cp.id}
                className="p-3 bg-[#0E1524] border border-[#233252] rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#52D6A0]">Checkpoint @ Seq #{cp.seq}</span>
                    <Badge variant="green">{cp.algorithm}</Badge>
                  </div>
                  <div className="text-[10px] text-[#8FA0BE] truncate max-w-md mt-1">
                    Head Hash: {cp.head_hash}
                  </div>
                </div>
                <div className="text-[11px] text-[#8FA0BE]">
                  {new Date(cp.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Verify Result Modal */}
      {verifyResult && (
        <Modal
          isOpen={Boolean(verifyResult)}
          onClose={() => setVerifyResult(null)}
          title="Hash-Chain Integrity Verification Result"
          footer={
            <Button variant="primary" size="sm" onClick={() => setVerifyResult(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-lg bg-[#0E1524] border border-[#233252] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#8FA0BE]">Overall Status:</span>
                {verifyResult.ok ? (
                  <Badge variant="green">INTEGRITY VERIFIED PASS</Badge>
                ) : (
                  <Badge variant="red">CHAIN TAMPER / GAP DETECTED</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8FA0BE]">Events Checked:</span>
                <span className="font-mono text-[#E5EAF2]">{verifyResult.checked}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8FA0BE]">Chain Head Seq:</span>
                <span className="font-mono text-[#44D7F2]">#{verifyResult.head_seq}</span>
              </div>
              <div>
                <span className="text-[#8FA0BE] block mb-1">Head Hash:</span>
                <code className="text-[11px] font-mono text-[#52D6A0] break-all">
                  {verifyResult.head_hash}
                </code>
              </div>
            </div>

            {verifyResult.failures.length > 0 && (
              <div className="p-3 bg-[#FF626F]/10 border border-[#FF626F]/30 rounded text-[#FF626F] space-y-1">
                <strong>Detected Failures:</strong>
                {verifyResult.failures.map((f, idx) => (
                  <div key={idx} className="text-[11px] font-mono">
                    Seq #{f.seq}: {f.kind} (Expected: {f.expected?.substring(0, 10)}... vs Actual:{' '}
                    {f.actual?.substring(0, 10)}...)
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Tamper Demonstration Result Modal */}
      {tamperResult && (
        <Modal
          isOpen={Boolean(tamperResult)}
          onClose={() => setTamperResult(null)}
          title="Isolated Tamper Demonstration"
          maxWidth="lg"
          footer={
            <Button variant="primary" size="sm" onClick={() => setTamperResult(null)}>
              Done
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#44D7F2]/10 border border-[#44D7F2]/30 rounded text-[#44D7F2]">
              <strong>Security Architecture Demonstration:</strong> {tamperResult.note}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-[#0E1524] border border-[#52D6A0]/40 rounded-lg space-y-2">
                <div className="font-semibold text-[#52D6A0] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Original Chain State
                </div>
                <div className="text-[11px] text-[#8FA0BE]">
                  Verified {tamperResult.original.checked} events.
                </div>
                <Badge variant="green">CHAIN OK: PASS</Badge>
              </div>

              <div className="p-3 bg-[#0E1524] border border-[#FF626F]/40 rounded-lg space-y-2">
                <div className="font-semibold text-[#FF626F] flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" />
                  Tampered Fixture Chain
                </div>
                <div className="text-[11px] text-[#8FA0BE]">
                  Modified field: <code>{tamperResult.tampered_field}</code> at Seq #{tamperResult.tampered_seq}
                </div>
                <Badge variant="red">TAMPER DETECTED: FAIL</Badge>
              </div>
            </div>

            <p className="text-[11px] text-[#8FA0BE] leading-relaxed">
              Demonstrates that any retroactive modification of an event payload or hash pointer invalidates subsequent SHA-256 links, proving the ledger is tamper-evident.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};

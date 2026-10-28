import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  DefensePolicyOut,
  PolicyVersionOut,
  DefenseSummary,
  ComparisonOut,
  PolicyConfig,
  PolicyRule,
} from '../types/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { MetricCard } from '../components/common/MetricCard';
import { Spinner } from '../components/common/Spinner';
import { Tabs } from '../components/common/Tabs';
import { Modal } from '../components/common/Modal';
import { ErrorState } from '../components/common/ErrorState';
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  Play,
  RotateCcw,
  FileCode,
  Layers,
  Sliders,
  TrendingDown,
  Lock,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

/**
 * Render a measured comparison value.
 *
 * `null` means "not observable" (the metric had no observations in that
 * denominator). It must never be displayed as 0, because 0 is a measurement.
 */
const formatMetric = (v: unknown): string => {
  if (v === null || v === undefined) return 'n/a';
  if (typeof v === 'number') return v.toFixed(2);
  return String(v);
};

export const BlueConsole: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'policies' | 'summary' | 'mitigations'>('policies');
  const [policies, setPolicies] = useState<DefensePolicyOut[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [versions, setVersions] = useState<PolicyVersionOut[]>([]);
  const [summary, setSummary] = useState<DefenseSummary | null>(null);
  const [mitigations, setMitigations] = useState<ComparisonOut[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New version modal
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('Added enhanced prompt injection rules and response normalization');
  const [inputRules, setInputRules] = useState<PolicyRule[]>([
    {
      id: 'IR-01',
      description: 'Block DAN jailbreak phrases',
      kind: 'regex',
      pattern: '(?i)(do anything now|bypass guardrails)',
      action: 'block',
      category: 'jailbreak',
      explanation_code: 'ERR_JAILBREAK_DETECTED',
      enabled: true,
    },
  ]);
  const [responseNorm, setResponseNorm] = useState(true);
  const [normMessage, setNormMessage] = useState('This request cannot be completed under the active evaluation policy.');
  const [latencyFloor, setLatencyFloor] = useState(150);
  const [savingVersion, setSavingVersion] = useState(false);

  // Mitigation comparison form
  const [baselineVersionId, setBaselineVersionId] = useState<string>('');
  const [mitigatedVersionId, setMitigatedVersionId] = useState<string>('');
  const [comparing, setComparing] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [policiesData, summaryData, mitigationsData] = await Promise.all([
        api.getBluePolicies(),
        api.getDefenseSummary(),
        api.getMitigations(),
      ]);
      setPolicies(policiesData);
      setSummary(summaryData);
      setMitigations(mitigationsData);

      if (policiesData.length > 0) {
        setSelectedPolicyId(policiesData[0].id);
        const vers = await api.getPolicyVersions(policiesData[0].id);
        setVersions(vers);
        if (vers.length >= 2) {
          setBaselineVersionId(vers[vers.length - 1].id);
          setMitigatedVersionId(vers[0].id);
        } else if (vers.length === 1) {
          setBaselineVersionId(vers[0].id);
          setMitigatedVersionId(vers[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Blue Team defense data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectPolicy = async (policyId: string) => {
    setSelectedPolicyId(policyId);
    try {
      const vers = await api.getPolicyVersions(policyId);
      setVersions(vers);
    } catch {
      // ignore
    }
  };

  const handleSaveVersion = async () => {
    if (!selectedPolicyId || !changeNote.trim()) return;
    try {
      setSavingVersion(true);
      const config: PolicyConfig = {
        input_rules: inputRules,
        output_rules: [
          {
            id: 'OR-01',
            description: 'Redact canary markers from model output',
            kind: 'substring',
            pattern: 'BAYORA_CANARY_',
            action: 'redact',
            category: 'canary_leak',
            explanation_code: 'OR_CANARY_REDACTED',
            enabled: true,
            replacement: '[CONFIDENTIAL_CANARY_REDACTED]',
          },
        ],
        injection_heuristics: {
          enabled: true,
          threshold: 2,
          keywords: ['ignore previous instructions', 'system prompt', 'you are now'],
          action: 'block',
        },
        max_input_chars: 4000,
        response_normalization: responseNorm,
        normalized_message: normMessage,
        latency_floor_ms: latencyFloor,
        log_mode: 'redacted',
        canary_markers: ['BAYORA_CANARY_V1'],
      };

      await api.createPolicyVersion(selectedPolicyId, {
        config,
        change_note: changeNote,
      });

      setIsEditorOpen(false);
      await handleSelectPolicy(selectedPolicyId);
      const summaryData = await api.getDefenseSummary();
      setSummary(summaryData);
    } catch (err: any) {
      alert(err.message || 'Failed to deploy new policy version');
    } finally {
      setSavingVersion(false);
    }
  };

  const handleRunComparison = async () => {
    if (!baselineVersionId || !mitigatedVersionId) return;
    try {
      setComparing(true);
      const comp = await api.runMitigationComparison({
        baseline_policy_version_id: baselineVersionId,
        mitigated_policy_version_id: mitigatedVersionId,
        n_facts: 4,
        probe_budget: 20,
      });
      setMitigations((prev) => [comp, ...prev]);
    } catch (err: any) {
      alert(err.message || 'Comparison failed');
    } finally {
      setComparing(false);
    }
  };

  if (loading && policies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3">Loading defense guardrails and policy engine...</p>
      </div>
    );
  }

  const selectedPolicy = policies.find((p) => p.id === selectedPolicyId);

  return (
    <div className="space-y-6">
      {/* Blue Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#5599FF]" />
            <h1 className="text-xl font-bold text-[#E5EAF2]">Blue Team Defense Console</h1>
          </div>
          <p className="text-xs text-[#8FA0BE] mt-1">
            Configure input/output guardrails, response normalization, and evaluate mitigation efficacy.
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
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsEditorOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New Policy Version
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* Navigation Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
        tabs={[
          { id: 'policies', label: 'Policy Versions & Rules', icon: <FileCode className="w-4 h-4" /> },
          { id: 'summary', label: 'Defense Telemetry & Rates', icon: <Sliders className="w-4 h-4" /> },
          { id: 'mitigations', label: 'Mitigation Comparisons', icon: <TrendingDown className="w-4 h-4" /> },
        ]}
      />

      {/* TAB 1: POLICIES */}
      {activeTab === 'policies' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Policy selector */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[#8FA0BE] tracking-wider uppercase font-mono">
              Managed Policies
            </h3>
            {policies.map((pol) => (
              <div
                key={pol.id}
                onClick={() => handleSelectPolicy(pol.id)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedPolicyId === pol.id
                    ? 'border-[#5599FF] bg-[#5599FF]/10 ring-1 ring-[#5599FF]'
                    : 'border-[#233252] bg-[#141C2E] hover:border-[#384F7E]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-[#E5EAF2]">{pol.name}</span>
                  <Badge variant="blue">{pol.version_count} versions</Badge>
                </div>
                <p className="text-xs text-[#8FA0BE] mt-1">{pol.description}</p>
              </div>
            ))}
          </div>

          {/* Version History & Rules */}
          <div className="lg:col-span-2 space-y-4">
            <Card
              title={
                <div className="flex items-center justify-between">
                  <span>Version History for {selectedPolicy?.name}</span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsEditorOpen(true)}
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Deploy Version
                  </Button>
                </div>
              }
              noPadding
            >
              <div className="divide-y divide-[#1D2942]">
                {versions.map((ver) => (
                  <div key={ver.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[#E5EAF2]">
                          Version {ver.version}
                        </span>
                        {ver.deployed && <Badge variant="green">DEPLOYED</Badge>}
                        <span className="text-[10px] text-[#8FA0BE] font-mono">
                          SHA: {ver.config_sha256.substring(0, 10)}...
                        </span>
                      </div>
                      <span className="text-[11px] text-[#8FA0BE]">
                        {new Date(ver.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-[#8FA0BE]">{ver.change_note}</p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px]">
                      <div className="p-2 bg-[#0E1524] rounded border border-[#233252]">
                        <span className="text-[#8FA0BE] block">Input Rules:</span>
                        <strong className="text-[#E5EAF2]">
                          {ver.config.input_rules?.length || 0}
                        </strong>
                      </div>
                      <div className="p-2 bg-[#0E1524] rounded border border-[#233252]">
                        <span className="text-[#8FA0BE] block">Output Rules:</span>
                        <strong className="text-[#E5EAF2]">
                          {ver.config.output_rules?.length || 0}
                        </strong>
                      </div>
                      <div className="p-2 bg-[#0E1524] rounded border border-[#233252]">
                        <span className="text-[#8FA0BE] block">Normalization:</span>
                        <strong className={ver.config.response_normalization ? 'text-[#52D6A0]' : 'text-[#8FA0BE]'}>
                          {ver.config.response_normalization ? 'ENABLED' : 'DISABLED'}
                        </strong>
                      </div>
                      <div className="p-2 bg-[#0E1524] rounded border border-[#233252]">
                        <span className="text-[#8FA0BE] block">Latency Floor:</span>
                        <strong className="text-[#E5EAF2]">
                          {ver.config.latency_floor_ms}ms
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: DEFENSE TELEMETRY & RATES */}
      {activeTab === 'summary' && summary && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card noPadding className="p-4">
              <span className="text-xs text-[#8FA0BE]">Total Blocked Inputs</span>
              <div className="text-2xl font-bold font-mono text-[#FF626F] my-2">
                {summary.counts.blocked || 0}
              </div>
              <span className="text-[11px] text-[#8FA0BE]">Filter rule matches</span>
            </Card>

            <Card noPadding className="p-4">
              <span className="text-xs text-[#8FA0BE]">Redacted Outputs</span>
              <div className="text-2xl font-bold font-mono text-[#F1BF62] my-2">
                {summary.counts.redacted || 0}
              </div>
              <span className="text-[11px] text-[#8FA0BE]">Canary & PII tokens masked</span>
            </Card>

            <MetricCard metric={summary.false_positive_rate} />
            <MetricCard metric={summary.false_negative_rate} />
          </div>

          <div className="p-3 bg-[#0E1524] border border-[#233252] rounded-lg text-xs text-[#8FA0BE]">
            <strong>Payload Visibility Policy:</strong> {summary.payload_visibility_note}
          </div>
        </div>
      )}

      {/* TAB 3: MITIGATION COMPARISONS */}
      {activeTab === 'mitigations' && (
        <div className="space-y-6">
          {/* Comparison launcher */}
          <Card title="Run Before/After Mitigation Leakage Assessment">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                  Baseline (Unmitigated) Version:
                </label>
                <select
                  value={baselineVersionId}
                  onChange={(e) => setBaselineVersionId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-xs text-white"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} ({v.change_note.substring(0, 30)}...)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                  Mitigated (Hardened) Version:
                </label>
                <select
                  value={mitigatedVersionId}
                  onChange={(e) => setMitigatedVersionId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-xs text-white"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} ({v.change_note.substring(0, 30)}...)
                    </option>
                  ))}
                </select>
              </div>

              <Button
                variant="primary"
                size="md"
                loading={comparing}
                disabled={!baselineVersionId || !mitigatedVersionId}
                onClick={handleRunComparison}
                icon={<Play className="w-3.5 h-3.5" />}
              >
                Compare Blind Inference Leakage
              </Button>
            </div>
          </Card>

          {/* Mitigations comparison list */}
          <div className="space-y-4">
            {mitigations.map((comp) => {
              const summaryData = comp.summary;
              // Only ever render numbers that the backend actually measured.
              // There is no fallback table: a comparison without a recorded
              // metrics table shows an explicit "no data" state instead of
              // invented baseline/mitigated values.
              const metricsTable: any[] = Array.isArray(summaryData?.metrics_table)
                ? summaryData.metrics_table
                : [];

              return (
                <Card
                  key={comp.id}
                  title={`Comparison #${comp.id.substring(0, 8)}: Baseline v Mitigated`}
                  subtitle={`Conducted at ${new Date(comp.created_at).toLocaleString()}`}
                >
                  <div className="space-y-4">
                    {metricsTable.length === 0 ? (
                      <div className="rounded border border-[#233252] bg-[#0E1524] p-4">
                        <p className="text-sm font-semibold text-[#F1BF62]">No comparison data recorded</p>
                        <p className="mt-1 text-xs text-[#8FA0BE]">
                          This comparison has status{' '}
                          <span className="font-mono">{comp.status}</span> and no measured metrics table.
                          Nothing is displayed here because no round was scored. Run the comparison again and
                          check the audit trail for the reason.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="h-56 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metricsTable}>
                              <XAxis dataKey="metric" stroke="#8FA0BE" fontSize={11} />
                              <YAxis stroke="#8FA0BE" fontSize={11} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#141C2E',
                                  borderColor: '#233252',
                                  fontSize: '11px',
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: '11px' }} />
                              <Bar dataKey="baseline" name="Baseline (Raw)" fill="#FF626F" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="mitigated" name="Mitigated (Hardened)" fill="#52D6A0" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-[#233252] text-[#8FA0BE] text-[10px] uppercase font-mono">
                              <th className="py-2 px-3">Leakage Metric</th>
                              <th className="py-2 px-3">Baseline</th>
                              <th className="py-2 px-3">Mitigated</th>
                              <th className="py-2 px-3">Delta (Improvement)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1D2942]">
                            {metricsTable.map((row: any, rIdx: number) => (
                              <tr key={rIdx}>
                                <td className="py-2 px-3 font-semibold text-[#E5EAF2]">
                                  {row.metric}
                                </td>
                                <td className="py-2 px-3 font-mono text-[#FF626F]">
                                  {formatMetric(row.baseline)}
                                </td>
                                <td className="py-2 px-3 font-mono text-[#52D6A0]">
                                  {formatMetric(row.mitigated)}
                                </td>
                                <td className="py-2 px-3 font-mono text-[#44D7F2]">
                                  {formatMetric(row.delta)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {summaryData?.conclusion && (
                      <div className="rounded border border-[#233252] bg-[#0E1524] p-3">
                        <span className="text-[10px] uppercase font-mono text-[#8FA0BE]">Derived conclusion</span>
                        <p className="mt-1 text-xs text-[#E5EAF2]">{summaryData.conclusion}</p>
                      </div>
                    )}
                    {Array.isArray(summaryData?.limitations) && summaryData.limitations.length > 0 && (
                      <ul className="list-disc pl-5 text-[11px] text-[#8FA0BE]">
                        {summaryData.limitations.map((lim: string, i: number) => (
                          <li key={i}>{lim}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Deploy New Version Modal */}
      <Modal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title="Deploy New Policy Version"
        maxWidth="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={savingVersion}
              onClick={handleSaveVersion}
            >
              Deploy Version
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-[#8FA0BE] mb-1">Change Note</label>
            <input
              type="text"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-white"
            />
          </div>

          <div className="p-3 bg-[#0E1524] border border-[#233252] rounded space-y-3">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-[#E5EAF2]">
              <input
                type="checkbox"
                checked={responseNorm}
                onChange={(e) => setResponseNorm(e.target.checked)}
                className="accent-[#44D7F2]"
              />
              <span>Enable Response Normalization (Prevents Side-Channel Leakage)</span>
            </label>

            {responseNorm && (
              <div>
                <label className="block text-[11px] text-[#8FA0BE] mb-1">
                  Normalized Block Message:
                </label>
                <input
                  type="text"
                  value={normMessage}
                  onChange={(e) => setNormMessage(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#141C2E] border border-[#233252] rounded text-white"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] text-[#8FA0BE] mb-1">
                Timing Defense Floor (ms): {latencyFloor}ms
              </label>
              <input
                type="range"
                min="0"
                max="500"
                step="50"
                value={latencyFloor}
                onChange={(e) => setLatencyFloor(Number(e.target.value))}
                className="w-full accent-[#44D7F2]"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

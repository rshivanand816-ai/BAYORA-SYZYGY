import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  EvaluationOut,
  ProbeBudget,
  ProbeResult,
  TestCaseOut,
} from '../types/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { ErrorState } from '../components/common/ErrorState';
import {
  Crosshair,
  Send,
  Zap,
  Clock,
  ShieldAlert,
  Bot,
  Layers,
  RotateCcw,
  AlertTriangle,
  Lock,
} from 'lucide-react';

export const RedWorkbench: React.FC = () => {
  const [evaluations, setEvaluations] = useState<EvaluationOut[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState<string>('');
  const [budget, setBudget] = useState<ProbeBudget | null>(null);
  const [history, setHistory] = useState<ProbeResult[]>([]);
  const [testCases, setTestCases] = useState<TestCaseOut[]>([]);

  const [prompt, setPrompt] = useState<string>('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [latestResult, setLatestResult] = useState<ProbeResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load evaluations list
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const evals = await api.getEvaluations();
        setEvaluations(evals);
        // Find running or interactive eval
        const active =
          evals.find((e) => e.status === 'running' || e.eval_type === 'interactive_probe') ||
          evals[0];
        if (active) {
          setSelectedEvalId(active.id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load evaluations');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // When selected eval changes, load budget, history, and test cases if available
  useEffect(() => {
    if (!selectedEvalId) return;

    const loadEvalData = async () => {
      try {
        const [bData, redResults] = await Promise.all([
          api.getProbeBudget(selectedEvalId),
          api.getRedResults(selectedEvalId),
        ]);
        setBudget(bData);
        setHistory(redResults.executions || []);

        const currentEval = evaluations.find((e) => e.id === selectedEvalId);
        if (currentEval?.suite?.id) {
          try {
            const cases = await api.getTestSuiteCases(currentEval.suite.id);
            setTestCases(cases);
          } catch {
            setTestCases([]);
          }
        } else {
          setTestCases([]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to refresh probe data');
      }
    };

    loadEvalData();
  }, [selectedEvalId]);

  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    const tc = testCases.find((c) => c.id === caseId);
    if (tc) {
      setPrompt(tc.input_preview);
    }
  };

  const handleSubmitProbe = async () => {
    if (!selectedEvalId || !prompt.trim()) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.submitProbe(selectedEvalId, {
        prompt,
        test_case_id: selectedCaseId || null,
      });
      setLatestResult(res);
      // update history
      setHistory((prev) => [res, ...prev]);
      // update budget
      if (budget) {
        setBudget({
          ...budget,
          probes_used: res.probes_used,
          remaining: res.probe_budget - res.probes_used,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit adversarial probe');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedEval = evaluations.find((e) => e.id === selectedEvalId);

  if (loading && evaluations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3">Loading Red Team workbench...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workbench Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-[#FF626F]" />
            <h1 className="text-xl font-bold text-[#E5EAF2]">Red Team Adversarial Workbench</h1>
          </div>
          <p className="text-xs text-[#8FA0BE] mt-1">
            Submit custom attack payloads and analyze model responses against hidden defense filters.
          </p>
        </div>

        {/* Evaluation Session Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-[#8FA0BE]">Target Session:</label>
          <select
            value={selectedEvalId}
            onChange={(e) => setSelectedEvalId(e.target.value)}
            className="px-3 py-1.5 bg-[#141C2E] border border-[#233252] rounded text-xs text-white focus:outline-none focus:border-[#44D7F2]"
          >
            {evaluations.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({ev.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-[#FF626F]/10 border border-[#FF626F]/30 rounded text-xs text-[#FF626F]">
          {error}
        </div>
      )}

      {/* Target Session Status Bar */}
      {selectedEval && (
        <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-[#8FA0BE]">Target Model:</span>
            <div className="font-semibold text-[#44D7F2] font-mono mt-0.5">
              {selectedEval.model.name} ({selectedEval.model.version})
            </div>
            {selectedEval.simulated && <Badge variant="yellow">SIMULATED</Badge>}
          </div>

          <div>
            <span className="text-[#8FA0BE]">Blue Guardrail Version:</span>
            <div className="font-semibold text-[#5599FF] font-mono mt-0.5">
              Policy v{selectedEval.defense.version}
            </div>
            <span className="text-[10px] text-[#8FA0BE]">Rules hidden from Red</span>
          </div>

          <div>
            <span className="text-[#8FA0BE]">Probe Budget Remaining:</span>
            <div className="font-semibold text-[#E5EAF2] font-mono mt-0.5">
              {budget ? `${budget.remaining} / ${budget.probe_budget}` : 'Loading...'}
            </div>
            <div className="w-full bg-[#233252] h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-[#44D7F2] h-full"
                style={{
                  width: `${
                    budget ? (budget.remaining / budget.probe_budget) * 100 : 100
                  }%`,
                }}
              ></div>
            </div>
          </div>

          <div>
            <span className="text-[#8FA0BE]">Session Status:</span>
            <div className="font-semibold text-[#52D6A0] font-mono mt-0.5">
              {selectedEval.status.toUpperCase()}
            </div>
            <span className="text-[10px] text-[#8FA0BE] font-mono">
              Trace: {selectedEval.trace_id.substring(0, 10)}...
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Probe Submission Console */}
        <div className="space-y-4">
          <Card title="Adversarial Probe Injector">
            <div className="space-y-3">
              {testCases.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                    Pre-populate from Suite Test Case:
                  </label>
                  <select
                    value={selectedCaseId}
                    onChange={(e) => handleSelectCase(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0E1524] border border-[#233252] rounded text-xs text-white focus:outline-none focus:border-[#44D7F2]"
                  >
                    <option value="">-- Choose a benchmark attack case --</option>
                    {testCases.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        [{tc.category}] {tc.title} ({tc.severity})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                  Adversarial Prompt Payload:
                </label>
                <textarea
                  rows={8}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter adversarial prompt, prompt injection payload, jailbreak sequence, or canary probe..."
                  className="w-full p-3 bg-[#0E1524] border border-[#233252] rounded text-xs text-[#E5EAF2] font-mono placeholder-[#8FA0BE]/40 focus:outline-none focus:border-[#44D7F2] focus:ring-1 focus:ring-[#44D7F2]"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-[#8FA0BE]">
                  {prompt.length} characters · Budget cost: 1 probe
                </span>
                <Button
                  variant="primary"
                  size="md"
                  loading={submitting}
                  disabled={!prompt.trim() || (budget !== null && budget.remaining <= 0)}
                  onClick={handleSubmitProbe}
                  icon={<Send className="w-3.5 h-3.5" />}
                >
                  Submit Adversarial Probe
                </Button>
              </div>
            </div>
          </Card>

          {/* Response Inspector */}
          {latestResult && (
            <Card title="Latest Probe Inspection Result" className="border-[#44D7F2]/40">
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#233252]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#E5EAF2]">Status:</span>
                    <Badge
                      variant={
                        latestResult.status_class === 'allowed'
                          ? 'green'
                          : latestResult.status_class === 'blocked'
                          ? 'red'
                          : 'yellow'
                      }
                    >
                      {latestResult.status_class.toUpperCase()}
                    </Badge>
                    <span className="text-[#8FA0BE] font-mono">
                      HTTP {latestResult.http_status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-[#8FA0BE]">
                    <Clock className="w-3 h-3 text-[#44D7F2]" />
                    <span>{latestResult.latency_ms.toFixed(1)}ms total</span>
                  </div>
                </div>

                {/* Explanation: Defense Block vs Model Refusal */}
                <div className="p-3 bg-[#0E1524] border border-[#233252] rounded-lg space-y-2">
                  <div className="font-semibold text-[#E5EAF2] flex items-center justify-between">
                    <span>Enforcement Layer Analysis</span>
                    <span className="text-[10px] text-[#8FA0BE] font-mono">
                      Public code: {latestResult.defense_decision.public_code}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-[#8FA0BE]">Defense Decision:</span>
                      <div className="font-mono text-[#44D7F2]">
                        Input: {latestResult.defense_decision.input} / Output:{' '}
                        {latestResult.defense_decision.output}
                      </div>
                    </div>
                    <div>
                      <span className="text-[#8FA0BE]">Target Model Outcome:</span>
                      <div className="font-mono text-[#5599FF]">
                        {latestResult.model_outcome}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-[#8FA0BE] border-t border-[#233252]/60 pt-1.5">
                    <strong>Distinction:</strong>{' '}
                    {latestResult.defense_decision.input === 'block'
                      ? 'Defense layer blocked request before model execution.'
                      : latestResult.model_outcome === 'refusal'
                      ? 'Model generated an internal refusal independently.'
                      : 'Request reached target model and output was processed.'}
                  </div>
                </div>

                <div>
                  <span className="text-[#8FA0BE] font-medium">Response Content:</span>
                  <div className="mt-1 p-3 bg-[#0A0E1A] border border-[#233252] rounded text-xs text-[#E5EAF2] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {latestResult.response_text}
                  </div>
                </div>

                <div className="text-[11px] text-[#8FA0BE] flex items-center justify-between">
                  <span>Finding: {latestResult.finding_summary}</span>
                  <span className="font-mono">Execution #{latestResult.seq}</span>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right: Probe History */}
        <div>
          <Card
            title={`Probe Submission History (${history.length})`}
            subtitle="Real-time log of executed adversarial probes in this session"
            noPadding
          >
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono sticky top-0">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Latency</th>
                    <th className="py-2 px-3">Prompt Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D2942]">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[#8FA0BE] italic">
                        No probes submitted yet in this session.
                      </td>
                    </tr>
                  ) : (
                    history.map((h) => (
                      <tr
                        key={h.execution_id}
                        onClick={() => setLatestResult(h)}
                        className="hover:bg-[#182238] transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-3 font-mono text-[#44D7F2]">#{h.seq}</td>
                        <td className="py-2.5 px-3">
                          <Badge
                            variant={
                              h.status_class === 'allowed'
                                ? 'green'
                                : h.status_class === 'blocked'
                                ? 'red'
                                : 'yellow'
                            }
                          >
                            {h.status_class}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#8FA0BE]">
                          {h.latency_ms.toFixed(0)}ms
                        </td>
                        <td className="py-2.5 px-3 text-[#8FA0BE] truncate max-w-xs font-mono text-[11px]">
                          {h.prompt_preview}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

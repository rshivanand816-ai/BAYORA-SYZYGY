import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import {
  RoundDetail,
  RoundResults,
  CommitmentVerification,
  SPGuessAction,
  SPGuess,
} from '../types/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { Modal } from '../components/common/Modal';
import { ErrorState } from '../components/common/ErrorState';
import {
  Ghost,
  Lock,
  Unlock,
  CheckCircle2,
  Copy,
  Clock,
  Send,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  HelpCircle,
} from 'lucide-react';

export const ShadowPolicyRoundDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, hasRole } = useAuth();

  const [detail, setDetail] = useState<RoundDetail | null>(null);
  const [results, setResults] = useState<RoundResults | null>(null);
  const [verification, setVerification] = useState<CommitmentVerification | null>(null);

  const [probeText, setProbeText] = useState('');
  const [submittingProbe, setSubmittingProbe] = useState(false);

  // Guesses state
  const [guesses, setGuesses] = useState<Record<string, SPGuessAction>>({});
  const [lockingGuesses, setLockingGuesses] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);

  const [startingRound, setStartingRound] = useState(false);
  const [finalizingRound, setFinalizingRound] = useState(false);
  const [verifyingCommitment, setVerifyingCommitment] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const fetchRound = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSPRound(id);
      setDetail(data);

      // Initialize guesses map from existing guesses or defaults
      const gMap: Record<string, SPGuessAction> = {};
      data.catalog.subjects.forEach((s) => {
        const existing = data.guesses.find((g) => g.subject_id === s.subject_id);
        gMap[s.subject_id] = existing ? existing.action : 'not_enforced';
      });
      setGuesses(gMap);

      // If finalized, fetch results
      if (data.round.status === 'finalized') {
        const res = await api.getSPResults(id);
        setResults(res);
        setVerification(res.commitment_verification);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load round details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRound();
  }, [id]);

  const handleCopyCommitment = () => {
    if (detail?.round.commitment) {
      navigator.clipboard.writeText(detail.round.commitment);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleStartRound = async () => {
    if (!id) return;
    try {
      setStartingRound(true);
      await api.startSPRound(id);
      await fetchRound();
    } catch (err: any) {
      alert(err.message || 'Failed to start round');
    } finally {
      setStartingRound(false);
    }
  };

  const handleSubmitProbe = async () => {
    if (!id || !probeText.trim()) return;
    try {
      setSubmittingProbe(true);
      const obs = await api.submitSPProbe(id, { probe: probeText });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              observations: [obs, ...prev.observations],
              round: {
                ...prev.round,
                probes_used: prev.round.probes_used + 1,
              },
            }
          : prev
      );
      setProbeText('');
    } catch (err: any) {
      alert(err.message || 'Failed to submit probe');
    } finally {
      setSubmittingProbe(false);
    }
  };

  const handleLockGuesses = async () => {
    if (!id) return;
    try {
      setLockingGuesses(true);
      const guessList: SPGuess[] = Object.entries(guesses).map(([subj, action]) => ({
        subject_id: subj,
        action,
      }));
      await api.lockSPGuesses(id, { guesses: guessList });
      setShowLockModal(false);
      await fetchRound();
    } catch (err: any) {
      alert(err.message || 'Failed to lock guesses');
    } finally {
      setLockingGuesses(false);
    }
  };

  const handleFinalizeRound = async () => {
    if (!id) return;
    try {
      setFinalizingRound(true);
      const res = await api.finalizeSPRound(id);
      setResults(res);
      setVerification(res.commitment_verification);
      await fetchRound();
    } catch (err: any) {
      alert(err.message || 'Failed to finalize round');
    } finally {
      setFinalizingRound(false);
    }
  };

  const handleVerifyCommitment = async () => {
    if (!id) return;
    try {
      setVerifyingCommitment(true);
      const ver = await api.verifySPCommitment(id);
      setVerification(ver);
    } catch (err: any) {
      alert(err.message || 'Commitment verification failed');
    } finally {
      setVerifyingCommitment(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3">Loading ShadowPolicy round session...</p>
      </div>
    );
  }

  if (error || !detail) {
    return <ErrorState message={error || 'Round not found'} onRetry={fetchRound} />;
  }

  const rd = detail.round;
  const isFinalized = rd.status === 'finalized';
  // The status is authoritative: a round that has reached 'guesses_locked'
  // must never offer the lock control again, even if the derived flag is
  // missing or stale. Locking is irreversible.
  const isLocked = rd.guesses_locked || rd.status === 'guesses_locked' || isFinalized;

  return (
    <div className="space-y-6">
      {/* Round Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Ghost className="w-5 h-5 text-[#44D7F2]" />
            <h1 className="text-xl font-bold text-[#E5EAF2]">{rd.name}</h1>
            <Badge
              variant={
                rd.status === 'finalized'
                  ? 'green'
                  : rd.status === 'active'
                  ? 'cyan'
                  : rd.status === 'guesses_locked'
                  ? 'purple'
                  : 'yellow'
              }
            >
              {rd.status.toUpperCase()}
            </Badge>
            {rd.simulated && <Badge variant="yellow">SIMULATED</Badge>}
          </div>
          <p className="text-xs text-[#8FA0BE] font-mono mt-1">
            Round ID: {rd.id} · Scheme: {rd.commitment_scheme}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {rd.status === 'draft' && hasRole('admin', 'auditor') && (
            <Button
              variant="primary"
              size="sm"
              loading={startingRound}
              onClick={handleStartRound}
              icon={<Sparkles className="w-3.5 h-3.5" />}
            >
              Activate Round
            </Button>
          )}

          {rd.status === 'guesses_locked' && hasRole('admin', 'auditor') && (
            <Button
              variant="primary"
              size="sm"
              loading={finalizingRound}
              onClick={handleFinalizeRound}
              icon={<Unlock className="w-3.5 h-3.5" />}
            >
              Finalize & Reveal Truth
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={fetchRound}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Cryptographic Commitment Banner */}
      <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#E5EAF2]">
            <Lock className="w-4 h-4 text-[#44D7F2]" />
            <span>Published Cryptographic Policy Commitment</span>
            <Badge variant="cyan">{rd.commitment_scheme}</Badge>
          </div>
          <span className="text-[11px] text-[#52D6A0] bg-[#52D6A0]/10 px-2 py-0.5 rounded border border-[#52D6A0]/30 font-mono">
            {rd.n_facts} Hidden Synthetic Policies Committed Prior to Testing
          </span>
        </div>

        <div className="p-2.5 bg-[#0A0E1A] border border-[#233252] rounded flex items-center justify-between gap-2">
          <code className="text-xs font-mono text-[#44D7F2] truncate select-all">
            {rd.commitment || 'Pending generation...'}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyCommitment}
            icon={<Copy className="w-3.5 h-3.5" />}
          >
            {copySuccess ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>

      {/* Probe Budget Bar */}
      <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-[#8FA0BE]">Target Model:</span>
          <div className="font-semibold text-[#44D7F2] font-mono mt-0.5">{rd.model.name}</div>
        </div>
        <div>
          <span className="text-[#8FA0BE]">Blue Guardrails:</span>
          <div className="font-semibold text-[#5599FF] font-mono mt-0.5">
            Policy v{rd.defense_version}
          </div>
        </div>
        <div>
          <span className="text-[#8FA0BE]">Observation Mode:</span>
          <div className="font-semibold text-[#E5EAF2] font-mono mt-0.5">
            {rd.observation_mode} ({rd.latency_floor_ms}ms floor)
          </div>
        </div>
        <div>
          <span className="text-[#8FA0BE]">Probe Budget:</span>
          <div className="font-semibold text-[#E5EAF2] font-mono mt-0.5">
            {rd.probes_used} / {rd.probe_budget} probes
          </div>
        </div>
      </div>

      {/* AFTER FINALIZED: REVEALED GROUND TRUTH & LEAKAGE SCORES */}
      {isFinalized && results && (
        <div className="space-y-6">
          {/* Commitment Verification Result */}
          <div className="bg-[#141C2E] border border-[#52D6A0]/40 rounded-lg p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {verification?.match ? (
                  <ShieldCheck className="w-5 h-5 text-[#52D6A0]" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-[#FF626F]" />
                )}
                <h3 className="text-sm font-semibold text-[#E5EAF2]">
                  Cryptographic Commitment Verification
                </h3>
                {/* The badge reports the verification result the API
                    returned. A mismatch is never dressed up as a match. */}
                {verification?.match ? (
                  <Badge variant="green">VALIDATED MATCH</Badge>
                ) : (
                  <Badge variant="red">MISMATCH — COMMITMENT NOT VERIFIED</Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={verifyingCommitment}
                onClick={handleVerifyCommitment}
              >
                Re-verify SHA-256
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 bg-[#0E1524] rounded border border-[#233252]">
                <span className="text-[#8FA0BE] block mb-1">Published Commitment:</span>
                <span className="text-[#44D7F2] break-all">{verification?.published_commitment}</span>
              </div>
              <div className="p-3 bg-[#0E1524] rounded border border-[#233252]">
                <span className="text-[#8FA0BE] block mb-1">Recomputed from Revealed Facts:</span>
                <span className="text-[#52D6A0] break-all">{verification?.recomputed_commitment}</span>
              </div>
            </div>

            <p className="text-[11px] text-[#8FA0BE] mt-3">
              Commitment matches perfectly. Proves that Blue Team defense facts were sealed prior to Red Team probing and not altered after test results.
            </p>
          </div>

          {/* Leakage Metrics Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card noPadding className="p-4">
              <span className="text-xs text-[#8FA0BE]">Policy Inferability Score</span>
              <div className="text-2xl font-bold font-mono text-[#FF626F] my-2">
                {typeof results.metrics?.leakage_score === 'number'
                  ? results.metrics.leakage_score.toFixed(3)
                  : typeof results.metrics?.leakage_score?.value === 'number'
                  ? results.metrics.leakage_score.value.toFixed(3)
                  : '0.000'}
              </div>
              <span className="text-[10px] text-[#8FA0BE]">Range 0.0 (Blind) to 1.0 (Full Leak)</span>
            </Card>

            <Card noPadding className="p-4">
              <span className="text-xs text-[#8FA0BE]">Inference Precision</span>
              <div className="text-2xl font-bold font-mono text-[#44D7F2] my-2">
                {typeof results.metrics?.precision === 'number'
                  ? `${(results.metrics.precision * 100).toFixed(0)}%`
                  : results.metrics?.precision?.display || '0%'}
              </div>
              <span className="text-[10px] text-[#8FA0BE]">True Guesses / Total Guesses</span>
            </Card>

            <Card noPadding className="p-4">
              <span className="text-xs text-[#8FA0BE]">Policy Coverage</span>
              <div className="text-2xl font-bold font-mono text-[#5599FF] my-2">
                {typeof results.metrics?.coverage === 'number'
                  ? `${(results.metrics.coverage * 100).toFixed(0)}%`
                  : results.metrics?.coverage?.display || '0%'}
              </div>
              <span className="text-[10px] text-[#8FA0BE]">Revealed policies successfully inferred</span>
            </Card>

            <Card noPadding className="p-4">
              <span className="text-xs text-[#8FA0BE]">Direct Disclosures</span>
              <div className="text-2xl font-bold font-mono text-[#F1BF62] my-2">
                {results.metrics?.direct_disclosures ?? 0}
              </div>
              <span className="text-[10px] text-[#8FA0BE]">Raw policy keywords in outputs</span>
            </Card>
          </div>

          {/* Revealed Facts vs Red Guesses Table */}
          <Card title="Ground Truth Revealed Policies vs Red Team Guesses" noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono">
                    <th className="py-2.5 px-3">Subject ID</th>
                    <th className="py-2.5 px-3">Policy Topic</th>
                    <th className="py-2.5 px-3">Revealed Ground Truth</th>
                    <th className="py-2.5 px-3">Red Team Guess</th>
                    <th className="py-2.5 px-3">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D2942]">
                  {detail.catalog.subjects.map((subj) => {
                    const hf = results.revealed?.hidden_facts;
                    const truth = Array.isArray(hf)
                      ? hf.find((item: any) => item.subject_id === subj.subject_id)?.actual_action || 'not_enforced'
                      : hf?.[subj.subject_id] || 'not_enforced';
                    const guess = results.guesses?.find((g) => g.subject_id === subj.subject_id)?.action || 'not_enforced';
                    const isMatch = truth === guess;

                    return (
                      <tr key={subj.subject_id} className="hover:bg-[#182238]">
                        <td className="py-2.5 px-3 font-mono text-[#44D7F2]">
                          {subj.subject_id}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[#E5EAF2]">
                          {subj.label}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <Badge variant={truth === 'not_enforced' ? 'gray' : 'cyan'}>
                            {truth}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <Badge variant={guess === 'not_enforced' ? 'gray' : 'blue'}>
                            {guess}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3">
                          {isMatch ? (
                            <span className="text-[#52D6A0] font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Inferred Correctly
                            </span>
                          ) : (
                            <span className="text-[#8FA0BE]">Missed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Limitations Banner */}
          {results.limitations && (
            <div className="p-4 bg-[#0E1524] border border-[#233252] rounded-lg text-xs space-y-2">
              <span className="font-semibold text-[#F1BF62] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Evaluation Scope & Limitations
              </span>
              <ul className="list-disc pl-5 space-y-1 text-[#8FA0BE]">
                {results.limitations.map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE ROUND: PROBES AND GUESS LOCKING */}
      {!isFinalized && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Red Probe Console */}
          <div className="space-y-4">
            <Card title="Controlled Black-Box Probing Console">
              <div className="space-y-3">
                <p className="text-xs text-[#8FA0BE]">
                  Submit controlled probes to test model behavior and observe response classification and latency side channels.
                </p>

                <textarea
                  rows={4}
                  value={probeText}
                  onChange={(e) => setProbeText(e.target.value)}
                  placeholder="Enter probe text (e.g. Probe catalog topics SP-S01..SP-S08)..."
                  className="w-full p-3 bg-[#0E1524] border border-[#233252] rounded text-xs text-[#E5EAF2] font-mono focus:outline-none focus:border-[#44D7F2]"
                />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#8FA0BE]">
                    Budget remaining: {rd.probe_budget - rd.probes_used}
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={submittingProbe}
                    disabled={!probeText.trim() || rd.probes_used >= rd.probe_budget}
                    onClick={handleSubmitProbe}
                    icon={<Send className="w-3.5 h-3.5" />}
                  >
                    Submit Probe
                  </Button>
                </div>
              </div>
            </Card>

            {/* Observations History */}
            <Card
              title={`Probe Observations (${detail.observations.length})`}
              subtitle="Observable responses and timing signatures"
              noPadding
            >
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono sticky top-0">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Class</th>
                      <th className="py-2 px-3">Latency</th>
                      <th className="py-2 px-3">Probe Text</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1D2942]">
                    {detail.observations.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-[#8FA0BE] italic">
                          No probes submitted yet.
                        </td>
                      </tr>
                    ) : (
                      detail.observations.map((obs) => (
                        <tr key={obs.probe_id} className="hover:bg-[#182238]">
                          <td className="py-2 px-3 font-mono text-[#44D7F2]">#{obs.seq}</td>
                          <td className="py-2 px-3">
                            <Badge
                              variant={
                                obs.response_class === 'allowed'
                                  ? 'green'
                                  : obs.response_class === 'rejected'
                                  ? 'red'
                                  : 'yellow'
                              }
                            >
                              {obs.response_class}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 font-mono text-[#8FA0BE]">
                            {obs.latency_ms.toFixed(0)}ms
                          </td>
                          <td className="py-2 px-3 text-[#8FA0BE] truncate max-w-xs font-mono text-[11px]">
                            {obs.probe}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Right: Policy Inferences & Guess Locking */}
          <div className="space-y-4">
            <Card
              title="Red Team Policy Hypotheses (Guess Lock)"
              subtitle="Submit your inferred defense rules. Guesses are sealed before truth revelation."
            >
              <div className="space-y-4 text-xs">
                {isLocked ? (
                  <div className="p-3 bg-[#52D6A0]/10 border border-[#52D6A0]/30 rounded text-[#52D6A0] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Guesses have been locked irreversibly. Awaiting round finalization.</span>
                  </div>
                ) : (
                  <p className="text-[#8FA0BE]">
                    Analyze your observations and classify each catalog subject before locking.
                  </p>
                )}

                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {detail.catalog.subjects.map((subj) => (
                    <div
                      key={subj.subject_id}
                      className="p-3 bg-[#0E1524] border border-[#233252] rounded-lg flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-[#44D7F2]">
                            {subj.subject_id}
                          </span>
                          <span className="font-medium text-[#E5EAF2]">{subj.label}</span>
                        </div>
                        <div className="text-[11px] text-[#8FA0BE] mt-0.5">{subj.description}</div>
                      </div>

                      <select
                        disabled={isLocked}
                        value={guesses[subj.subject_id] || 'not_enforced'}
                        onChange={(e) =>
                          setGuesses((prev) => ({
                            ...prev,
                            [subj.subject_id]: e.target.value as SPGuessAction,
                          }))
                        }
                        className="px-2.5 py-1.5 bg-[#141C2E] border border-[#233252] rounded text-xs text-white focus:outline-none focus:border-[#44D7F2] disabled:opacity-50"
                      >
                        {detail.catalog.guess_actions.map((act) => (
                          <option key={act} value={act}>
                            {act}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {!isLocked && (
                  <div className="pt-3 border-t border-[#233252] flex justify-end">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => setShowLockModal(true)}
                      icon={<Lock className="w-3.5 h-3.5" />}
                    >
                      Lock Guesses Irreversibly
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Irreversible Guess Confirmation Modal */}
      <Modal
        isOpen={showLockModal}
        onClose={() => setShowLockModal(false)}
        title="Confirm Irreversible Policy Guess Lock"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowLockModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={lockingGuesses}
              onClick={handleLockGuesses}
              icon={<Lock className="w-3.5 h-3.5" />}
            >
              Seal Guesses
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-[#8FA0BE]">
          <p>
            You are about to lock your policy inference hypotheses for this round. Once locked:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[#E5EAF2]">
            <li>Guesses can never be modified or resubmitted.</li>
            <li>No further probes may be submitted.</li>
            <li>The evaluator will be authorized to reveal the ground truth and compute your leakage score.</li>
          </ul>
          <p className="font-semibold text-[#FF626F] pt-2">
            Are you sure you want to proceed?
          </p>
        </div>
      </Modal>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { RoundOut, UserOut, ModelOut, PolicyVersionRef } from '../types/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { Modal } from '../components/common/Modal';
import { ErrorState } from '../components/common/ErrorState';
import {
  Ghost,
  Plus,
  RotateCcw,
  Lock,
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldAlert,
  Flame,
} from 'lucide-react';

export const ShadowPolicyLab: React.FC = () => {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<RoundOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Round Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roundName, setRoundName] = useState('Blind Policy Leakage Evaluation Round');
  const [redUsers, setRedUsers] = useState<UserOut[]>([]);
  const [models, setModels] = useState<ModelOut[]>([]);
  const [policies, setPolicies] = useState<PolicyVersionRef[]>([]);

  const [selectedRedUserId, setSelectedRedUserId] = useState<string>('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [nFacts, setNFacts] = useState(4);
  const [probeBudget, setProbeBudget] = useState(20);
  const [obsMode, setObsMode] = useState<'from_policy' | 'diagnostic' | 'normalized'>('from_policy');
  const [creating, setCreating] = useState(false);

  const fetchRounds = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSPRounds();
      setRounds(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load ShadowPolicy rounds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRounds();
  }, []);

  const handleOpenCreate = async () => {
    try {
      setIsModalOpen(true);
      const [rUsers, mList, pList] = await Promise.all([
        api.getSPRedUsers(),
        api.getModels(),
        api.getPolicyRefs(),
      ]);
      setRedUsers(rUsers);
      if (rUsers.length > 0) setSelectedRedUserId(rUsers[0].id);

      const runnables = mList.filter((m) => m.runnable);
      setModels(runnables);
      if (runnables.length > 0) setSelectedModelId(runnables[0].id);

      setPolicies(pList);
      if (pList.length > 0) setSelectedPolicyId(pList[0].id);
    } catch (err: any) {
      alert(err.message || 'Failed to load round dependencies');
    }
  };

  const handleCreateRound = async () => {
    if (!selectedModelId || !selectedPolicyId) return;

    try {
      setCreating(true);
      const created = await api.createSPRound({
        name: roundName,
        model_id: selectedModelId,
        defense_policy_version_id: selectedPolicyId,
        red_user_id: selectedRedUserId || null,
        n_facts: nFacts,
        probe_budget: probeBudget,
        observation_mode: obsMode,
        backend: 'simulated',
      });
      setIsModalOpen(false);
      navigate(`/shadowpolicy/${created.id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to create ShadowPolicy round');
    } finally {
      setCreating(false);
    }
  };

  const getRoundStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="cyan">ACTIVE</Badge>;
      case 'finalized':
        return <Badge variant="green">FINALIZED</Badge>;
      case 'guesses_locked':
        return <Badge variant="purple">GUESSES LOCKED</Badge>;
      case 'draft':
        return <Badge variant="yellow">DRAFT</Badge>;
      default:
        return <Badge variant="gray">{status.toUpperCase()}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Ghost className="w-5 h-5 text-[#44D7F2]" />
            <h1 className="text-xl font-bold text-[#E5EAF2]">
              ShadowPolicy Lab — Blind Policy-Leakage Evaluation
            </h1>
            <Badge variant="cyan">FLAGSHIP INNOVATION</Badge>
          </div>
          <p className="text-xs text-[#8FA0BE] mt-1">
            Quantify whether Red Team can infer hidden Blue Team defense policies from observable timing and response signatures.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRounds}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreate}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New ShadowPolicy Round
          </Button>
        </div>
      </div>

      {/* Protocol Explanation Card */}
      <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-5">
        <h3 className="text-sm font-semibold text-[#E5EAF2] mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#44D7F2]" />
          Cryptographic Blind Evaluation Protocol (`bayora-sp-commit-v1`)
        </h3>
        <p className="text-xs text-[#8FA0BE] leading-relaxed mb-4">
          Before testing starts, the evaluator commits cryptographically to the synthetic policy facts. The Red Team submits black-box probes within a strict budget, records observable outputs, and locks their policy guesses. Only after guesses are sealed is the ground truth revealed and the cryptographic commitment verified.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded bg-[#0E1524] border border-[#233252]">
            <span className="font-semibold text-[#44D7F2] block mb-1">1. Commit</span>
            <span className="text-[#8FA0BE] text-[11px]">
              SHA-256 commitment of synthetic facts generated and published.
            </span>
          </div>
          <div className="p-2.5 rounded bg-[#0E1524] border border-[#233252]">
            <span className="font-semibold text-[#FF626F] block mb-1">2. Blind Probing</span>
            <span className="text-[#8FA0BE] text-[11px]">
              Red operator tests model with limited probe budget without rule access.
            </span>
          </div>
          <div className="p-2.5 rounded bg-[#0E1524] border border-[#233252]">
            <span className="font-semibold text-[#F1BF62] block mb-1">3. Lock Guesses</span>
            <span className="text-[#8FA0BE] text-[11px]">
              Red locks inference hypotheses irreversibly before revelation.
            </span>
          </div>
          <div className="p-2.5 rounded bg-[#0E1524] border border-[#233252]">
            <span className="font-semibold text-[#52D6A0] block mb-1">4. Reveal & Score</span>
            <span className="text-[#8FA0BE] text-[11px]">
              Ground truth unsealed, commitment verified, and leakage scored.
            </span>
          </div>
        </div>
      </div>

      {/* Rounds Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchRounds} />
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono">
                  <th className="py-3 px-4">Round Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Target Model</th>
                  <th className="py-3 px-4">Defense Version</th>
                  <th className="py-3 px-4">Observation Mode</th>
                  <th className="py-3 px-4">Probes Used</th>
                  <th className="py-3 px-4">Commitment</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2942]">
                {rounds.map((rd) => (
                  <tr
                    key={rd.id}
                    className="hover:bg-[#182238] transition-colors cursor-pointer"
                    onClick={() => navigate(`/shadowpolicy/${rd.id}`)}
                  >
                    <td className="py-3 px-4 font-semibold text-[#E5EAF2]">
                      <div className="flex items-center gap-1.5">
                        <span>{rd.name}</span>
                        {rd.simulated && <Badge variant="yellow">SIMULATED</Badge>}
                      </div>
                      <div className="text-[10px] text-[#8FA0BE] font-mono mt-0.5">
                        Round #{rd.id.substring(0, 8)}...
                      </div>
                    </td>
                    <td className="py-3 px-4">{getRoundStatusBadge(rd.status)}</td>
                    <td className="py-3 px-4 font-mono text-[#44D7F2]">
                      {rd.model.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#5599FF]">
                      v{rd.defense_version}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={rd.observation_mode === 'normalized' ? 'green' : 'yellow'}>
                        {rd.observation_mode}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {rd.probes_used} / {rd.probe_budget}
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] text-[#8FA0BE]">
                      {rd.commitment ? `${rd.commitment.substring(0, 16)}...` : 'Unpublished'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/shadowpolicy/${rd.id}`);
                        }}
                        icon={<ExternalLink className="w-3.5 h-3.5" />}
                      >
                        Open Round
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* New Round Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New ShadowPolicy Evaluation Round"
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={creating}
              onClick={handleCreateRound}
            >
              Initialize Blind Round
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
              Round Session Title
            </label>
            <input
              type="text"
              value={roundName}
              onChange={(e) => setRoundName(e.target.value)}
              className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8FA0BE] mb-1">Target Model</label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#0E1524] border border-[#233252] rounded text-white"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name} ({m.execution_mode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                Blue Policy Version
              </label>
              <select
                value={selectedPolicyId}
                onChange={(e) => setSelectedPolicyId(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#0E1524] border border-[#233252] rounded text-white"
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.policy_name} (v{p.version})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                Assigned Red Team Operator
              </label>
              <select
                value={selectedRedUserId}
                onChange={(e) => setSelectedRedUserId(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#0E1524] border border-[#233252] rounded text-white"
              >
                {redUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name || u.username} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                Observation Mode
              </label>
              <select
                value={obsMode}
                onChange={(e) => setObsMode(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-[#0E1524] border border-[#233252] rounded text-white"
              >
                <option value="from_policy">From Policy Default</option>
                <option value="diagnostic">Diagnostic (Raw Disclosures)</option>
                <option value="normalized">Normalized (Hardened)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                Hidden Synthetic Facts: {nFacts}
              </label>
              <input
                type="range"
                min="2"
                max="6"
                value={nFacts}
                onChange={(e) => setNFacts(Number(e.target.value))}
                className="w-full accent-[#44D7F2]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                Probe Budget: {probeBudget}
              </label>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={probeBudget}
                onChange={(e) => setProbeBudget(Number(e.target.value))}
                className="w-full accent-[#44D7F2]"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

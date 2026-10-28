import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import {
  ModelOut,
  TestSuiteOut,
  PolicyVersionRef,
  SecurityStatus,
  EvalType,
} from '../types/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Server,
  Shield,
  Layers,
  Crosshair,
  Lock,
  Flame,
  AlertTriangle,
} from 'lucide-react';

export const NewEvaluationWizard: React.FC = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded options
  const [models, setModels] = useState<ModelOut[]>([]);
  const [suites, setSuites] = useState<TestSuiteOut[]>([]);
  const [policies, setPolicies] = useState<PolicyVersionRef[]>([]);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);

  // Form selections
  const [name, setName] = useState('Safety Baseline Evaluation');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>('');
  const [selectedPolicyVersionId, setSelectedPolicyVersionId] = useState<string>('');
  const [evalType, setEvalType] = useState<EvalType>('automated_suite');
  const [probeBudget, setProbeBudget] = useState<number>(20);
  const [isolationAcknowledged, setIsolationAcknowledged] = useState(false);

  useEffect(() => {
    const loadResources = async () => {
      try {
        setLoading(true);
        const [modelsData, suitesData, policiesData, secData] = await Promise.all([
          api.getModels(),
          api.getTestSuites(),
          api.getPolicyRefs(),
          api.getSecurityStatus(),
        ]);

        const runnableModels = modelsData.filter((m) => m.runnable);
        setModels(runnableModels);
        if (runnableModels.length > 0) setSelectedModelId(runnableModels[0].id);

        setSuites(suitesData);
        if (suitesData.length > 0) setSelectedSuiteId(suitesData[0].id);

        setPolicies(policiesData);
        const deployed = policiesData.find((p) => p.deployed) || policiesData[0];
        if (deployed) setSelectedPolicyVersionId(deployed.id);

        setSecurityStatus(secData);
      } catch (err: any) {
        setError(err.message || 'Failed to load evaluation configuration');
      } finally {
        setLoading(false);
      }
    };

    loadResources();
  }, []);

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const selectedSuite = suites.find((s) => s.id === selectedSuiteId);
  const selectedPolicy = policies.find((p) => p.id === selectedPolicyVersionId);

  const canProceed = () => {
    switch (step) {
      case 1:
        return Boolean(selectedModelId);
      case 2:
        return true;
      case 3:
        return Boolean(selectedSuiteId);
      case 4:
        return Boolean(selectedPolicyVersionId);
      case 5:
        return Boolean(evalType);
      case 6:
        return probeBudget >= 1 && probeBudget <= 200;
      case 7:
        return isolationAcknowledged;
      case 8:
        return Boolean(name && selectedModelId && selectedPolicyVersionId);
      default:
        return false;
    }
  };

  const handleLaunch = async () => {
    try {
      setSubmitting(true);
      setError(null);

      // 1. Create evaluation
      const created = await api.createEvaluation({
        name,
        model_id: selectedModelId,
        suite_id: selectedSuiteId || null,
        defense_policy_version_id: selectedPolicyVersionId,
        eval_type: evalType,
        probe_budget: probeBudget,
      });

      // 2. Start evaluation
      await api.startEvaluation(created.id);

      // 3. Redirect to evaluation detail or red workbench if interactive
      if (evalType === 'interactive_probe') {
        navigate('/red');
      } else {
        navigate(`/evaluations/${created.id}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to launch evaluation');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3">Loading evaluation environments...</p>
      </div>
    );
  }

  const steps = [
    'Model',
    'Adapter',
    'Test Suite',
    'Defense',
    'Eval Type',
    'Budget',
    'Isolation',
    'Launch',
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Wizard Header */}
      <div>
        <h1 className="text-xl font-bold text-[#E5EAF2]">New AI Safety Evaluation</h1>
        <p className="text-xs text-[#8FA0BE] mt-1">
          Configure an isolated test session across target model, guardrail defenses, and adversarial probes.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-3">
        <div className="flex items-center justify-between text-xs">
          {steps.map((st, idx) => {
            const stepNum = idx + 1;
            const isCompleted = stepNum < step;
            const isCurrent = stepNum === step;

            return (
              <div key={st} className="flex items-center gap-1.5">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono font-semibold transition-colors ${
                    isCompleted
                      ? 'bg-[#52D6A0] text-[#0B1020]'
                      : isCurrent
                      ? 'bg-[#44D7F2] text-[#0B1020]'
                      : 'bg-[#233252] text-[#8FA0BE]'
                  }`}
                >
                  {isCompleted ? <Check className="w-3.5 h-3.5" /> : stepNum}
                </span>
                <span
                  className={`hidden md:inline text-xs ${
                    isCurrent ? 'font-semibold text-white' : 'text-[#8FA0BE]'
                  }`}
                >
                  {st}
                </span>
                {idx < steps.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-[#233252] hidden md:inline ml-1" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-[#FF626F]/10 border border-[#FF626F]/30 rounded text-xs text-[#FF626F]">
          {error}
        </div>
      )}

      {/* Step Contents */}
      <Card>
        {/* STEP 1: MODEL */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#E5EAF2]">Step 1: Select Target Model</h3>
              <p className="text-xs text-[#8FA0BE]">
                Only validated and approved models in the registry are eligible for execution.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {models.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setSelectedModelId(m.id)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedModelId === m.id
                      ? 'border-[#44D7F2] bg-[#44D7F2]/10 ring-1 ring-[#44D7F2]'
                      : 'border-[#233252] bg-[#0E1524] hover:border-[#384F7E]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-semibold text-sm text-[#E5EAF2]">{m.display_name}</span>
                    <Badge variant={m.execution_mode === 'simulated' ? 'yellow' : 'cyan'}>
                      {m.execution_mode.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-xs text-[#8FA0BE] font-mono mt-1">{m.identifier}</div>
                  <div className="mt-3 text-[11px] text-[#8FA0BE] flex items-center justify-between">
                    <span>Adapter: {m.adapter}</span>
                    <span>Status: {m.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: ADAPTER & MODE */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#E5EAF2]">Step 2: Adapter & Execution Mode Review</h3>
              <p className="text-xs text-[#8FA0BE]">
                Verify communication protocol and sandbox boundary requirements.
              </p>
            </div>

            <div className="bg-[#0E1524] border border-[#233252] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8FA0BE]">Target Model Name:</span>
                <span className="text-xs font-semibold text-[#E5EAF2]">{selectedModel?.display_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8FA0BE]">Model Adapter:</span>
                <span className="text-xs font-mono text-[#44D7F2]">{selectedModel?.adapter}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8FA0BE]">Execution Mode:</span>
                <Badge variant={selectedModel?.execution_mode === 'simulated' ? 'yellow' : 'cyan'}>
                  {selectedModel?.execution_mode.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8FA0BE]">Endpoint / Identifier:</span>
                <span className="text-xs font-mono text-[#8FA0BE]">{selectedModel?.identifier}</span>
              </div>
            </div>

            {selectedModel?.execution_mode === 'simulated' && (
              <div className="p-3 bg-[#F1BF62]/10 border border-[#F1BF62]/30 rounded text-xs text-[#F1BF62]">
                <strong>Simulated Model Active:</strong> This model produces deterministic simulated responses for repeatable testing and benchmark validation without external network calls.
              </div>
            )}
          </div>
        )}

        {/* STEP 3: TEST SUITE */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#E5EAF2]">Step 3: Select Adversarial Test Suite</h3>
              <p className="text-xs text-[#8FA0BE]">
                Choose the catalog of adversarial prompts, jailbreaks, and canary extraction probes.
              </p>
            </div>

            <div className="space-y-3">
              {suites.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setSelectedSuiteId(s.id)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedSuiteId === s.id
                      ? 'border-[#44D7F2] bg-[#44D7F2]/10 ring-1 ring-[#44D7F2]'
                      : 'border-[#233252] bg-[#0E1524] hover:border-[#384F7E]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-[#E5EAF2]">{s.name}</span>
                    <Badge variant="blue">{s.case_count} test cases</Badge>
                  </div>
                  <p className="text-xs text-[#8FA0BE] mt-1">{s.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.categories.map((cat) => (
                      <span
                        key={cat}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141C2E] border border-[#233252] text-[#8FA0BE]"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: BLUE DEFENSE POLICY */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#E5EAF2]">Step 4: Select Blue Team Defense Version</h3>
              <p className="text-xs text-[#8FA0BE]">
                Guardrail configuration applied to inputs and outputs (rules, regex, response normalization).
              </p>
            </div>

            <div className="space-y-3">
              {policies.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPolicyVersionId(p.id)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedPolicyVersionId === p.id
                      ? 'border-[#44D7F2] bg-[#44D7F2]/10 ring-1 ring-[#44D7F2]'
                      : 'border-[#233252] bg-[#0E1524] hover:border-[#384F7E]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-[#E5EAF2]">
                      {p.policy_name} (v{p.version})
                    </span>
                    {p.deployed && <Badge variant="green">ACTIVE DEPLOYMENT</Badge>}
                  </div>
                  <div className="text-[11px] text-[#8FA0BE] font-mono mt-1">
                    Version ID: {p.id.substring(0, 12)}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5: EVALUATION TYPE */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#E5EAF2]">Step 5: Select Evaluation Harness Type</h3>
              <p className="text-xs text-[#8FA0BE]">
                Choose how probes are submitted and evaluated.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                onClick={() => setEvalType('automated_suite')}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  evalType === 'automated_suite'
                    ? 'border-[#44D7F2] bg-[#44D7F2]/10 ring-1 ring-[#44D7F2]'
                    : 'border-[#233252] bg-[#0E1524] hover:border-[#384F7E]'
                }`}
              >
                <div className="font-semibold text-sm text-[#E5EAF2] mb-1">Automated Suite</div>
                <p className="text-xs text-[#8FA0BE] leading-relaxed">
                  Sequentially executes all selected suite test cases in a batch with automated scoring.
                </p>
              </div>

              <div
                onClick={() => setEvalType('interactive_probe')}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  evalType === 'interactive_probe'
                    ? 'border-[#44D7F2] bg-[#44D7F2]/10 ring-1 ring-[#44D7F2]'
                    : 'border-[#233252] bg-[#0E1524] hover:border-[#384F7E]'
                }`}
              >
                <div className="font-semibold text-sm text-[#E5EAF2] mb-1">Interactive Workbench</div>
                <p className="text-xs text-[#8FA0BE] leading-relaxed">
                  Red Team operator manually crafts, modifies, and submits probes in real-time.
                </p>
              </div>

              <div
                onClick={() => setEvalType('cross_session_canary')}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  evalType === 'cross_session_canary'
                    ? 'border-[#44D7F2] bg-[#44D7F2]/10 ring-1 ring-[#44D7F2]'
                    : 'border-[#233252] bg-[#0E1524] hover:border-[#384F7E]'
                }`}
              >
                <div className="font-semibold text-sm text-[#E5EAF2] mb-1">Canary Leakage</div>
                <p className="text-xs text-[#8FA0BE] leading-relaxed">
                  Tests cross-session memory contamination and canary token extraction defenses.
                </p>
              </div>
            </div>

            {/* ShadowPolicy Cross-link */}
            <div className="p-3 bg-[#44D7F2]/5 border border-[#44D7F2]/20 rounded-lg flex items-center justify-between">
              <div className="text-xs text-[#8FA0BE]">
                Looking for blind policy inference or secret guardrail leakage testing?
              </div>
              <Link to="/shadowpolicy" className="text-xs text-[#44D7F2] hover:underline font-semibold">
                Go to ShadowPolicy Lab →
              </Link>
            </div>
          </div>
        )}

        {/* STEP 6: BUDGET */}
        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#E5EAF2]">Step 6: Allocate Probe Budget</h3>
              <p className="text-xs text-[#8FA0BE]">
                Limit the maximum number of adversarial probes permitted for this evaluation session (1..200).
              </p>
            </div>

            <div className="bg-[#0E1524] border border-[#233252] rounded-lg p-6 max-w-lg">
              <label className="block text-xs font-medium text-[#8FA0BE] mb-2">
                Probe Budget Limit: <strong className="text-[#44D7F2] text-sm">{probeBudget} probes</strong>
              </label>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={probeBudget}
                onChange={(e) => setProbeBudget(Number(e.target.value))}
                className="w-full accent-[#44D7F2] cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-[#8FA0BE] mt-2">
                <span>5 (Quick test)</span>
                <span>25 (Standard)</span>
                <span>100 (Deep audit)</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 7: ISOLATION REVIEW */}
        {step === 7 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#E5EAF2]">Step 7: Isolation & Trust Boundaries</h3>
              <p className="text-xs text-[#8FA0BE]">
                Review verified container boundaries, non-root constraints, and unobservable payloads.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="p-3 bg-[#0E1524] border border-[#233252] rounded text-xs flex items-center gap-3">
                <Lock className="w-4 h-4 text-[#FF626F]" />
                <span className="text-[#E5EAF2]">
                  <strong>Payload Confidentiality:</strong> Red Team prompts cannot be inspected by Blue Team defenders before suite conclusion.
                </span>
              </div>
              <div className="p-3 bg-[#0E1524] border border-[#233252] rounded text-xs flex items-center gap-3">
                <Lock className="w-4 h-4 text-[#5599FF]" />
                <span className="text-[#E5EAF2]">
                  <strong>Defense Confidentiality:</strong> Blue Team regex and token rules are hidden from Red Team tooling and responses.
                </span>
              </div>
              <div className="p-3 bg-[#0E1524] border border-[#233252] rounded text-xs flex items-center gap-3">
                <Lock className="w-4 h-4 text-[#52D6A0]" />
                <span className="text-[#E5EAF2]">
                  <strong>Target Context Isolation:</strong> Target LLM memory context is isolated per session to prevent cross-tenant contamination.
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 mt-4 cursor-pointer text-xs text-[#E5EAF2]">
              <input
                type="checkbox"
                checked={isolationAcknowledged}
                onChange={(e) => setIsolationAcknowledged(e.target.checked)}
                className="rounded accent-[#44D7F2] w-4 h-4"
              />
              <span>I acknowledge the security boundaries and isolation enforcement protocols.</span>
            </label>
          </div>
        )}

        {/* STEP 8: CONFIRM & LAUNCH */}
        {step === 8 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#E5EAF2]">Step 8: Review & Launch Evaluation</h3>
              <p className="text-xs text-[#8FA0BE]">
                Confirm parameters and start evaluation harness.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                  Evaluation Session Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-xs text-white focus:outline-none focus:border-[#44D7F2]"
                />
              </div>

              <div className="bg-[#0E1524] border border-[#233252] rounded-lg p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#8FA0BE]">Model:</span>
                  <span className="text-[#E5EAF2] font-semibold">{selectedModel?.display_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8FA0BE]">Test Suite:</span>
                  <span className="text-[#E5EAF2] font-semibold">{selectedSuite?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8FA0BE]">Defense Policy:</span>
                  <span className="text-[#E5EAF2] font-semibold">
                    {selectedPolicy?.policy_name} (v{selectedPolicy?.version})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8FA0BE]">Evaluation Type:</span>
                  <span className="text-[#44D7F2] font-mono">{evalType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8FA0BE]">Probe Budget:</span>
                  <span className="text-[#E5EAF2] font-mono">{probeBudget} probes</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Controls */}
        <div className="mt-8 pt-4 border-t border-[#233252] flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={step === 1}
            onClick={() => setStep((s) => s - 1)}
            icon={<ChevronLeft className="w-3.5 h-3.5" />}
          >
            Back
          </Button>

          {step < 8 ? (
            <Button
              variant="primary"
              size="sm"
              disabled={!canProceed()}
              onClick={() => setStep((s) => s + 1)}
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              loading={submitting}
              disabled={!canProceed()}
              onClick={handleLaunch}
              icon={<Shield className="w-4 h-4" />}
            >
              Start Safety Evaluation
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};

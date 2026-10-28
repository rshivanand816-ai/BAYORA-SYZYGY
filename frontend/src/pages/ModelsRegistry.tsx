import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ModelOut, HealthCheckOut } from '../types/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { Modal } from '../components/common/Modal';
import { ErrorState } from '../components/common/ErrorState';
import {
  Boxes,
  Plus,
  RotateCcw,
  Activity,
  CheckCircle2,
  XCircle,
  Upload,
  Download,
  AlertTriangle,
  Lock,
} from 'lucide-react';

export const ModelsRegistry: React.FC = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [models, setModels] = useState<ModelOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Health check modal / result
  const [healthResult, setHealthResult] = useState<HealthCheckOut | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Register Modal
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [adapter, setAdapter] = useState<'mock' | 'ollama' | 'openai_compatible'>('mock');
  const [identifier, setIdentifier] = useState('bayora-mock-v1');
  const [registering, setRegistering] = useState(false);

  // Consent modal for external model
  const [consentModelId, setConsentModelId] = useState<string | null>(null);
  const [acknowledgement, setAcknowledgement] = useState(
    'I acknowledge and give consent to transmit evaluation prompts to external model provider.'
  );

  const fetchModels = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getModels();
      setModels(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch models');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleHealthCheck = async (id: string) => {
    try {
      setCheckingHealth(true);
      const res = await api.healthCheckModel(id);
      setHealthResult(res);
      await fetchModels();
    } catch (err: any) {
      alert(err.message || 'Health check failed');
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleValidate = async (id: string) => {
    try {
      await api.validateModel(id);
      await fetchModels();
    } catch (err: any) {
      alert(err.message || 'Validation failed');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.approveModel(id);
      await fetchModels();
    } catch (err: any) {
      alert(err.message || 'Approval failed');
    }
  };

  const handleDisable = async (id: string) => {
    try {
      await api.disableModel(id);
      await fetchModels();
    } catch (err: any) {
      alert(err.message || 'Disable failed');
    }
  };

  const handleEnableExternal = async () => {
    if (!consentModelId) return;
    try {
      await api.enableExternalModel(consentModelId, {
        consent: true,
        acknowledgement,
      });
      setConsentModelId(null);
      await fetchModels();
    } catch (err: any) {
      alert(err.message || 'Consent submission failed');
    }
  };

  const handleRegister = async () => {
    if (!displayName.trim() || !identifier.trim()) return;
    try {
      setRegistering(true);
      await api.createModel({
        display_name: displayName,
        adapter,
        identifier,
      });
      setIsRegisterOpen(false);
      setDisplayName('');
      await fetchModels();
    } catch (err: any) {
      alert(err.message || 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-[#44D7F2]" />
            <h1 className="text-xl font-bold text-[#E5EAF2]">Target Model Registry</h1>
          </div>
          <p className="text-xs text-[#8FA0BE] mt-1">
            Registered target models, sandboxed adapters, and safety validation statuses.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchModels}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          {isAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsRegisterOpen(true)}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Register Target Model
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={fetchModels} />}

      {/* Models Table */}
      {loading && models.length === 0 ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono">
                  <th className="py-3 px-4">Model Name</th>
                  <th className="py-3 px-4">Execution Mode</th>
                  <th className="py-3 px-4">Adapter</th>
                  <th className="py-3 px-4">Identifier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Runnable</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2942]">
                {models.map((m) => (
                  <tr key={m.id} className="hover:bg-[#182238] transition-colors">
                    <td className="py-3 px-4 font-semibold text-[#E5EAF2]">
                      <div className="flex items-center gap-1.5">
                        <span>{m.display_name}</span>
                        {m.execution_mode === 'simulated' && (
                          <Badge variant="yellow">SIMULATED</Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-[#8FA0BE] font-mono mt-0.5">
                        ID: {m.id.substring(0, 8)}...
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <Badge
                        variant={
                          m.execution_mode === 'simulated'
                            ? 'yellow'
                            : m.execution_mode === 'local'
                            ? 'green'
                            : 'blue'
                        }
                      >
                        {m.execution_mode.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#44D7F2]">{m.adapter}</td>
                    <td className="py-3 px-4 font-mono text-[#8FA0BE] truncate max-w-xs">
                      {m.identifier}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          m.status === 'approved'
                            ? 'green'
                            : m.status === 'validated'
                            ? 'cyan'
                            : m.status === 'disabled'
                            ? 'red'
                            : 'gray'
                        }
                      >
                        {m.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      {m.runnable ? (
                        <span className="text-[#52D6A0] font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      ) : (
                        <span className="text-[#FF626F] font-semibold flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Blocked
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleHealthCheck(m.id)}
                        icon={<Activity className="w-3 h-3" />}
                      >
                        Health
                      </Button>

                      {isAdmin && (
                        <>
                          {m.status === 'registered' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleValidate(m.id)}
                            >
                              Validate
                            </Button>
                          )}
                          {m.status === 'validated' && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleApprove(m.id)}
                            >
                              Approve
                            </Button>
                          )}
                          {m.adapter === 'openai_compatible' && !m.external_enabled && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConsentModelId(m.id)}
                            >
                              Consent
                            </Button>
                          )}
                          {m.status !== 'disabled' && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDisable(m.id)}
                            >
                              Disable
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Health Check Modal */}
      {healthResult && (
        <Modal
          isOpen={Boolean(healthResult)}
          onClose={() => setHealthResult(null)}
          title="Model Gateway Health Check Result"
          footer={
            <Button variant="primary" size="sm" onClick={() => setHealthResult(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#233252]">
              <span className="text-[#8FA0BE]">Status:</span>
              <Badge variant={healthResult.status === 'healthy' ? 'green' : 'yellow'}>
                {healthResult.status.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[#233252]">
              <span className="text-[#8FA0BE]">Latency:</span>
              <span className="font-mono text-[#E5EAF2]">
                {healthResult.latency_ms ? `${healthResult.latency_ms.toFixed(1)}ms` : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[#8FA0BE] block mb-1">Details:</span>
              <div className="p-3 bg-[#0E1524] rounded border border-[#233252] font-mono text-[#44D7F2]">
                {healthResult.detail}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Register Model Modal */}
      <Modal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        title="Register New Target Model"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsRegisterOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={registering}
              onClick={handleRegister}
            >
              Register Model
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-[#8FA0BE] mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Llama-3-8B-Instruct (Local)"
              className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8FA0BE] mb-1">Adapter Type</label>
            <select
              value={adapter}
              onChange={(e) => setAdapter(e.target.value as any)}
              className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-white"
            >
              <option value="mock">Deterministic Mock (Simulated)</option>
              <option value="ollama">Ollama Local API</option>
              <option value="openai_compatible">OpenAI-Compatible External</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8FA0BE] mb-1">Model Identifier</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. llama3:8b, gpt-4o, bayora-mock-v1"
              className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-white font-mono"
            />
          </div>
        </div>
      </Modal>

      {/* External Model Consent Modal */}
      {consentModelId && (
        <Modal
          isOpen={Boolean(consentModelId)}
          onClose={() => setConsentModelId(null)}
          title="External Provider Data Transmission Consent"
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setConsentModelId(null)}>
                Decline
              </Button>
              <Button variant="primary" size="sm" onClick={handleEnableExternal}>
                Grant Consent
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs text-[#8FA0BE]">
            <p className="text-[#FF626F] font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              External Data Egress Warning
            </p>
            <p>
              Enabling an external model allows adversarial prompts to cross the local sandbox network boundary. Ensure no confidential data or non-cleared canary markers are transmitted.
            </p>
            <textarea
              rows={3}
              value={acknowledgement}
              onChange={(e) => setAcknowledgement(e.target.value)}
              className="w-full p-2 bg-[#0E1524] border border-[#233252] rounded text-xs text-white"
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

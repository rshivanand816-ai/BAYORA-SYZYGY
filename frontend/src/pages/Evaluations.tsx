import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { EvaluationOut } from '../types/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { Plus, RotateCcw, ExternalLink, ShieldCheck, Flame, ArrowRight } from 'lucide-react';

export const Evaluations: React.FC = () => {
  const [evaluations, setEvaluations] = useState<EvaluationOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchEvals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getEvaluations();
      setEvaluations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load evaluations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvals();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="green">COMPLETED</Badge>;
      case 'running':
        return <Badge variant="cyan">RUNNING</Badge>;
      case 'queued':
        return <Badge variant="yellow">QUEUED</Badge>;
      case 'failed':
        return <Badge variant="red">FAILED</Badge>;
      case 'cancelled':
        return <Badge variant="gray">CANCELLED</Badge>;
      default:
        return <Badge variant="blue">{status.toUpperCase()}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#E5EAF2]">AI Safety Evaluations</h1>
          <p className="text-xs text-[#8FA0BE] mt-1">
            Controlled adversarial safety and policy compliance assessments with isolated execution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchEvals}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/evaluations/new')}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New Evaluation
          </Button>
        </div>
      </div>

      {/* ShadowPolicy Feature Card Banner */}
      <div className="bg-gradient-to-r from-[#141C2E] to-[#182440] border border-[#44D7F2]/30 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#44D7F2]/10 border border-[#44D7F2]/30 flex items-center justify-center">
            <Flame className="w-5 h-5 text-[#44D7F2]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#E5EAF2] flex items-center gap-2">
              <span>ShadowPolicy — Blind Policy-Leakage Evaluation</span>
              <Badge variant="cyan">FLAGSHIP INNOVATION</Badge>
            </h3>
            <p className="text-xs text-[#8FA0BE]">
              Evaluate whether Red Team can infer secret Blue Team guardrails using black-box probe timing and response signatures.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/shadowpolicy')}
          icon={<ArrowRight className="w-3.5 h-3.5" />}
        >
          Open ShadowPolicy Lab
        </Button>
      </div>

      {/* Evaluations Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchEvals} />
      ) : evaluations.length === 0 ? (
        <EmptyState
          title="No evaluations created"
          message="No evaluation sessions have been launched yet. Click 'New Evaluation' to configure and run an adversarial test suite."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/evaluations/new')}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Start First Evaluation
            </Button>
          }
        />
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono">
                  <th className="py-3 px-4">Evaluation Name</th>
                  <th className="py-3 px-4">Target Model</th>
                  <th className="py-3 px-4">Suite / Type</th>
                  <th className="py-3 px-4">Defense Policy</th>
                  <th className="py-3 px-4">Budget / Probes</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2942]">
                {evaluations.map((ev) => (
                  <tr
                    key={ev.id}
                    className="hover:bg-[#182238] transition-colors cursor-pointer"
                    onClick={() => navigate(`/evaluations/${ev.id}`)}
                  >
                    <td className="py-3 px-4 font-medium text-[#E5EAF2]">
                      <div className="flex items-center gap-1.5">
                        <span>{ev.name}</span>
                        {ev.simulated && <Badge variant="yellow">SIMULATED</Badge>}
                      </div>
                      <div className="text-[10px] text-[#8FA0BE] font-mono mt-0.5">
                        ID: {ev.id.substring(0, 8)}...
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className="text-[#44D7F2]">{ev.model.name}</span>
                      <span className="text-[#8FA0BE] text-[10px] ml-1">({ev.model.version})</span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="blue" size="sm">
                        {ev.eval_type.replace('_', ' ')}
                      </Badge>
                      {ev.suite && (
                        <div className="text-[10px] text-[#8FA0BE] mt-0.5 truncate max-w-xs">
                          {ev.suite.name}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#8FA0BE]">
                      v{ev.defense.version}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className="text-[#E5EAF2]">{ev.probes_used}</span>
                      <span className="text-[#8FA0BE]"> / {ev.probe_budget}</span>
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(ev.status)}</td>
                    <td className="py-3 px-4 text-[#8FA0BE] text-[11px]">
                      {new Date(ev.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        to={`/evaluations/${ev.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[#44D7F2] hover:underline text-xs"
                      >
                        Inspect
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
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

import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ThreatModelOut } from '../types/api';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { ErrorState } from '../components/common/ErrorState';
import {
  FileSpreadsheet,
  Shield,
  AlertTriangle,
  Lock,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export const ThreatModel: React.FC = () => {
  const [model, setModel] = useState<ThreatModelOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchThreatModel = async () => {
      try {
        setLoading(true);
        const data = await api.getThreatModel();
        setModel(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load threat model');
      } finally {
        setLoading(false);
      }
    };
    fetchThreatModel();
  }, []);

  if (loading && !model) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3">Compiling formal security threat model...</p>
      </div>
    );
  }

  if (error || !model) {
    return <ErrorState message={error || 'Threat model unavailable'} />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-[#44D7F2]" />
          <h1 className="text-xl font-bold text-[#E5EAF2]">
            BAYORA Adversarial Threat Model & Trust Boundaries
          </h1>
        </div>
        <p className="text-xs text-[#8FA0BE] mt-1">
          Formal threat modeling for Problem Statement 04: Securing Adversarial AI Safety Testing Infrastructure.
        </p>
      </div>

      {/* Assets & Sensitivity */}
      <Card title="Protected Assets & Data Sensitivity">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {model.assets?.map((asset: any, idx: number) => (
            <div key={idx} className="p-3 bg-[#0E1524] rounded border border-[#233252] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#E5EAF2]">{asset.name}</span>
                <Badge
                  variant={
                    asset.sensitivity === 'confidential' || asset.sensitivity === 'critical'
                      ? 'red'
                      : 'yellow'
                  }
                >
                  {asset.sensitivity?.toUpperCase()}
                </Badge>
              </div>
              <p className="text-[#8FA0BE] text-[11px] leading-relaxed">{asset.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Trust Boundaries */}
      <Card title="Trust Boundaries & Isolation Controls">
        <div className="space-y-3 text-xs">
          {model.trust_boundaries?.map((tb: any, idx: number) => (
            <div key={idx} className="p-3.5 bg-[#0E1524] rounded border border-[#233252] space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#44D7F2]" />
                <span className="font-semibold text-[#E5EAF2] text-sm">{tb.name}</span>
              </div>
              <div className="text-[11px] text-[#8FA0BE]">
                <strong>Internal Components:</strong> {tb.components_inside?.join(', ')}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tb.controls?.map((ctrl: string, cIdx: number) => (
                  <span
                    key={cIdx}
                    className="px-2 py-0.5 rounded bg-[#141C2E] border border-[#44D7F2]/30 text-[#44D7F2] text-[10px] font-mono"
                  >
                    {ctrl}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Threat Actors & Entry Points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Threat Actors & Profiles">
          <div className="space-y-3 text-xs">
            {model.threat_actors?.map((ta: any, idx: number) => (
              <div key={idx} className="p-3 bg-[#0E1524] rounded border border-[#233252] space-y-1">
                <span className="font-semibold text-[#FF626F]">{ta.name}</span>
                <p className="text-[#8FA0BE] text-[11px]">Capabilities: {ta.capabilities}</p>
                <p className="text-[#8FA0BE] text-[11px]">Intent: {ta.intent}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="System Entry Points">
          <div className="space-y-3 text-xs">
            {model.entry_points?.map((ep: any, idx: number) => (
              <div key={idx} className="p-3 bg-[#0E1524] rounded border border-[#233252] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#E5EAF2]">{ep.name}</span>
                  <Badge variant="blue">{ep.protocol}</Badge>
                </div>
                <div className="text-[#8FA0BE] text-[11px]">Auth: {ep.auth}</div>
                <div className="text-[#8FA0BE] text-[11px]">Exposure: {ep.exposure}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Residual Risks Matrix */}
      <Card title="Residual Risks & Continuous Mitigation Matrix" noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono">
                <th className="py-2.5 px-3">Identified Threat</th>
                <th className="py-2.5 px-3">Implemented Mitigation</th>
                <th className="py-2.5 px-3">Verification Evidence</th>
                <th className="py-2.5 px-3">Remaining Risk</th>
                <th className="py-2.5 px-3">Next Step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D2942]">
              {model.residual_risks?.map((risk: any, idx: number) => (
                <tr key={idx} className="hover:bg-[#182238]">
                  <td className="py-2.5 px-3 font-semibold text-[#FF626F]">
                    {risk.threat}
                  </td>
                  <td className="py-2.5 px-3 text-[#E5EAF2]">
                    {risk.mitigation}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-[#44D7F2]">
                    {risk.evidence}
                  </td>
                  <td className="py-2.5 px-3 text-[#F1BF62]">
                    {risk.remaining}
                  </td>
                  <td className="py-2.5 px-3 text-[#8FA0BE] text-[11px]">
                    {risk.next}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

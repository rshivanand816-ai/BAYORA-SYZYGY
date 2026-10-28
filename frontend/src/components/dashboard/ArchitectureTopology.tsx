import React from 'react';
import { SecurityStatus, FlowInfo } from '../../types/api';
import { ShieldAlert, CheckCircle2, XCircle, ArrowRight, Lock } from 'lucide-react';
import { Badge } from '../common/Badge';

interface ArchitectureTopologyProps {
  status: SecurityStatus;
}

export const ArchitectureTopology: React.FC<ArchitectureTopologyProps> = ({ status }) => {
  // Service node coordinates in an interactive SVG canvas
  const nodePositions: Record<string, { x: number; y: number; label: string; role: string }> = {
    'red-service': { x: 70, y: 70, label: 'Red Team Client', role: 'red' },
    'bayora-controller': { x: 280, y: 150, label: 'Bayora Controller', role: 'core' },
    'blue-policy-service': { x: 70, y: 250, label: 'Blue Policy Service', role: 'blue' },
    'model-gateway': { x: 500, y: 70, label: 'Model Gateway', role: 'gateway' },
    'target-llm': { x: 710, y: 70, label: 'Target Model (Sandbox)', role: 'target' },
    'shadowpolicy-evaluator': { x: 500, y: 250, label: 'ShadowPolicy Engine', role: 'eval' },
    'audit-collector': { x: 280, y: 350, label: 'Audit Hash-Chain', role: 'audit' },
  };

  const getNodeColor = (role: string) => {
    switch (role) {
      case 'red':
        return '#FF626F';
      case 'blue':
        return '#5599FF';
      case 'core':
        return '#44D7F2';
      case 'gateway':
        return '#F1BF62';
      case 'target':
        return '#52D6A0';
      case 'eval':
        return '#B185FF';
      case 'audit':
        return '#38BDF8';
      default:
        return '#8FA0BE';
    }
  };

  return (
    <div className="bg-[#141C2E] border border-[#233252] rounded-lg p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[#233252]">
        <div>
          <h3 className="text-sm font-semibold text-[#E5EAF2] flex items-center gap-2">
            <span>Isolation Boundary & Inter-Service Network Flows</span>
            <Badge variant="cyan" size="sm">
              Docker Network Mode: {status.deployment_mode}
            </Badge>
          </h3>
          <p className="text-xs text-[#8FA0BE] mt-0.5">
            Cryptographic and kernel-level network segmentation (Allowed flows = solid cyan; Forbidden = dashed red)
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-[#52D6A0]">
            <span className="w-2.5 h-0.5 bg-[#52D6A0]"></span>
            <span>Allowed Flow</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#FF626F]">
            <span className="w-2.5 h-0.5 border-t border-dashed border-[#FF626F]"></span>
            <span>Forbidden Boundary (Blocked)</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="w-full overflow-x-auto bg-[#0A0E1A] rounded border border-[#233252]/60 p-2">
        <svg viewBox="0 0 820 430" className="w-full min-w-[700px] h-[360px]">
          <defs>
            <marker
              id="arrow-allowed"
              viewBox="0 0 10 10"
              refX="16"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#44D7F2" />
            </marker>
            <marker
              id="arrow-forbidden"
              viewBox="0 0 10 10"
              refX="16"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#FF626F" />
            </marker>
          </defs>

          {/* Draw Flows */}
          {status.flows.map((flow, idx) => {
            const source = nodePositions[flow.from];
            const target = nodePositions[flow.to];
            if (!source || !target) return null;

            const strokeColor = flow.allowed ? '#44D7F2' : '#FF626F';
            const strokeDash = flow.allowed ? 'none' : '4 4';
            const opacity = flow.allowed ? 0.7 : 0.85;

            // Simple curve calculation
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;

            return (
              <g key={idx} className="group cursor-pointer">
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={strokeColor}
                  strokeWidth={flow.allowed ? 2 : 2.5}
                  strokeDasharray={strokeDash}
                  strokeOpacity={opacity}
                  markerEnd={flow.allowed ? 'url(#arrow-allowed)' : 'url(#arrow-forbidden)'}
                />
                {!flow.allowed && (
                  <circle
                    cx={midX}
                    cy={midY}
                    r="8"
                    fill="#141C2E"
                    stroke="#FF626F"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}

          {/* Draw Nodes */}
          {Object.entries(nodePositions).map(([key, pos]) => {
            const service = status.services.find((s) => s.name === key);
            const isHealthy = service ? service.health === 'healthy' : true;
            const color = getNodeColor(pos.role);

            return (
              <g key={key} transform={`translate(${pos.x - 65}, ${pos.y - 25})`}>
                <rect
                  width="130"
                  height="50"
                  rx="6"
                  fill="#141C2E"
                  stroke={color}
                  strokeWidth="1.5"
                  className="filter drop-shadow"
                />
                <circle
                  cx="16"
                  cy="17"
                  r="4"
                  fill={isHealthy ? '#52D6A0' : '#FF626F'}
                />
                <text
                  x="26"
                  y="20"
                  fill="#E5EAF2"
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="Inter, sans-serif"
                >
                  {pos.label}
                </text>
                <text
                  x="14"
                  y="37"
                  fill="#8FA0BE"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {service?.networks?.[0] || 'isolated-net'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Network boundary notes */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-2.5 rounded bg-[#0E1524] border border-[#233252]/80">
          <div className="font-semibold text-[#FF626F] flex items-center gap-1.5 mb-1">
            <Lock className="w-3.5 h-3.5" />
            Red Team Payloads
          </div>
          <p className="text-[11px] text-[#8FA0BE] leading-relaxed">
            Withheld until test suite completes. Blue cannot inspect ongoing adversarial prompts.
          </p>
        </div>

        <div className="p-2.5 rounded bg-[#0E1524] border border-[#233252]/80">
          <div className="font-semibold text-[#5599FF] flex items-center gap-1.5 mb-1">
            <Lock className="w-3.5 h-3.5" />
            Blue Defense Rules
          </div>
          <p className="text-[11px] text-[#8FA0BE] leading-relaxed">
            Private regex and canary markers never exposed to Red Team probes or API responses.
          </p>
        </div>

        <div className="p-2.5 rounded bg-[#0E1524] border border-[#233252]/80">
          <div className="font-semibold text-[#52D6A0] flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Model Gateway Isolation
          </div>
          <p className="text-[11px] text-[#8FA0BE] leading-relaxed">
            Target LLM runs in dedicated container sandbox; egress blocked except validated loop.
          </p>
        </div>
      </div>
    </div>
  );
};

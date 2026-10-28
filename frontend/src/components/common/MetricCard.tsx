import React from 'react';
import { MetricValue, Provenance } from '../../types/api';
import { Badge } from './Badge';
import { Info } from 'lucide-react';

interface MetricCardProps {
  metric: MetricValue;
  className?: string;
  icon?: React.ReactNode;
}

export const MetricCard: React.FC<MetricCardProps> = ({ metric, className = '', icon }) => {
  const provenanceColor = (prov: Provenance) => {
    switch (prov) {
      case 'measured':
        return 'green';
      case 'calculated':
        return 'blue';
      case 'estimated':
        return 'yellow';
      case 'simulated':
        return 'purple';
      case 'insufficient':
      default:
        return 'gray';
    }
  };

  const isInsufficient = metric.provenance === 'insufficient' || metric.value === null;

  return (
    <div
      className={`bg-[#141C2E] border border-[#233252] rounded-lg p-4 shadow relative flex flex-col justify-between ${className}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-[#8FA0BE] flex items-center gap-1.5">
          {icon}
          {metric.label}
        </span>
        <Badge variant={provenanceColor(metric.provenance)}>
          {metric.provenance.toUpperCase()}
        </Badge>
      </div>

      <div className="my-1">
        {isInsufficient ? (
          <div className="text-lg font-semibold text-[#8FA0BE] italic">
            Insufficient observations
          </div>
        ) : (
          <div className="text-2xl font-bold font-mono text-[#E5EAF2] tracking-tight">
            {metric.display}
          </div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-[#233252]/60 flex items-center justify-between text-[11px] text-[#8FA0BE]">
        <div className="flex items-center gap-2">
          <span>n = {metric.n}</span>
          {metric.numerator !== null && metric.denominator !== null && metric.denominator !== undefined && (
            <span className="text-[#8FA0BE]/70">
              ({metric.numerator}/{metric.denominator})
            </span>
          )}
        </div>
        {metric.formula && (
          <span
            className="flex items-center gap-1 cursor-help hover:text-[#E5EAF2]"
            title={`Formula: ${metric.formula}`}
          >
            <Info className="w-3 h-3 text-[#8FA0BE]" />
            formula
          </span>
        )}
      </div>
    </div>
  );
};

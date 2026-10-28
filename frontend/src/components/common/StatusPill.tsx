import React from 'react';
import { CheckStatus } from '../../types/api';
import { CheckCircle2, XCircle, AlertTriangle, FlaskConical, HelpCircle } from 'lucide-react';

interface StatusPillProps {
  status: CheckStatus | string;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, className = '' }) => {
  switch (status) {
    case 'verified_pass':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#52D6A0]/10 text-[#52D6A0] border border-[#52D6A0]/30 ${className}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-[#52D6A0]" />
          Verified
        </span>
      );
    case 'failed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FF626F]/10 text-[#FF626F] border border-[#FF626F]/30 ${className}`}
        >
          <XCircle className="w-3.5 h-3.5 text-[#FF626F]" />
          Failed
        </span>
      );
    case 'configured_untested':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F1BF62]/10 text-[#F1BF62] border border-[#F1BF62]/30 ${className}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-[#F1BF62]" />
          Configured – untested
        </span>
      );
    case 'simulated':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#44D7F2]/10 text-[#44D7F2] border border-[#44D7F2]/30 ${className}`}
        >
          <FlaskConical className="w-3.5 h-3.5 text-[#44D7F2]" />
          Simulated
        </span>
      );
    case 'unsupported':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#233252]/50 text-[#8FA0BE] border border-[#233252] ${className}`}
        >
          <HelpCircle className="w-3.5 h-3.5 text-[#8FA0BE]" />
          Unsupported / no telemetry
        </span>
      );
  }
};

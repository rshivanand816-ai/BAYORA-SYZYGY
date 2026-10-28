import React from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load telemetry',
  message = 'An unexpected error occurred while communicating with the Bayora backend services.',
  onRetry,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-[#FF626F]/30 rounded-lg bg-[#FF626F]/5">
      <div className="w-12 h-12 rounded-full bg-[#FF626F]/10 flex items-center justify-center text-[#FF626F] mb-3">
        <AlertOctagon className="w-6 h-6" />
      </div>
      <h4 className="text-sm font-semibold text-[#FF626F] mb-1">{title}</h4>
      <p className="text-xs text-[#8FA0BE] max-w-sm mb-4 leading-relaxed">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} icon={<RotateCcw className="w-3.5 h-3.5" />}>
          Retry Request
        </Button>
      )}
    </div>
  );
};

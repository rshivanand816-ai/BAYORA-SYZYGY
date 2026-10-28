import React from 'react';
import { Database } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No records found',
  message = 'No data has been recorded for this view yet. Start an evaluation or run a test to populate results.',
  action,
  icon,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-[#233252] rounded-lg bg-[#0F1729]/50">
      <div className="w-12 h-12 rounded-full bg-[#1A243B] flex items-center justify-center text-[#8FA0BE] mb-3">
        {icon || <Database className="w-6 h-6 text-[#44D7F2]" />}
      </div>
      <h4 className="text-sm font-semibold text-[#E5EAF2] mb-1">{title}</h4>
      <p className="text-xs text-[#8FA0BE] max-w-sm mb-4 leading-relaxed">{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
};

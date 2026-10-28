import React from 'react';

interface BadgeProps {
  variant?: 'cyan' | 'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'gray';
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'gray',
  children,
  className = '',
  size = 'sm',
}) => {
  const variants = {
    cyan: 'bg-[#44D7F2]/10 text-[#44D7F2] border-[#44D7F2]/30',
    blue: 'bg-[#5599FF]/10 text-[#5599FF] border-[#5599FF]/30',
    red: 'bg-[#FF626F]/10 text-[#FF626F] border-[#FF626F]/30',
    green: 'bg-[#52D6A0]/10 text-[#52D6A0] border-[#52D6A0]/30',
    yellow: 'bg-[#F1BF62]/10 text-[#F1BF62] border-[#F1BF62]/30',
    purple: 'bg-[#B185FF]/10 text-[#B185FF] border-[#B185FF]/30',
    gray: 'bg-[#233252]/40 text-[#8FA0BE] border-[#233252]',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-medium rounded border ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
};

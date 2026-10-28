import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center font-medium rounded transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0B1020] disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const sizes = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  };

  const variants = {
    primary:
      'bg-[#44D7F2] text-[#0B1020] font-semibold hover:bg-[#34c6e0] focus:ring-[#44D7F2] shadow-sm shadow-[#44D7F2]/20',
    secondary:
      'bg-[#1F2B44] text-[#E5EAF2] hover:bg-[#283756] border border-[#2D3E63] focus:ring-[#5599FF]',
    danger:
      'bg-[#FF626F] text-white font-semibold hover:bg-[#e64e5c] focus:ring-[#FF626F] shadow-sm shadow-[#FF626F]/20',
    outline:
      'border border-[#233252] text-[#E5EAF2] hover:bg-[#182238] hover:border-[#384F7E] focus:ring-[#44D7F2]',
    ghost:
      'text-[#8FA0BE] hover:text-[#E5EAF2] hover:bg-[#182238] focus:ring-[#8FA0BE]',
  };

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
};

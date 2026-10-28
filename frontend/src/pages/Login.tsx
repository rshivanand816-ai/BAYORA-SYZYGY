import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, User, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '../components/common/Button';

const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setServerError(null);
      setSubmitting(true);
      await login(data.username, data.password);
      navigate('/');
    } catch (err: any) {
      setServerError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillUsername = (user: string) => {
    setValue('username', user);
  };

  return (
    <div className="min-h-screen bg-[#0B1020] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background ambient security grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#233252_1px,transparent_1px)] [background-size:24px_24px] opacity-25"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[#44D7F2]/10 border border-[#44D7F2]/30 mb-3 shadow-lg shadow-[#44D7F2]/10">
            <Shield className="w-8 h-8 text-[#44D7F2]" />
          </div>
          <h1 className="text-2xl font-bold font-mono tracking-wider text-white">
            BAYORA
          </h1>
          <p className="text-xs text-[#8FA0BE] mt-1 font-mono">
            Securing Adversarial AI Safety Testing Infrastructure
          </p>
          <div className="mt-2 text-[11px] text-[#44D7F2] font-mono">
            Hack in Hills ’26 · Team SYZYGY
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#141C2E] border border-[#233252] rounded-xl p-7 shadow-2xl">
          <h2 className="text-base font-semibold text-[#E5EAF2] mb-1">
            Sign in to Safety Console
          </h2>
          <p className="text-xs text-[#8FA0BE] mb-6">
            Strict isolation boundaries enforced. Select an operator role.
          </p>

          {serverError && (
            <div className="mb-5 p-3 rounded bg-[#FF626F]/10 border border-[#FF626F]/30 flex items-start gap-2.5 text-xs text-[#FF626F]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8FA0BE]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  {...register('username')}
                  type="text"
                  placeholder="e.g. admin, red, blue, auditor"
                  className="w-full pl-9 pr-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-xs text-white placeholder-[#8FA0BE]/40 focus:outline-none focus:border-[#44D7F2] focus:ring-1 focus:ring-[#44D7F2]"
                />
              </div>
              {errors.username && (
                <p className="text-[11px] text-[#FF626F] mt-1">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8FA0BE] mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8FA0BE]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  {...register('password')}
                  type="password"
                  placeholder="Enter role password"
                  className="w-full pl-9 pr-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-xs text-white placeholder-[#8FA0BE]/40 focus:outline-none focus:border-[#44D7F2] focus:ring-1 focus:ring-[#44D7F2]"
                />
              </div>
              {errors.password && (
                <p className="text-[11px] text-[#FF626F] mt-1">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              loading={submitting}
            >
              Authenticate Operator
            </Button>
          </form>

          {/* Quick-select Demo Roles */}
          <div className="mt-6 pt-5 border-t border-[#233252]">
            <div className="flex items-center gap-1.5 text-[11px] text-[#8FA0BE] mb-2 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-[#44D7F2]" />
              <span>Demo Operator Roles (Local Dev):</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => fillUsername('admin')}
                className="p-2 rounded bg-[#0E1524] border border-[#233252] text-left hover:border-[#F1BF62] transition-colors"
              >
                <div className="font-semibold text-[#F1BF62]">Admin</div>
                <div className="text-[10px] text-[#8FA0BE]">username: admin</div>
              </button>
              <button
                type="button"
                onClick={() => fillUsername('red')}
                className="p-2 rounded bg-[#0E1524] border border-[#233252] text-left hover:border-[#FF626F] transition-colors"
              >
                <div className="font-semibold text-[#FF626F]">Red Team</div>
                <div className="text-[10px] text-[#8FA0BE]">username: red</div>
              </button>
              <button
                type="button"
                onClick={() => fillUsername('blue')}
                className="p-2 rounded bg-[#0E1524] border border-[#233252] text-left hover:border-[#5599FF] transition-colors"
              >
                <div className="font-semibold text-[#5599FF]">Blue Team</div>
                <div className="text-[10px] text-[#8FA0BE]">username: blue</div>
              </button>
              <button
                type="button"
                onClick={() => fillUsername('auditor')}
                className="p-2 rounded bg-[#0E1524] border border-[#233252] text-left hover:border-[#B185FF] transition-colors"
              >
                <div className="font-semibold text-[#B185FF]">Auditor</div>
                <div className="text-[10px] text-[#8FA0BE]">username: auditor</div>
              </button>
            </div>
            <p className="text-[10px] text-[#8FA0BE]/70 mt-3 text-center leading-relaxed">
              Passwords are set in the backend environment (<code>BAYORA_DEMO_*_PASSWORD</code>) and
              are never shipped in the browser bundle.
            </p>
          </div>
        </div>

        {/* Team Footer */}
        <div className="text-center mt-6 text-xs text-[#8FA0BE]/60">
          Developed by SYZYGY (Shivanand Rai · Tanish Jain · Aashish Bodal)
        </div>
      </div>
    </div>
  );
};

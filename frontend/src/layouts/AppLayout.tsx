import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  FlaskConical,
  Crosshair,
  ShieldAlert,
  Ghost,
  Boxes,
  ScrollText,
  FileCheck2,
  Server,
  FileSpreadsheet,
  Settings,
  LogOut,
  User,
  Shield,
} from 'lucide-react';
import { Badge } from '../components/common/Badge';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const role = user?.role || 'red';

  const navItems = [
    {
      label: 'Dashboard',
      path: '/',
      icon: <LayoutDashboard className="w-4 h-4" />,
      roles: ['admin', 'red', 'blue', 'auditor'],
    },
    {
      label: 'Evaluations',
      path: '/evaluations',
      icon: <FlaskConical className="w-4 h-4" />,
      roles: ['admin', 'red', 'blue', 'auditor'],
    },
    {
      label: 'Red Workbench',
      path: '/red',
      icon: <Crosshair className="w-4 h-4" />,
      roles: ['admin', 'red'],
    },
    {
      label: 'Blue Console',
      path: '/blue',
      icon: <ShieldAlert className="w-4 h-4" />,
      roles: ['admin', 'blue'],
    },
    {
      label: 'ShadowPolicy Lab',
      path: '/shadowpolicy',
      icon: <Ghost className="w-4 h-4" />,
      roles: ['admin', 'red', 'blue', 'auditor'],
      badge: 'PROPOSED',
    },
    {
      label: 'Model Registry',
      path: '/models',
      icon: <Boxes className="w-4 h-4" />,
      roles: ['admin', 'red', 'blue', 'auditor'],
    },
    {
      label: 'Audit Explorer',
      path: '/audit',
      icon: <ScrollText className="w-4 h-4" />,
      roles: ['admin', 'auditor'],
    },
    {
      label: 'Reports',
      path: '/reports',
      icon: <FileCheck2 className="w-4 h-4" />,
      roles: ['admin', 'red', 'blue', 'auditor'],
    },
    {
      label: 'Isolation Center',
      path: '/isolation',
      icon: <Server className="w-4 h-4" />,
      roles: ['admin', 'blue', 'auditor'],
    },
    {
      label: 'Threat Model',
      path: '/threat-model',
      icon: <FileSpreadsheet className="w-4 h-4" />,
      roles: ['admin', 'red', 'blue', 'auditor'],
    },
    {
      label: 'Settings',
      path: '/settings',
      icon: <Settings className="w-4 h-4" />,
      roles: ['admin', 'red', 'blue', 'auditor'],
    },
  ];

  const allowedNav = navItems.filter((item) =>
    role === 'admin' ? true : item.roles.includes(role)
  );

  const getRoleBadgeVariant = (r: string) => {
    switch (r) {
      case 'admin':
        return 'yellow';
      case 'red':
        return 'red';
      case 'blue':
        return 'blue';
      case 'auditor':
        return 'purple';
      default:
        return 'gray';
    }
  };

  return (
    <div className="flex h-screen bg-[#0B1020] text-[#E5EAF2] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#141C2E] border-r border-[#233252] flex flex-col justify-between shrink-0">
        <div>
          {/* Logo & Platform Info */}
          <div className="p-4 border-b border-[#233252]">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-[#44D7F2]/10 border border-[#44D7F2]/30 flex items-center justify-center">
                <Shield className="w-5 h-5 text-[#44D7F2]" />
              </div>
              <div>
                <span className="text-base font-bold font-mono tracking-wider text-white">
                  BAYORA
                </span>
                <span className="block text-[10px] text-[#44D7F2] font-mono leading-none">
                  AI SAFETY HARNESS
                </span>
              </div>
            </Link>
            <div className="mt-3 flex items-center justify-between text-[11px] text-[#8FA0BE] bg-[#0E1524] px-2.5 py-1.5 rounded border border-[#233252]/60">
              {/* Deliberately not a green "secure" indicator. Isolation status is
                  reported by the Isolation Center from real checks, and several
                  of those are only 'configured_untested' in this environment. */}
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#F1BF62]"></span>
                <span>Isolation status: see Isolation Center</span>
              </span>
              <span className="font-mono text-[10px]">PS-04</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-210px)]">
            {allowedNav.map((item) => {
              const active =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[#18233C] text-[#44D7F2] border-l-2 border-[#44D7F2]'
                      : 'text-[#8FA0BE] hover:text-[#E5EAF2] hover:bg-[#182238]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#44D7F2]/10 text-[#44D7F2] border border-[#44D7F2]/30">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Status & Logout */}
        <div className="p-3 border-t border-[#233252] bg-[#0E1524]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-[#233252] flex items-center justify-center text-xs text-[#E5EAF2]">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-[#E5EAF2] truncate">
                  {user?.display_name || user?.username || 'User'}
                </p>
                <div className="flex items-center gap-1">
                  <Badge variant={getRoleBadgeVariant(role)} size="sm">
                    {role.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Logout session"
              className="p-1.5 text-[#8FA0BE] hover:text-[#FF626F] hover:bg-[#182238] rounded transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-[#8FA0BE]/70 text-center font-mono">
            Team SYZYGY · Hack in Hills ’26
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-14 bg-[#141C2E] border-b border-[#233252] px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[#8FA0BE]">
              Securing the Integrity of Adversarial AI Testing
            </span>
            <span className="text-[#233252]">•</span>
            <span className="text-xs font-mono text-[#F1BF62]/80 bg-[#F1BF62]/10 px-2 py-0.5 rounded border border-[#F1BF62]/20">
              Boundary claims are reported, not assumed
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-[#8FA0BE]">
            <span className="flex items-center gap-1 font-mono">
              <span className="text-[#44D7F2]">●</span> Multi-Store SHA-256 (tamper-evident)
            </span>
            <span className="text-[#233252]">•</span>
            <span>Tenant: <strong className="text-[#E5EAF2] font-mono">{user?.tenant || 'default'}</strong></span>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#0B1020]">
          <Outlet />
        </main>

        {/* Sub-footer */}
        <footer className="h-8 bg-[#0E1524] border-t border-[#233252] px-6 flex items-center justify-between text-[11px] text-[#8FA0BE] shrink-0">
          <span>
            BAYORA — Securing Adversarial AI Safety Testing Infrastructure · Team SYZYGY
          </span>
          <span className="font-mono text-[10px]">
            Shivanand Rai · Tanish Jain · Aashish Bodal
          </span>
        </footer>
      </div>
    </div>
  );
};

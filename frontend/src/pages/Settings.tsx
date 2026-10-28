import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  UserOut,
  UserCreate,
  DatasetSourceOut,
  ImportJobOut,
  AboutOut,
} from '../types/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { Modal } from '../components/common/Modal';
import { Tabs } from '../components/common/Tabs';
import { ErrorState } from '../components/common/ErrorState';
import {
  Settings as SettingsIcon,
  Users,
  Database,
  Info,
  Plus,
  RotateCcw,
  Key,
  Shield,
  Upload,
  CheckCircle2,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [activeTab, setActiveTab] = useState<'team' | 'users' | 'datasets' | 'system'>('team');

  // Team & About
  const [about, setAbout] = useState<AboutOut | null>(null);

  // Users
  const [users, setUsers] = useState<UserOut[]>([]);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'red' | 'blue' | 'auditor'>('red');
  const [creatingUser, setCreatingUser] = useState(false);

  // Datasets
  const [sources, setSources] = useState<DatasetSourceOut[]>([]);
  const [imports, setImports] = useState<ImportJobOut[]>([]);

  // System Settings
  const [systemSettings, setSystemSettings] = useState<Record<string, any>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [aboutData, sourcesData, importsData] = await Promise.all([
        api.getAbout(),
        api.getDatasetSources(),
        api.getDatasetImports(),
      ]);
      setAbout(aboutData);
      setSources(sourcesData);
      setImports(importsData);

      if (isAdmin) {
        const [usersData, settingsData] = await Promise.all([
          api.getUsers(),
          api.getSystemSettings(),
        ]);
        setUsers(usersData);
        setSystemSettings(settingsData);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load settings data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isAdmin]);

  const handleCreateUser = async () => {
    if (!newUsername.trim() || !newEmail.trim() || !newPassword.trim()) return;
    try {
      setCreatingUser(true);
      await api.createUser({
        username: newUsername,
        email: newEmail,
        password: newPassword,
        role: newRole,
      });
      setIsCreateUserOpen(false);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      const uList = await api.getUsers();
      setUsers(uList);
    } catch (err: any) {
      alert(err.message || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  if (loading && !about) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3">Loading system configuration...</p>
      </div>
    );
  }

  const tabs = [
    { id: 'team', label: 'Team SYZYGY & About', icon: <Info className="w-4 h-4" /> },
    ...(isAdmin
      ? [
          { id: 'users', label: 'User RBAC Accounts', icon: <Users className="w-4 h-4" /> },
          { id: 'system', label: 'System Configuration', icon: <SettingsIcon className="w-4 h-4" /> },
        ]
      : []),
    { id: 'datasets', label: 'Adversarial Datasets', icon: <Database className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-[#44D7F2]" />
            <h1 className="text-xl font-bold text-[#E5EAF2]">Platform Settings & Metadata</h1>
          </div>
          <p className="text-xs text-[#8FA0BE] mt-1">
            System metadata, team identification, user RBAC administration, and dataset provenance.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          icon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          Refresh
        </Button>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      <Tabs
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
        tabs={tabs}
      />

      {/* TAB 1: TEAM SYZYGY & ABOUT */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <Card title="Team SYZYGY — Project Information">
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-[#0E1524] border border-[#44D7F2]/30 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-white font-mono tracking-wide">
                    {about?.product || 'BAYORA'}
                  </span>
                  <Badge variant="cyan">HACK IN HILLS ’26</Badge>
                </div>
                <p className="text-xs text-[#44D7F2]">
                  {about?.tagline || 'Securing Adversarial AI Safety Testing Infrastructure'}
                </p>
                <div className="text-[11px] text-[#8FA0BE] border-t border-[#233252] pt-2">
                  <strong>Problem Statement:</strong> {about?.problem_statement || '04 — Securing Adversarial AI Safety Testing Infrastructure'}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-[#E5EAF2] mb-2 uppercase tracking-wider text-[11px] font-mono">
                  Team Members:
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(about?.members || ['Shivanand Rai', 'Tanish Jain', 'Aashish Bodal']).map(
                    (member, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-[#0E1524] border border-[#233252] rounded-lg text-center"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#44D7F2]/10 border border-[#44D7F2]/30 flex items-center justify-center text-[#44D7F2] font-bold mx-auto mb-1">
                          {member.charAt(0)}
                        </div>
                        <span className="font-semibold text-[#E5EAF2] text-xs">{member}</span>
                        <div className="text-[10px] text-[#8FA0BE] mt-0.5">Team SYZYGY</div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: USERS (ADMIN ONLY) */}
      {activeTab === 'users' && isAdmin && (
        <div className="space-y-4">
          <Card
            title={`Managed RBAC Users (${users.length})`}
            subtitle="Operators assigned to Red, Blue, Auditor, or Admin boundaries"
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateUserOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Create Operator
              </Button>
            }
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono">
                    <th className="py-2.5 px-3">Username</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Email</th>
                    <th className="py-2.5 px-3">Tenant</th>
                    <th className="py-2.5 px-3">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D2942]">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#182238]">
                      <td className="py-2.5 px-3 font-semibold text-[#E5EAF2]">{u.username}</td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant={
                            u.role === 'admin'
                              ? 'yellow'
                              : u.role === 'red'
                              ? 'red'
                              : u.role === 'blue'
                              ? 'blue'
                              : 'purple'
                          }
                        >
                          {u.role.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-[#8FA0BE]">{u.email}</td>
                      <td className="py-2.5 px-3 font-mono text-[#8FA0BE]">{u.tenant}</td>
                      <td className="py-2.5 px-3">
                        {u.is_active ? (
                          <span className="text-[#52D6A0]">Active</span>
                        ) : (
                          <span className="text-[#FF626F]">Disabled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: DATASETS */}
      {activeTab === 'datasets' && (
        <div className="space-y-4">
          <Card title="Adversarial Benchmark Dataset Sources">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {sources.map((src) => (
                <div key={src.id} className="p-3 bg-[#0E1524] border border-[#233252] rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#E5EAF2]">{src.name}</span>
                    <Badge variant="cyan">{src.kind.toUpperCase()}</Badge>
                  </div>
                  <div className="text-[11px] text-[#8FA0BE]">{src.license_note}</div>
                  <div className="text-[10px] text-[#8FA0BE]/70 font-mono">
                    Supported: {src.supported_formats.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: SYSTEM CONFIGURATION (ADMIN) */}
      {activeTab === 'system' && isAdmin && (
        <Card title="Allowlisted System Runtime Parameters">
          <div className="space-y-3 text-xs font-mono">
            {Object.entries(systemSettings).map(([key, val]) => (
              <div key={key} className="flex justify-between p-2.5 bg-[#0E1524] rounded border border-[#233252]">
                <span className="text-[#8FA0BE]">{key}:</span>
                <span className="text-[#44D7F2]">{String(val)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Create User Modal */}
      <Modal
        isOpen={isCreateUserOpen}
        onClose={() => setIsCreateUserOpen(false)}
        title="Create New RBAC User Account"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsCreateUserOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={creatingUser}
              onClick={handleCreateUser}
            >
              Create Account
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[#8FA0BE] mb-1">Username</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-white"
            />
          </div>
          <div>
            <label className="block text-[#8FA0BE] mb-1">Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-white"
            />
          </div>
          <div>
            <label className="block text-[#8FA0BE] mb-1">Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as any)}
              className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-white"
            >
              <option value="red">Red Team Operator</option>
              <option value="blue">Blue Team Defender</option>
              <option value="auditor">Auditor</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <div>
            <label className="block text-[#8FA0BE] mb-1">Password (min 12 chars)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-[#0E1524] border border-[#233252] rounded text-white"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

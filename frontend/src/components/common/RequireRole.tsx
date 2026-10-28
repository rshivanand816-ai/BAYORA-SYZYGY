import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { RoleName } from '../../types/api';
import { Card } from './Card';

interface Props {
  roles: RoleName[];
  children: React.ReactNode;
}

/**
 * Client-side route guard.
 *
 * This is a *user-experience* control only. The authoritative authorization
 * boundary is the backend, which enforces roles on every endpoint and writes
 * an `authz.denied` security event when it refuses. A user who reaches a
 * forbidden page in the browser still gets a 403 from the API.
 */
export const RequireRole: React.FC<Props> = ({ roles, children }) => {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!hasRole(...roles)) {
    return (
      <Card title="Not authorized for this console" noPadding className="p-5">
        <p className="text-sm text-[#E5EAF2]">
          Your role is{' '}
          <span className="font-mono text-[#44D7F2]">{user.role.toUpperCase()}</span>. This screen
          requires one of:{' '}
          <span className="font-mono text-[#8FA0BE]">{roles.join(', ')}</span>.
        </p>
        <p className="mt-2 text-xs text-[#8FA0BE]">
          The restriction is enforced by the API as well. Accessing this screen is recorded as a
          denied authorization attempt in the audit trail.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
};

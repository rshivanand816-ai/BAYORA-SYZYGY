import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Evaluations } from './pages/Evaluations';
import { NewEvaluationWizard } from './pages/NewEvaluationWizard';
import { EvaluationDetail } from './pages/EvaluationDetail';
import { RedWorkbench } from './pages/RedWorkbench';
import { BlueConsole } from './pages/BlueConsole';
import { ShadowPolicyLab } from './pages/ShadowPolicyLab';
import { ShadowPolicyRoundDetail } from './pages/ShadowPolicyRoundDetail';
import { ModelsRegistry } from './pages/ModelsRegistry';
import { AuditExplorer } from './pages/AuditExplorer';
import { Reports } from './pages/Reports';
import { ReportDetail } from './pages/ReportDetail';
import { IsolationCenter } from './pages/IsolationCenter';
import { ThreatModel } from './pages/ThreatModel';
import { Settings } from './pages/Settings';
import { Spinner } from './components/common/Spinner';
import { RequireRole } from './components/common/RequireRole';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1020] flex flex-col items-center justify-center">
        <Spinner size="lg" />
        <p className="text-xs text-[#8FA0BE] mt-3 font-mono">Authenticating session security...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <Dashboard />
                  </RequireRole>
                }
              />
              <Route
                path="evaluations"
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <Evaluations />
                  </RequireRole>
                }
              />
              <Route
                path="evaluations/new"
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <NewEvaluationWizard />
                  </RequireRole>
                }
              />
              <Route
                path="evaluations/:id"
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <EvaluationDetail />
                  </RequireRole>
                }
              />
              <Route
                path="red"
                element={
                  <RequireRole roles={['admin', 'red']}>
                    <RedWorkbench />
                  </RequireRole>
                }
              />
              <Route
                path="blue"
                element={
                  <RequireRole roles={['admin', 'blue']}>
                    <BlueConsole />
                  </RequireRole>
                }
              />
              <Route
                path="shadowpolicy"
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <ShadowPolicyLab />
                  </RequireRole>
                }
              />
              <Route
                path="shadowpolicy/:id"
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <ShadowPolicyRoundDetail />
                  </RequireRole>
                }
              />
              <Route
                path="models"
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <ModelsRegistry />
                  </RequireRole>
                }
              />
              <Route
                path="audit"
                element={
                  <RequireRole roles={['admin', 'auditor']}>
                    <AuditExplorer />
                  </RequireRole>
                }
              />
              <Route
                path="reports"
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <Reports />
                  </RequireRole>
                }
              />
              <Route
                path="reports/:id"
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <ReportDetail />
                  </RequireRole>
                }
              />
              <Route
                path="isolation"
                element={
                  <RequireRole roles={['admin', 'blue', 'auditor']}>
                    <IsolationCenter />
                  </RequireRole>
                }
              />
              <Route
                path="threat-model"
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <ThreatModel />
                  </RequireRole>
                }
              />
              <Route
                path="settings"
                element={
                  <RequireRole roles={['admin', 'red', 'blue', 'auditor']}>
                    <Settings />
                  </RequireRole>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

import {
  ApiErrorResponse,
  LoginRequest,
  LoginResponse,
  UserOut,
  DashboardSummary,
  ModelOut,
  ModelCreate,
  ModelImportRequest,
  ExternalEnableRequest,
  HealthCheckOut,
  TestSuiteOut,
  TestCaseOut,
  EvaluationCreate,
  EvaluationOut,
  EvaluationResults,
  RedResults,
  ProbeBudget,
  ProbeRequest,
  ProbeResult,
  PolicyVersionOut,
  PolicyVersionCreate,
  DefensePolicyOut,
  DefensePolicyCreate,
  PolicyVersionRef,
  DefenseSummary,
  MitigationRequest,
  ComparisonOut,
  RoundCreate,
  RoundOut,
  RoundDetail,
  RoundResults,
  SPCatalog,
  SPProbeRequest,
  SPObservation,
  GuessSubmit,
  CommitmentVerification,
  AuditEventOut,
  AuditEventsPage,
  AuditVerifyResult,
  CheckpointOut,
  TamperDemoResult,
  SecurityStatus,
  IsolationRun,
  IsolationCheckOut,
  ThreatModelOut,
  DatasetSourceOut,
  ImportJobOut,
  UserCreate,
  UserUpdate,
  AboutOut,
} from '../types/api';

export class ApiError extends Error {
  code: string;
  traceId?: string | null;
  status: number;

  constructor(status: number, code: string, message: string, traceId?: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.traceId = traceId;
  }
}

const BASE_URL = '/api/v1';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  // For non-GET requests, attach CSRF header required by Bayora
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-Bayora-CSRF', '1');
  }

  // Ensure JSON content-type if body is JSON string and not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // essential for HttpOnly session cookie
  });

  if (!response.ok) {
    let errorCode = 'unknown_error';
    let errorMessage = `HTTP error ${response.status}`;
    let traceId: string | null = null;

    try {
      const errJson: ApiErrorResponse = await response.json();
      if (errJson?.error) {
        errorCode = errJson.error.code || errorCode;
        errorMessage = errJson.error.message || errorMessage;
        traceId = errJson.error.trace_id || null;
      }
    } catch {
      // not JSON
      errorMessage = response.statusText || errorMessage;
    }

    if (response.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    throw new ApiError(response.status, errorCode, errorMessage, traceId);
  }

  // Handle empty or 204 responses
  if (response.status === 204) {
    return {} as T;
  }

  // Handle binary/download if requested
  const contentType = response.headers.get('content-type');
  if (contentType && (contentType.includes('application/pdf') || contentType.includes('application/octet-stream'))) {
    return (await response.blob()) as unknown as T;
  }

  return response.json();
}

export const api = {
  // Auth
  login: (data: LoginRequest) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  logout: () =>
    request<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
    }),
  getMe: () => request<UserOut>('/auth/me'),

  // Dashboard & Meta
  getDashboardSummary: () => request<DashboardSummary>('/dashboard/summary'),
  getDashboardRecentEvents: (limit = 10) =>
    request<AuditEventOut[]>(`/dashboard/recent-events?limit=${limit}`),
  getAbout: () => request<AboutOut>('/meta/about'),

  // Models Gateway
  getModels: () => request<ModelOut[]>('/models'),
  getModel: (id: string) => request<ModelOut>(`/models/${id}`),
  createModel: (data: ModelCreate) =>
    request<ModelOut>('/models', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  importHFModel: (data: ModelImportRequest) =>
    request<ModelOut>('/models/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  uploadModel: (formData: FormData) =>
    request<ModelOut>('/models/upload', {
      method: 'POST',
      body: formData,
    }),
  validateModel: (id: string) =>
    request<ModelOut>(`/models/${id}/validate`, {
      method: 'POST',
    }),
  healthCheckModel: (id: string) =>
    request<HealthCheckOut>(`/models/${id}/health-check`, {
      method: 'POST',
    }),
  approveModel: (id: string) =>
    request<ModelOut>(`/models/${id}/approve`, {
      method: 'POST',
    }),
  disableModel: (id: string) =>
    request<ModelOut>(`/models/${id}/disable`, {
      method: 'POST',
    }),
  enableExternalModel: (id: string, data: ExternalEnableRequest) =>
    request<ModelOut>(`/models/${id}/enable-external`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Test Suites & Cases
  getTestSuites: () => request<TestSuiteOut[]>('/test-suites'),
  getTestSuiteCases: (suiteId: string) =>
    request<TestCaseOut[]>(`/test-suites/${suiteId}/cases`),

  // Evaluations
  getEvaluations: () => request<EvaluationOut[]>('/evaluations'),
  getEvaluation: (id: string) => request<EvaluationOut>(`/evaluations/${id}`),
  createEvaluation: (data: EvaluationCreate) =>
    request<EvaluationOut>('/evaluations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  startEvaluation: (id: string) =>
    request<EvaluationOut>(`/evaluations/${id}/start`, {
      method: 'POST',
    }),
  cancelEvaluation: (id: string) =>
    request<EvaluationOut>(`/evaluations/${id}/cancel`, {
      method: 'POST',
    }),
  getEvaluationResults: (id: string) =>
    request<EvaluationResults>(`/evaluations/${id}/results`),
  getEvaluationReport: (id: string) =>
    request<any>(`/evaluations/${id}/report`),
  downloadEvaluationReportPdf: (id: string) =>
    request<Blob>(`/evaluations/${id}/report?format=pdf`),

  // Red Team Workbench
  getRedResults: (id: string) => request<RedResults>(`/evaluations/${id}/red-results`),
  getProbeBudget: (id: string) => request<ProbeBudget>(`/evaluations/${id}/probe-budget`),
  submitProbe: (id: string, data: ProbeRequest) =>
    request<ProbeResult>(`/evaluations/${id}/probes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Blue Team Console
  getBluePolicies: () => request<DefensePolicyOut[]>('/blue/policies'),
  createBluePolicy: (data: DefensePolicyCreate) =>
    request<DefensePolicyOut>('/blue/policies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getPolicyVersions: (policyId: string) =>
    request<PolicyVersionOut[]>(`/blue/policies/${policyId}/versions`),
  createPolicyVersion: (policyId: string, data: PolicyVersionCreate) =>
    request<PolicyVersionOut>(`/blue/policies/${policyId}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getPolicyRefs: () => request<PolicyVersionRef[]>('/blue/policy-refs'),
  getDefenseSummary: () => request<DefenseSummary>('/blue/defense-summary'),
  getMitigations: () => request<ComparisonOut[]>('/blue/mitigations'),
  runMitigationComparison: (data: MitigationRequest) =>
    request<ComparisonOut>('/blue/mitigations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ShadowPolicy Lab (First-class Showcase)
  getSPCatalog: () => request<SPCatalog>('/shadowpolicy/catalog'),
  getSPRedUsers: () => request<UserOut[]>('/shadowpolicy/red-users'),
  getSPRounds: () => request<RoundOut[]>('/shadowpolicy/rounds'),
  createSPRound: (data: RoundCreate) =>
    request<RoundOut>('/shadowpolicy/rounds', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getSPRound: (id: string) => request<RoundDetail>(`/shadowpolicy/rounds/${id}`),
  startSPRound: (id: string) =>
    request<RoundOut>(`/shadowpolicy/rounds/${id}/start`, {
      method: 'POST',
    }),
  submitSPProbe: (id: string, data: SPProbeRequest) =>
    request<SPObservation>(`/shadowpolicy/rounds/${id}/probes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  lockSPGuesses: (id: string, data: GuessSubmit) =>
    request<RoundOut>(`/shadowpolicy/rounds/${id}/lock-guesses`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  finalizeSPRound: (id: string) =>
    request<RoundResults>(`/shadowpolicy/rounds/${id}/finalize`, {
      method: 'POST',
    }),
  getSPResults: (id: string) =>
    request<RoundResults>(`/shadowpolicy/rounds/${id}/results`),
  verifySPCommitment: (id: string) =>
    request<CommitmentVerification>(`/shadowpolicy/rounds/${id}/verify-commitment`, {
      method: 'POST',
    }),

  // Audit Collector & Tamper Evidence
  getAuditEvents: (params?: {
    actor?: string;
    session_id?: string;
    category?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.actor) q.set('actor', params.actor);
    if (params?.session_id) q.set('session_id', params.session_id);
    if (params?.category) q.set('category', params.category);
    if (params?.severity) q.set('severity', params.severity);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return request<AuditEventsPage>(`/audit/events?${q.toString()}`);
  },
  verifyAuditChain: () =>
    request<AuditVerifyResult>('/audit/verify', {
      method: 'POST',
    }),
  getAuditCheckpoints: () => request<CheckpointOut[]>('/audit/checkpoints'),
  createAuditCheckpoint: () =>
    request<CheckpointOut>('/audit/checkpoints', {
      method: 'POST',
    }),
  verifyAuditCheckpoint: (id: string) =>
    request<CheckpointOut>(`/audit/checkpoints/${id}/verify`, {
      method: 'POST',
    }),
  runTamperDemo: () =>
    request<TamperDemoResult>('/audit/tamper-demo', {
      method: 'POST',
    }),
  exportAuditLogs: () => request<Blob>('/audit/export'),

  // Security Status & Isolation
  getSecurityStatus: () => request<SecurityStatus>('/security/status'),
  getIsolationChecks: () => request<IsolationCheckOut[]>('/security/isolation-checks'),
  runIsolationChecks: () =>
    request<IsolationRun>('/security/isolation-checks/run', {
      method: 'POST',
    }),
  getThreatModel: () => request<ThreatModelOut>('/security/threat-model'),

  // Datasets
  getDatasetSources: () => request<DatasetSourceOut[]>('/datasets/sources'),
  getDatasetImports: () => request<ImportJobOut[]>('/datasets/imports'),
  importDataset: (formData: FormData) =>
    request<ImportJobOut>('/datasets/import', {
      method: 'POST',
      body: formData,
    }),

  // Admin & Settings
  getUsers: () => request<UserOut[]>('/admin/users'),
  createUser: (data: UserCreate) =>
    request<UserOut>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateUser: (id: string, data: UserUpdate) =>
    request<UserOut>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  resetUserPassword: (id: string, password: string) =>
    request<{ ok: boolean }>(`/admin/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  getSystemSettings: () => request<Record<string, any>>('/settings'),
  updateSystemSettings: (data: Record<string, any>) =>
    request<Record<string, any>>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

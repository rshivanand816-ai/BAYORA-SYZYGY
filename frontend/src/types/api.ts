// TypeScript definitions mirroring backend/app/schemas/api.py

export type RoleName = 'admin' | 'red' | 'blue' | 'auditor';
export type Provenance = 'measured' | 'calculated' | 'estimated' | 'simulated' | 'insufficient';
export type EvalStatus = 'created' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type EvalType = 'automated_suite' | 'interactive_probe' | 'cross_session_canary';
export type Outcome =
  | 'allowed'
  | 'blocked_input'
  | 'redacted_output'
  | 'blocked_output'
  | 'model_refusal'
  | 'model_error'
  | 'timeout'
  | 'resource_limit'
  | 'network_failure'
  | 'harness_error';

export type CheckStatus =
  | 'verified_pass'
  | 'failed'
  | 'configured_untested'
  | 'simulated'
  | 'unsupported';

export type SPAction = 'refuse' | 'redact' | 'rewrite' | 'block_output';
export type SPGuessAction = 'not_enforced' | 'refuse' | 'redact' | 'rewrite' | 'block_output';

export interface ApiErrorPayload {
  code: string;
  message: string;
  trace_id?: string | null;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
}

// ------------------------------------------------------------------ Auth
export interface LoginRequest {
  username: string;
  password: string;
}

export interface UserOut {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: RoleName;
  tenant: string;
  is_active: boolean;
}

export interface LoginResponse {
  user: UserOut;
  expires_at: string;
}

// ------------------------------------------------------------------ Metrics
export interface MetricValue {
  key: string;
  label: string;
  value: number | null;
  display: string;
  numerator?: number | null;
  denominator?: number | null;
  n: number;
  provenance: Provenance;
  source: string;
  formula?: string | null;
  note?: string | null;
}

// ------------------------------------------------------------------ Models
export interface ModelVersionOut {
  id: string;
  model_id: string;
  version: string;
  revision: string | null;
  file_sha256: string | null;
  file_size: number | null;
  config_hash: string | null;
  created_at: string;
}

export interface ModelOut {
  id: string;
  display_name: string;
  adapter: 'mock' | 'ollama' | 'openai_compatible' | 'huggingface' | 'upload';
  identifier: string;
  base_url?: string | null;
  source: string;
  format: string | null;
  architecture: string | null;
  resource_estimate?: Record<string, unknown> | null;
  status: string;
  validation_result?: Record<string, unknown> | null;
  runtime_version: string | null;
  execution_mode: 'simulated' | 'local' | 'external' | 'none';
  external_enabled: boolean;
  created_at: string;
  last_health_check_at: string | null;
  last_health_status: string | null;
  current_version: ModelVersionOut | null;
  runnable: boolean;
}

export interface ModelCreate {
  display_name: string;
  adapter: 'mock' | 'ollama' | 'openai_compatible';
  identifier: string;
  version?: string | null;
  base_url?: string | null;
}

export interface ModelImportRequest {
  repo_id: string;
  revision: string;
  display_name: string;
}

export interface ExternalEnableRequest {
  consent: boolean;
  acknowledgement: string;
}

export interface HealthCheckOut {
  model_id: string;
  status: 'healthy' | 'unhealthy' | 'simulated' | 'not_runnable';
  detail: string;
  latency_ms: number | null;
  checked_at: string;
}

// ------------------------------------------------------------------ Test Suites
export interface TestSuiteOut {
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  is_external: boolean;
  case_count: number;
  categories: string[];
}

export interface TestCaseOut {
  id: string;
  case_key: string;
  title: string;
  category: string;
  input_preview: string;
  expected_outcome: 'allow' | 'block' | 'redact';
  is_attack: boolean;
  severity: string;
  success_condition: string;
}

// ------------------------------------------------------------------ Evaluations
export interface ModelRef {
  id: string;
  name: string;
  version: string;
  execution_mode: string;
}

export interface EvaluationCreate {
  name: string;
  model_id: string;
  suite_id?: string | null;
  defense_policy_version_id: string;
  eval_type: EvalType;
  probe_budget: number;
}

export interface EvaluationOut {
  id: string;
  name: string;
  owner: string;
  model: ModelRef;
  suite: { id: string; name: string; version: string } | null;
  defense: { policy_version_id: string; version: string | number };
  eval_type: EvalType;
  probe_budget: number;
  probes_used: number;
  status: EvalStatus;
  trace_id: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  isolation_snapshot: Record<string, unknown> | null;
  simulated: boolean;
  error: string | null;
}

export interface ProbeRequest {
  prompt: string;
  test_case_id?: string | null;
}

export interface DefenseDecisionPublic {
  input: 'allow' | 'transform' | 'block' | 'withheld';
  output: 'allow' | 'redact' | 'block' | 'not_run' | 'withheld';
  public_code: string;
}

export interface ProbeResult {
  execution_id: string;
  seq: number;
  trace_id: string;
  status_class: 'allowed' | 'blocked' | 'redacted' | 'error' | 'timeout';
  http_status: number;
  prompt_preview: string;
  response_text: string;
  defense_decision: DefenseDecisionPublic;
  model_outcome: 'completed' | 'refusal' | 'error' | 'timeout' | 'not_called';
  finding_summary: string;
  latency_ms: number;
  model_latency_ms: number | null;
  probes_used: number;
  probe_budget: number;
  created_at: string;
  simulated: boolean;
  event_ids: string[];
}

export interface ProbeBudget {
  evaluation_id: string;
  probe_budget: number;
  probes_used: number;
  remaining: number;
  status: EvalStatus;
}

export interface RedResults {
  evaluation: EvaluationOut;
  executions: ProbeResult[];
}

export interface ExecutionDetail {
  id: string;
  seq: number;
  kind: string;
  test_case_key: string | null;
  category: string | null;
  severity: string | null;
  outcome: Outcome;
  input_decision: string;
  output_decision: string;
  model_outcome: string;
  expected_outcome: string | null;
  is_attack: boolean | null;
  passed: boolean | null;
  attack_succeeded: boolean | null;
  detected: boolean | null;
  canary_leaked_raw: boolean;
  latency_ms: number;
  model_latency_ms: number | null;
  prompt_preview: string | null;
  delivered_preview: string;
  model_version: string;
  defense_version: string;
  suite_version: string | null;
  evidence_event_ids: string[];
  policy_decisions: Record<string, unknown>[];
  created_at: string;
}

export interface FindingOut {
  id: string;
  session_id: string;
  execution_id: string | null;
  title: string;
  category: string;
  severity: string;
  confidence: string;
  evidence_type: 'observed' | 'inferred' | 'untested';
  description: string;
  remediation: string;
  evidence_refs: string[];
  created_at: string;
}

export interface EvaluationResults {
  evaluation: EvaluationOut;
  executions: ExecutionDetail[];
  metrics: MetricValue[];
  findings: FindingOut[];
  payload_visibility: 'full' | 'withheld_until_complete';
}

// ------------------------------------------------------------------ Blue
export interface PolicyRule {
  id: string;
  description: string;
  kind: 'regex' | 'substring' | 'canary';
  pattern: string;
  action: 'block' | 'transform' | 'redact' | 'flag' | 'allow';
  category: string;
  explanation_code: string;
  enabled: boolean;
  replacement?: string | null;
}

export interface InjectionHeuristics {
  enabled: boolean;
  threshold: number;
  keywords: string[];
  action: 'block' | 'flag';
}

export interface PolicyConfig {
  input_rules: PolicyRule[];
  output_rules: PolicyRule[];
  injection_heuristics: InjectionHeuristics;
  max_input_chars: number;
  response_normalization: boolean;
  normalized_message: string;
  latency_floor_ms: number;
  log_mode: 'hash_only' | 'redacted';
  canary_markers: string[];
}

export interface PolicyVersionOut {
  id: string;
  policy_id: string;
  version: number;
  config: PolicyConfig;
  config_sha256: string;
  change_note: string;
  created_by: string;
  created_at: string;
  deployed: boolean;
}

export interface DefensePolicyOut {
  id: string;
  name: string;
  description: string;
  created_at: string;
  current_version: PolicyVersionOut | null;
  version_count: number;
}

export interface DefensePolicyCreate {
  name: string;
  description: string;
  config: PolicyConfig;
}

export interface PolicyVersionCreate {
  config: PolicyConfig;
  change_note: string;
}

export interface PolicyVersionRef {
  id: string;
  policy_id: string;
  policy_name: string;
  version: number;
  deployed: boolean;
  response_normalization?: boolean | null;
  created_at: string;
}

export interface DefenseSummary {
  deployed: PolicyVersionRef[];
  counts: Record<string, number>;
  by_category: Record<string, unknown>[];
  false_positive_rate: MetricValue;
  false_negative_rate: MetricValue;
  recent_decisions: Record<string, unknown>[];
  payload_visibility_note: string;
}

export interface MitigationRequest {
  baseline_policy_version_id: string;
  mitigated_policy_version_id: string;
  n_facts?: number;
  probe_budget?: number;
  model_id?: string | null;
}

export interface ComparisonOut {
  id: string;
  created_at: string;
  status: string;
  baseline_round_id: string | null;
  mitigated_round_id: string | null;
  baseline_policy_version_id: string;
  mitigated_policy_version_id: string;
  n_facts: number;
  probe_budget: number;
  summary: Record<string, any> | null;
}

// ------------------------------------------------------------------ ShadowPolicy
export interface SPSubject {
  subject_id: string;
  label: string;
  description: string;
  probe_hint: string;
}

export interface SPCatalog {
  version: string;
  subjects: SPSubject[];
  actions: string[];
  guess_actions: string[];
  note: string;
}

export interface RoundCreate {
  name: string;
  model_id: string;
  defense_policy_version_id: string;
  red_user_id?: string | null;
  n_facts?: number;
  probe_budget?: number;
  timeout_seconds?: number;
  observation_mode?: 'from_policy' | 'diagnostic' | 'normalized';
  backend?: 'simulated' | 'model';
}

export interface RoundOut {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'guesses_locked' | 'finalized' | 'expired';
  model: ModelRef;
  defense_policy_version_id: string;
  defense_version: string;
  observation_mode: 'diagnostic' | 'normalized';
  latency_floor_ms: number;
  backend: 'simulated' | 'model';
  n_facts: number;
  probe_budget: number;
  probes_used: number;
  timeout_seconds: number;
  commitment: string | null;
  commitment_scheme: string;
  catalog_version: string;
  red_user: string;
  created_at: string;
  started_at: string | null;
  locked_at: string | null;
  finalized_at: string | null;
  expires_at: string | null;
  comparison_id: string | null;
  comparison_role: string | null;
  automated: boolean;
  simulated: boolean;
  guesses_locked: boolean;
}

export interface SPProbeRequest {
  probe: string;
}

export interface SPObservation {
  probe_id: string;
  seq: number;
  probe: string;
  response_text: string;
  response_class: 'allowed' | 'rejected' | 'modified' | 'error';
  latency_ms: number;
  created_at: string;
  remaining: number;
}

export interface SPGuess {
  subject_id: string;
  action: SPGuessAction;
}

export interface GuessSubmit {
  guesses: SPGuess[];
}

export interface RoundDetail {
  round: RoundOut;
  observations: SPObservation[];
  guesses: SPGuess[];
  catalog: SPCatalog;
}

export interface CommitmentVerification {
  round_id: string;
  scheme: string;
  published_commitment: string;
  recomputed_commitment: string;
  match: boolean;
  verified_at: string;
  encoding: string;
}

export interface RoundResults {
  round: RoundOut;
  revealed: {
    hidden_facts: Record<string, string>;
    facts_list: {
      subject_id: string;
      label: string;
      actual_action: string;
      guessed_action: string;
      correct: boolean;
    }[];
    nonce_hex: string;
    canonical_b64: string;
  };
  commitment_verification: CommitmentVerification;
  guesses: SPGuess[];
  metrics: Record<string, any>;
  limitations: string[];
}

// ------------------------------------------------------------------ Audit
export interface AuditEventOut {
  event_id: string;
  seq: number;
  ts: string;
  actor: string;
  actor_role: string;
  service: string;
  event_type: string;
  category: string;
  severity: 'info' | 'warning' | 'high' | 'critical';
  session_id: string | null;
  trace_id: string | null;
  summary: string;
  payload: Record<string, any>;
  prev_hash: string;
  hash: string;
  verification: 'verified' | 'mismatch' | 'unverified';
}

export interface AuditEventsPage {
  items: AuditEventOut[];
  total: number;
}

export interface ChainFailure {
  seq: number;
  event_id: string | null;
  kind: 'hash_mismatch' | 'sequence_gap' | 'prev_link_mismatch';
  expected: string | null;
  actual: string | null;
}

export interface AuditVerifyResult {
  ok: boolean;
  checked: number;
  head_seq: number;
  head_hash: string;
  failures: ChainFailure[];
  verified_at: string;
  scope: string;
}

export interface CheckpointOut {
  id: string;
  seq: number;
  head_hash: string;
  created_at: string;
  algorithm: string;
  key_id: string;
  signature: string;
  public_key_pem: string;
  signature_valid: boolean | null;
  chain_matches: boolean | null;
}

export interface TamperDemoResult {
  fixture_events: number;
  original: AuditVerifyResult;
  tampered: AuditVerifyResult;
  tampered_seq: number;
  tampered_field: string;
  note: string;
}

// ------------------------------------------------------------------ Security & Isolation
export interface IsolationCheckOut {
  id: string;
  run_id: string;
  check_key: string;
  title: string;
  category: string;
  method: string;
  status: CheckStatus;
  evidence: Record<string, any>;
  environment: string;
  created_at: string;
}

export interface IsolationRun {
  run_id: string;
  environment: string;
  checks: IsolationCheckOut[];
}

export interface ServiceStatus {
  name: string;
  networks: string[];
  health: 'healthy' | 'unreachable' | 'in_process' | 'unknown';
  detail: string;
  checked_at: string;
}

export interface NetworkInfo {
  name: string;
  driver?: string;
  subnet?: string;
  internal?: boolean;
  isolated?: boolean;
}

export interface FlowInfo {
  from: string;
  to: string;
  allowed: boolean;
  purpose: string;
  network?: string;
}

export interface SecurityStatus {
  deployment_mode: string;
  services: ServiceStatus[];
  networks: NetworkInfo[];
  flows: FlowInfo[];
  latest_checks: Record<string, number>;
  notes: string[];
}

export interface ResourceMetricOut {
  id: string;
  service: string;
  metric: string;
  value: number | null;
  unit: string;
  provenance: string;
  detail: string | null;
  captured_at: string;
}

// ------------------------------------------------------------------ Datasets
export interface DatasetSourceOut {
  id: string;
  key: string;
  name: string;
  url: string;
  kind: 'synthetic' | 'external';
  license_note: string;
  use_restrictions: string;
  supported_formats: string[];
  version: string | null;
  status: string;
}

export interface ImportJobOut {
  id: string;
  source_id: string;
  source_name: string;
  format: string;
  status: string;
  rows_total: number;
  rows_imported: number;
  rows_rejected: number;
  errors: string[];
  suite_id: string | null;
  file_sha256: string | null;
  dataset_version: string | null;
  created_at: string;
  completed_at: string | null;
}

// ------------------------------------------------------------------ Admin & Meta
export interface UserCreate {
  username: string;
  email: string;
  display_name?: string;
  role: RoleName;
  tenant?: string;
  password: string;
}

export interface UserUpdate {
  role?: RoleName;
  is_active?: boolean;
}

export interface AboutOut {
  product: string;
  tagline: string;
  team: string;
  members: string[];
  problem_statement: string;
  version: string;
}

export interface DashboardSummary {
  sessions_total: number;
  sessions_by_status: Record<string, number>;
  attack_cases_executed: number;
  blocked_count: number;
  output_leak_detections: number;
  failed_authz_24h: number;
  shadowpolicy_latest: Record<string, any> | null;
  audit_integrity: Record<string, any>;
  latency: Record<string, MetricValue>;
  current_model: ModelRef | null;
  current_defense: PolicyVersionRef | null;
  data_provenance: string;
  resource: ResourceMetricOut[];
}

export interface ThreatModelOut {
  assets: { name: string; description: string; sensitivity: string }[];
  trust_boundaries: { name: string; components_inside: string[]; controls: string[] }[];
  threat_actors: { name: string; capabilities: string; intent: string }[];
  entry_points: { name: string; protocol: string; auth: string; exposure: string }[];
  assumptions: string[];
  controls: { name: string; category: string; description: string; status: string }[];
  limitations: string[];
  residual_risks: {
    threat: string;
    mitigation: string;
    evidence: string;
    remaining: string;
    next: string;
  }[];
  future_work: string[];
}

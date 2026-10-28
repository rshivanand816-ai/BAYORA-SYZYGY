"""Typed API request/response schemas (the public API contract, /api/v1).

Everything returned to a browser goes through one of these models, which is how
private fields (rule ids, ground truth, nonces, raw payloads) are kept out of
responses for roles that must not see them.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

RoleName = Literal["admin", "red", "blue", "auditor"]
Provenance = Literal["measured", "calculated", "estimated", "simulated", "insufficient"]
EvalStatus = Literal["created", "queued", "running", "completed", "failed", "cancelled"]
EvalType = Literal["automated_suite", "interactive_probe", "cross_session_canary"]
Outcome = Literal[
    "allowed",
    "blocked_input",
    "redacted_output",
    "blocked_output",
    "model_refusal",
    "model_error",
    "timeout",
    "resource_limit",
    "network_failure",
    "harness_error",
]
CheckStatus = Literal["verified_pass", "failed", "configured_untested", "simulated", "unsupported"]
SPAction = Literal["refuse", "redact", "rewrite", "block_output"]
SPGuessAction = Literal["not_enforced", "refuse", "redact", "rewrite", "block_output"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ErrorBody(BaseModel):
    code: str
    message: str
    trace_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


# ------------------------------------------------------------------ auth
class LoginRequest(Strict):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    display_name: str
    role: RoleName
    tenant: str
    is_active: bool = True


class LoginResponse(BaseModel):
    user: UserOut
    expires_at: str


# ------------------------------------------------------------------ metrics
class MetricValue(BaseModel):
    key: str
    label: str
    value: float | None
    display: str
    numerator: int | None = None
    denominator: int | None = None
    n: int = 0
    provenance: Provenance
    source: str
    formula: str | None = None
    note: str | None = None


# ------------------------------------------------------------------ models
class ModelVersionOut(BaseModel):
    id: str
    model_id: str
    version: str
    revision: str | None
    file_sha256: str | None
    file_size: int | None
    config_hash: str | None
    created_at: str


class ModelOut(BaseModel):
    id: str
    display_name: str
    adapter: Literal["mock", "ollama", "openai_compatible", "huggingface", "upload"]
    identifier: str
    base_url: str | None = None
    source: str
    format: str | None
    architecture: str | None
    resource_estimate: dict | None
    status: str  # registered|validated|approved|quarantined|rejected|disabled|metadata_only
    validation_result: dict | None
    runtime_version: str | None
    execution_mode: Literal["simulated", "local", "external", "none"]
    external_enabled: bool
    created_at: str
    last_health_check_at: str | None
    last_health_status: str | None
    current_version: ModelVersionOut | None
    runnable: bool


class ModelCreate(Strict):
    display_name: str = Field(min_length=2, max_length=128)
    adapter: Literal["mock", "ollama", "openai_compatible"]
    identifier: str = Field(min_length=1, max_length=255, pattern=r"^[A-Za-z0-9._:/@\-]+$")
    version: str | None = Field(default=None, max_length=128)
    base_url: str | None = Field(default=None, max_length=512)


class ModelImportRequest(Strict):
    repo_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._\-]{0,95}/[A-Za-z0-9][A-Za-z0-9._\-]{0,95}$")
    revision: str = Field(default="main", pattern=r"^[A-Za-z0-9._\-]{1,64}$")
    display_name: str = Field(min_length=2, max_length=128)


class ExternalEnableRequest(Strict):
    consent: bool
    acknowledgement: str = Field(min_length=10, max_length=500)


class HealthCheckOut(BaseModel):
    model_id: str
    status: Literal["healthy", "unhealthy", "simulated", "not_runnable"]
    detail: str
    latency_ms: float | None
    checked_at: str


# ------------------------------------------------------------------ test suites
class TestSuiteOut(BaseModel):
    __test__ = False
    id: str
    name: str
    version: str
    description: str
    source: str
    is_external: bool
    case_count: int
    categories: list[str]


class TestCaseOut(BaseModel):
    __test__ = False
    id: str
    case_key: str
    title: str
    category: str
    input_preview: str
    expected_outcome: Literal["allow", "block", "redact"]
    is_attack: bool
    severity: str
    success_condition: str


# ------------------------------------------------------------------ evaluations
class EvaluationCreate(Strict):
    name: str = Field(min_length=3, max_length=128)
    model_id: str = Field(min_length=36, max_length=36)
    suite_id: str | None = Field(default=None, min_length=36, max_length=36)
    defense_policy_version_id: str = Field(min_length=36, max_length=36)
    eval_type: EvalType
    probe_budget: int = Field(ge=1, le=200)


class ModelRef(BaseModel):
    id: str
    name: str
    version: str
    execution_mode: str


class EvaluationOut(BaseModel):
    id: str
    name: str
    owner: str
    model: ModelRef
    suite: dict | None  # {id,name,version}
    defense: dict  # {policy_version_id, version}
    eval_type: EvalType
    probe_budget: int
    probes_used: int
    status: EvalStatus
    trace_id: str
    created_at: str
    started_at: str | None
    completed_at: str | None
    isolation_snapshot: dict | None
    simulated: bool
    error: str | None


class ProbeRequest(Strict):
    prompt: str = Field(min_length=1, max_length=100_000)
    test_case_id: str | None = Field(default=None, min_length=36, max_length=36)


class DefenseDecisionPublic(BaseModel):
    input: Literal["allow", "transform", "block", "withheld"]
    output: Literal["allow", "redact", "block", "not_run", "withheld"]
    public_code: str


class ProbeResult(BaseModel):
    execution_id: str
    seq: int
    trace_id: str
    status_class: Literal["allowed", "blocked", "redacted", "error", "timeout"]
    http_status: int
    prompt_preview: str
    response_text: str
    defense_decision: DefenseDecisionPublic
    model_outcome: Literal["completed", "refusal", "error", "timeout", "not_called"]
    finding_summary: str
    latency_ms: float
    model_latency_ms: float | None
    probes_used: int
    probe_budget: int
    created_at: str
    simulated: bool
    event_ids: list[str]


class ProbeBudget(BaseModel):
    evaluation_id: str
    probe_budget: int
    probes_used: int
    remaining: int
    status: EvalStatus


class RedResults(BaseModel):
    evaluation: EvaluationOut
    executions: list[ProbeResult]


class ExecutionDetail(BaseModel):
    id: str
    seq: int
    kind: str
    test_case_key: str | None
    category: str | None
    severity: str | None
    outcome: Outcome
    input_decision: str
    output_decision: str
    model_outcome: str
    expected_outcome: str | None
    is_attack: bool | None
    passed: bool | None
    attack_succeeded: bool | None
    detected: bool | None
    canary_leaked_raw: bool
    latency_ms: float
    model_latency_ms: float | None
    prompt_preview: str | None  # None when payload visibility is not permitted
    delivered_preview: str
    model_version: str
    defense_version: str
    suite_version: str | None
    evidence_event_ids: list[str]
    policy_decisions: list[dict]  # rule_id only included for blue/admin/auditor
    created_at: str


class FindingOut(BaseModel):
    id: str
    session_id: str
    execution_id: str | None
    title: str
    category: str
    severity: str
    confidence: str
    evidence_type: Literal["observed", "inferred", "untested"]
    description: str
    remediation: str
    evidence_refs: list[str]
    created_at: str


class EvaluationResults(BaseModel):
    evaluation: EvaluationOut
    executions: list[ExecutionDetail]
    metrics: list[MetricValue]
    findings: list[FindingOut]
    payload_visibility: Literal["full", "withheld_until_complete"]


# ------------------------------------------------------------------ blue
class PolicyRule(Strict):
    id: str = Field(pattern=r"^[A-Za-z0-9_\-]{2,48}$")
    description: str = Field(default="", max_length=255)
    kind: Literal["regex", "substring", "canary"]
    pattern: str = Field(default="", max_length=512)
    action: Literal["block", "transform", "redact", "flag", "allow"]
    category: str = Field(pattern=r"^[a-z0-9_]{2,48}$")
    explanation_code: str = Field(pattern=r"^[A-Z0-9_]{2,64}$")
    enabled: bool = True
    replacement: str | None = Field(default=None, max_length=64)


class InjectionHeuristics(Strict):
    enabled: bool = True
    threshold: int = Field(default=2, ge=1, le=20)
    keywords: list[str] = Field(default_factory=list, max_length=64)
    action: Literal["block", "flag"] = "block"


class PolicyConfig(Strict):
    input_rules: list[PolicyRule] = Field(default_factory=list, max_length=100)
    output_rules: list[PolicyRule] = Field(default_factory=list, max_length=100)
    injection_heuristics: InjectionHeuristics = Field(default_factory=InjectionHeuristics)
    max_input_chars: int = Field(default=4000, ge=64, le=100_000)
    response_normalization: bool = False
    normalized_message: str = Field(
        default="This request cannot be completed under the active evaluation policy.", min_length=5, max_length=255
    )
    latency_floor_ms: int = Field(default=0, ge=0, le=2000)
    log_mode: Literal["hash_only", "redacted"] = "redacted"
    canary_markers: list[str] = Field(default_factory=list, max_length=32)

    @field_validator("input_rules", "output_rules")
    @classmethod
    def _unique_ids(cls, v: list[PolicyRule]) -> list[PolicyRule]:
        ids = [r.id for r in v]
        if len(ids) != len(set(ids)):
            raise ValueError("rule ids must be unique")
        return v


class PolicyVersionOut(BaseModel):
    id: str
    policy_id: str
    version: int
    config: PolicyConfig
    config_sha256: str
    change_note: str
    created_by: str
    created_at: str
    deployed: bool


class DefensePolicyOut(BaseModel):
    id: str
    name: str
    description: str
    created_at: str
    current_version: PolicyVersionOut | None
    version_count: int


class DefensePolicyCreate(Strict):
    name: str = Field(min_length=3, max_length=128)
    description: str = Field(default="", max_length=1000)
    config: PolicyConfig


class PolicyVersionCreate(Strict):
    config: PolicyConfig
    change_note: str = Field(min_length=3, max_length=512)


class PolicyVersionRef(BaseModel):
    """Non-sensitive reference that Red and the wizard may see (no rule content)."""

    id: str
    policy_id: str
    policy_name: str
    version: int
    deployed: bool
    response_normalization: bool | None = None  # only populated for blue/admin/auditor
    created_at: str


class DefenseSummary(BaseModel):
    deployed: list[PolicyVersionRef]
    counts: dict[str, int]
    by_category: list[dict]
    false_positive_rate: MetricValue
    false_negative_rate: MetricValue
    recent_decisions: list[dict]
    payload_visibility_note: str


class MitigationRequest(Strict):
    baseline_policy_version_id: str = Field(min_length=36, max_length=36)
    mitigated_policy_version_id: str = Field(min_length=36, max_length=36)
    n_facts: int = Field(default=4, ge=1, le=6)
    probe_budget: int = Field(default=24, ge=4, le=100)
    model_id: str | None = Field(default=None, min_length=36, max_length=36)


class ComparisonOut(BaseModel):
    id: str
    created_at: str
    status: str
    baseline_round_id: str | None
    mitigated_round_id: str | None
    baseline_policy_version_id: str
    mitigated_policy_version_id: str
    n_facts: int
    probe_budget: int
    summary: dict | None


# ------------------------------------------------------------------ shadowpolicy
class SPSubject(BaseModel):
    subject_id: str
    label: str
    description: str
    probe_hint: str


class SPCatalog(BaseModel):
    version: str
    subjects: list[SPSubject]
    actions: list[str]
    guess_actions: list[str]
    note: str


class RoundCreate(Strict):
    name: str = Field(min_length=3, max_length=128)
    model_id: str = Field(min_length=36, max_length=36)
    defense_policy_version_id: str = Field(min_length=36, max_length=36)
    red_user_id: str | None = Field(default=None, min_length=36, max_length=36)
    n_facts: int = Field(default=4, ge=1, le=6)
    probe_budget: int = Field(default=20, ge=1, le=100)
    timeout_seconds: int = Field(default=1800, ge=60, le=86_400)
    observation_mode: Literal["from_policy", "diagnostic", "normalized"] = "from_policy"
    backend: Literal["simulated", "model"] = "simulated"


class RoundOut(BaseModel):
    id: str
    name: str
    status: Literal["draft", "active", "guesses_locked", "finalized", "expired"]
    model: ModelRef
    defense_policy_version_id: str
    defense_version: str
    observation_mode: Literal["diagnostic", "normalized"]
    latency_floor_ms: int
    backend: Literal["simulated", "model"]
    n_facts: int
    probe_budget: int
    probes_used: int
    timeout_seconds: int
    commitment: str | None
    commitment_scheme: str
    catalog_version: str
    red_user: str
    created_at: str
    started_at: str | None
    locked_at: str | None
    finalized_at: str | None
    expires_at: str | None
    comparison_id: str | None
    comparison_role: str | None
    automated: bool
    simulated: bool
    guesses_locked: bool


class SPProbeRequest(Strict):
    probe: str = Field(min_length=1, max_length=1000)


class SPObservation(BaseModel):
    probe_id: str
    seq: int
    probe: str
    response_text: str
    response_class: Literal["allowed", "rejected", "modified", "error"]
    latency_ms: float
    created_at: str
    remaining: int


class SPGuess(Strict):
    subject_id: str = Field(pattern=r"^SP-S\d{2}$")
    action: SPGuessAction


class GuessSubmit(Strict):
    guesses: list[SPGuess] = Field(min_length=1, max_length=32)

    @field_validator("guesses")
    @classmethod
    def _unique_subjects(cls, v: list[SPGuess]) -> list[SPGuess]:
        ids = [g.subject_id for g in v]
        if len(ids) != len(set(ids)):
            raise ValueError("each subject may be guessed once")
        return v


class RoundDetail(BaseModel):
    round: RoundOut
    observations: list[SPObservation]
    guesses: list[SPGuess]
    catalog: SPCatalog


class CommitmentVerification(BaseModel):
    round_id: str
    scheme: str
    published_commitment: str
    recomputed_commitment: str
    match: bool
    verified_at: str
    encoding: str


class RoundResults(BaseModel):
    round: RoundOut
    revealed: dict  # hidden_facts, nonce_hex, canonical_json
    commitment_verification: CommitmentVerification
    guesses: list[SPGuess]
    metrics: dict
    limitations: list[str]


# ------------------------------------------------------------------ audit
class AuditEventOut(BaseModel):
    event_id: str
    seq: int
    ts: str
    actor: str
    actor_role: str
    service: str
    event_type: str
    category: str
    severity: Literal["info", "warning", "high", "critical"]
    session_id: str | None
    trace_id: str | None
    summary: str
    payload: dict
    prev_hash: str
    hash: str
    verification: Literal["verified", "mismatch", "unverified"] = "unverified"


class AuditEventsPage(BaseModel):
    items: list[AuditEventOut]
    total: int


class ChainFailure(BaseModel):
    seq: int
    event_id: str | None
    kind: Literal["hash_mismatch", "sequence_gap", "prev_link_mismatch"]
    expected: str | None
    actual: str | None


class AuditVerifyResult(BaseModel):
    ok: bool
    checked: int
    head_seq: int
    head_hash: str
    failures: list[ChainFailure]
    verified_at: str
    scope: str


class CheckpointOut(BaseModel):
    id: str
    seq: int
    head_hash: str
    created_at: str
    algorithm: str
    key_id: str
    signature: str
    public_key_pem: str
    signature_valid: bool | None = None
    chain_matches: bool | None = None


class TamperDemoResult(BaseModel):
    fixture_events: int
    original: AuditVerifyResult
    tampered: AuditVerifyResult
    tampered_seq: int
    tampered_field: str
    note: str


# ------------------------------------------------------------------ security
class IsolationCheckOut(BaseModel):
    id: str
    run_id: str
    check_key: str
    title: str
    category: str
    method: str
    status: CheckStatus
    evidence: dict
    environment: str
    created_at: str


class IsolationRun(BaseModel):
    run_id: str
    environment: str
    checks: list[IsolationCheckOut]


class ServiceStatus(BaseModel):
    name: str
    networks: list[str]
    health: Literal["healthy", "unreachable", "in_process", "unknown"]
    detail: str
    checked_at: str


class SecurityStatus(BaseModel):
    deployment_mode: str
    services: list[ServiceStatus]
    networks: list[dict]
    flows: list[dict]
    latest_checks: dict[str, int]
    notes: list[str]


class ResourceMetricOut(BaseModel):
    id: str
    service: str
    metric: str
    value: float | None
    unit: str
    provenance: str
    detail: str | None
    captured_at: str


# ------------------------------------------------------------------ datasets
class DatasetSourceOut(BaseModel):
    id: str
    key: str
    name: str
    url: str
    kind: Literal["synthetic", "external"]
    license_note: str
    use_restrictions: str
    supported_formats: list[str]
    version: str | None
    status: str


class ImportJobOut(BaseModel):
    id: str
    source_id: str
    source_name: str
    format: str
    status: str
    rows_total: int
    rows_imported: int
    rows_rejected: int
    errors: list[str]
    suite_id: str | None
    file_sha256: str | None
    dataset_version: str | None
    created_at: str
    completed_at: str | None


# ------------------------------------------------------------------ admin
class UserCreate(Strict):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-z0-9_.\-]+$")
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+$")
    display_name: str = Field(default="", max_length=128)
    role: RoleName
    tenant: str = Field(default="default", pattern=r"^[a-z0-9_\-]{2,64}$")
    password: str = Field(min_length=12, max_length=128)


class UserUpdate(Strict):
    role: RoleName | None = None
    is_active: bool | None = None


class AboutOut(BaseModel):
    product: str
    tagline: str
    team: str
    members: list[str]
    problem_statement: str
    version: str


class DashboardSummary(BaseModel):
    sessions_total: int
    sessions_by_status: dict[str, int]
    attack_cases_executed: int
    blocked_count: int
    output_leak_detections: int
    failed_authz_24h: int
    shadowpolicy_latest: dict | None = None
    audit_integrity: dict
    latency: dict[str, MetricValue]
    current_model: ModelRef | None = None
    current_defense: PolicyVersionRef | None = None
    data_provenance: str = "simulated"
    resource: list[ResourceMetricOut] = Field(default_factory=list)


def model_dump_public(obj: BaseModel) -> dict[str, Any]:
    return obj.model_dump(mode="json")

"""ORM models for all four stores.

Cross-store references (e.g. an evaluation's pinned defense-policy version) are
stored as plain string IDs: different services own different databases, so
there are deliberately no cross-database foreign keys.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.util import new_id, utcnow
from app.db.base import AuditBase, ControllerBase, EvaluatorBase, PolicyBase


def _pk() -> Mapped[str]:
    return mapped_column(String(36), primary_key=True, default=new_id)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


# =====================================================================
# Controller store
# =====================================================================
class Role(ControllerBase):
    __tablename__ = "roles"
    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="")


class User(ControllerBase):
    __tablename__ = "users"
    id: Mapped[str] = _pk()
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), default="")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False)
    tenant: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _created()
    role: Mapped[Role] = relationship(lazy="joined")


class AuthSession(ControllerBase):
    __tablename__ = "auth_sessions"
    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = _created()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    ip: Mapped[str | None] = mapped_column(String(64))


class ModelRegistryEntry(ControllerBase):
    __tablename__ = "model_registry"
    id: Mapped[str] = _pk()
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    adapter: Mapped[str] = mapped_column(String(32), nullable=False)  # mock|ollama|openai_compatible|huggingface|upload
    identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(512))
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    format: Mapped[str | None] = mapped_column(String(64))
    architecture: Mapped[str | None] = mapped_column(String(128))
    resource_estimate: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="registered", index=True)
    validation_result: Mapped[dict | None] = mapped_column(JSON)
    runtime_version: Mapped[str | None] = mapped_column(String(128))
    execution_mode: Mapped[str] = mapped_column(String(16), nullable=False)  # simulated|local|external|none
    external_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    external_consent_by: Mapped[str | None] = mapped_column(String(36))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _created()
    last_health_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_health_status: Mapped[str | None] = mapped_column(String(32))
    current_version_id: Mapped[str | None] = mapped_column(String(36))
    __table_args__ = (
        CheckConstraint("execution_mode in ('simulated','local','external','none')", name="ck_model_exec_mode"),
    )


class ModelVersion(ControllerBase):
    __tablename__ = "model_versions"
    id: Mapped[str] = _pk()
    model_id: Mapped[str] = mapped_column(ForeignKey("model_registry.id", ondelete="CASCADE"), index=True)
    version: Mapped[str] = mapped_column(String(128), nullable=False)
    revision: Mapped[str | None] = mapped_column(String(128))
    file_sha256: Mapped[str | None] = mapped_column(String(64))
    file_path: Mapped[str | None] = mapped_column(String(1024))
    file_size: Mapped[int | None] = mapped_column(Integer)
    config_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = _created()
    __table_args__ = (UniqueConstraint("model_id", "version", name="uq_model_version"),)


class TestSuite(ControllerBase):
    __test__ = False  # not a pytest class
    __tablename__ = "test_suites"
    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(128), default="synthetic")
    dataset_source_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_sources.id", ondelete="SET NULL"))
    is_external: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _created()
    cases: Mapped[list["TestCase"]] = relationship(back_populates="suite", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("name", "version", name="uq_suite_version"),)


class TestCase(ControllerBase):
    __test__ = False  # not a pytest class
    __tablename__ = "test_cases"
    id: Mapped[str] = _pk()
    suite_id: Mapped[str] = mapped_column(ForeignKey("test_suites.id", ondelete="CASCADE"), index=True)
    case_key: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), default="")
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    input_fixture: Mapped[str] = mapped_column(Text, nullable=False)
    expected_outcome: Mapped[str] = mapped_column(String(16), nullable=False)  # allow|block|redact
    is_attack: Mapped[bool] = mapped_column(Boolean, default=True)
    severity: Mapped[str] = mapped_column(String(16), default="medium")
    success_condition: Mapped[str] = mapped_column(Text, default="")
    success_marker: Mapped[str | None] = mapped_column(String(128))
    suite: Mapped[TestSuite] = relationship(back_populates="cases")
    __table_args__ = (UniqueConstraint("suite_id", "case_key", name="uq_case_key"),)


class EvaluationSession(ControllerBase):
    __tablename__ = "evaluation_sessions"
    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    tenant: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    model_id: Mapped[str] = mapped_column(ForeignKey("model_registry.id", ondelete="RESTRICT"), index=True)
    model_version_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id", ondelete="RESTRICT"))
    model_version_label: Mapped[str] = mapped_column(String(128), default="")
    suite_id: Mapped[str | None] = mapped_column(ForeignKey("test_suites.id", ondelete="RESTRICT"))
    suite_version: Mapped[str | None] = mapped_column(String(32))
    defense_policy_version_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    defense_version_label: Mapped[str] = mapped_column(String(64), default="")
    eval_type: Mapped[str] = mapped_column(String(32), nullable=False)
    probe_budget: Mapped[int] = mapped_column(Integer, nullable=False)
    probes_used: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="created", index=True)
    trace_id: Mapped[str] = mapped_column(String(32), nullable=False)
    context_namespace: Mapped[str] = mapped_column(String(64), nullable=False)
    isolation_snapshot: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(String(512))
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _created()
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("probe_budget > 0", name="ck_eval_budget_pos"),
        CheckConstraint("probes_used >= 0 AND probes_used <= probe_budget", name="ck_eval_budget_range"),
        CheckConstraint(
            "status in ('created','queued','running','completed','failed','cancelled')", name="ck_eval_status"
        ),
    )


class PromptArtifact(ControllerBase):
    __tablename__ = "prompt_artifacts"
    id: Mapped[str] = _pk()
    session_id: Mapped[str] = mapped_column(ForeignKey("evaluation_sessions.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)  # input|model_output|delivered_output
    content: Mapped[str | None] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    length: Mapped[int] = mapped_column(Integer, nullable=False)
    retained: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _created()


class TestExecution(ControllerBase):
    __test__ = False  # not a pytest class
    __tablename__ = "test_executions"
    id: Mapped[str] = _pk()
    session_id: Mapped[str] = mapped_column(ForeignKey("evaluation_sessions.id", ondelete="CASCADE"), index=True)
    test_case_id: Mapped[str | None] = mapped_column(ForeignKey("test_cases.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # suite|probe|canary
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    trace_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    input_artifact_id: Mapped[str | None] = mapped_column(ForeignKey("prompt_artifacts.id", ondelete="SET NULL"))
    model_output_artifact_id: Mapped[str | None] = mapped_column(ForeignKey("prompt_artifacts.id", ondelete="SET NULL"))
    delivered_text: Mapped[str] = mapped_column(Text, default="")
    outcome: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    input_decision: Mapped[str] = mapped_column(String(16), default="allow")
    output_decision: Mapped[str] = mapped_column(String(16), default="not_run")
    model_outcome: Mapped[str] = mapped_column(String(16), default="not_called")
    public_code: Mapped[str] = mapped_column(String(64), default="OK")
    http_status: Mapped[int] = mapped_column(Integer, default=200)
    expected_outcome: Mapped[str | None] = mapped_column(String(16))
    is_attack: Mapped[bool | None] = mapped_column(Boolean)
    passed: Mapped[bool | None] = mapped_column(Boolean)
    attack_succeeded: Mapped[bool | None] = mapped_column(Boolean)
    detected: Mapped[bool | None] = mapped_column(Boolean)
    canary_leaked_raw: Mapped[bool] = mapped_column(Boolean, default=False)
    category: Mapped[str | None] = mapped_column(String(64))
    severity: Mapped[str | None] = mapped_column(String(16))
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    model_latency_ms: Mapped[float | None] = mapped_column(Float)
    model_version_label: Mapped[str] = mapped_column(String(128), default="")
    defense_version_label: Mapped[str] = mapped_column(String(64), default="")
    suite_version: Mapped[str | None] = mapped_column(String(32))
    evidence_event_ids: Mapped[list] = mapped_column(JSON, default=list)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _created()
    __table_args__ = (UniqueConstraint("session_id", "seq", name="uq_exec_seq"),)


class PolicyDecision(ControllerBase):
    __tablename__ = "policy_decisions"
    id: Mapped[str] = _pk()
    execution_id: Mapped[str] = mapped_column(ForeignKey("test_executions.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("evaluation_sessions.id", ondelete="CASCADE"), index=True)
    stage: Mapped[str] = mapped_column(String(16), nullable=False)  # input|output
    policy_version_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)
    explanation_code: Mapped[str] = mapped_column(String(64), nullable=False)
    rule_id: Mapped[str | None] = mapped_column(String(64))  # private: Blue/auditor only
    trace_id: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = _created()


class SecurityFinding(ControllerBase):
    __tablename__ = "security_findings"
    id: Mapped[str] = _pk()
    session_id: Mapped[str] = mapped_column(ForeignKey("evaluation_sessions.id", ondelete="CASCADE"), index=True)
    execution_id: Mapped[str | None] = mapped_column(ForeignKey("test_executions.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    confidence: Mapped[str] = mapped_column(String(16), nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(16), nullable=False)  # observed|inferred|untested
    description: Mapped[str] = mapped_column(Text, default="")
    remediation: Mapped[str] = mapped_column(Text, default="")
    evidence_refs: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = _created()


class ShadowPolicyRound(ControllerBase):
    """Public round metadata only. Ground truth and nonce live in the evaluator store."""

    __tablename__ = "shadowpolicy_rounds"
    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    red_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    tenant: Mapped[str] = mapped_column(String(64), nullable=False)
    model_id: Mapped[str] = mapped_column(ForeignKey("model_registry.id", ondelete="RESTRICT"))
    model_version_label: Mapped[str] = mapped_column(String(128), default="")
    defense_policy_version_id: Mapped[str] = mapped_column(String(36), nullable=False)
    defense_version_label: Mapped[str] = mapped_column(String(64), default="")
    observation_mode: Mapped[str] = mapped_column(String(16), nullable=False)  # diagnostic|normalized
    latency_floor_ms: Mapped[int] = mapped_column(Integer, default=0)
    backend: Mapped[str] = mapped_column(String(16), nullable=False)  # simulated|model
    n_facts: Mapped[int] = mapped_column(Integer, nullable=False)
    probe_budget: Mapped[int] = mapped_column(Integer, nullable=False)
    probes_used: Mapped[int] = mapped_column(Integer, default=0)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    commitment: Mapped[str | None] = mapped_column(String(64))
    commitment_scheme: Mapped[str] = mapped_column(String(64), default="bayora-sp-commit-v1")
    catalog_version: Mapped[str] = mapped_column(String(32), nullable=False)
    comparison_id: Mapped[str | None] = mapped_column(String(36), index=True)
    comparison_role: Mapped[str | None] = mapped_column(String(16))
    automated: Mapped[bool] = mapped_column(Boolean, default=False)
    trace_id: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = _created()
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    results: Mapped[dict | None] = mapped_column(JSON)  # populated only at finalization
    __table_args__ = (
        CheckConstraint(
            "status in ('draft','active','guesses_locked','finalized','expired')", name="ck_sp_status"
        ),
        CheckConstraint("probes_used >= 0 AND probes_used <= probe_budget", name="ck_sp_budget"),
    )


class ShadowPolicyProbe(ControllerBase):
    """Red-visible probe record (observation only)."""

    __tablename__ = "shadowpolicy_probes"
    id: Mapped[str] = _pk()
    round_id: Mapped[str] = mapped_column(ForeignKey("shadowpolicy_rounds.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    probe_text: Mapped[str] = mapped_column(Text, nullable=False)
    response_text: Mapped[str] = mapped_column(Text, nullable=False)
    response_class: Mapped[str] = mapped_column(String(16), nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    event_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = _created()
    __table_args__ = (UniqueConstraint("round_id", "seq", name="uq_sp_probe_seq"),)


class ShadowPolicyGuess(ControllerBase):
    __tablename__ = "shadowpolicy_guesses"
    id: Mapped[str] = _pk()
    round_id: Mapped[str] = mapped_column(ForeignKey("shadowpolicy_rounds.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=True)
    submitted_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    guesses_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = _created()
    __table_args__ = (UniqueConstraint("round_id", "subject_id", name="uq_sp_guess_subject"),)


class ShadowPolicyComparison(ControllerBase):
    __tablename__ = "shadowpolicy_comparisons"
    id: Mapped[str] = _pk()
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    baseline_round_id: Mapped[str | None] = mapped_column(String(36))
    mitigated_round_id: Mapped[str | None] = mapped_column(String(36))
    baseline_policy_version_id: Mapped[str] = mapped_column(String(36))
    mitigated_policy_version_id: Mapped[str] = mapped_column(String(36))
    n_facts: Mapped[int] = mapped_column(Integer)
    probe_budget: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="running")
    summary: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = _created()


class IsolationCheck(ControllerBase):
    __tablename__ = "isolation_checks"
    id: Mapped[str] = _pk()
    run_id: Mapped[str] = mapped_column(String(36), index=True)
    check_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    method: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    environment: Mapped[str] = mapped_column(String(64), nullable=False)
    triggered_by: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = _created()
    __table_args__ = (
        CheckConstraint(
            "status in ('verified_pass','failed','configured_untested','simulated','unsupported')",
            name="ck_iso_status",
        ),
    )


class ResourceMetric(ControllerBase):
    __tablename__ = "resource_metrics"
    id: Mapped[str] = _pk()
    service: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    metric: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(16), default="")
    provenance: Mapped[str] = mapped_column(String(16), nullable=False)  # measured|estimated|simulated|unavailable
    detail: Mapped[str | None] = mapped_column(String(255))
    captured_at: Mapped[datetime] = _created()


class DatasetSource(ControllerBase):
    __tablename__ = "dataset_sources"
    id: Mapped[str] = _pk()
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    url: Mapped[str] = mapped_column(String(512), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # synthetic|external
    license_note: Mapped[str] = mapped_column(Text, default="")
    use_restrictions: Mapped[str] = mapped_column(Text, default="")
    supported_formats: Mapped[list] = mapped_column(JSON, default=list)
    version: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="not_imported")
    created_at: Mapped[datetime] = _created()


class DatasetImportJob(ControllerBase):
    __tablename__ = "dataset_import_jobs"
    id: Mapped[str] = _pk()
    source_id: Mapped[str] = mapped_column(ForeignKey("dataset_sources.id", ondelete="CASCADE"), index=True)
    format: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="running")
    rows_total: Mapped[int] = mapped_column(Integer, default=0)
    rows_imported: Mapped[int] = mapped_column(Integer, default=0)
    rows_rejected: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    suite_id: Mapped[str | None] = mapped_column(ForeignKey("test_suites.id", ondelete="SET NULL"))
    file_sha256: Mapped[str | None] = mapped_column(String(64))
    dataset_version: Mapped[str | None] = mapped_column(String(64))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = _created()
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# =====================================================================
# Policy store (blue-policy-service)
# =====================================================================
class DefensePolicy(PolicyBase):
    __tablename__ = "defense_policies"
    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    owner_tenant: Mapped[str] = mapped_column(String(64), default="blue")
    current_version_id: Mapped[str | None] = mapped_column(String(36))
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = _created()
    versions: Mapped[list["DefensePolicyVersion"]] = relationship(
        back_populates="policy", order_by="DefensePolicyVersion.version"
    )


class DefensePolicyVersion(PolicyBase):
    """Immutable: rows are only ever inserted. Updates create a new version."""

    __tablename__ = "defense_policy_versions"
    id: Mapped[str] = _pk()
    policy_id: Mapped[str] = mapped_column(ForeignKey("defense_policies.id", ondelete="RESTRICT"), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    config_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    change_note: Mapped[str] = mapped_column(String(512), default="")
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = _created()
    policy: Mapped[DefensePolicy] = relationship(back_populates="versions")
    __table_args__ = (UniqueConstraint("policy_id", "version", name="uq_policy_version"),)


# =====================================================================
# Evaluator store (evaluation-service) - ShadowPolicy private state
# =====================================================================
class ShadowPolicyFact(EvaluatorBase):
    __tablename__ = "shadowpolicy_facts"
    id: Mapped[str] = _pk()
    round_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    subject_id: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    definition: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = _created()
    __table_args__ = (UniqueConstraint("round_id", "subject_id", name="uq_sp_fact_subject"),)


class ShadowPolicyRoundSecret(EvaluatorBase):
    __tablename__ = "shadowpolicy_round_secrets"
    round_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    catalog_version: Mapped[str] = mapped_column(String(32), nullable=False)
    canonical_b64: Mapped[str] = mapped_column(Text, nullable=False)
    nonce_hex: Mapped[str] = mapped_column(String(64), nullable=False)
    commitment: Mapped[str] = mapped_column(String(64), nullable=False)
    observation_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    latency_floor_ms: Mapped[int] = mapped_column(Integer, default=0)
    revealed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _created()


class ShadowPolicyProbeTrace(EvaluatorBase):
    """Private evaluator tracking for each probe; never returned to Red."""

    __tablename__ = "shadowpolicy_probe_traces"
    id: Mapped[str] = _pk()
    round_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    probe_seq: Mapped[int] = mapped_column(Integer, nullable=False)
    probe_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    matched_subjects: Mapped[list] = mapped_column(JSON, default=list)
    exercised_subjects: Mapped[list] = mapped_column(JSON, default=list)
    applied_action: Mapped[str | None] = mapped_column(String(16))
    observed_class: Mapped[str | None] = mapped_column(String(16))
    response_signature: Mapped[str | None] = mapped_column(String(64))
    direct_disclosure: Mapped[bool] = mapped_column(Boolean, default=False)
    policy_distinction: Mapped[bool] = mapped_column(Boolean, default=False)
    latency_ms: Mapped[float | None] = mapped_column(Float)
    stage: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = _created()
    __table_args__ = (UniqueConstraint("round_id", "probe_seq", name="uq_sp_trace_seq"),)


# =====================================================================
# Audit store (audit-collector)
# =====================================================================
class AuditEvent(AuditBase):
    __tablename__ = "audit_events"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    event_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    ts: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # canonical ISO-8601 UTC string
    actor: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    service: Mapped[str] = mapped_column(String(64), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), index=True)
    trace_id: Mapped[str | None] = mapped_column(String(32), index=True)
    summary: Mapped[str] = mapped_column(String(512), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False)


class AuditCheckpoint(AuditBase):
    __tablename__ = "audit_checkpoints"
    id: Mapped[str] = _pk()
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    head_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = _created()
    algorithm: Mapped[str] = mapped_column(String(32), default="Ed25519")
    key_id: Mapped[str] = mapped_column(String(64), nullable=False)
    signature: Mapped[str] = mapped_column(Text, nullable=False)
    public_key_pem: Mapped[str] = mapped_column(Text, nullable=False)


Index("ix_audit_session_ts", AuditEvent.session_id, AuditEvent.ts)
Index("ix_exec_session_created", TestExecution.session_id, TestExecution.created_at)
Index("ix_eval_model_version", EvaluationSession.model_id, EvaluationSession.model_version_id)

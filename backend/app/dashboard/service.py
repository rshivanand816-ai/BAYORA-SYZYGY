"""Dashboard service: summary metrics, latency series, and recent events."""
from __future__ import annotations

from sqlalchemy import func, select

from app.audit.collector import get_collector
from app.blue_team.service import get_policy_refs
from app.core.config import get_settings
from app.core.util import iso, utcnow
from app.db.base import session_scope
from app.db.models import (
    AuditEvent,
    EvaluationSession,
    ModelRegistryEntry,
    ShadowPolicyRound,
    TestExecution,
)
from app.schemas.api import (
    AuditEventOut,
    AuditEventsPage,
    DashboardSummary,
    MetricValue,
    ModelRef,
    PolicyVersionRef,
    ResourceMetricOut,
    UserOut,
)
from app.security.service import get_resource_metrics


def get_dashboard_summary(user: UserOut) -> DashboardSummary:
    collector = get_collector()
    integrity_status = collector.status()

    with session_scope("controller") as s:
        # Sessions counts
        q_sess = select(EvaluationSession)
        if user.role == "red":
            q_sess = q_sess.where(EvaluationSession.owner_id == user.id)
        sessions = s.execute(q_sess).scalars().all()

        sessions_total = len(sessions)
        status_counts = {
            "created": sum(1 for sess in sessions if sess.status == "created"),
            "queued": sum(1 for sess in sessions if sess.status == "queued"),
            "running": sum(1 for sess in sessions if sess.status == "running"),
            "completed": sum(1 for sess in sessions if sess.status == "completed"),
            "failed": sum(1 for sess in sessions if sess.status == "failed"),
            "cancelled": sum(1 for sess in sessions if sess.status == "cancelled"),
        }

        # Test executions
        q_execs = select(TestExecution)
        if user.role == "red":
            session_ids = [sess.id for sess in sessions]
            q_execs = q_execs.where(TestExecution.session_id.in_(session_ids))
        execs = s.execute(q_execs).scalars().all()

        attack_cases_executed = sum(1 for e in execs if e.is_attack is True)
        blocked_count = sum(1 for e in execs if "blocked" in e.outcome)
        output_leak_detections = sum(1 for e in execs if e.canary_leaked_raw is True or "redacted" in e.outcome)

        # ShadowPolicy latest round
        q_rnd = select(ShadowPolicyRound).order_by(ShadowPolicyRound.created_at.desc())
        if user.role == "red":
            q_rnd = q_rnd.where(ShadowPolicyRound.red_user_id == user.id)
        latest_rnd = s.execute(q_rnd.limit(1)).scalar_one_or_none()

        sp_latest = None
        if latest_rnd:
            cov_val = (
                latest_rnd.results.get("metrics", {}).get("coverage", {}).get("value", 0.0)
                if latest_rnd.results
                else 0.0
            )
            sp_latest = {
                "round_id": latest_rnd.id,
                "name": latest_rnd.name,
                "coverage": MetricValue(
                    key="sp_coverage",
                    label="Hypothesis Coverage",
                    value=cov_val,
                    display=f"{round(cov_val * 100, 1)}%",
                    provenance="calculated" if latest_rnd.results else "insufficient",
                    source="shadowpolicy_rounds",
                ),
            }

        # Latency metrics
        latencies = sorted([e.latency_ms for e in execs if e.latency_ms > 0])
        n_lat = len(latencies)
        p50 = latencies[int(n_lat * 0.5)] if n_lat > 0 else None
        p95 = latencies[int(n_lat * 0.95)] if n_lat > 0 else None

        # Current active model and defense
        active_model = s.execute(
            select(ModelRegistryEntry).where(ModelRegistryEntry.status == "approved").limit(1)
        ).scalar_one_or_none()
        current_model_ref = (
            ModelRef(
                id=active_model.id,
                name=active_model.display_name,
                version=active_model.identifier,
                execution_mode=active_model.execution_mode,
            )
            if active_model
            else None
        )

    # Current defense policy ref
    policy_refs = get_policy_refs()
    current_defense_ref = policy_refs[0] if policy_refs else None

    # Failed authz in last 24 hours
    events, _ = collector.list_events({"event_type": "authz.denied"}, limit=100)
    failed_authz_24h = len(events)

    return DashboardSummary(
        sessions_total=sessions_total,
        sessions_by_status=status_counts,
        attack_cases_executed=attack_cases_executed,
        blocked_count=blocked_count,
        output_leak_detections=output_leak_detections,
        failed_authz_24h=failed_authz_24h,
        shadowpolicy_latest=sp_latest,
        audit_integrity={
            "status": integrity_status.get("status", "unverified"),
            "last_verified_at": integrity_status.get("last_verified_at"),
            "events": integrity_status.get("events", 0),
            "head_seq": integrity_status.get("head_seq", 0),
        },
        latency={
            "p50": MetricValue(
                key="p50_latency",
                label="P50 Evaluation Latency",
                value=round(p50, 2) if p50 else None,
                display=f"{round(p50, 1)} ms" if p50 else "Insufficient observations",
                n=n_lat,
                provenance="measured" if n_lat > 0 else "insufficient",
                source="test_executions",
            ),
            "p95": MetricValue(
                key="p95_latency",
                label="P95 Evaluation Latency",
                value=round(p95, 2) if p95 else None,
                display=f"{round(p95, 1)} ms" if p95 else "Insufficient observations",
                n=n_lat,
                provenance="measured" if n_lat > 0 else "insufficient",
                source="test_executions",
            ),
        },
        current_model=current_model_ref,
        current_defense=current_defense_ref,
        data_provenance="simulated" if any(sess.simulated for sess in sessions) else "measured",
        resource=get_resource_metrics(),
    )


def get_dashboard_metrics(user: UserOut) -> dict:
    with session_scope("controller") as s:
        q_execs = select(TestExecution).order_by(TestExecution.created_at)
        if user.role == "red":
            sessions = s.execute(
                select(EvaluationSession.id).where(EvaluationSession.owner_id == user.id)
            ).scalars().all()
            q_execs = q_execs.where(TestExecution.session_id.in_(sessions))
        execs = s.execute(q_execs).scalars().all()

        latency_series = [
            {
                "seq": ex.seq,
                "t": iso(ex.created_at) or "",
                "latency_ms": round(ex.latency_ms, 2),
                "outcome": ex.outcome,
            }
            for ex in execs[-30:]
        ]

        outcome_counts: dict[str, int] = {}
        for ex in execs:
            outcome_counts[ex.outcome] = outcome_counts.get(ex.outcome, 0) + 1

        outcome_breakdown = [{"outcome": k, "count": v} for k, v in outcome_counts.items()]

        return {
            "metrics": [
                MetricValue(
                    key="total_executions",
                    label="Test Invocations",
                    value=float(len(execs)),
                    display=str(len(execs)),
                    n=len(execs),
                    provenance="measured",
                    source="controller",
                ),
            ],
            "latency_series": latency_series,
            "outcome_breakdown": outcome_breakdown,
        }


def get_recent_events(user: UserOut, limit: int = 20) -> list[AuditEventOut]:
    collector = get_collector()
    filters = {}
    if user.role == "red":
        filters["actor"] = user.username
    elif user.role == "blue":
        # Blue must not see raw attack payload categories
        filters["categories"] = ["policy", "security", "shadowpolicy", "audit"]

    events, _ = collector.list_events(filters, limit=limit)
    return [AuditEventOut(**ev) for ev in events]

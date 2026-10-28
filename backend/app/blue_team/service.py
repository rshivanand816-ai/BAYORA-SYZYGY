"""Blue team service: defense policies, versioning, defense metrics and mitigation comparisons."""
from __future__ import annotations

import copy
from sqlalchemy import select

from app.audit.collector import AuditCollector
from app.blue_team.engine import DEFAULT_POLICY_CONFIG, validate_patterns
from app.core.errors import ApiError, bad_request, conflict, not_found
from app.core.util import canonical_json, iso, new_id, sha256_hex, utcnow
from app.db.base import session_scope
from app.db.models import DefensePolicy, DefensePolicyVersion, TestExecution
from app.schemas.api import (
    ComparisonOut,
    DefensePolicyOut,
    DefenseSummary,
    MetricValue,
    PolicyVersionCreate,
    PolicyVersionOut,
    PolicyVersionRef,
)
from app.shadowpolicy.service import compare_mitigations

audit_collector = AuditCollector()


def seed_defense_policies() -> None:
    with session_scope("policy") as s:
        p = s.execute(select(DefensePolicy).where(DefensePolicy.name == "bayora-default-defense")).scalar_one_or_none()
        if not p:
            p_id = new_id()
            v1_id = new_id()
            v2_id = new_id()

            # Baseline version (raw diagnostics, no normalization)
            cfg_v1 = copy.deepcopy(DEFAULT_POLICY_CONFIG)
            cfg_v1["response_normalization"] = False
            cfg_v1["latency_floor_ms"] = 0

            # Mitigated version (response normalization, latency floor)
            cfg_v2 = copy.deepcopy(DEFAULT_POLICY_CONFIG)
            cfg_v2["response_normalization"] = True
            cfg_v2["latency_floor_ms"] = 80
            cfg_v2["normalized_message"] = "This request cannot be completed under the active evaluation policy."

            p = DefensePolicy(
                id=p_id,
                name="bayora-default-defense",
                description="Layered input and output safety guardrails (regex, heuristics, canary redaction).",
                owner_tenant="blue",
                current_version_id=v2_id,
                created_by="blue",
            )
            s.add(p)
            s.flush()

            v1 = DefensePolicyVersion(
                id=v1_id,
                policy_id=p_id,
                version=1,
                config=cfg_v1,
                config_sha256=sha256_hex(canonical_json(cfg_v1)),
                change_note="Initial baseline defense policy without output normalization (diagnostic leak testbed).",
                created_by="blue",
            )
            v2 = DefensePolicyVersion(
                id=v2_id,
                policy_id=p_id,
                version=2,
                config=cfg_v2,
                config_sha256=sha256_hex(canonical_json(cfg_v2)),
                change_note="Mitigated release: response normalization enabled and 80ms latency floor applied to defeat timing side-channels.",
                created_by="blue",
            )
            s.add_all([v1, v2])


def get_policy_refs() -> list[PolicyVersionRef]:
    with session_scope("policy") as s:
        policies = s.execute(select(DefensePolicy)).scalars().all()
        refs = []
        for pol in policies:
            versions = s.execute(
                select(DefensePolicyVersion)
                .where(DefensePolicyVersion.policy_id == pol.id)
                .order_by(DefensePolicyVersion.version.desc())
            ).scalars().all()
            for v in versions:
                is_dep = (v.id == pol.current_version_id)
                refs.append(
                    PolicyVersionRef(
                        id=v.id,
                        policy_id=v.policy_id,
                        policy_name=pol.name,
                        version=v.version,
                        deployed=is_dep,
                        response_normalization=v.config.get("response_normalization", False),
                        created_at=iso(v.created_at) or "",
                    )
                )
        return refs


def get_all_policies() -> list[DefensePolicyOut]:
    with session_scope("policy") as s:
        policies = s.execute(select(DefensePolicy).order_by(DefensePolicy.name)).scalars().all()
        result = []
        for p in policies:
            versions = s.execute(
                select(DefensePolicyVersion)
                .where(DefensePolicyVersion.policy_id == p.id)
                .order_by(DefensePolicyVersion.version.desc())
            ).scalars().all()
            latest_v = versions[0] if versions else None

            curr_v_out = None
            if latest_v:
                curr_v_out = PolicyVersionOut(
                    id=latest_v.id,
                    policy_id=latest_v.policy_id,
                    version=latest_v.version,
                    config=latest_v.config,
                    config_sha256=latest_v.config_sha256,
                    change_note=latest_v.change_note,
                    created_by=latest_v.created_by,
                    created_at=iso(latest_v.created_at) or "",
                    deployed=(latest_v.id == p.current_version_id),
                )

            result.append(
                DefensePolicyOut(
                    id=p.id,
                    name=p.name,
                    description=p.description or "",
                    created_at=iso(p.created_at) or "",
                    current_version=curr_v_out,
                    version_count=len(versions),
                )
            )
        return result


def get_policy_versions(policy_id: str) -> list[PolicyVersionOut]:
    with session_scope("policy") as s:
        policy = s.execute(select(DefensePolicy).where(DefensePolicy.id == policy_id)).scalar_one_or_none()
        curr_id = policy.current_version_id if policy else None
        versions = s.execute(
            select(DefensePolicyVersion)
            .where(DefensePolicyVersion.policy_id == policy_id)
            .order_by(DefensePolicyVersion.version.desc())
        ).scalars().all()

        return [
            PolicyVersionOut(
                id=v.id,
                policy_id=v.policy_id,
                version=v.version,
                config=v.config,
                config_sha256=v.config_sha256,
                change_note=v.change_note,
                created_by=v.created_by,
                created_at=iso(v.created_at) or "",
                deployed=(v.id == curr_id),
            )
            for v in versions
        ]


def get_policy_config_by_version_id(version_id: str) -> tuple[dict, str]:
    with session_scope("policy") as s:
        v = s.execute(
            select(DefensePolicyVersion).where(DefensePolicyVersion.id == version_id)
        ).scalar_one_or_none()
        if not v:
            return DEFAULT_POLICY_CONFIG, "v1-default"
        return v.config, f"v{v.version}"


def create_policy_version(policy_id: str, payload: PolicyVersionCreate, actor: str) -> PolicyVersionOut:
    cfg_dict = payload.config.model_dump()
    errs = validate_patterns(cfg_dict)
    if errs:
        raise bad_request(f"Invalid policy patterns: {'; '.join(errs)}")

    with session_scope("policy") as s:
        policy = s.execute(select(DefensePolicy).where(DefensePolicy.id == policy_id)).scalar_one_or_none()
        if not policy:
            raise not_found("DefensePolicy")

        latest_v = s.execute(
            select(DefensePolicyVersion)
            .where(DefensePolicyVersion.policy_id == policy_id)
            .order_by(DefensePolicyVersion.version.desc())
            .limit(1)
        ).scalar_one_or_none()

        next_ver = (latest_v.version + 1) if latest_v else 1
        new_v_id = new_id()
        c_json = canonical_json(cfg_dict)

        new_v = DefensePolicyVersion(
            id=new_v_id,
            policy_id=policy_id,
            version=next_ver,
            config=cfg_dict,
            config_sha256=sha256_hex(c_json),
            change_note=payload.change_note,
            created_by=actor,
        )
        s.add(new_v)
        policy.current_version_id = new_v_id

        audit_collector.append({
            "actor": actor,
            "actor_role": "blue",
            "service": "blue-policy-service",
            "event_type": "policy.version_created",
            "category": "policy",
            "severity": "info",
            "summary": f"Created defense policy version v{next_ver} for '{policy.name}'",
            "payload": {"policy_id": policy_id, "version": next_ver, "change_note": payload.change_note},
        })

        return PolicyVersionOut(
            id=new_v.id,
            policy_id=new_v.policy_id,
            version=new_v.version,
            config=payload.config,
            config_sha256=new_v.config_sha256,
            change_note=new_v.change_note,
            created_by=new_v.created_by,
            created_at=iso(new_v.created_at) or "",
            deployed=True,
        )


def get_defense_summary() -> DefenseSummary:
    with session_scope("controller") as s:
        execs = s.execute(select(TestExecution)).scalars().all()
        blocked_count = sum(1 for e in execs if "blocked" in e.outcome)
        rewritten_count = sum(1 for e in execs if e.input_decision == "transform")
        redacted_count = sum(1 for e in execs if "redacted" in e.outcome or e.output_decision == "redact")
        allowed_count = sum(1 for e in execs if e.outcome == "allowed")
        total = len(execs)

        fp_count = sum(1 for e in execs if e.is_attack is False and ("blocked" in e.outcome or "redacted" in e.outcome))
        benign_total = sum(1 for e in execs if e.is_attack is False)
        fp_rate = (fp_count / benign_total) if benign_total > 0 else 0.0

        fn_count = sum(1 for e in execs if e.is_attack is True and e.outcome == "allowed")
        attack_total = sum(1 for e in execs if e.is_attack is True)
        fn_rate = (fn_count / attack_total) if attack_total > 0 else 0.0

        cat_counts: dict[str, int] = {}
        for e in execs:
            c = e.category or "general"
            cat_counts[c] = cat_counts.get(c, 0) + 1

        refs = get_policy_refs()
        deployed_refs = [r for r in refs if r.deployed]

        return DefenseSummary(
            deployed=deployed_refs,
            counts={
                "total": total,
                "blocked": blocked_count,
                "rewritten": rewritten_count,
                "redacted": redacted_count,
                "allowed": allowed_count,
            },
            by_category=[{"category": k, "count": v} for k, v in cat_counts.items()],
            false_positive_rate=MetricValue(
                key="false_positive_rate",
                label="False Positive Rate",
                value=round(fp_rate, 4),
                display=f"{round(fp_rate * 100, 1)}%",
                numerator=fp_count,
                denominator=benign_total,
                n=benign_total,
                provenance="measured" if benign_total > 0 else "insufficient",
                source="controller.test_executions",
                formula="benign_blocked / total_benign",
            ),
            false_negative_rate=MetricValue(
                key="false_negative_rate",
                label="False Negative Rate",
                value=round(fn_rate, 4),
                display=f"{round(fn_rate * 100, 1)}%",
                numerator=fn_count,
                denominator=attack_total,
                n=attack_total,
                provenance="measured" if attack_total > 0 else "insufficient",
                source="controller.test_executions",
                formula="attacks_allowed / total_attacks",
            ),
            recent_decisions=[
                {
                    "stage": e.input_decision,
                    "outcome": e.outcome,
                    "explanation_code": e.public_code,
                    "seq": e.seq,
                    "created_at": iso(e.created_at) or "",
                }
                for e in execs[-10:]
            ],
            payload_visibility_note="Red Team attack payloads are strictly isolated until session finalization.",
        )

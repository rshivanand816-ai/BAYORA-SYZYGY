"""Blue Team Defense Console API endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.auth.service import get_current_user, require_roles
from app.blue_team.service import (
    compare_mitigations,
    create_policy_version,
    get_all_policies,
    get_defense_summary,
    get_policy_refs,
    get_policy_versions,
)
from app.core.errors import not_found
from app.core.util import iso, new_id, utcnow
from app.db.base import session_scope
from app.db.models import DefensePolicy, ShadowPolicyComparison
from app.schemas.api import (
    ComparisonOut,
    DefensePolicyCreate,
    DefensePolicyOut,
    DefenseSummary,
    MitigationRequest,
    PolicyVersionCreate,
    PolicyVersionOut,
    PolicyVersionRef,
    UserOut,
)

router = APIRouter(prefix="/blue", tags=["Blue Team Defense Console"])


@router.get("/policy-refs", response_model=list[PolicyVersionRef])
def policy_refs(user: Annotated[UserOut, Depends(get_current_user)]) -> list[PolicyVersionRef]:
    # Available to everyone (contains public identifiers only, no rule logic)
    return get_policy_refs()


@router.get("/policies", response_model=list[DefensePolicyOut])
def list_policies(
    user: Annotated[UserOut, Depends(require_roles("blue", "admin", "auditor"))],
) -> list[DefensePolicyOut]:
    return get_all_policies()


@router.post("/policies", response_model=DefensePolicyOut)
def create_policy(
    payload: DefensePolicyCreate,
    user: Annotated[UserOut, Depends(require_roles("blue", "admin"))],
) -> DefensePolicyOut:
    p_id = new_id()
    with session_scope("policy") as s:
        p = DefensePolicy(
            id=p_id,
            name=payload.name,
            description=payload.description or "",
            owner_tenant="blue",
            created_by=user.username,
        )
        s.add(p)
    return next(pol for pol in get_all_policies() if pol.id == p_id)


@router.post("/policies/{policy_id}/versions", response_model=PolicyVersionOut)
def new_version(
    policy_id: str,
    payload: PolicyVersionCreate,
    user: Annotated[UserOut, Depends(require_roles("blue", "admin"))],
) -> PolicyVersionOut:
    return create_policy_version(policy_id, payload, user.username)


@router.get("/policies/{policy_id}/versions", response_model=list[PolicyVersionOut])
def list_versions(
    policy_id: str,
    user: Annotated[UserOut, Depends(require_roles("blue", "admin", "auditor"))],
) -> list[PolicyVersionOut]:
    return get_policy_versions(policy_id)


@router.get("/defense-summary", response_model=DefenseSummary)
def defense_summary(
    user: Annotated[UserOut, Depends(require_roles("blue", "admin", "auditor"))],
) -> DefenseSummary:
    return get_defense_summary()


@router.post("/mitigations", response_model=ComparisonOut)
def run_mitigation_comparison(
    payload: MitigationRequest,
    user: Annotated[UserOut, Depends(require_roles("blue", "admin"))],
) -> ComparisonOut:
    return compare_mitigations(
        payload.baseline_policy_version_id,
        payload.mitigated_policy_version_id,
        user.id,
        n_facts=payload.n_facts,
        probe_budget=payload.probe_budget,
    )


@router.get("/mitigations", response_model=list[ComparisonOut])
def list_mitigations(
    user: Annotated[UserOut, Depends(require_roles("blue", "admin", "auditor"))],
) -> list[ComparisonOut]:
    with session_scope("controller") as s:
        cmps = s.execute(select(ShadowPolicyComparison).order_by(ShadowPolicyComparison.created_at.desc())).scalars().all()
        return [
            ComparisonOut(
                id=c.id,
                created_at=iso(c.created_at) or "",
                status=c.status,
                baseline_round_id=c.baseline_round_id,
                mitigated_round_id=c.mitigated_round_id,
                baseline_policy_version_id=c.baseline_policy_version_id or "",
                mitigated_policy_version_id=c.mitigated_policy_version_id or "",
                n_facts=c.n_facts or 4,
                probe_budget=c.probe_budget or 20,
                summary=c.summary,
            )
            for c in cmps
        ]


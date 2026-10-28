"""Evaluations & Red Team Workbench API endpoints."""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select

from app.auth.service import get_current_user, require_roles
from app.core.errors import forbidden, not_found
from app.core.util import utcnow
from app.db.base import session_scope
from app.db.models import EvaluationSession
from app.evaluations.service import (
    create_evaluation,
    generate_evaluation_report,
    get_all_evaluations,
    get_evaluation_out,
    get_evaluation_results,
    get_probe_budget,
    get_red_results,
    start_evaluation,
    submit_eval_probe,
)
from app.schemas.api import (
    EvaluationCreate,
    EvaluationOut,
    EvaluationResults,
    ProbeBudget,
    ProbeRequest,
    ProbeResult,
    RedResults,
    UserOut,
)

router = APIRouter(prefix="/evaluations", tags=["Evaluations & Red Workbench"])


@router.post("", response_model=EvaluationOut)
def new_evaluation(
    payload: EvaluationCreate,
    user: Annotated[UserOut, Depends(require_roles("red", "admin"))],
) -> EvaluationOut:
    return create_evaluation(payload, user)


@router.get("", response_model=list[EvaluationOut])
def list_evaluations(user: Annotated[UserOut, Depends(get_current_user)]) -> list[EvaluationOut]:
    return get_all_evaluations(user)


@router.get("/{session_id}", response_model=EvaluationOut)
def get_evaluation(
    session_id: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> EvaluationOut:
    eval_out = get_evaluation_out(session_id)
    if user.role == "red" and eval_out.owner != user.username:
        raise not_found("Evaluation Session")  # 404 to avoid ID enumeration
    return eval_out


@router.post("/{session_id}/start", response_model=EvaluationOut)
def start_eval(
    session_id: str,
    user: Annotated[UserOut, Depends(require_roles("red", "admin"))],
) -> EvaluationOut:
    return start_evaluation(session_id, user)


@router.post("/{session_id}/cancel", response_model=EvaluationOut)
def cancel_eval(
    session_id: str,
    user: Annotated[UserOut, Depends(require_roles("red", "admin"))],
) -> EvaluationOut:
    with session_scope("controller") as s:
        e = s.execute(select(EvaluationSession).where(EvaluationSession.id == session_id)).scalar_one_or_none()
        if not e:
            raise not_found("Evaluation")
        if user.role == "red" and e.owner_id != user.id:
            raise forbidden("Not your evaluation")
        e.status = "cancelled"
        e.completed_at = utcnow()
    return get_evaluation_out(session_id)


@router.post("/{session_id}/complete", response_model=EvaluationOut)
def complete_eval(
    session_id: str,
    user: Annotated[UserOut, Depends(require_roles("red", "admin"))],
) -> EvaluationOut:
    with session_scope("controller") as s:
        e = s.execute(select(EvaluationSession).where(EvaluationSession.id == session_id)).scalar_one_or_none()
        if not e:
            raise not_found("Evaluation")
        if user.role == "red" and e.owner_id != user.id:
            raise forbidden("Not your evaluation")
        e.status = "completed"
        e.completed_at = utcnow()
    return get_evaluation_out(session_id)


@router.get("/{session_id}/results", response_model=EvaluationResults)
def eval_results(
    session_id: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> EvaluationResults:
    e = get_evaluation_out(session_id)
    if user.role == "red" and e.owner != user.username:
        raise not_found("Evaluation Session")
    if user.role == "blue" and e.status != "completed":
        raise forbidden("Blue Team can only inspect evaluation results once completed")
    return get_evaluation_results(session_id)


@router.get("/{session_id}/report", response_model=None)
def eval_report(
    session_id: str,
    format: Literal["json", "pdf"] = "json",
    user: Annotated[UserOut, Depends(get_current_user)] = None,  # type: ignore[assignment]
) -> Response | dict:
    e = get_evaluation_out(session_id)
    if user.role == "red" and e.owner != user.username:
        raise not_found("Evaluation Session")
    if user.role == "blue" and e.status != "completed":
        raise forbidden("Blue Team can only view reports after evaluation is complete")

    result = generate_evaluation_report(session_id, format_type=format)
    if format == "pdf":
        return Response(
            content=result,  # type: ignore[arg-type]
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="bayora-report-{session_id[:8]}.pdf"'},
        )
    return result  # type: ignore[return-value]


@router.post("/{session_id}/probes", response_model=ProbeResult)
def submit_probe(
    session_id: str,
    payload: ProbeRequest,
    user: Annotated[UserOut, Depends(require_roles("red", "admin"))],
) -> ProbeResult:
    return submit_eval_probe(session_id, payload, user)


@router.get("/{session_id}/red-results", response_model=RedResults)
def red_results(
    session_id: str,
    user: Annotated[UserOut, Depends(require_roles("red", "admin"))],
) -> RedResults:
    return get_red_results(session_id, user)


@router.get("/{session_id}/probe-budget", response_model=ProbeBudget)
def probe_budget(
    session_id: str,
    user: Annotated[UserOut, Depends(require_roles("red", "admin"))],
) -> ProbeBudget:
    return get_probe_budget(session_id)

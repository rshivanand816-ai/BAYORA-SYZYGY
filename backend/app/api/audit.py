"""Audit Explorer and Cryptographic Verification API endpoints."""
from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.audit.collector import get_collector
from app.auth.service import require_roles
from app.core.errors import not_found
from app.schemas.api import (
    AuditEventOut,
    AuditEventsPage,
    AuditVerifyResult,
    CheckpointOut,
    TamperDemoResult,
    UserOut,
)

router = APIRouter(prefix="/audit", tags=["Audit Explorer"])


@router.get("/events", response_model=AuditEventsPage)
def list_events(
    user: Annotated[UserOut, Depends(require_roles("auditor", "admin"))],
    since: str | None = None,
    until: str | None = None,
    actor: str | None = None,
    session_id: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    event_type: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> AuditEventsPage:
    collector = get_collector()
    filters = {}
    if since:
        filters["since"] = since
    if until:
        filters["until"] = until
    if actor:
        filters["actor"] = actor
    if session_id:
        filters["session_id"] = session_id
    if category:
        filters["category"] = category
    if severity:
        filters["severity"] = severity
    if event_type:
        filters["event_type"] = event_type

    events, total = collector.list_events(filters, limit=limit, offset=offset)
    return AuditEventsPage(
        total=total,
        items=[AuditEventOut(**e) for e in events],
    )


@router.get("/events/{event_id}", response_model=AuditEventOut)
def get_single_event(
    event_id: str,
    user: Annotated[UserOut, Depends(require_roles("auditor", "admin"))],
) -> AuditEventOut:
    collector = get_collector()
    ev = collector.get_event(event_id)
    if not ev:
        raise not_found("AuditEvent")
    return AuditEventOut(**ev)


@router.post("/verify", response_model=AuditVerifyResult)
def verify_audit_chain(
    user: Annotated[UserOut, Depends(require_roles("auditor", "admin"))],
) -> AuditVerifyResult:
    collector = get_collector()
    res = collector.verify()
    return AuditVerifyResult(**res)


@router.get("/checkpoints", response_model=list[CheckpointOut])
def list_checkpoints(
    user: Annotated[UserOut, Depends(require_roles("auditor", "admin"))],
) -> list[CheckpointOut]:
    collector = get_collector()
    cps = collector.list_checkpoints()
    return [CheckpointOut(**cp) for cp in cps]


@router.post("/checkpoints", response_model=CheckpointOut)
def create_checkpoint(
    user: Annotated[UserOut, Depends(require_roles("auditor", "admin"))],
) -> CheckpointOut:
    collector = get_collector()
    cp = collector.create_checkpoint()
    return CheckpointOut(**cp)


@router.post("/checkpoints/{checkpoint_id}/verify", response_model=CheckpointOut)
def verify_checkpoint(
    checkpoint_id: str,
    user: Annotated[UserOut, Depends(require_roles("auditor", "admin"))],
) -> CheckpointOut:
    collector = get_collector()
    res = collector.verify_checkpoint(checkpoint_id)
    if not res:
        raise not_found("Checkpoint")
    return CheckpointOut(**res)


@router.post("/tamper-demo", response_model=TamperDemoResult)
def run_tamper_demo(
    user: Annotated[UserOut, Depends(require_roles("auditor", "admin"))],
) -> TamperDemoResult:
    collector = get_collector()
    events = collector.all_events()
    demo_res = collector.tamper_demo(events)
    return TamperDemoResult(**demo_res)


@router.get("/export")
def export_audit_log(
    user: Annotated[UserOut, Depends(require_roles("auditor", "admin"))],
) -> Response:
    collector = get_collector()
    events = collector.all_events()
    payload = json.dumps(events, indent=2)
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="bayora-audit-export.json"'},
    )

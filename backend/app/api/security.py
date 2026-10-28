"""Security, Isolation Checks, and Threat Model API endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.audit.collector import get_collector
from app.auth.service import get_current_user, require_roles
from app.schemas.api import (
    AuditEventOut,
    IsolationCheckOut,
    IsolationRun,
    ResourceMetricOut,
    SecurityStatus,
    UserOut,
)
from app.security.service import (
    get_latest_isolation_checks,
    get_resource_metrics,
    get_security_status,
    get_threat_model,
    run_system_isolation_checks,
)

router = APIRouter(prefix="/security", tags=["Security & Isolation"])


@router.get("/status", response_model=SecurityStatus)
def security_status(user: Annotated[UserOut, Depends(get_current_user)]) -> SecurityStatus:
    return get_security_status()


@router.get("/isolation-checks", response_model=list[IsolationCheckOut])
def list_isolation_checks(
    user: Annotated[UserOut, Depends(require_roles("admin", "auditor", "blue"))],
) -> list[IsolationCheckOut]:
    return get_latest_isolation_checks()


@router.post("/isolation-checks/run", response_model=IsolationRun)
def trigger_isolation_checks(
    user: Annotated[UserOut, Depends(require_roles("admin", "auditor"))],
) -> IsolationRun:
    return run_system_isolation_checks(user.username)


@router.get("/network-events", response_model=list[AuditEventOut])
def network_events(
    user: Annotated[UserOut, Depends(require_roles("admin", "auditor"))],
) -> list[AuditEventOut]:
    collector = get_collector()
    events, _ = collector.list_events({"category": "security"}, limit=50)
    return [AuditEventOut(**e) for e in events]


@router.get("/resource-metrics", response_model=list[ResourceMetricOut])
def resource_metrics(
    user: Annotated[UserOut, Depends(require_roles("admin", "auditor", "blue"))],
) -> list[ResourceMetricOut]:
    return get_resource_metrics()


@router.get("/threat-model")
def threat_model(user: Annotated[UserOut, Depends(get_current_user)]) -> dict:
    return get_threat_model()

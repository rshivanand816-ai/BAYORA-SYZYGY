"""Dashboard API endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth.service import get_current_user
from app.dashboard.service import get_dashboard_metrics, get_dashboard_summary, get_recent_events
from app.schemas.api import AuditEventOut, DashboardSummary, UserOut

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(user: Annotated[UserOut, Depends(get_current_user)]) -> DashboardSummary:
    return get_dashboard_summary(user)


@router.get("/recent-events", response_model=list[AuditEventOut])
def recent_events(user: Annotated[UserOut, Depends(get_current_user)]) -> list[AuditEventOut]:
    return get_recent_events(user)


@router.get("/metrics")
def dashboard_metrics(user: Annotated[UserOut, Depends(get_current_user)]) -> dict:
    return get_dashboard_metrics(user)

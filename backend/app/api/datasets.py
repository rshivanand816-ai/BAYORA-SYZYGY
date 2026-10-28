"""Datasets and benchmarks API endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.audit.collector import AuditCollector
from app.auth.service import get_current_user, require_roles
from app.core.config import get_settings
from app.core.errors import bad_request, not_found
from app.datasets.service import (
    get_all_dataset_sources,
    get_import_jobs,
    import_dataset_file,
)
from app.schemas.api import DatasetSourceOut, ImportJobOut, UserOut

router = APIRouter(prefix="/datasets", tags=["Datasets"])
audit_collector = AuditCollector()


@router.get("/sources", response_model=list[DatasetSourceOut])
def list_sources(user: Annotated[UserOut, Depends(get_current_user)]) -> list[DatasetSourceOut]:
    return get_all_dataset_sources()


@router.post("/import", response_model=ImportJobOut)
def import_dataset(
    source_id: str = Form(...),
    format: str = Form(...),
    file: UploadFile = File(...),
    user: Annotated[UserOut, Depends(require_roles("admin"))] = None,  # type: ignore[assignment]
) -> ImportJobOut:
    """Import an uploaded benchmark file.

    The file is parsed for real: the returned row counts are observed from
    the upload, and every rejected row carries a reason.
    """
    settings = get_settings()
    if file is None:
        raise bad_request("A dataset file is required", code="file_required")

    raw = file.file.read()
    if not raw:
        raise bad_request("The uploaded dataset file is empty", code="file_empty")
    if len(raw) > settings.max_upload_bytes:
        raise bad_request(
            f"Dataset file exceeds the {settings.max_upload_bytes}-byte upload limit",
            code="file_too_large",
        )

    return import_dataset_file(
        source_id=source_id,
        fmt=format,
        raw_bytes=raw,
        created_by=user.id,
    )


@router.get("/imports", response_model=list[ImportJobOut])
def list_imports(
    user: Annotated[UserOut, Depends(get_current_user)],
) -> list[ImportJobOut]:
    return get_import_jobs()


@router.get("/imports/{job_id}", response_model=ImportJobOut)
def get_single_import(
    job_id: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> ImportJobOut:
    jobs = get_import_jobs()
    for j in jobs:
        if j.id == job_id:
            return j
    raise not_found("ImportJob")


"""Models and Test Suites API endpoints."""
from __future__ import annotations

import shutil
import time
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select

from app.audit.collector import AuditCollector
from app.auth.service import get_current_user, require_roles
from app.core.config import get_settings
from app.core.errors import bad_request, forbidden, not_found
from app.core.util import iso, new_id, sha256_hex, utcnow
from app.db.base import session_scope
from app.db.models import ModelRegistryEntry, ModelVersion
from app.models_gateway.service import (
    get_all_models,
    get_all_test_suites,
    get_model_versions,
    get_suite_cases,
)
from app.schemas.api import (
    ExternalEnableRequest,
    HealthCheckOut,
    ModelCreate,
    ModelImportRequest,
    ModelOut,
    ModelVersionOut,
    TestCaseOut,
    TestSuiteOut,
    UserOut,
)

router = APIRouter(tags=["Models & Test Suites"])
audit_collector = AuditCollector()


@router.get("/models", response_model=list[ModelOut])
def list_models(user: Annotated[UserOut, Depends(get_current_user)]) -> list[ModelOut]:
    return get_all_models()


@router.post("/models", response_model=ModelOut)
def create_model(
    payload: ModelCreate,
    user: Annotated[UserOut, Depends(require_roles("admin"))],
) -> ModelOut:
    m_id = new_id()
    v_id = new_id()
    with session_scope("controller") as s:
        m = ModelRegistryEntry(
            id=m_id,
            display_name=payload.display_name,
            adapter=payload.adapter,
            identifier=payload.identifier,
            base_url=payload.base_url,
            source=payload.adapter,
            format="api" if payload.adapter != "mock" else "simulated",
            architecture="transformer",
            resource_estimate={"vram_gb": 0 if payload.adapter == "mock" else 8},
            status="registered",
            execution_mode="simulated" if payload.adapter == "mock" else ("local" if payload.adapter == "ollama" else "external"),
            external_enabled=False,
            created_by=user.id,
            current_version_id=v_id,
            last_health_status="untested",
        )
        s.add(m)
        s.flush()

        v = ModelVersion(
            id=v_id,
            model_id=m_id,
            version=payload.version or "1.0.0",
            revision="rev-01",
            config_hash=sha256_hex(payload.identifier),
        )
        s.add(v)

    audit_collector.append({
        "actor": user.username,
        "actor_role": user.role,
        "service": "api-controller",
        "event_type": "model.registered",
        "category": "models",
        "severity": "info",
        "summary": f"Registered model '{payload.display_name}' ({payload.adapter})",
        "payload": {"model_id": m_id, "adapter": payload.adapter},
    })

    models = get_all_models()
    return next(m for m in models if m.id == m_id)


@router.get("/models/{model_id}", response_model=ModelOut)
def get_model(model_id: str, user: Annotated[UserOut, Depends(get_current_user)]) -> ModelOut:
    models = get_all_models()
    for m in models:
        if m.id == model_id:
            return m
    raise not_found("Model")


@router.post("/models/{model_id}/validate", response_model=ModelOut)
def validate_model(
    model_id: str,
    user: Annotated[UserOut, Depends(require_roles("admin"))],
) -> ModelOut:
    """Validate a registry entry against what can actually be checked.

    The check is real but bounded: it verifies the registry metadata, the
    pinned version, the adapter's reachability and the file hash. It does
    NOT attest the model's provenance or trustworthiness.
    """
    settings = get_settings()
    with session_scope("controller") as s:
        m = s.execute(select(ModelRegistryEntry).where(ModelRegistryEntry.id == model_id)).scalar_one_or_none()
        if not m:
            raise not_found("Model")

        version = None
        if m.current_version_id:
            version = s.execute(
                select(ModelVersion).where(ModelVersion.id == m.current_version_id)
            ).scalar_one_or_none()

        checks: list[dict] = []

        checks.append({
            "check": "registry_metadata",
            "passed": bool(m.display_name and m.adapter and m.identifier),
            "detail": f"adapter={m.adapter}, identifier={m.identifier}",
        })

        checks.append({
            "check": "pinned_version",
            "passed": version is not None,
            "detail": (
                f"version {version.version} ({version.file_sha256[:16]}...)"
                if version is not None
                else "no current version is pinned"
            ),
        })

        # Adapter reachability: the mock is in-process; ollama is a real
        # HTTP probe; an external adapter is probed only if it has consent.
        adapter_ok, adapter_detail, latency = _probe_adapter(m)
        checks.append({
            "check": "adapter_reachability",
            "passed": adapter_ok,
            "detail": adapter_detail,
        })

        # The file hash is only verifiable if the bytes are still present.
        hash_ok = True
        hash_detail = "no local file to verify (remote or mock adapter)"
        if version is not None and version.file_path and not version.file_path.startswith("mock://"):
            p = Path(version.file_path)
            if p.is_file():
                actual = sha256_hex(p.read_bytes())
                hash_ok = actual == (version.file_sha256 or "")
                hash_detail = (
                    "sha256 matches the pinned version"
                    if hash_ok
                    else f"sha256 mismatch: pinned {str(version.file_sha256)[:16]}..., file {actual[:16]}..."
                )
            else:
                hash_ok = False
                hash_detail = f"pinned file is missing at {version.file_path}"
        checks.append({"check": "file_hash", "passed": hash_ok, "detail": hash_detail})

        valid = all(c["passed"] for c in checks)
        m.validation_result = {
            "valid": valid,
            "checks": checks,
            "latency_ms": latency,
            "detail": (
                "All performed checks passed. This is not a provenance attestation."
                if valid
                else "One or more checks failed; see 'checks'."
            ),
            "limitations": [
                "Validation confirms registry metadata, a pinned version, adapter reachability and the local file hash.",
                "It does NOT attest where the weights came from, what they were trained on, or that they are safe.",
            ],
        }
        m.status = "validated" if valid else "validation_failed"

    audit_collector.append({
        "actor": user.username,
        "actor_role": user.role,
        "service": "api-controller",
        "event_type": "model.validated",
        "category": "models",
        "severity": "info" if valid else "warning",
        "summary": f"Validated model '{m.display_name}': {'passed' if valid else 'failed'}",
        "payload": {"model_id": model_id, "valid": valid},
    })

    return get_model(model_id, user)


def _probe_adapter(m: ModelRegistryEntry) -> tuple[bool, str, float | None]:
    """Probe the adapter's reachability. Returns (ok, detail, latency_ms)."""
    settings = get_settings()
    if m.adapter == "mock" or m.execution_mode == "simulated":
        return True, "mock adapter is in-process; no remote endpoint to probe", 0.0

    if m.adapter == "openai_compatible" and not m.external_enabled:
        return False, (
            "external adapter is not enabled: external data transmission consent "
            "has not been granted for this model"
        ), None

    base = m.base_url or settings.ollama_base_url
    if not base:
        return False, "no base URL is configured for this adapter", None

    try:
        import httpx

        t0 = time.perf_counter()
        res = httpx.get(f"{base.rstrip('/')}/api/tags", timeout=min(settings.model_timeout_seconds, 10))
        latency = round((time.perf_counter() - t0) * 1000, 2)
        if res.status_code == 200:
            return True, f"adapter endpoint answered HTTP 200 in {latency} ms", latency
        return False, f"adapter endpoint answered HTTP {res.status_code}", latency
    except Exception as exc:
        return False, f"adapter endpoint unreachable: {exc.__class__.__name__}", None


@router.post("/models/{model_id}/health-check", response_model=HealthCheckOut)
def health_check_model(
    model_id: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> HealthCheckOut:
    """Liveness probe for the model's adapter.

    A health check proves the endpoint answered. It says nothing about the
    model's trustworthiness, its provenance, or the strength of its
    defences.
    """
    with session_scope("controller") as s:
        m = s.execute(select(ModelRegistryEntry).where(ModelRegistryEntry.id == model_id)).scalar_one_or_none()
        if not m:
            raise not_found("Model")

        ok, detail, latency = _probe_adapter(m)
        status = "healthy" if ok else "unhealthy"
        m.last_health_check_at = utcnow()
        m.last_health_status = status

    return HealthCheckOut(
        model_id=model_id,
        status=status,  # type: ignore[arg-type]
        latency_ms=latency,
        detail=detail,
        checked_at=iso(utcnow()) or "",
    )


@router.post("/models/{model_id}/approve", response_model=ModelOut)
def approve_model(
    model_id: str,
    user: Annotated[UserOut, Depends(require_roles("admin"))],
) -> ModelOut:
    with session_scope("controller") as s:
        m = s.execute(select(ModelRegistryEntry).where(ModelRegistryEntry.id == model_id)).scalar_one_or_none()
        if not m:
            raise not_found("Model")
        m.status = "approved"

    return get_model(model_id, user)


@router.post("/models/{model_id}/disable", response_model=ModelOut)
def disable_model(
    model_id: str,
    user: Annotated[UserOut, Depends(require_roles("admin"))],
) -> ModelOut:
    with session_scope("controller") as s:
        m = s.execute(select(ModelRegistryEntry).where(ModelRegistryEntry.id == model_id)).scalar_one_or_none()
        if not m:
            raise not_found("Model")
        m.status = "disabled"

    return get_model(model_id, user)


@router.post("/models/{model_id}/enable-external", response_model=ModelOut)
def enable_external_model(
    model_id: str,
    req: ExternalEnableRequest,
    user: Annotated[UserOut, Depends(require_roles("admin"))],
) -> ModelOut:
    with session_scope("controller") as s:
        m = s.execute(select(ModelRegistryEntry).where(ModelRegistryEntry.id == model_id)).scalar_one_or_none()
        if not m:
            raise not_found("Model")
        m.external_enabled = True
        m.external_consent_by = user.id
        m_name = m.display_name

    audit_collector.append({
        "actor": user.username,
        "actor_role": user.role,
        "service": "api-controller",
        "event_type": "model.external_enabled",
        "category": "security",
        "severity": "warning",
        "summary": f"Admin '{user.username}' granted external transmission consent for model '{m_name}'",
        "payload": {"model_id": model_id, "consent": req.consent, "acknowledgement": req.acknowledgement},
    })

    return get_model(model_id, user)


@router.post("/models/import", response_model=ModelOut)
def import_model_hf(
    req: ModelImportRequest,
    user: Annotated[UserOut, Depends(require_roles("admin"))],
) -> ModelOut:
    """Register a model from a repository reference.

    This registers *metadata* only. Nothing is downloaded here: the
    import is refused unless the Hugging Face import path is explicitly
    enabled, and the weights are pulled by the model server on its own
    network, not by the controller.
    """
    settings = get_settings()
    if not settings.hf_import_enabled:
        raise forbidden(
            "Hugging Face model import is disabled. Set BAYORA_HF_IMPORT_ENABLED=true "
            "to enable it, and review the egress implications first."
        )
    payload = ModelCreate(
        display_name=req.display_name or f"HF: {req.repo_id}",
        adapter="ollama",
        identifier=req.repo_id,
        version=req.revision,
    )
    return create_model(payload, user)


@router.post("/models/upload", response_model=ModelOut)
def upload_model(
    file: UploadFile = File(...),
    display_name: str = Form(...),
    user: Annotated[UserOut, Depends(require_roles("admin"))] = None,  # type: ignore[assignment]
) -> ModelOut:
    """Store an uploaded model package in quarantine.

    The uploaded bytes are written to the quarantine directory, hashed, and
    registered. They are **never executed by the controller**: the
    controller has no code path that loads an uploaded file as code, and
    the package is not made runnable by this endpoint. Only the `ollama`
    adapter, in its own container on its own network, loads weights.
    """
    settings = get_settings()
    if file is None or not file.filename:
        raise bad_request("An uploaded file with a filename is required", code="file_required")

    raw = file.file.read()
    if not raw:
        raise bad_request("The uploaded file is empty", code="file_empty")
    if len(raw) > settings.max_upload_bytes:
        raise bad_request(
            f"Upload exceeds the {settings.max_upload_bytes}-byte limit",
            code="file_too_large",
        )

    digest = sha256_hex(raw)
    quarantine_root = Path(settings.quarantine_dir)
    quarantine_root.mkdir(parents=True, exist_ok=True)
    # Store under the content hash, so the same bytes are stored once and
    # the path itself carries the digest.
    stored_path = quarantine_root / f"{digest[:2]}" / digest
    stored_path.parent.mkdir(parents=True, exist_ok=True)
    if stored_path.exists():
        stored_path.unlink()
    with stored_path.open("wb") as fh:
        fh.write(raw)

    m_id = new_id()
    v_id = new_id()
    with session_scope("controller") as s:
        m = ModelRegistryEntry(
            id=m_id,
            display_name=display_name,
            adapter="mock",
            identifier=file.filename,
            base_url=None,
            source="uploaded_package",
            format="uploaded",
            architecture="unknown",
            resource_estimate={"vram_gb": 0},
            status="quarantined",
            validation_result={
                "valid": False,
                "detail": (
                    "Package is stored in quarantine and has not been executed or validated. "
                    "The controller does not load uploaded packages."
                ),
                "file_sha256": digest,
                "quarantine_path": str(stored_path),
                "file_size": len(raw),
                "limitations": [
                    "Quarantine is an application-level convention: the file is stored outside the "
                    "data store and is not executed, but path separation is not kernel confinement.",
                ],
            },
            runtime_version=None,
            execution_mode="none",
            external_enabled=False,
            created_by=user.id,
            current_version_id=v_id,
            last_health_status="not_runnable",
        )
        s.add(m)
        s.flush()

        s.add(ModelVersion(
            id=v_id,
            model_id=m_id,
            version="uploaded-1",
            revision=None,
            file_sha256=digest,
            file_path=str(stored_path),
            file_size=len(raw),
            config_hash=sha256_hex(f"{display_name}:{digest}"),
        ))

    audit_collector.append({
        "actor": user.username,
        "actor_role": user.role,
        "service": "api-controller",
        "event_type": "model.uploaded",
        "category": "models",
        "severity": "warning",
        "summary": f"Uploaded model package '{display_name}' quarantined (sha256 {digest[:16]}...)",
        "payload": {
            "model_id": m_id,
            "file_sha256": digest,
            "file_size": len(raw),
            "quarantined": True,
            "executed": False,
        },
    })

    models = get_all_models()
    return next(m for m in models if m.id == m_id)


@router.get("/models/{model_id}/versions", response_model=list[ModelVersionOut])
def list_model_versions(model_id: str, user: Annotated[UserOut, Depends(get_current_user)]) -> list[ModelVersionOut]:
    return get_model_versions(model_id)


@router.get("/test-suites", response_model=list[TestSuiteOut])
def list_test_suites(user: Annotated[UserOut, Depends(get_current_user)]) -> list[TestSuiteOut]:
    return get_all_test_suites()


@router.get("/test-suites/{suite_id}/cases", response_model=list[TestCaseOut])
def list_suite_cases(
    suite_id: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> list[TestCaseOut]:
    # Rule 1: Red Team attack payloads must not be observable by Blue Team before test concludes
    if user.role == "blue":
        audit_collector.append({
            "actor": user.username,
            "actor_role": "blue",
            "service": "api-controller",
            "event_type": "authz.denied",
            "category": "security",
            "severity": "warning",
            "summary": "Blue team denied access to Red test cases (isolation rule #1)",
            "payload": {"suite_id": suite_id},
        })
        raise forbidden("Blue Team is restricted from inspecting Red Team attack payloads")

    return get_suite_cases(suite_id)

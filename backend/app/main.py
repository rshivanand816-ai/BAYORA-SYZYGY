"""Bayora — Securing Adversarial AI Safety Testing Infrastructure.
Developed by team SYZYGY (Shivanand Rai, Tanish Jain, Aashish Bodal) for Hack in Hills '26.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.admin import router as admin_router
from app.api.audit import router as audit_router
from app.api.blue import router as blue_router
from app.api.dashboard import router as dashboard_router
from app.api.datasets import router as datasets_router
from app.api.evaluations import router as evaluations_router
from app.api.models import router as models_router
from app.api.security import router as security_router
from app.api.shadowpolicy import router as shadowpolicy_router
from app.api.auth import router as auth_router
from app.audit.collector import start_periodic_verifier
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.logging import configure_logging
from app.core.util import new_trace_id
from app.seed import bootstrap_system

log = logging.getLogger("bayora.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.service_role)
    log.info("Starting Bayora platform (version %s, role %s)...", settings.app_version, settings.service_role)

    # Bootstrap DBs and seed data
    bootstrap_system()

    # Start periodic background audit verification
    start_periodic_verifier(settings.audit_verify_interval_seconds)

    yield

    log.info("Shutting down Bayora platform.")


app = FastAPI(
    title="BAYORA API",
    description="Securing Adversarial AI Safety Testing Infrastructure — Team SYZYGY",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

settings = get_settings()

# CORS configuration
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
origins.extend(["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080", "http://127.0.0.1:8080"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(set(origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# CSRF Middleware: check X-Bayora-CSRF: 1 header on mutating requests
@app.middleware("http")
async def csrf_and_trace_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-Id") or new_trace_id()
    request.state.trace_id = trace_id

    # Enforce CSRF header on state-changing methods
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        exempt_paths = ("/api/v1/auth/login", "/auth/login", "/api/docs", "/api/openapi.json")
        if not any(request.url.path.startswith(p) for p in exempt_paths):
            csrf_header = request.headers.get("X-Bayora-CSRF")
            if csrf_header != "1":
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": {
                            "code": "csrf_required",
                            "message": "Missing required security header 'X-Bayora-CSRF: 1'",
                            "trace_id": trace_id,
                        }
                    },
                )

    response: Response = await call_next(request)
    response.headers["X-Trace-Id"] = trace_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


# Global Exception Handlers
@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError):
    trace_id = getattr(request.state, "trace_id", None)
    return JSONResponse(
        status_code=exc.status,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "trace_id": trace_id,
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    trace_id = getattr(request.state, "trace_id", None)
    err_msgs = [f"{'.'.join(str(l) for l in e['loc'])}: {e['msg']}" for e in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "; ".join(err_msgs),
                "trace_id": trace_id,
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    trace_id = getattr(request.state, "trace_id", None)
    log.exception("Unhandled server error [trace_id=%s]: %s", trace_id, exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "An internal server error occurred",
                "trace_id": trace_id,
            }
        },
    )


# API v1 Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(models_router, prefix="/api/v1")
app.include_router(evaluations_router, prefix="/api/v1")
app.include_router(blue_router, prefix="/api/v1")
app.include_router(shadowpolicy_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")
app.include_router(security_router, prefix="/api/v1")
app.include_router(datasets_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")

# Top-level health endpoint
@app.get("/health")
def root_health():
    return {"status": "ok", "service": "bayora-api"}

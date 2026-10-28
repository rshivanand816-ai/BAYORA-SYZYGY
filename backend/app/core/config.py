"""Bayora runtime configuration.

All values come from environment variables prefixed with ``BAYORA_`` (see
``.env.example``). Secrets are never returned by any API; the settings API
exposes only the explicit allow-list in :func:`public_settings`.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ServiceRole = Literal[
    "monolith",
    "controller",
    "red-service",
    "blue-policy-service",
    "model-gateway",
    "evaluation-service",
    "audit-collector",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BAYORA_", env_file=".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    service_role: ServiceRole = "monolith"
    app_version: str = "1.0.0"

    # --- storage: each trust domain owns a separate store ---
    data_dir: str = "./data"
    database_url: str = "sqlite:///./data/controller.db"
    policy_database_url: str = "sqlite:///./data/policy.db"
    evaluator_database_url: str = "sqlite:///./data/evaluator.db"
    audit_database_url: str = "sqlite:///./data/audit.db"
    quarantine_dir: str = "./data/quarantine"
    audit_signing_key_path: str = "./data/audit-keys/ed25519-private.pem"

    # --- service mesh (compose mode). When unset, services run in-process (monolith dev mode) ---
    red_service_url: str | None = None
    blue_service_url: str | None = None
    model_gateway_url: str | None = None
    evaluation_service_url: str | None = None
    audit_collector_url: str | None = None
    # Per-target shared secrets. Each internal service knows only its own token.
    service_token_red: str = "dev-only-red-token-change-me"
    service_token_blue: str = "dev-only-blue-token-change-me"
    service_token_model: str = "dev-only-model-token-change-me"
    service_token_eval: str = "dev-only-eval-token-change-me"
    service_token_audit: str = "dev-only-audit-token-change-me"
    internal_timeout_seconds: float = 60.0

    # --- authentication ---
    session_ttl_minutes: int = 480
    cookie_secure: bool = False
    cookie_name: str = "bayora_session"
    seed_demo_users: bool = True
    demo_admin_password: str | None = None
    demo_red_password: str | None = None
    demo_red2_password: str | None = None
    demo_blue_password: str | None = None
    demo_auditor_password: str | None = None

    # --- limits / resource governance ---
    max_prompt_chars: int = Field(4000, ge=64, le=100_000)
    max_output_chars: int = Field(4000, ge=64, le=100_000)
    max_request_bytes: int = 64 * 1024
    model_timeout_seconds: float = 30.0
    max_upload_bytes: int = 512 * 1024 * 1024
    eval_concurrency: int = Field(2, ge=1, le=16)
    eval_sync: bool = False
    rate_limit_per_minute: int = 240
    login_rate_limit_per_minute: int = 10
    probe_rate_limit_per_minute: int = 60
    max_probe_budget: int = 200

    # --- model adapters ---
    ollama_base_url: str = "http://ollama:11434"
    external_models_enabled: bool = False
    external_host_allowlist: str = ""
    hf_import_enabled: bool = False
    hf_api_base: str = "https://huggingface.co"
    mock_shared_context_bug: bool = False  # negative control for the cross-session canary test ONLY

    # --- audit ---
    audit_verify_interval_seconds: int = 300
    retain_raw_prompts: bool = True  # synthetic demo; see docs/security-controls.md

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def is_monolith(self) -> bool:
        return self.service_role == "monolith"

    @property
    def deployment_mode(self) -> str:
        return "monolith-dev" if self.is_monolith else "compose-services"

    def ensure_dirs(self) -> None:
        for p in (self.data_dir, self.quarantine_dir, str(Path(self.audit_signing_key_path).parent)):
            Path(p).mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def public_settings(s: Settings) -> dict:
    """Explicit allow-list of non-secret settings safe to show administrators."""
    return {
        "env": s.env,
        "deployment_mode": s.deployment_mode,
        "app_version": s.app_version,
        "max_prompt_chars": s.max_prompt_chars,
        "max_output_chars": s.max_output_chars,
        "model_timeout_seconds": s.model_timeout_seconds,
        "max_upload_bytes": s.max_upload_bytes,
        "eval_concurrency": s.eval_concurrency,
        "rate_limit_per_minute": s.rate_limit_per_minute,
        "login_rate_limit_per_minute": s.login_rate_limit_per_minute,
        "probe_rate_limit_per_minute": s.probe_rate_limit_per_minute,
        "max_probe_budget": s.max_probe_budget,
        "session_ttl_minutes": s.session_ttl_minutes,
        "cookie_secure": s.cookie_secure,
        "external_models_enabled": s.external_models_enabled,
        "hf_import_enabled": s.hf_import_enabled,
        "ollama_configured": bool(s.ollama_base_url),
        "audit_verify_interval_seconds": s.audit_verify_interval_seconds,
        "retain_raw_prompts": s.retain_raw_prompts,
        "services_split": not s.is_monolith,
    }

"""Admin operations: user management, application settings, and team metadata."""
from __future__ import annotations

from sqlalchemy import select

from app.audit.collector import AuditCollector
from app.core.config import get_settings, public_settings
from app.core.errors import bad_request, conflict, not_found
from app.core.util import hash_password, iso, new_id, utcnow
from app.db.base import session_scope
from app.db.models import Role, User
from app.schemas.api import AboutOut, UserCreate, UserOut, UserUpdate

audit_collector = AuditCollector()

TEAM_SYZYGY = {
    "team_name": "SYZYGY",
    "hackathon": "Hack in Hills ’26",
    "problem_statement": "Problem Statement 04: Securing Adversarial AI Safety Testing Infrastructure",
    "members": [
        {"name": "Shivanand Rai", "role": "Full-Stack & Security Architecture Lead"},
        {"name": "Tanish Jain", "role": "AI Safety & Evaluation Systems Engineer"},
        {"name": "Aashish Bodal", "role": "Infrastructure, Sandbox & DevSecOps Engineer"},
    ],
    "project": "BAYORA — Securing Adversarial AI Safety Testing Infrastructure",
    "special_feature": "ShadowPolicy — Blind Policy-Leakage Evaluation",
}


def list_users() -> list[UserOut]:
    with session_scope("controller") as s:
        users = s.execute(select(User).order_by(User.username)).scalars().all()
        return [
            UserOut(
                id=u.id,
                username=u.username,
                email=u.email,
                display_name=u.display_name,
                role=u.role.name,  # type: ignore[arg-type]
                tenant=u.tenant,
                is_active=u.is_active,
            )
            for u in users
        ]


def create_user(req: UserCreate, actor: str) -> UserOut:
    with session_scope("controller") as s:
        existing = s.execute(
            select(User).where((User.username == req.username) | (User.email == req.email))
        ).scalar_one_or_none()
        if existing:
            raise conflict("Username or email already in use")

        role = s.execute(select(Role).where(Role.name == req.role)).scalar_one_or_none()
        if not role:
            raise bad_request(f"Invalid role '{req.role}'")

        u = User(
            id=new_id(),
            username=req.username,
            email=req.email,
            display_name=req.display_name,
            password_hash=hash_password(req.password),
            role_id=role.id,
            tenant=req.tenant,
            is_active=True,
        )
        s.add(u)
        s.flush()

        audit_collector.append({
            "actor": actor,
            "actor_role": "admin",
            "service": "api-controller",
            "event_type": "admin.user_created",
            "category": "security",
            "severity": "info",
            "summary": f"Created user '{req.username}' with role '{req.role}'",
            "payload": {"username": req.username, "role": req.role, "tenant": req.tenant},
        })

        return UserOut(
            id=u.id,
            username=u.username,
            email=u.email,
            display_name=u.display_name,
            role=req.role,
            tenant=u.tenant,
            is_active=u.is_active,
        )


def update_user(user_id: str, req: UserUpdate, actor: str) -> UserOut:
    with session_scope("controller") as s:
        u = s.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
        if not u:
            raise not_found("User")

        disp = getattr(req, "display_name", None)
        if disp is not None:
            u.display_name = disp
        if req.is_active is not None:
            u.is_active = req.is_active
        if req.role is not None:
            r = s.execute(select(Role).where(Role.name == req.role)).scalar_one_or_none()
            if not r:
                raise bad_request("Invalid role")
            u.role_id = r.id

        audit_collector.append({
            "actor": actor,
            "actor_role": "admin",
            "service": "api-controller",
            "event_type": "admin.user_updated",
            "category": "security",
            "severity": "info",
            "summary": f"Updated user '{u.username}' properties",
            "payload": {"user_id": user_id, "is_active": u.is_active},
        })

        return UserOut(
            id=u.id,
            username=u.username,
            email=u.email,
            display_name=u.display_name,
            role=u.role.name,  # type: ignore[arg-type]
            tenant=u.tenant,
            is_active=u.is_active,
        )


def get_settings_data(user: UserOut) -> dict:
    s = get_settings()
    if user.role != "admin":
        return {"team": TEAM_SYZYGY}

    return {
        "service_settings": public_settings(s),
        "adapters": [
            {"adapter": "mock", "name": "Deterministic Mock Safety Model", "status": "active", "sandboxed": True},
            {"adapter": "ollama", "name": "Local Ollama LLM Bridge", "status": "configured", "sandboxed": True},
            {"adapter": "openai_compatible", "name": "External OpenAI Compatible API", "status": "gated_by_consent", "sandboxed": False},
        ],
        "team": TEAM_SYZYGY,
    }


def get_about() -> AboutOut:
    return AboutOut(
        product="BAYORA — Securing Adversarial AI Safety Testing Infrastructure",
        tagline="Securing the Integrity of Adversarial AI Testing",
        team="SYZYGY",
        members=["Shivanand Rai", "Tanish Jain", "Aashish Bodal"],
        problem_statement="Problem Statement 04: Securing Adversarial AI Safety Testing Infrastructure",
        version="1.0.0",
    )

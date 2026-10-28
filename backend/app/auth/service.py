"""Authentication & session management for Bayora."""
from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select

from app.audit.collector import AuditCollector
from app.core.config import get_settings
from app.core.errors import ApiError, bad_request, forbidden, rate_limiter
from app.core.util import (
    as_utc,
    hash_password,
    iso,
    new_id,
    new_session_token,
    sha256_hex,
    utcnow,
    verify_password,
)
from app.db.base import session_scope
from app.db.models import AuthSession, Role, User
from app.schemas.api import LoginResponse, RoleName, UserOut

audit_collector = AuditCollector()

DEMO_PASSWORDS = {
    "admin": "admin-pass",
    "red": "red-pass",
    "red2": "red2-pass",
    "blue": "blue-pass",
    "auditor": "auditor-pass",
}


def seed_demo_users() -> None:
    settings = get_settings()
    with session_scope("controller") as s:
        # 1. Seed roles
        role_map: dict[str, str] = {}
        for r_name, r_desc in [
            ("admin", "System Administrator with full access"),
            ("red", "Red Team Adversarial Tester"),
            ("blue", "Blue Team Defensive Engineer"),
            ("auditor", "Independent Safety & Compliance Auditor"),
        ]:
            role = s.execute(select(Role).where(Role.name == r_name)).scalar_one_or_none()
            if not role:
                role = Role(id=new_id(), name=r_name, description=r_desc)
                s.add(role)
                s.flush()
            role_map[r_name] = role.id

        # 2. Seed users
        demo_accounts = [
            ("admin", "admin@bayora.local", "System Admin", "admin", settings.demo_admin_password or DEMO_PASSWORDS["admin"]),
            ("red", "red@bayora.local", "Red Lead (Operator A)", "red", settings.demo_red_password or DEMO_PASSWORDS["red"]),
            ("red2", "red2@bayora.local", "Red Specialist (Operator B)", "red", settings.demo_red2_password or DEMO_PASSWORDS["red2"]),
            ("blue", "blue@bayora.local", "Blue Lead (Defense)", "blue", settings.demo_blue_password or DEMO_PASSWORDS["blue"]),
            ("auditor", "auditor@bayora.local", "Compliance Auditor", "auditor", settings.demo_auditor_password or DEMO_PASSWORDS["auditor"]),
        ]

        for uname, email, dname, rname, pwd in demo_accounts:
            existing = s.execute(select(User).where(User.username == uname)).scalar_one_or_none()
            if not existing:
                u = User(
                    id=new_id(),
                    username=uname,
                    email=email,
                    display_name=dname,
                    password_hash=hash_password(pwd),
                    role_id=role_map[rname],
                    tenant="default",
                    is_active=True,
                )
                s.add(u)


def authenticate_user(username: str, password: str, client_ip: str = "127.0.0.1") -> tuple[UserOut, str, str]:
    settings = get_settings()
    if not rate_limiter.check(f"login:{username}", settings.login_rate_limit_per_minute, window=60.0):
        raise ApiError(429, "rate_limited", "Too many login attempts. Please wait a moment.")

    with session_scope("controller") as s:
        user = s.execute(select(User).where(User.username == username, User.is_active == True)).scalar_one_or_none()  # noqa: E712
        valid = verify_password(password, user.password_hash) if user else False

        if not user or not valid:
            audit_collector.append({
                "actor": username,
                "actor_role": "unknown",
                "service": "api-controller",
                "event_type": "auth.failed",
                "category": "security",
                "severity": "warning",
                "summary": f"Failed login attempt for user '{username}'",
                "payload": {"client_ip": client_ip, "username": username},
            })
            raise ApiError(401, "unauthorized", "Invalid username or password")

        token = new_session_token()
        token_hash = sha256_hex(token)
        expires_at = utcnow() + timedelta(minutes=settings.session_ttl_minutes)

        auth_session = AuthSession(
            id=new_id(),
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            revoked=False,
            ip=client_ip,
        )
        s.add(auth_session)

        user_out = UserOut(
            id=user.id,
            username=user.username,
            email=user.email,
            display_name=user.display_name,
            role=user.role.name,  # type: ignore[arg-type]
            tenant=user.tenant,
            is_active=user.is_active,
        )

        audit_collector.append({
            "actor": user.username,
            "actor_role": user.role.name,
            "service": "api-controller",
            "event_type": "auth.login",
            "category": "security",
            "severity": "info",
            "summary": f"User '{user.username}' logged in successfully",
            "payload": {"client_ip": client_ip, "user_id": user.id, "role": user.role.name},
        })

        return user_out, token, iso(expires_at) or ""


def revoke_session(token: str) -> None:
    token_hash = sha256_hex(token)
    with session_scope("controller") as s:
        sess = s.execute(select(AuthSession).where(AuthSession.token_hash == token_hash)).scalar_one_or_none()
        if sess:
            sess.revoked = True


def get_current_user_optional(request: Request) -> UserOut | None:
    settings = get_settings()
    cookie = request.cookies.get(settings.cookie_name)
    if not cookie:
        # Also allow Authorization header for programmatic testing
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            cookie = auth_header[7:].strip()

    if not cookie:
        return None

    token_hash = sha256_hex(cookie)
    with session_scope("controller") as s:
        sess = s.execute(
            select(AuthSession).where(
                AuthSession.token_hash == token_hash,
                AuthSession.revoked == False,  # noqa: E712
            )
        ).scalar_one_or_none()

        if not sess:
            return None

        # Check expiration
        now = utcnow()
        exp = as_utc(sess.expires_at)
        if exp and exp < now:
            sess.revoked = True
            return None

        user = s.execute(select(User).where(User.id == sess.user_id, User.is_active == True)).scalar_one_or_none()  # noqa: E712
        if not user:
            return None

        return UserOut(
            id=user.id,
            username=user.username,
            email=user.email,
            display_name=user.display_name,
            role=user.role.name,  # type: ignore[arg-type]
            tenant=user.tenant,
            is_active=user.is_active,
        )


def get_current_user(request: Request) -> UserOut:
    user = get_current_user_optional(request)
    if not user:
        raise ApiError(401, "unauthorized", "Authentication session required")
    return user


def require_roles(*allowed_roles: RoleName):
    def _role_checker(user: Annotated[UserOut, Depends(get_current_user)]) -> UserOut:
        if user.role not in allowed_roles:
            audit_collector.append({
                "actor": user.username,
                "actor_role": user.role,
                "service": "api-controller",
                "event_type": "authz.denied",
                "category": "security",
                "severity": "warning",
                "summary": f"User '{user.username}' denied access (required {list(allowed_roles)}, had {user.role})",
                "payload": {"required": list(allowed_roles), "user_role": user.role},
            })
            raise forbidden(f"Role '{user.role}' is not authorized for this resource")
        return user

    return _role_checker

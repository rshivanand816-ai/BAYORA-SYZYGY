"""Auth and Meta API endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response

from app.admin.service import get_about
from app.auth.service import authenticate_user, get_current_user, revoke_session
from app.core.config import get_settings
from app.core.errors import not_found
from app.schemas.api import AboutOut, LoginRequest, LoginResponse, UserOut

router = APIRouter(tags=["Auth & Meta"])


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, response: Response) -> LoginResponse:
    settings = get_settings()
    client_ip = request.client.host if request.client else "127.0.0.1"
    user_out, token, expires_at = authenticate_user(payload.username, payload.password, client_ip)

    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_ttl_minutes * 60,
    )

    return LoginResponse(user=user_out, expires_at=expires_at)


@router.post("/auth/logout")
def logout(request: Request, response: Response, user: Annotated[UserOut, Depends(get_current_user)]) -> dict:
    settings = get_settings()
    cookie = request.cookies.get(settings.cookie_name)
    if cookie:
        revoke_session(cookie)
    response.delete_cookie(key=settings.cookie_name)
    return {"ok": True}


@router.get("/auth/me", response_model=UserOut)
def me(user: Annotated[UserOut, Depends(get_current_user)]) -> UserOut:
    return user


@router.get("/meta/about", response_model=AboutOut)
def about() -> AboutOut:
    return get_about()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "bayora-api"}

"""Admin operations and Settings API router."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.admin.service import create_user, get_settings_data, list_users, update_user
from app.auth.service import get_current_user, require_roles
from app.schemas.api import UserCreate, UserOut, UserUpdate

router = APIRouter(tags=["Admin & Settings"])


@router.get("/admin/users", response_model=list[UserOut])
def get_users(user: Annotated[UserOut, Depends(require_roles("admin"))]) -> list[UserOut]:
    return list_users()


@router.post("/admin/users", response_model=UserOut)
def add_user(
    payload: UserCreate,
    user: Annotated[UserOut, Depends(require_roles("admin"))],
) -> UserOut:
    return create_user(payload, user.username)


@router.patch("/admin/users/{user_id}", response_model=UserOut)
def patch_user(
    user_id: str,
    payload: UserUpdate,
    user: Annotated[UserOut, Depends(require_roles("admin"))],
) -> UserOut:
    return update_user(user_id, payload, user.username)


@router.get("/settings")
@router.get("/admin/settings")
def settings_endpoint(user: Annotated[UserOut, Depends(get_current_user)]) -> dict:
    return get_settings_data(user)


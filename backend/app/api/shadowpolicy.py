"""ShadowPolicy Lab API endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth.service import get_current_user, require_roles
from app.core.errors import forbidden, not_found
from app.schemas.api import (
    CommitmentVerification,
    GuessSubmit,
    RoundCreate,
    RoundDetail,
    RoundOut,
    RoundResults,
    SPCatalog,
    SPObservation,
    SPProbeRequest,
    UserOut,
)
from app.shadowpolicy.service import (
    create_round,
    finalize_round,
    get_all_rounds,
    get_catalog,
    get_red_users,
    get_round_detail,
    get_round_results,
    lock_guesses,
    start_round,
    submit_probe,
    verify_commitment,
)

router = APIRouter(prefix="/shadowpolicy", tags=["ShadowPolicy Lab"])


@router.get("/catalog", response_model=SPCatalog)
def catalog(user: Annotated[UserOut, Depends(get_current_user)]) -> SPCatalog:
    return get_catalog()


@router.get("/red-users", response_model=list[UserOut])
def red_users(user: Annotated[UserOut, Depends(require_roles("admin", "auditor"))]) -> list[UserOut]:
    return get_red_users()


@router.post("/rounds", response_model=RoundOut)
def new_round(
    payload: RoundCreate,
    user: Annotated[UserOut, Depends(require_roles("admin", "auditor"))],
) -> RoundOut:
    return create_round(payload, user.id, user.role)


@router.get("/rounds", response_model=list[RoundOut])
def list_rounds(user: Annotated[UserOut, Depends(get_current_user)]) -> list[RoundOut]:
    return get_all_rounds(user)


@router.get("/rounds/{round_id}", response_model=RoundDetail)
def round_detail(
    round_id: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> RoundDetail:
    return get_round_detail(round_id, user)


@router.post("/rounds/{round_id}/start", response_model=RoundOut)
def start_sp_round(
    round_id: str,
    user: Annotated[UserOut, Depends(require_roles("admin", "auditor"))],
) -> RoundOut:
    return start_round(round_id, user.username)


@router.post("/rounds/{round_id}/probes", response_model=SPObservation)
def probe_sp_round(
    round_id: str,
    payload: SPProbeRequest,
    user: Annotated[UserOut, Depends(require_roles("red", "admin"))],
) -> SPObservation:
    return submit_probe(round_id, payload, user)


@router.post("/rounds/{round_id}/lock-guesses", response_model=RoundOut)
@router.post("/rounds/{round_id}/guesses/lock", response_model=RoundOut)
def lock_sp_guesses(
    round_id: str,
    payload: GuessSubmit,
    user: Annotated[UserOut, Depends(require_roles("red", "admin"))],
) -> RoundOut:
    return lock_guesses(round_id, payload, user)


@router.post("/rounds/{round_id}/finalize", response_model=RoundResults)
def finalize_sp_round(
    round_id: str,
    user: Annotated[UserOut, Depends(require_roles("admin", "auditor"))],
) -> RoundResults:
    return finalize_round(round_id, user.username)


@router.get("/rounds/{round_id}/results", response_model=RoundResults)
def get_sp_results(
    round_id: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> RoundResults:
    _ = get_round_detail(round_id, user)
    return get_round_results(round_id)


@router.post("/rounds/{round_id}/verify-commitment", response_model=CommitmentVerification)
def verify_sp_commitment(
    round_id: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> CommitmentVerification:
    detail = get_round_detail(round_id, user)
    if detail.round.status != "finalized":
        raise forbidden("Commitment verification is performed after round finalization")
    return verify_commitment(round_id)

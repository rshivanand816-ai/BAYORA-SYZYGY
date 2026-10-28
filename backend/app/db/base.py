"""Database engines. Each trust domain has its own store and its own metadata.

* controller  - application data (PostgreSQL in compose, SQLite in dev)
* policy      - Blue Team private defense policies (owned by blue-policy-service)
* evaluator   - ShadowPolicy ground truth, nonces and private probe traces (evaluation-service)
* audit       - append-only, hash-chained audit events (audit-collector)
"""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import JSON, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class ControllerBase(DeclarativeBase):
    type_annotation_map = {dict: JSON, list: JSON}


class PolicyBase(DeclarativeBase):
    type_annotation_map = {dict: JSON, list: JSON}


class EvaluatorBase(DeclarativeBase):
    type_annotation_map = {dict: JSON, list: JSON}


class AuditBase(DeclarativeBase):
    type_annotation_map = {dict: JSON, list: JSON}


STORE_BASES = {
    "controller": ControllerBase,
    "policy": PolicyBase,
    "evaluator": EvaluatorBase,
    "audit": AuditBase,
}

_engines: dict[str, Engine] = {}
_sessionmakers: dict[str, sessionmaker] = {}


def store_url(store: str) -> str:
    s = get_settings()
    return {
        "controller": s.database_url,
        "policy": s.policy_database_url,
        "evaluator": s.evaluator_database_url,
        "audit": s.audit_database_url,
    }[store]


def _make_engine(url: str) -> Engine:
    kwargs: dict = {"pool_pre_ping": True, "future": True}
    if url.startswith("sqlite"):
        path = url.split("///", 1)[-1]
        if path and path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    eng = create_engine(url, **kwargs)
    if url.startswith("sqlite"):

        @event.listens_for(eng, "connect")
        def _fk_on(dbapi_conn, _):  # pragma: no cover - driver hook
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

    return eng


def get_engine(store: str) -> Engine:
    if store not in _engines:
        _engines[store] = _make_engine(store_url(store))
        _sessionmakers[store] = sessionmaker(bind=_engines[store], expire_on_commit=False, future=True)
    return _engines[store]


def get_sessionmaker(store: str) -> sessionmaker:
    get_engine(store)
    return _sessionmakers[store]


@contextmanager
def session_scope(store: str) -> Iterator[Session]:
    sess: Session = get_sessionmaker(store)()
    try:
        yield sess
        sess.commit()
    except Exception:
        sess.rollback()
        raise
    finally:
        sess.close()


def reset_engines() -> None:
    for eng in _engines.values():
        eng.dispose()
    _engines.clear()
    _sessionmakers.clear()


def create_all(store: str) -> None:
    """Used by tests. Real deployments use Alembic migrations (see backend/migrations)."""
    import app.db.models  # noqa: F401  (register tables)

    STORE_BASES[store].metadata.create_all(get_engine(store))


def drop_all(store: str) -> None:
    """Drop every table in a store.

    Used by the test harness to start each run from a known-empty state. The
    audit store is append-only by design, but a test database that survives
    across runs accumulates events and slowly invalidates any assertion that
    depends on an event count.
    """
    import app.db.models  # noqa: F401  (register tables)

    STORE_BASES[store].metadata.drop_all(get_engine(store))

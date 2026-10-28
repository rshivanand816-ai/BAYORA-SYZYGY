"""Pytest fixtures and test environment setup."""
from __future__ import annotations

import os
import sys
import tempfile
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Set test environment
os.environ["BAYORA_ENV"] = "test"
os.environ["BAYORA_DATABASE_URL"] = "sqlite:///./data/test_controller.db"
os.environ["BAYORA_POLICY_DATABASE_URL"] = "sqlite:///./data/test_policy.db"
os.environ["BAYORA_EVALUATOR_DATABASE_URL"] = "sqlite:///./data/test_evaluator.db"
os.environ["BAYORA_AUDIT_DATABASE_URL"] = "sqlite:///./data/test_audit.db"

from app.core.config import get_settings
get_settings.cache_clear()

from app.db.base import create_all, drop_all, reset_engines
from app.main import app
from app.seed import bootstrap_system


@pytest.fixture(scope="session", autouse=True)
def setup_test_databases():
    reset_engines()
    # Start from empty stores. The test databases live on disk and would
    # otherwise accumulate rows on every run — the audit store in particular
    # is append-only, so a leftover chain would keep growing and eventually
    # make event-count assertions depend on how many times the suite had
    # been run before.
    for s in ("controller", "policy", "evaluator", "audit"):
        drop_all(s)
        create_all(s)
    bootstrap_system()
    yield
    reset_engines()


@pytest.fixture
def client():
    with TestClient(app, base_url="http://testserver") as c:
        yield c


def _login(c: TestClient, username: str, password: str) -> TestClient:
    res = c.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
        headers={"X-Bayora-CSRF": "1"},
    )
    assert res.status_code == 200, res.text
    return c


def login_client(client: TestClient, username: str = "admin", password: str = "admin-pass") -> TestClient:
    return _login(client, username, password)


# Session-scoped, one authenticated client per role.
#
# The login rate limiter is a real control and stays enabled. These fixtures
# exist so that a role authenticates exactly once for the whole test session
# instead of once per test, which keeps the suite under the limit without
# altering the limit itself.
def _role_client(username: str, password: str):
    c = TestClient(app, base_url="http://testserver")
    c.__enter__()
    _login(c, username, password)
    return c


@pytest.fixture(scope="session")
def admin_client(setup_test_databases):
    c = _role_client("admin", "admin-pass")
    yield c
    c.__exit__(None, None, None)


@pytest.fixture(scope="session")
def red_client(setup_test_databases):
    c = _role_client("red", "red-pass")
    yield c
    c.__exit__(None, None, None)


@pytest.fixture(scope="session")
def blue_client(setup_test_databases):
    c = _role_client("blue", "blue-pass")
    yield c
    c.__exit__(None, None, None)


@pytest.fixture(scope="session")
def auditor_client(setup_test_databases):
    c = _role_client("auditor", "auditor-pass")
    yield c
    c.__exit__(None, None, None)

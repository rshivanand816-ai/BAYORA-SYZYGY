"""Load the Bayora synthetic suite into the controller store.

`POST /api/v1/datasets/import` parses the uploaded file and creates a *new*
suite per import. This script is the idempotent path: it creates (or
updates) a single named `test_suites` row and upserts the `test_cases` rows
from `bayora-synthetic-v1.jsonl`, so re-running it does not duplicate cases.

Use the script for the shipped corpus; use the API when importing a
third-party file that should be kept as a separate, versioned suite.

Usage, from the repository root:

    python datasets/synthetic/load_into_store.py

The controller store's schema must exist first. Either start the application
once (it bootstraps the schema with `create_all`) or run:

    cd backend && alembic -c migrations/alembic.ini upgrade head

The suite is idempotent: running the script twice updates the existing
cases rather than duplicating them.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
DATASET = HERE / "bayora-synthetic-v1.jsonl"
SUITE_NAME = "bayora-synthetic-v1"
SUITE_VERSION = "1.0.0"
SUITE_DESCRIPTION = (
    "Bayora Synthetic Adversarial Suite v1 — 35 hand-authored cases across "
    "12 categories. No external corpus is integrated; see datasets/synthetic/PROVENANCE.md."
)

BACKEND_ROOT = HERE.parent.parent / "backend"
if BACKEND_ROOT.exists():
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from app.core.util import new_id  # noqa: E402
from app.db.base import create_all, session_scope  # noqa: E402
from app.db.models import TestCase, TestSuite  # noqa: E402


def load() -> tuple[str, int]:
    records = []
    with DATASET.open(encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{DATASET}:{lineno}: invalid JSON: {exc}") from exc

    if not records:
        raise SystemExit(f"{DATASET} is empty")

    with session_scope("controller") as s:
        # The suite and case tables must exist. Creating them here keeps the
        # script usable against a fresh store without requiring a prior
        # application start; `create_all` is idempotent.
        create_all("controller")
        suite = s.execute(
            select(TestSuite).where(
                TestSuite.name == SUITE_NAME, TestSuite.version == SUITE_VERSION
            )
        ).scalar_one_or_none()
        if suite is None:
            suite = TestSuite(
                id=new_id(),
                name=SUITE_NAME,
                version=SUITE_VERSION,
                description=SUITE_DESCRIPTION,
                source="synthetic",
                is_external=False,
            )
            s.add(suite)
            s.flush()
        else:
            suite.description = SUITE_DESCRIPTION

        existing = {
            tc.case_key: tc
            for tc in s.execute(
                select(TestCase).where(TestCase.suite_id == suite.id)
            ).scalars()
        }

        inserted = updated = 0
        for rec in records:
            tc = existing.get(rec["case_key"])
            if tc is None:
                tc = TestCase(id=new_id(), suite_id=suite.id, case_key=rec["case_key"])
                s.add(tc)
                inserted += 1
            else:
                updated += 1
            tc.title = rec["title"]
            tc.category = rec["category"]
            tc.input_fixture = rec["input"]
            tc.expected_outcome = rec["expected_outcome"]
            tc.is_attack = rec["is_attack"]
            tc.severity = rec["severity"]
            tc.success_condition = rec["success_condition"]
            # The JSONL has no success_marker column; the platform derives the
            # marker from the category where it needs one.
            tc.success_marker = None

    return suite.id, inserted, updated  # type: ignore[return-value]


def main() -> None:
    os.environ.setdefault("BAYORA_SERVICE_ROLE", "controller")
    suite_id, inserted, updated = load()
    print(f"suite {SUITE_NAME} ({suite_id}): {inserted} inserted, {updated} updated")


if __name__ == "__main__":
    main()

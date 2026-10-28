"""Audit hash chain (pure functions).

Encoding (normative, see docs/security-controls.md):

    canonical = canonical_json({k: event[k] for k in HASH_FIELDS})   # sorted keys, UTF-8, no whitespace
    current_hash = SHA256( canonical || prev_hash_hex_ascii ).hexdigest()

The first event uses ``prev_hash = "0" * 64``. Timestamps are stored as the
exact ISO string that was hashed, so database round-trips cannot change them.
"""
from __future__ import annotations

import hashlib
from typing import Any, Iterable

from app.core.util import canonical_json

GENESIS_HASH = "0" * 64
HASH_FIELDS = (
    "event_id",
    "seq",
    "ts",
    "actor",
    "actor_role",
    "service",
    "event_type",
    "category",
    "severity",
    "session_id",
    "trace_id",
    "summary",
    "payload",
)


def event_hash(event: dict[str, Any], prev_hash: str) -> str:
    body = canonical_json({k: event.get(k) for k in HASH_FIELDS})
    return hashlib.sha256(body + prev_hash.encode("ascii")).hexdigest()


def verify_events(events: Iterable[dict[str, Any]], prev_hash: str = GENESIS_HASH, expected_seq: int = 1) -> dict:
    """Verify an ordered sequence of events. Reports *all* failures, not just the first."""
    failures: list[dict] = []
    checked = 0
    head_seq = expected_seq - 1
    head_hash = prev_hash
    statuses: dict[int, str] = {}
    for ev in events:
        checked += 1
        ok = True
        if ev["seq"] != expected_seq:
            failures.append(
                {"seq": ev["seq"], "event_id": ev.get("event_id"), "kind": "sequence_gap",
                 "expected": str(expected_seq), "actual": str(ev["seq"])}
            )
            ok = False
        if ev["prev_hash"] != head_hash:
            failures.append(
                {"seq": ev["seq"], "event_id": ev.get("event_id"), "kind": "prev_link_mismatch",
                 "expected": head_hash, "actual": ev["prev_hash"]}
            )
            ok = False
        recomputed = event_hash(ev, ev["prev_hash"])
        if recomputed != ev["hash"]:
            failures.append(
                {"seq": ev["seq"], "event_id": ev.get("event_id"), "kind": "hash_mismatch",
                 "expected": recomputed, "actual": ev["hash"]}
            )
            ok = False
        statuses[ev["seq"]] = "verified" if ok else "mismatch"
        head_hash = ev["hash"]
        head_seq = ev["seq"]
        expected_seq = ev["seq"] + 1
    return {
        "ok": not failures,
        "checked": checked,
        "head_seq": head_seq,
        "head_hash": head_hash,
        "failures": failures,
        "statuses": statuses,
    }

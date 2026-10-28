"""Audit collector: append-only writes, verification, signed checkpoints.

Runs inside the ``audit-collector`` service (compose) or in-process (monolith dev
mode). The only mutating operations are ``append`` and ``create_checkpoint``;
there is no update/delete code path.
"""
from __future__ import annotations

import base64
import copy
import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from sqlalchemy import func, select

from app.audit.chain import GENESIS_HASH, event_hash, verify_events
from app.core.config import get_settings
from app.core.logging import redact_secrets
from app.core.util import canonical_json, iso, new_id, sha256_hex, utcnow
from app.db.base import session_scope
from app.db.models import AuditCheckpoint, AuditEvent

log = logging.getLogger("bayora.audit")

SEVERITIES = ("info", "warning", "high", "critical")
_FORBIDDEN_PAYLOAD_KEYS = {"prompt", "raw_prompt", "password", "token", "api_key", "nonce", "ground_truth", "config"}


def _sanitize_payload(payload: dict | None) -> dict:
    """Defence in depth: strip keys that must never enter the shared audit log."""
    clean: dict[str, Any] = {}
    for k, v in (payload or {}).items():
        if k.lower() in _FORBIDDEN_PAYLOAD_KEYS:
            clean[k] = "[REDACTED_BY_COLLECTOR]"
        elif isinstance(v, float):
            clean[k] = round(v, 3)
        elif isinstance(v, str):
            clean[k] = redact_secrets(v)[:1000]
        elif isinstance(v, dict):
            clean[k] = _sanitize_payload(v)
        else:
            clean[k] = v
    return clean


def _row_dict(ev: AuditEvent) -> dict:
    return {
        "event_id": ev.event_id,
        "seq": ev.seq,
        "ts": ev.ts,
        "actor": ev.actor,
        "actor_role": ev.actor_role,
        "service": ev.service,
        "event_type": ev.event_type,
        "category": ev.category,
        "severity": ev.severity,
        "session_id": ev.session_id,
        "trace_id": ev.trace_id,
        "summary": ev.summary,
        "payload": ev.payload,
        "prev_hash": ev.prev_hash,
        "hash": ev.hash,
    }


class AuditCollector:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last_verification: dict | None = None
        self._key: Ed25519PrivateKey | None = None

    # ------------------------------------------------------------ writes
    def append(self, ev: dict) -> dict:
        severity = ev.get("severity", "info")
        if severity not in SEVERITIES:
            severity = "info"
        with self._lock, session_scope("audit") as s:
            last = s.execute(select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(1)).scalar_one_or_none()
            seq = (last.seq + 1) if last else 1
            prev = last.hash if last else GENESIS_HASH
            row = {
                "event_id": new_id(),
                "seq": seq,
                "ts": iso(utcnow()),  # trusted timestamp assigned by the collector
                "actor": str(ev.get("actor") or "system")[:64],
                "actor_role": str(ev.get("actor_role") or "service")[:32],
                "service": str(ev.get("service") or "unknown")[:64],
                "event_type": str(ev["event_type"])[:64],
                "category": str(ev.get("category") or "general")[:32],
                "severity": severity,
                "session_id": ev.get("session_id"),
                "trace_id": ev.get("trace_id"),
                "summary": redact_secrets(str(ev.get("summary") or ev["event_type"]))[:512],
                "payload": _sanitize_payload(ev.get("payload")),
            }
            row["prev_hash"] = prev
            row["hash"] = event_hash(row, prev)
            s.add(AuditEvent(**row))
        return row

    # ------------------------------------------------------------ reads
    def list_events(self, filters: dict, limit: int = 100, offset: int = 0) -> tuple[list[dict], int]:
        with session_scope("audit") as s:
            q = select(AuditEvent)
            cq = select(func.count()).select_from(AuditEvent)
            conds = []
            if filters.get("since"):
                conds.append(AuditEvent.ts >= filters["since"])
            if filters.get("until"):
                conds.append(AuditEvent.ts <= filters["until"])
            for key in ("actor", "session_id", "category", "severity", "event_type", "trace_id"):
                if filters.get(key):
                    conds.append(getattr(AuditEvent, key) == filters[key])
            if filters.get("categories"):
                conds.append(AuditEvent.category.in_(filters["categories"]))
            if filters.get("actors"):
                conds.append(AuditEvent.actor.in_(filters["actors"]))
            if filters.get("session_ids") is not None:
                conds.append(AuditEvent.session_id.in_(filters["session_ids"]))
            for c in conds:
                q = q.where(c)
                cq = cq.where(c)
            total = s.execute(cq).scalar_one()
            rows = s.execute(q.order_by(AuditEvent.seq.desc()).limit(limit).offset(offset)).scalars().all()
            out = [_row_dict(r) for r in rows]
        statuses = (self._last_verification or {}).get("statuses", {})
        bad = {f["seq"] for f in (self._last_verification or {}).get("failures", [])}
        verified_head = (self._last_verification or {}).get("head_seq", 0)
        for e in out:
            if e["seq"] in bad:
                e["verification"] = "mismatch"
            elif e["seq"] <= verified_head and statuses is not None:
                e["verification"] = "verified"
            else:
                e["verification"] = "unverified"
        return out, total

    def get_event(self, event_id: str) -> dict | None:
        with session_scope("audit") as s:
            row = s.execute(select(AuditEvent).where(AuditEvent.event_id == event_id)).scalar_one_or_none()
            return _row_dict(row) if row else None

    def all_events(self) -> list[dict]:
        with session_scope("audit") as s:
            return [_row_dict(r) for r in s.execute(select(AuditEvent).order_by(AuditEvent.seq)).scalars()]

    # ------------------------------------------------------------ verification
    def verify(self) -> dict:
        events = self.all_events()
        res = verify_events(events)
        res["verified_at"] = iso(utcnow())
        res["scope"] = f"full chain ({len(events)} events)"
        res["statuses"] = {}  # not needed after aggregation; keep memory small
        self._last_verification = res
        return res

    def status(self) -> dict:
        with session_scope("audit") as s:
            count = s.execute(select(func.count()).select_from(AuditEvent)).scalar_one()
            head = s.execute(select(func.max(AuditEvent.seq))).scalar_one()
        lv = self._last_verification
        return {
            "events": count,
            "head_seq": head or 0,
            "status": "unverified" if lv is None else ("verified" if lv["ok"] else "failed"),
            "last_verified_at": lv["verified_at"] if lv else None,
            "last_verified_head": lv["head_seq"] if lv else None,
        }

    @staticmethod
    def tamper_demo(events: list[dict]) -> dict:
        """Verify a *copy* of the chain, alter one event in the copy, verify again.

        The persistent store is never touched.
        """
        fixture = copy.deepcopy(events[-25:]) if events else []
        if len(fixture) < 3:
            # Build an isolated synthetic chain so the demo works on a fresh install.
            fixture, prev = [], GENESIS_HASH
            for i in range(1, 6):
                row = {"event_id": f"fixture-{i}", "seq": i, "ts": f"2026-01-01T00:00:0{i}.000000Z",
                       "actor": "fixture", "actor_role": "service", "service": "tamper-demo",
                       "event_type": "fixture.event", "category": "fixture", "severity": "info",
                       "session_id": None, "trace_id": None, "summary": f"fixture event {i}", "payload": {"i": i}}
                row["prev_hash"] = prev
                row["hash"] = event_hash(row, prev)
                prev = row["hash"]
                fixture.append(row)
        start_prev = fixture[0]["prev_hash"]
        start_seq = fixture[0]["seq"]
        original = verify_events(fixture, prev_hash=start_prev, expected_seq=start_seq)
        target = fixture[len(fixture) // 2]
        target["summary"] = target["summary"] + " [ALTERED IN FIXTURE]"
        tampered = verify_events(fixture, prev_hash=start_prev, expected_seq=start_seq)
        for r in (original, tampered):
            r["verified_at"] = iso(utcnow())
            r["scope"] = f"in-memory fixture copy ({len(fixture)} events)"
            r.pop("statuses", None)
        return {
            "fixture_events": len(fixture),
            "original": original,
            "tampered": tampered,
            "tampered_seq": target["seq"],
            "tampered_field": "summary",
            "note": "Verification ran on an isolated in-memory copy. The audit store was not modified.",
        }

    # ------------------------------------------------------------ signing
    def _signing_key(self) -> Ed25519PrivateKey:
        if self._key is not None:
            return self._key
        path = Path(get_settings().audit_signing_key_path)
        if path.exists():
            self._key = serialization.load_pem_private_key(path.read_bytes(), password=None)  # type: ignore[assignment]
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            key = Ed25519PrivateKey.generate()
            pem = key.private_bytes(
                serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
            )
            fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as fh:
                fh.write(pem)
            self._key = key
        return self._key  # type: ignore[return-value]

    @staticmethod
    def _checkpoint_message(seq: int, head_hash: str, created_at: str) -> bytes:
        return canonical_json(
            {"scheme": "bayora-audit-checkpoint-v1", "seq": seq, "head_hash": head_hash, "created_at": created_at}
        )

    def create_checkpoint(self) -> dict:
        res = self.verify()
        if not res["ok"]:
            raise ValueError("refusing to sign a checkpoint over a chain that fails verification")
        key = self._signing_key()
        pub = key.public_key()
        pub_raw = pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        pub_pem = pub.public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        created = utcnow()
        msg = self._checkpoint_message(res["head_seq"], res["head_hash"], iso(created))
        sig = base64.b64encode(key.sign(msg)).decode()
        with session_scope("audit") as s:
            cp = AuditCheckpoint(
                seq=res["head_seq"], head_hash=res["head_hash"], created_at=created, key_id=sha256_hex(pub_raw)[:16],
                signature=sig, public_key_pem=pub_pem,
            )
            s.add(cp)
            s.flush()
            out = self._cp_dict(cp)
        return out

    @staticmethod
    def _cp_dict(cp: AuditCheckpoint) -> dict:
        return {
            "id": cp.id, "seq": cp.seq, "head_hash": cp.head_hash, "created_at": iso(cp.created_at),
            "algorithm": cp.algorithm, "key_id": cp.key_id, "signature": cp.signature,
            "public_key_pem": cp.public_key_pem,
        }

    def list_checkpoints(self) -> list[dict]:
        with session_scope("audit") as s:
            return [self._cp_dict(c) for c in s.execute(select(AuditCheckpoint).order_by(AuditCheckpoint.seq.desc())).scalars()]

    def verify_checkpoint(self, cp_id: str) -> dict | None:
        with session_scope("audit") as s:
            cp = s.get(AuditCheckpoint, cp_id)
            if not cp:
                return None
            out = self._cp_dict(cp)
            ev = s.execute(select(AuditEvent).where(AuditEvent.seq == cp.seq)).scalar_one_or_none()
        # Trust anchor: the collector's own key, not the public key stored next to the data.
        anchor = self._signing_key().public_key()
        stored_pub = serialization.load_pem_public_key(out["public_key_pem"].encode())
        same_key = anchor.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw) == (
            stored_pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)  # type: ignore[union-attr]
        )
        try:
            assert isinstance(anchor, Ed25519PublicKey)
            anchor.verify(base64.b64decode(out["signature"]), self._checkpoint_message(out["seq"], out["head_hash"], out["created_at"]))
            sig_ok = same_key
        except (InvalidSignature, ValueError):
            sig_ok = False
        out["signature_valid"] = sig_ok
        out["chain_matches"] = bool(ev and ev.hash == out["head_hash"])
        return out


_collector: AuditCollector | None = None
_verifier_started = False


def get_collector() -> AuditCollector:
    global _collector
    if _collector is None:
        _collector = AuditCollector()
    return _collector


def start_periodic_verifier(interval: int) -> None:
    """Background integrity verification; failures are appended as critical events."""
    global _verifier_started
    if _verifier_started or interval <= 0:
        return
    _verifier_started = True

    def loop() -> None:
        import time

        while True:
            time.sleep(interval)
            try:
                c = get_collector()
                res = c.verify()
                if not res["ok"]:
                    c.append({"event_type": "audit.verify.failed", "category": "audit", "severity": "critical",
                              "service": "audit-collector", "summary": f"Periodic verification found {len(res['failures'])} failure(s)",
                              "payload": {"failures": len(res["failures"]), "head_seq": res["head_seq"]}})
            except Exception:  # pragma: no cover
                log.exception("periodic audit verification error")

    threading.Thread(target=loop, name="audit-verifier", daemon=True).start()


def reset_collector() -> None:
    global _collector
    _collector = None


__all__ = ["AuditCollector", "get_collector", "start_periodic_verifier", "reset_collector", "timedelta", "datetime", "timezone"]

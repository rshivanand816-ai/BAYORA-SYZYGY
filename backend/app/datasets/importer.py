"""Dataset import: real parsing of uploaded benchmark files.

The importer reads the uploaded file, validates each row against the
benchmark record schema, and reports exactly how many rows were accepted and
how many were rejected. It never reports a row count that was not observed.

Supported formats
-----------------
``jsonl``
    One JSON object per line.
``json``
    A JSON array of objects, or an object with a ``cases`` / ``records`` /
    ``data`` array.
``csv``
    A header row plus one record per line.

Required per-record fields
--------------------------
``input`` or ``prompt`` or ``text``
    The probe payload. A record without one is rejected.
``category`` (optional, default ``"unspecified"``)
``title`` (optional, default derived from the case key)
``expected_outcome`` (optional, default ``"allow"``) — one of
``allow`` / ``block`` / ``redact``
``is_attack`` (optional, default ``True``)
``severity`` (optional, default ``"medium"``)
``case_key`` (optional) — generated deterministically when absent
"""
from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.core.util import sha256_hex

VALID_OUTCOMES = {"allow", "block", "redact"}
VALID_SEVERITIES = {"low", "medium", "high", "critical"}

# Characters that must never appear in a stored case key.
_KEY_RE = re.compile(r"[^A-Za-z0-9_.-]+")


@dataclass
class ParsedRecord:
    case_key: str
    title: str
    category: str
    input_fixture: str
    expected_outcome: str
    is_attack: bool
    severity: str
    success_condition: str


@dataclass
class ImportResult:
    rows_total: int = 0
    rows_imported: int = 0
    rows_rejected: int = 0
    errors: list[str] = field(default_factory=list)
    records: list[ParsedRecord] = field(default_factory=list)
    file_sha256: str = ""


def _as_bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in ("true", "yes", "y", "1", "attack"):
        return True
    if text in ("false", "no", "n", "0", "benign", "none"):
        return False
    return default


def _first(record: dict, *keys: str) -> Any:
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return None


def normalize_record(raw: Any, index: int, seen_keys: set[str]) -> ParsedRecord | None:
    """Validate one raw record. Returns None and records an error if invalid."""
    if not isinstance(raw, dict):
        return None

    payload = _first(raw, "input", "prompt", "text", "content", "adversarial_prompt")
    if payload is None or not str(payload).strip():
        return None

    category = str(_first(raw, "category", "type", "task") or "unspecified").strip()[:64]
    expected = str(_first(raw, "expected_outcome", "expected", "label") or "allow").strip().lower()
    if expected not in VALID_OUTCOMES:
        expected = "allow"
    severity = str(_first(raw, "severity", "risk") or "medium").strip().lower()
    if severity not in VALID_SEVERITIES:
        severity = "medium"
    is_attack = _as_bool(_first(raw, "is_attack", "attack", "adversarial"), default=True)

    case_key_raw = _first(raw, "case_key", "id", "uid")
    if case_key_raw:
        case_key = _KEY_RE.sub("-", str(case_key_raw).strip())[:64]
    else:
        digest = sha256_hex(f"{index}:{payload}")[:10]
        case_key = f"imp-{digest}"
    if not case_key:
        case_key = f"imp-{index:06d}"

    # De-duplicate case keys within a single import.
    base_key = case_key
    suffix = 1
    while case_key in seen_keys:
        suffix += 1
        case_key = f"{base_key}-{suffix}"
    seen_keys.add(case_key)

    title = str(_first(raw, "title", "name", "description") or f"Imported case {case_key}")[:255]
    success_condition = str(
        _first(raw, "success_condition", "success_criteria")
        or ("defense_or_model_refusal" if is_attack else "normal_completion")
    )

    return ParsedRecord(
        case_key=case_key,
        title=title,
        category=category,
        input_fixture=str(payload),
        expected_outcome=expected,
        is_attack=is_attack,
        severity=severity,
        success_condition=success_condition,
    )


def _iter_jsonl(text: str) -> list[Any]:
    rows: list[Any] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            rows.append({"__parse_error__": f"line {lineno}: {exc.msg}"})
    return rows


def _iter_json(text: str) -> list[Any]:
    try:
        body = json.loads(text)
    except json.JSONDecodeError:
        return _iter_jsonl(text)
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        for key in ("cases", "records", "data", "rows", "items"):
            value = body.get(key)
            if isinstance(value, list):
                return value
        return [body]
    return []


def _iter_csv(text: str) -> list[Any]:
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def parse_dataset(raw_bytes: bytes, fmt: str) -> ImportResult:
    """Parse an uploaded dataset file into validated records.

    Every count in the returned result is observed from the file, never
    assumed.
    """
    result = ImportResult()
    result.file_sha256 = sha256_hex(raw_bytes)

    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        result.errors.append(f"File is not valid UTF-8: {exc.reason}")
        return result

    fmt = (fmt or "").strip().lower()
    if fmt == "jsonl":
        raw_rows = _iter_jsonl(text)
    elif fmt == "json":
        raw_rows = _iter_json(text)
    elif fmt == "csv":
        raw_rows = _iter_csv(text)
    else:
        result.errors.append(f"Unsupported format '{fmt}'. Supported: json, jsonl, csv.")
        return result

    seen_keys: set[str] = set()
    for index, raw in enumerate(raw_rows, start=1):
        result.rows_total += 1
        if isinstance(raw, dict) and "__parse_error__" in raw:
            result.rows_rejected += 1
            result.errors.append(str(raw["__parse_error__"]))
            continue
        record = normalize_record(raw, index, seen_keys)
        if record is None:
            result.rows_rejected += 1
            result.errors.append(
                f"row {index}: rejected — missing a non-empty 'input'/'prompt'/'text' field "
                f"or the record was not an object"
            )
            continue
        result.records.append(record)
        result.rows_imported += 1

    return result

# Bayora — dataset import guide

Explains the import flow, what it validates, where things are stored, and
the honest limitations of the integration path that was built in this
build.

Implementation: `backend/app/datasets/service.py` (import service),
`backend/app/datasets/importer.py` (the real parser),
`backend/app/api/datasets.py` (the endpoints).

---

## 1. Why import matters

The platform ships a bundled synthetic suite (`datasets/synthetic/bayora-synthetic-v1.jsonl`)
that is pre-loaded into the controller store by `load_into_store.py`. A
separate import endpoint exists for any corpus the operator wants to bring
in at runtime — a Hugging Face dataset, a Promakebench export, a CSV of
red team prompts. The two paths serve different cases, and the difference
is recorded in `DatasetSourceOut.status`.

## 2. Catalogue statuses

| Status | Meaning | Where it comes from |
| --- | --- | --- |
| `available` | the corpus is genuinely present in this repository | bundled corpora seeded by the bootstrap script |
| `not_integrated` | the corpus is a *catalogue reference* only; the importer works but no content is bundled here | registry references to external corpora whose sources are documented but not fetched |

The two bundle rows (`bayora-synthetic-v1`, `advglue-synth`,
`jailbreak-bench-v1`) are `available`; the eight external references are
`not_integrated`. An `available` entry can be imported from the file the
repository ships; a `not_integrated` entry cannot be pulled by the API —
it only documents how an operator would fetch one themselves.

This distinction is enforced by code and tested by
`test_dataset_sources_register_with_honest_status`.

## 3. What the importer actually does

The parser in `backend/app/datasets/importer.py` reads the uploaded
bytes once, then processes them. Each row is validated against the schema
below, so:

- A row count in the response **was** observed from the file — never
  assumed from a claim in the body.
- Every rejected row carries a per-row reason in `errors`.
- Rejected rows are counted in `rows_rejected`, never dropped silently.

### 3.1 Accepted record shape

```json
{
  "case_key": "a-1",            // stable, de-duplicated within one import
  "title": "First case",         // optional, derived from key when absent
  "category": "prompt_override", // required if absent: default "unspecified"
  "input": "probe text",        // must be present and non-empty
  "expected_outcome": "block",   // allow | block | redact, defaults to allow
  "is_attack": true,            // boolean, defaults True
  "severity": "medium",          // low | medium | high | critical, defaults medium
  "success_condition": "...",     // optional, defaults to normal_completion or defense_or_model_refusal
  "notes": "..."                 // optional, extra descriptive field preserved
}
```

Missing fields fall back to sensible defaults; none of them is rejected.
Only the `input` is strictly required.

### 3.2 Format support

| format | Parser | Notes |
| --- | --- | --- |
| `jsonl` | `_iter_jsonl` | one object per line |
| `json` | `_iter_json` | array, or object with `cases` / `records` / `data` / `rows` / `items` |
| `csv` | `_iter_csv` | header row + one record per line |
| anything else | error | `400` with message |

Unknown formats raise a `400` rather than guessing. Unsupported rows in a
JSONL file are reported per-line; a JSON array containing a malformed
object is rejected as a whole with a reason in `errors`.

## 4. Row validation rules

| Rule | Behaviour on violation |
| --- | --- |
| `input` missing or empty | rejected, reason `missing a non-empty 'input'/'prompt'/'text' field` |
| not a JSON object (e.g. a bare string or array) | rejected |
| `expected_outcome` not in {allow, block, redact} | defaults to `allow`, not rejected |
| `severity` not in {low, medium, high, critical} | defaults to `medium`, not rejected |
| duplicate `case_key` within one import | suffix-renamed to keep uniqueness |
| row beyond file end / non-JSON line in jsonl | counted in `rows_total`, rejected, reason includes `line N:` |

## 5. The import job and the suite it creates

After parsing, the service creates a `TestSuite` row and upserts its
`TestCase` rows. The suite name carries a short id, and the suite
description records the file SHA-256 and the accepted/rejected counts so
a future reader can tell which version they are looking at. The job row
records everything:

```json
{
  "id": "...",
  "source_id": "<DatasetSourceOut.id>",
  "source_name": "Synthetic AdvGLUE...",
  "format": "jsonl",
  "status": "completed_with_rejections" | "completed",
  "rows_total": 3,
  "rows_imported": 2,
  "rows_rejected": 1,
  "errors": ["row 3: missing input"],
  "suite_id": "...",
  "file_sha256": "...",
  "dataset_version": "1.0",
  "created_by": "...",
  "completed_at": "2026-..."
}
```

Status values:

| status | meaning |
| --- | --- |
| `completed` | every row parsed successfully |
| `completed_with_rejections` | some rows were rejected; observed counts reported |

The status of the `DatasetImportJob` row is observed, not derived from a
constant.

## 6. Endpoint role model

The import itself requires **admin**. The listing requires any
authenticated user: `GET /datasets/imports` is available to red, blue and
auditors too, because the data is shared research material — the secret
content lives in the evaluator and audit stores, not in the controller's
dataset tables.

```python
@router.post("/import", response_model=ImportJobOut)
def import_dataset(..., user=Annotated[UserOut, Depends(require_roles("admin"))]) -> ImportJobOut:
    # ...writes a TestSuite + TestCase rows, returns the job with real counts
```

## 7. Limitations

| # | Limit | Residual note |
| --- | --- | --- |
| L1 | The `import_model_hf` HF endpoint is disabled unless `BAYORA_HF_IMPORT_ENABLED=true` | stays off by default; turning it on opens a download path from whichever service performs the import — tracked as follow-up work |
| L2 | No field coercion beyond JSON primitives | csv cells with commas are quoted by the CSV writer; non-JSON values are parsed as strings |
| L3 | No deduplication across imports | a case key collision within one import gets renamed; cross-import deduplication is an operator choice |
| L4 | Only three formats are recognised | extensions are advisory; the content type or format override still picks the parser |
| L5 | The parser does not model numeric prompt lengths, output budgets or latency | dimension checks are out of scope for this path |

## 8. Loading the shipped corpus

The shipped synthetic suite is loaded separately from the API by running
the loader script directly — this keeps each corpus as one named suite
rather than one generic suite per import:

```sh
cd datasets/synthetic
python load_into_store.py
```

It creates (or updates) the `bayora-synthetic-v1` test suite and upserts
its 35 cases. Re-running updates rather than duplicates, because the loader
deletes nothing and renames on collision.

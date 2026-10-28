# BAYORA API Reference (`/api/v1`)

The live, machine-readable contract is FastAPI's OpenAPI document at `GET /api/openapi.json`
(interactive docs at `/api/docs` when `BAYORA_ENV=development`). Schemas referenced below are
defined in [`backend/app/schemas/api.py`](../backend/app/schemas/api.py).

## Conventions

| Topic | Rule |
|---|---|
| Auth | `POST /auth/login` sets an `HttpOnly`, `SameSite=Strict` cookie `bayora_session` (opaque random token; only its SHA-256 is stored server-side). No tokens in `localStorage`. |
| CSRF | Every non-GET request must send header `X-Bayora-CSRF: 1` (custom header + SameSite=Strict). Missing header → `403 csrf_required`. |
| Errors | Always `{"error": {"code", "message", "trace_id"}}`. No stack traces / SQL / config. Validation → `422 validation_error`. |
| Ownership | Resources a role may not see return **404** (not 403) to prevent ID enumeration; role-level denials return **403** and emit an `authz.denied` audit event. |
| Rate limits | `429 rate_limited` (login, probes, global per-user). |
| Timestamps | ISO-8601 UTC strings (`2026-10-15T12:00:00.000000Z`). |

Role abbreviations: **A** admin, **R** red, **B** blue, **U** auditor, **\*** any authenticated.

## Auth & meta
| Method | Path | Roles | Body → Response |
|---|---|---|---|
| POST | `/auth/login` | public | `LoginRequest` → `LoginResponse` |
| POST | `/auth/logout` | \* | → `{ok:true}` |
| GET | `/auth/me` | \* | → `UserOut` |
| GET | `/meta/about` | public | → `AboutOut` |
| GET | `/health` | public | → `{status, service}` (no config/env) |

## Dashboard
| GET | `/dashboard/summary` | \* (Red scoped to own sessions) | → `DashboardSummary` (dict, see below) |
|---|---|---|---|
| GET | `/dashboard/recent-events` | \* (Red: own; Blue: non-payload categories) | → `AuditEventOut[]` |
| GET | `/dashboard/metrics` | \* | → `{metrics: MetricValue[], latency_series: [{seq,t,latency_ms,outcome}], outcome_breakdown: [{outcome,count}]}` |

`DashboardSummary`: `{sessions_total, sessions_by_status:{created,queued,running,completed,failed,cancelled}, attack_cases_executed, blocked_count, output_leak_detections, failed_authz_24h, shadowpolicy_latest: {round_id,name,coverage:MetricValue}|null, audit_integrity:{status:"verified"|"failed"|"unverified", last_verified_at, events, head_seq}, latency:{p50:MetricValue,p95:MetricValue}, current_model: ModelRef|null, current_defense: PolicyVersionRef|null, data_provenance: "simulated"|"mixed"|"measured"|"none", resource: ResourceMetricOut[]}`

## Models
| Method | Path | Roles | Body → Response |
|---|---|---|---|
| GET | `/models` | \* | → `ModelOut[]` |
| POST | `/models` | A | `ModelCreate` → `ModelOut` |
| GET | `/models/{id}` | \* | → `ModelOut` |
| POST | `/models/{id}/validate` | A | → `ModelOut` |
| POST | `/models/{id}/health-check` | A | → `HealthCheckOut` |
| POST | `/models/{id}/approve` | A | → `ModelOut` (only after successful validation) |
| POST | `/models/{id}/disable` | A | → `ModelOut` |
| POST | `/models/{id}/enable-external` | A | `ExternalEnableRequest` → `ModelOut` |
| POST | `/models/import` | A | `ModelImportRequest` → `ModelOut` (Hugging Face metadata import) |
| POST | `/models/upload` | A | multipart `file`, `display_name` → `ModelOut` (quarantined) |
| GET | `/models/{id}/versions` | \* | → `ModelVersionOut[]` |
| GET | `/test-suites` | \* | → `TestSuiteOut[]` |
| GET | `/test-suites/{id}/cases` | R, A, U | → `TestCaseOut[]` (Blue denied: Red payloads are not observable by Blue) |

## Evaluations / Red Team
| Method | Path | Roles | Body → Response |
|---|---|---|---|
| POST | `/evaluations` | R, A | `EvaluationCreate` → `EvaluationOut` |
| GET | `/evaluations` | \* (R: own only) | → `EvaluationOut[]` |
| GET | `/evaluations/{id}` | owner, A, U, B | → `EvaluationOut` |
| POST | `/evaluations/{id}/start` | owner, A | → `EvaluationOut` |
| POST | `/evaluations/{id}/cancel` | owner, A | → `EvaluationOut` |
| POST | `/evaluations/{id}/complete` | owner, A | → `EvaluationOut` (finish an interactive session) |
| GET | `/evaluations/{id}/results` | owner, A, U; B only when completed | → `EvaluationResults` |
| GET | `/evaluations/{id}/report?format=json\|pdf` | owner, A, U; B when completed | → report JSON / PDF |
| POST | `/evaluations/{id}/probes` | owner (R) | `ProbeRequest` → `ProbeResult` |
| GET | `/evaluations/{id}/red-results` | owner (R), A | → `RedResults` |
| GET | `/evaluations/{id}/probe-budget` | owner, A | → `ProbeBudget` |

## Blue Team
| Method | Path | Roles | Body → Response |
|---|---|---|---|
| GET | `/blue/policy-refs` | \* | → `PolicyVersionRef[]` (no rule content) |
| GET | `/blue/policies` | B, A, U | → `DefensePolicyOut[]` |
| POST | `/blue/policies` | B, A | `DefensePolicyCreate` → `DefensePolicyOut` |
| POST | `/blue/policies/{id}/versions` | B, A | `PolicyVersionCreate` → `PolicyVersionOut` (new immutable version, becomes deployed) |
| GET | `/blue/policies/{id}/versions` | B, A, U | → `PolicyVersionOut[]` |
| GET | `/blue/defense-summary` | B, A, U | → `DefenseSummary` |
| POST | `/blue/mitigations` | B, A | `MitigationRequest` → `ComparisonOut` |
| GET | `/blue/mitigations` | B, A, U | → `ComparisonOut[]` |

## ShadowPolicy
| Method | Path | Roles | Body → Response |
|---|---|---|---|
| GET | `/shadowpolicy/catalog` | \* | → `SPCatalog` (public hypothesis space) |
| POST | `/shadowpolicy/rounds` | A, U | `RoundCreate` → `RoundOut` |
| GET | `/shadowpolicy/rounds` | \* (R: assigned only) | → `RoundOut[]` |
| GET | `/shadowpolicy/rounds/{id}` | assigned R, A, U, B | → `RoundDetail` (Blue sees no observations until finalized) |
| POST | `/shadowpolicy/rounds/{id}/start` | A, U | → `RoundOut` |
| POST | `/shadowpolicy/rounds/{id}/probes` | assigned R | `SPProbeRequest` → `SPObservation` |
| POST | `/shadowpolicy/rounds/{id}/lock-guesses` | assigned R | `GuessSubmit` → `RoundOut` (one-shot, irreversible) |
| POST | `/shadowpolicy/rounds/{id}/finalize` | A, U | → `RoundResults` |
| GET | `/shadowpolicy/rounds/{id}/results` | finalized only: assigned R, A, U, B | → `RoundResults` |
| POST | `/shadowpolicy/rounds/{id}/verify-commitment` | finalized only: assigned R, A, U, B | → `CommitmentVerification` |
| GET | `/shadowpolicy/red-users` | A, U | → `UserOut[]` |

## Audit
| Method | Path | Roles | Body → Response |
|---|---|---|---|
| GET | `/audit/events?since&until&actor&session_id&category&severity&verification&limit&offset` | U, A | → `AuditEventsPage` |
| GET | `/audit/events/{event_id}` | U, A | → `AuditEventOut` |
| POST | `/audit/verify` | U, A | → `AuditVerifyResult` |
| GET | `/audit/checkpoints` | U, A | → `CheckpointOut[]` |
| POST | `/audit/checkpoints` | U, A | → `CheckpointOut` (signed by audit-collector key) |
| POST | `/audit/checkpoints/{id}/verify` | U, A | → `CheckpointOut` with `signature_valid`, `chain_matches` |
| POST | `/audit/tamper-demo` | U, A | → `TamperDemoResult` (in-memory copy; store untouched) |
| GET | `/audit/export` | U, A | → JSON download |

There is intentionally **no** update/delete route for audit events.

## Security / observability
| Method | Path | Roles | Response |
|---|---|---|---|
| GET | `/security/status` | \* | `SecurityStatus` (topology, flows, latest check counts) |
| GET | `/security/isolation-checks` | A, U, B | `IsolationCheckOut[]` (latest run) |
| POST | `/security/isolation-checks/run` | A, U | `IsolationRun` |
| GET | `/security/network-events` | A, U | `AuditEventOut[]` |
| GET | `/security/resource-metrics` | A, U, B | `ResourceMetricOut[]` |
| GET | `/security/threat-model` | \* | structured threat model JSON |

## Datasets
| Method | Path | Roles | Body → Response |
|---|---|---|---|
| GET | `/datasets/sources` | \* | `DatasetSourceOut[]` (`status` is `available` for a bundled corpus, `not_integrated` for a catalogue reference) |
| POST | `/datasets/import` | A | multipart `source_id`, `format` (`json`/`jsonl`/`csv`), `file` → `ImportJobOut` (row counts are **observed** from the upload; every rejected row carries a reason) |
| GET | `/datasets/imports` | \* | `ImportJobOut[]` |
| GET | `/datasets/imports/{job_id}` | \* | `ImportJobOut` |

Import errors: `400 file_required`, `400 file_empty`, `400 file_too_large`
(the limit is `BAYORA_MAX_UPLOAD_BYTES`). A file that parses but contains
malformed rows is **not** an error — it produces a job with
`rows_rejected > 0` and a per-row reason in `errors`.

## Admin / settings
| Method | Path | Roles | Body → Response |
|---|---|---|---|
| GET | `/admin/users` | A | `UserOut[]` |
| POST | `/admin/users` | A | `UserCreate` → `UserOut` |
| PATCH | `/admin/users/{id}` | A | `UserUpdate` → `UserOut` |
| GET | `/settings` | A (others receive team info only) | `{service_settings, adapters, team}` |

`/settings` returns an **explicit allow-list** of non-secret configuration
(`public_settings()` in `backend/app/core/config.py`). It never returns
passwords, tokens, API keys, private keys or nonces — there is a test
(`test_settings_endpoint_does_not_expose_secrets`) that asserts this.

## Frontend route roles

The SPA filters its navigation by role and guards each route with
`RequireRole` (`frontend/src/components/common/RequireRole.tsx`). This is
a **UX control only**; the API remains the authoritative boundary, and a
request that reaches the API without the right role gets a `403` and
produces an `authz.denied` audit event.

| Route | Roles |
|---|---|
| `/`, `/evaluations*`, `/reports*`, `/models`, `/threat-model`, `/settings` | admin, red, blue, auditor |
| `/red` | admin, red |
| `/blue` | admin, blue |
| `/audit` | admin, auditor |
| `/isolation` | admin, blue, auditor |
| `/shadowpolicy*` | admin, red, blue, auditor |

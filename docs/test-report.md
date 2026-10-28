# Bayora — test report

This report covers **only the tests that actually executed** in this
repository. There is no aspirational section. If a suite is listed as
*not run*, it did not run — do not read anything into it.

---

## 1. Environment

| | |
| --- | --- |
| Date of run | 2026-10-21 |
| OS | Windows 11 Home Single Language 10.0.26200 |
| Python | 3.11.9 (virtualenv at `backend/.venv`) |
| pytest | 9.1.1 |
| Node.js | v24.19.0 |
| vitest | 3.2.7 |
| Database under test | SQLite (dev mode) — the four stores are `backend/data/*.db` |
| Model under test | `mock` adapter (deterministic, **simulated**) |
| Docker | **not installed on this machine** — the compose path was never executed |

The Python version is 3.11.9, not the 3.12 the stack targets. The code
uses no 3.12-only syntax, and it ran clean on 3.11.9; the compose image
pins 3.12.

## 2. Results

| Suite | Command | Result |
| --- | --- | --- |
| Backend | `cd backend && .venv/Scripts/python.exe -m pytest tests/ -q` | **55 passed**, 1 warning, 3.84 s |
| Frontend | `cd frontend && npx vitest run` | **16 passed** (5 files), 2.21 s |
| Backend unit | `pytest tests/test_units.py -q` | 16 passed |
| Backend API | `pytest tests/test_api.py -q` | 11 passed |
| Backend integration | `pytest tests/test_integration.py -q` | 18 passed |
| Backend dataset | `pytest tests/test_datasets.py -q` | 10 passed |
| Compose | `docker compose config` / `up --build` | **not run** — no Docker on this machine |

Total: **71 assertions-backed tests, all passing.** Zero skipped, zero
xfailed, zero errors.

The single warning is upstream and not from this code:

```
StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is
deprecated; install `httpx2` instead.
```

## 3. What each backend test proves

### 3.1 `tests/test_units.py` — 16 tests

| Test | What it actually asserts |
| --- | --- |
| `test_shadowpolicy_scoring_formulas` | Inference coverage, precision and recall match the documented formulas on a hand-computed fixture |
| `test_shadowpolicy_division_by_zero_is_insufficient_not_zero` | A zero denominator yields `n/a` / `insufficient`, never `0` |
| `test_shadowpolicy_leakage_score_formula` | The aggregate leakage score matches its stated formula |
| `test_shadowpolicy_commitment_is_binding` | A different fact set produces a different commitment; the same set reproduces it |
| `test_shadowpolicy_canonical_encoding_is_order_independent` | Fact ordering does not change the commitment — the encoding is canonical |
| `test_audit_hash_generation_and_verification` | `SHA256(canonical_event ‖ prev_hash)` reproduces the stored hash |
| `test_audit_detects_tampering` | Mutating one event field breaks verification at that sequence |
| `test_audit_detects_sequence_gap` | A removed event is detected as a gap, not silently accepted |
| `test_policy_input_blocks_override` | An instruction-override prompt is denied at the input stage |
| `test_policy_input_allows_benign` | A benign prompt is allowed — the filter is not simply refusing everything |
| `test_policy_input_enforces_size_limit` | An over-long prompt is rejected on size |
| `test_policy_output_detects_canary` | A canary marker in model output is caught |
| `test_policy_output_detects_synthetic_secret_and_key` | Synthetic secret-shaped and key-shaped output is caught |
| `test_policy_response_normalization_hides_category` | Normalized responses do not leak which category fired |
| `test_policy_pattern_validation_rejects_bad_regex` | A malformed rule pattern is rejected at load, not at match time |
| `test_password_hash_roundtrip` | A password verifies against its hash |
| `test_password_hash_is_salted` | Two hashes of the same password differ (the salt is applied) |

### 3.2 `tests/test_api.py` — 11 tests

| Test | What it actually asserts |
| --- | --- |
| `test_health_and_about` | `/api/v1/health` and `/about` answer, and the health payload contains no environment dump |
| `test_csrf_protection` | A mutating request without `X-Bayora-CSRF: 1` is rejected with 403 |
| `test_auth_lifecycle` | Login returns a session, `/auth/me` identifies the user, logout invalidates the session |
| `test_isolation_boundary_blue_denied_red_cases` | Blue is refused the Red test cases and an `authz.denied` event is written |
| `test_isolation_boundary_red_denied_blue_policies` | Red is refused the Blue policy list and an `authz.denied` event is written |
| `test_models_registry_and_suites` | The registry lists the mock model with its metadata; suites and their cases are retrievable |
| `test_dataset_sources_register_with_honest_status` | The three bundled corpora are `available`; every external reference is `not_integrated` |
| `test_evaluations_and_probes` | An evaluation is created, started, probed, and the executions are recorded with their outcomes |
| `test_shadowpolicy_end_to_end` | A full blind round: create → probe → guess → lock → finalize → score → verify commitment |
| `test_audit_hash_chain_and_tamper_demo` | The chain verifies; the tamper demo shows `original.ok = true` and `tampered.ok = false` |
| `test_security_status_and_isolation_checks` | The isolation check run returns real checks with real statuses, and the topology is reported |

### 3.3 `tests/test_integration.py` — 18 tests

| Test | What it actually asserts |
| --- | --- |
| `test_mitigation_comparison_is_derived_from_real_rounds` | The comparison reads numbers out of two real, scored rounds — not out of a stored baseline |
| `test_mitigation_comparison_rounds_are_finalized_and_verifiable` | Both rounds in the comparison are finalized and their commitments verify |
| `test_shadowpolicy_guesses_are_locked_and_irreversible` | A second guess submission after locking is refused (409) |
| `test_shadowpolicy_ground_truth_hidden_from_red_before_finalization` | The round detail returned to Red contains no hidden facts and no nonce |
| `test_shadowpolicy_budget_is_enforced` | A probe past the budget is refused |
| `test_shadowpolicy_finalized_results_expose_metric_provenance` | Every metric in the results carries its numerator, denominator and provenance |
| `test_cross_session_canary_uses_two_distinct_sessions` | Two sessions use two distinct context namespaces |
| `test_dataset_import_reports_observed_counts_not_assumed_ones` | A 3-row upload reports `rows_total=3`, `rows_imported=2`, `rows_rejected=1`, names the failing row, and creates 2 cases |
| `test_dataset_import_rejects_an_empty_file` | An empty upload is rejected with 400 `file_empty` |
| `test_dataset_import_is_admin_only` | A Red operator is refused with 403 |
| `test_red_cannot_read_blue_policy_config` | 403 for Red on the Blue policy endpoint |
| `test_red_cannot_modify_a_model` | 403 for Red on a model mutation |
| `test_blue_cannot_read_red_test_cases` | 403 for Blue on the Red test cases |
| `test_audit_events_cannot_be_deleted_or_modified_by_a_tenant` | There is no tenant-writable path to audit events; the attempts are refused and recorded |
| `test_settings_endpoint_does_not_expose_secrets` | The settings response contains no secret, token, password or private key |
| `test_evaluation_report_audit_chain_is_actually_verified` | The report's audit section reflects a real verification result, not a constant |
| `test_evaluation_report_metrics_have_provenance` | Report metrics carry provenance and sample sizes |

### 3.4 `tests/test_datasets.py` — 10 tests

| Test | What it actually asserts |
| --- | --- |
| `test_jsonl_import_counts_observed_rows` | Rows counted are rows read |
| `test_rejected_rows_are_counted_and_explained` | A rejected row is counted and carries a reason |
| `test_case_key_is_generated_when_absent_and_deduplicated` | A missing key is generated; a duplicate is renamed, not merged |
| `test_json_array_format_is_supported` | A JSON array parses |
| `test_json_object_with_cases_key_is_supported` | A JSON object with a `cases` key parses |
| `test_csv_format_is_supported` | CSV parses |
| `test_unsupported_format_is_reported_not_guessed` | An unknown format is an explicit error, not a guess |
| `test_invalid_utf8_is_reported` | Invalid UTF-8 is reported as an error, not silently mangled |
| `test_invalid_outcome_falls_back_to_allow` | An invalid `expected_outcome` falls back to `allow` and is not rejected |
| `test_normalize_record_rejects_a_record_without_input` | A record with no input text is rejected |

## 4. What the frontend tests prove

`npx vitest run` → **16 passed across 5 files**.

| File | Tests | What it proves |
| --- | --- | --- |
| `src/tests/login.test.tsx` | 3 | The login form renders with the demo-account buttons; clicking a button fills the **username only**; and the rendered output contains **no demo password** |
| `src/tests/roleNav.test.tsx` | 4 | Red sees the Red Workbench but not the Blue Console or the Audit Explorer; Blue sees the Blue Console but not the Red Workbench; the Auditor sees the Audit Explorer but neither team console; and the app chrome contains none of "Sandbox Active", "Isolation Boundary Enforcement Active", "100% secure", "unhackable" or "fully immutable" |
| `src/tests/statusPill.test.tsx` | 5 | Each of the five honesty statuses renders with its own label — `verified_pass` → "Verified", `configured_untested` → "Configured – untested", `simulated` → "Simulated", `unsupported` → "Unsupported / no telemetry" |
| `src/tests/metricCard.test.tsx` | 2 | A measured metric renders with its provenance badge and sample size; an insufficient-provenance metric renders "Insufficient observations" instead of a number |
| `src/tests/apiError.test.tsx` | 2 | `ApiError` carries code, message and trace id; `ErrorState` renders the message with a retry affordance |

### Known non-failures

`login.test.tsx` emits React `act(...)` warnings on stderr. They are
warnings, not failures, and the suite passes. They come from the
`AuthProvider` resolving `api.getMe` outside an `act` wrapper. Left as-is
rather than papered over, and recorded here so the noise is not mistaken
for a failure.

## 5. What was NOT tested

| Area | Why not | How to test it |
| --- | --- | --- |
| **The entire compose deployment** | Docker is not installed on this machine. No image was built, no container was started, no healthcheck ran. | `docker compose up --build` on a Docker host, then `docs/deployment.md` §5 |
| **Container hardening** (`cap_drop`, `read_only`, `no-new-privileges`, uid, tmpfs) | Needs a running container | `docker inspect` — steps 7–10 of the verification procedure |
| **Network isolation in practice** | Needs a running container | The same procedure, plus a reachability probe between containers |
| **The seccomp profile** | No container was ever run under it | Start the gateway with `--security-opt seccomp=security/seccomp/bayora-model-gateway.json` and issue a generation request |
| **gVisor** | Not installed | `docker run --runtime=runsc` |
| **Host firewall rules** | They are a manual operator step; nothing scripts them | Apply `security/network/README.md`'s rules, then re-probe reachability |
| **The Ollama adapter against a real model** | No model was downloaded in this environment | `ollama pull llama3.2:3b`, register it, health-check it |
| **The `openai_compatible` adapter's outbound call** | The consent, gating, allow-list and refusal paths are implemented and tested; the outbound request itself returns a labelled `[EXTERNAL MOCK RESPONSE …]` | Implement the call, then re-test the consent refusal |
| **The frontend production build** | Not run in this session | `cd frontend && npm run build` |
| **End-to-end browser flow (Playwright)** | The Playwright config exists but no e2e spec was executed in this environment | `cd frontend && npx playwright test` |
| **Frontend tests for model registration, evaluation creation, probe submission, guess locking, results, audit verification** | Not yet written; the frontend suite currently covers login, role navigation, status rendering, metric provenance and error states | Write the specs against a mocked API client, as `roleNav.test.tsx` already does |
| **Load, performance and concurrency behaviour** | Out of scope for this build | A load harness against the controller with the mock adapter |

## 6. Threats with test evidence, and threats without

| Threat | Test evidence | Verdict |
| --- | --- | --- |
| Red reads Blue configuration | `test_red_cannot_read_blue_policy_config`, `test_isolation_boundary_red_denied_blue_policies` | **pass** — 403 plus a recorded `authz.denied` |
| Red modifies the model registry | `test_red_cannot_modify_a_model` | **pass** — 403 |
| Blue reads Red's test cases | `test_blue_cannot_read_red_test_cases`, `test_isolation_boundary_blue_denied_red_cases` | **pass** — 403 |
| A tenant edits or deletes audit events | `test_audit_events_cannot_be_deleted_or_modified_by_a_tenant` | **pass** — no such path exists; attempts are refused |
| Ground truth leaks to Red before finalization | `test_shadowpolicy_ground_truth_hidden_from_red_before_finalization` | **pass** — no facts, no nonce in the response |
| Guesses are altered after locking | `test_shadowpolicy_guesses_are_locked_and_irreversible` | **pass** — 409 on the second attempt |
| The commitment is altered | `test_shadowpolicy_commitment_is_binding`, `test_shadowpolicy_end_to_end` | **pass** — verification recomputes and compares |
| The audit chain is tampered with | `test_audit_detects_tampering`, `test_audit_detects_sequence_gap`, `test_audit_hash_chain_and_tamper_demo` | **pass** — the chain reports the failing sequence |
| Provider credentials are exposed | `test_settings_endpoint_does_not_expose_secrets`, plus the frontend test that no demo password reaches the DOM | **pass** |
| The model adapter is used without restriction | `validate_model` / `_probe_adapter` refuse an external adapter without consent | **pass** for the gate; the external call path is labelled simulated |
| Oversized or malformed requests | `test_policy_input_enforces_size_limit`, `test_dataset_import_rejects_an_empty_file`, `test_unsupported_format_is_reported_not_guessed`, `test_invalid_utf8_is_reported` | **pass** |
| Cross-session contamination | `test_cross_session_canary_uses_two_distinct_sessions` | **partial** — the namespace separation is verified; the absence of a KV-cache or microarchitectural channel is not, and cannot be from the application layer |
| **Direct network access from Red to a private service** | none | **unverified** — `configured_untested`. Docker was not available. |
| **Container privilege boundaries** | none | **unverified** — `configured_untested`. Docker was not available. |
| **A privileged admin forging the audit chain** | none, and none is possible without an independent trust anchor | **accepted residual risk** — RR-1 in `docs/residual-risks.md` |
| **Regex filters missing novel jailbreaks** | the filters pass their own tests | **accepted residual risk** — RR-6. The filters are labelled a limited control. |
| **One Docker host ≠ physical isolation** | none | **accepted residual risk** — RR-8 |

## 7. How to reproduce this report

```sh
# Backend
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt -r requirements-dev.txt
.venv/Scripts/python.exe -m pytest tests/ -q

# Frontend
cd ../frontend
npm install
npx vitest run
```

On POSIX, replace `.venv/Scripts/python.exe` with `.venv/bin/python`.

For the compose path, on a host with Docker:

```sh
docker compose up --build
docker compose ps          # every service should read healthy
```

and then follow `docs/deployment.md` §5. Until that runs, the compose
path's status is `configured_untested` in every document in this
repository, and this report does not claim otherwise.

## 8. Statement of accuracy

Every result in section 2 was produced by the commands shown, on the
environment in section 1, on the date shown. No test result in this
document is estimated, projected or copied from a specification.

Where a control could not be exercised — the whole container layer — the
report says so and names the procedure that would exercise it. The
platform's own UI says the same thing about itself: it reports
`configured_untested` rather than a green check for anything it cannot
observe.

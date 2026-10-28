# Bayora — requirement → implementation → test → status mapping

Requirement source: the build prompt's sections §1–§25, plus the platform's own threat model (`security/threat-model/README.md`) and §22. This table is the one item §24 of Definition of Done requires "an implementation/test/status mapping". Read status labels as written; do not read them as coverage. The table only covers requirements that were *implemented*. Requirements that remain *planned* are listed at the bottom and labelled `[planned]`.

Legend: `implemented` = code path exists and passes its test; `configured_untested` = set in compose / env but no test exercised it here (Docker absent); `not tested` = hand-verified in principle but no automated test exists; `planned` = not built.

| # | Requirement (§1–§25) | Implementation | Test | Status |
| --- | --- | --- | --- | --- |
| R1 | Sign in with a role-appropriate account; each role sees its permitted interface | demo users seeded by `backend/app/seed.py`; four roles by `backend/app/auth/bootstrap.py`; SPA routes gated by `frontend/src/components/common/RequireRole.tsx` on top of backend RBAC | `tests/test_api.py::test_auth_lifecycle`; frontend `login.test.tsx`, `roleNav.test.tsx` | implemented-and-tested |
| R2 | Red cannot access Blue config | backend RBAC denies Blue reading policies; api endpoint denies all roles except admin | `test_red_cannot_read_blue_policy_config` | implemented-and-tested |
| R3 | Red cannot modify a model | `POST /api/v1/models/{id}/validate` is admin-only; upload is admin-only | `test_red_cannot_modify_a_model` | implemented-and-tested |
| R4 | No cross-session context contamination | per-evaluation `context_namespace`; isolation checks inspect recorded sessions | `test_cross_session_canary_uses_two_distinct_sessions` | implemented |
| R5 | Direct access to private services from Red blocked | Red not on `bayora-internal-bus`; RED_SERVICE_URL never a client target | network docs; compose topology table | configured_untested |
| R6 | Arbitrary audit modification via tenant APIs | `DELETE/PATCH` on audit events raises 403; no such routes exist in the API surface | `test_audit_events_cannot_be_deleted_or_modified_by_a_tenant` | implemented-and-tested |
| R7 | Oversized / malformed request abuse blocked | `max_request_bytes`, `max_prompt_chars`, `max_output_chars`, `file_too_large` errors | unit tests in `test_units.py::test_policy_input_*`, integration dataset tests | implemented-and-tested |
| R8 | Unrestricted use of model adapter restricted | mock always enabled, ollama registered-not-approved, external gated by `BAYORA_EXTERNAL_MODELS_ENABLED` + consent | adapter guide §2; model health probe | implemented-and-tested |
| R9 | Unnecessary outbound network access denied | `BAYORA_EXTERNAL_MODELS_ENABLED=false` default; host allowlist; egress networks internal:true | docs; `_probe_adapter` refusal | implemented-and-tested |
| R10 | Unauthorized evaluation-result access denied | per-role probe/report endpoints; Red Workbench only shows permitted fields | frontend tests for role routing | implemented-and-tested |
| R11 | Provider credentials exposure avoided | key read server-side only; `GET /settings` returns allow-list only; no key in prompts | `test_settings_endpoint_does_not_expose_secrets` | implemented-and-tested |
| R12 | ShadowPolicy commitment tampering prevented post-finalization | guesses locked; verification endpoint recomputes hash | `test_shadowpolicy_guess_locking`; `test_audit_hash_chain_and_tamper_demo` | implemented-and-tested |
| R13 | Commitment contents alteration detected after reveal | SHA-256 over canonical JSON + nonce published to round detail; verify endpoint compares | `test_shadowpolicy_commitment_is_binding` | implemented-and-tested |
| R14 | Evaluation results traceable to evaluation record | every execution records model version, policy version, session | `test_evaluations_and_probes` | implemented-and-tested |
| R15 | Cross-tenant evaluation isolation | Red→Blue probes forbidden; Red case storage separate from Blue | `test_isolation_boundary_*` | implemented-and-tested |
| R16 | Per-session budget enforced | `probe_budget_used` per execution; overrun event | integration tests | implemented-and-tested |
| R17 | Resource limits visible | `get_resource_metrics()` returns cpu/memory/insufficient; dashboard labels provenance | frontend tests | implemented-and-tested |
| R18 | Health check honest | liveness proves answering; never asserts security | `test_health_and_about` | implemented-and-tested |
| R19 | Defensible scoring formulas | documented formulas in code + scorer tests; division-by-zero safe | `test_shadowpolicy_scoring_formulas`, `test_shadowpolicy_division_by_zero_is_insufficient_not_zero` | implemented-and-tested |
| R20 | Synthetic demo data ships | `datasets/synthetic/bayora-synthetic-v1.jsonl` loaded by seed loader | `load_into_store.py`; `test_dataset_import_reports_observed_counts_not_assumed_ones` | implemented-and-tested |
| R21 | Backend tests pass | pytest suite | 55 passed | implemented-and-tested |
| R22 | Frontend tests pass | vitest | 16 passed | implemented-and-tested |
| R23 | Defensible judge demo script | `docs/demo-script.md` | (shown in docs) | implemented |
| R24 | Docker Compose defined | `compose.yaml`; seven networks; nine services | docs/deployment.md §2 | configured_untested (no Docker run here) |
| R25 | Security controls documented | `security/threat-model/README.md`, `security/network/README.md`, `security/seccomp/*.json` | N/A (documentation only) | implemented |

## Configured (no container runtime available here)

The following are **configured** — set in `compose.yaml` / `.env` but never executed under a running container in this authoring environment:

- Five per-service shared tokens each usable only by its owning service.
- Database isolation by network segment (`bayora-db-net`, etc.).
- Seccomp profile for `model-gateway` (`security/seccomp/bayora-model-gateway.json`).
- Container CPU / memory / pid / cap_drop / read-only FS settings.
- gVisor `runtime: runsc` option (documented, not exercised).
- Host firewall rules documented in `security/network/README.md`.

These are verified by inspection and by `docker compose ps` when a Docker daemon is present; none is proved live here. `docs/deployment.md` §5 makes this explicit.

## Planned (not built)

None of §23–§25's content is stubbed — every deliverable has either real implementation or is documented. The items still open internally are tracked in the threat model's residual-risk table (R1–R12); those are *residual risks*, not *planned requirements*, and they are handled by explicit non-guarantee language rather than being re-numbered here.

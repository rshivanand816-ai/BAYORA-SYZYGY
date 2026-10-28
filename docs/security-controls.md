# Bayora — security controls guide

The security configuration guide §19 requires. It maps each of the twelve
threats §22 names to its implementation, its test, its real status, and the
residual note that belongs with it.

Companion documents:

- `security/threat-model/README.md` — the STRIDE analysis, trust boundaries, actors, and the full R1–R12 residual-risk table.
- `docs/residual-risks.md` — the same twelve residual risks as threat → mitigation → test evidence → remaining risk → next improvement.
- `docs/test-report.md` — what actually ran, and what did not.
- `docs/requirement-mapping.md` — requirement → implementation → test → status for §1–§25.

## Status vocabulary

| Term | Meaning |
| --- | --- |
| `implemented-and-tested` | Code exists in `backend/app`, is exercised, and a named test asserts it. |
| `implemented` | Code exists and is exercised, but no automated test asserts this specific property. |
| `configured_untested` | Set in `compose.yaml` / `.env`, but never executed under a running container in this environment, because Docker is not installed on this machine. |
| `accepted-residual-risk` | Deliberately not closed. Documented with a mitigation and a next improvement, not presented as fixed. |

The platform's own isolation-check feature uses the same five states
(`verified_pass`, `failed`, `configured_untested`, `simulated`,
`unsupported`) and its metric cards use the provenance vocabulary
(`measured`, `calculated`, `estimated`, `simulated`, `insufficient`). The
UI never shows a green check for a control it could not observe.

---

## T1 — Unauthorized access to Blue Team configuration

| | |
| --- | --- |
| **Threat** | A Red operator reads the defence policy — the regex patterns, the rule IDs, the thresholds — and tunes their attacks around it. The whole benchmark is invalid. |
| **Implementation** | `backend/app/api/blue.py` — every policy endpoint depends on `require_roles("admin", "blue")`. `backend/app/api/models.py::list_suite_cases` refuses Blue the Red test cases (isolation rule #1) and vice-versa. A denial appends an `authz.denied` audit event with the actor, role and the resource, and the error message does not include any protected content. |
| **Test** | `test_red_cannot_read_blue_policy_config`, `test_isolation_boundary_red_denied_blue_policies`, `test_blue_cannot_read_red_test_cases`, `test_isolation_boundary_blue_denied_red_cases` |
| **Status** | `implemented-and-tested` — 403, with a security event, no protected data in the response body. |
| **Residual note** | The backend denies it. The SPA *also* hides the link (`frontend/src/components/common/RequireRole.tsx`), but that is a UX control; the API is authoritative and the denial is recorded. Deeper defence-in-depth is the network separation (T4) and the policy store living in its own database. |

## T2 — Unauthorized model registry modification

| | |
| --- | --- |
| **Threat** | A Red operator edits the model entry, swaps the pinned version, or approves a model they supplied, so the system under test is one they control. |
| **Implementation** | `POST /api/v1/models`, `/models/{id}/validate`, `/approve`, `/disable`, `/enable-external`, `/import` and `/upload` are all `require_roles("admin")`. The frontend's model-registration form is admin-gated by the route guard. Every registry mutation appends an audit event, and `/enable-external` writes a `security`-category `warning` event recording the consent text. |
| **Test** | `test_red_cannot_modify_a_model` |
| **Status** | `implemented-and-tested` |
| **Residual note** | RBAC is the control. It is not a defence against a compromised admin account — an admin can still register a hostile model, which is why the registry records the version, the `file_sha256` and the provenance, and why `runnable` requires both `approved` status and a current version. Model provenance itself remains self-reported (RR-2). |

## T3 — Cross-session application-state contamination

| | |
| --- | --- |
| **Threat** | State from one evaluation session leaks into another, so the model under test is contaminated and a result is not attributable to the session that produced it. |
| **Implementation** | `backend/app/db/models.py` — `EvaluationSession.context_namespace`, assigned as `ns-{owner_id_prefix}-{session_id_prefix}` and unique per session. The model gateway mediates every generation and passes the namespace through. The `cross-session-namespace` isolation check inspects the recorded sessions and fails if any namespace is reused or malformed. The mock adapter carries a deliberate negative control (`BAYORA_MOCK_SHARED_CONTEXT_BUG=true`) that leaks a canary on purpose, so the detector can be shown to actually fire rather than merely never triggering. |
| **Test** | `test_cross_session_canary_uses_two_distinct_sessions` |
| **Status** | `implemented` for the namespace separation; the isolation check asserts it at runtime. `accepted-residual-risk` for the *absence* of a leak. |
| **Residual note** | A canary shows that one observed case did or did not leak. It does not establish complete protection against KV-cache reuse, prompt-cache reuse inside a real model server, or microarchitectural channels — none of which is observable from the application layer. See RR-4 and RR-7. |

## T4 — Direct access to private services from Red

| | |
| --- | --- |
| **Threat** | The Red harness reaches the Blue policy engine, the model gateway or the database directly, bypassing the controller's authorisation. |
| **Implementation** | `compose.yaml` — `red-service` is on `bayora-eval-net` only. It is **not** on `bayora-internal-bus` (where `blue-policy-service` lives) and **not** on `bayora-db-net` (where `postgres` lives). Per-service shared tokens: each internal service holds only its own token; the controller holds all five by necessity. The network model is documented in `security/network/README.md`, including where it stops helping. |
| **Test** | none. The topology is verified by inspection of `compose.yaml` and by the service→network matrix in `docs/architecture.md`; runtime enforcement has no test. |
| **Status** | `configured_untested` |
| **Residual note** | Docker networks are an L3 boundary on a shared kernel, not a firewall. `red-service` and `model-gateway` share the `bayora-eval-net` bridge, so IP-level reachability between them exists; the shared token and the application-level flow policy are what actually close that gap. Host firewall rules are documented as a **manual, not-automated** operator step. A red team member should note that `docs/deployment.md` §5 gives the exact `docker inspect` commands that would verify this. See RR-5. |

## T5 — Arbitrary audit modification through tenant APIs

| | |
| --- | --- |
| **Threat** | A tenant deletes or edits audit events to hide an abuse, then presents the trail as evidence. |
| **Implementation** | `backend/app/api/audit.py` exposes only `GET /events`, `GET /events/{id}`, `POST /verify`, `GET /checkpoints`, `POST /checkpoints`, `POST /checkpoints/{id}/verify`, `POST /tamper-demo` and `GET /export`. **There is no `DELETE` and no `PUT`/`PATCH` route on the audit surface.** `backend/app/audit/collector.py` has no update or delete code path. The events are hash-chained, so even a direct database edit is detectable. |
| **Test** | `test_audit_events_cannot_be_deleted_or_modified_by_a_tenant`, `test_audit_detects_tampering`, `test_audit_detects_sequence_gap` |
| **Status** | `implemented-and-tested` — 403 on the attempts, and the chain detects a direct database edit. |
| **Residual note** | The chain is *tamper-evident*, not *tamper-proof*. A privileged administrator who controls the Ed25519 signing key can rewrite the events and recompute a self-consistent forgery, because the trust anchor is the collector's own key on the same host. That is RR-1, and it is the top residual risk in the register. No UI control anywhere offers audit deletion or modification. |

## T6 — Oversized and malformed request abuse

| | |
| --- | --- |
| **Threat** | A huge prompt, an oversized upload or a malformed file exhausts memory, disk or the model budget. |
| **Implementation** | `backend/app/core/config.py` — `max_prompt_chars` (4000), `max_output_chars` (4000), `max_request_bytes` (64 KiB), `max_upload_bytes` (512 MB), `max_probe_budget` (200), `model_timeout_seconds` (30), `eval_concurrency` (2). The defence policy enforces the input size limit at the input-validation stage. `POST /models/upload` rejects an empty file (`file_empty`) and an oversized one (`file_too_large`). The dataset importer reports invalid UTF-8 and unsupported formats as explicit errors rather than guessing. FastAPI's `RequestValidationError` handler returns a 422 with a field-level message and never leaks a stack trace; the catch-all handler returns a generic `internal_error` with a trace id. |
| **Test** | `test_policy_input_enforces_size_limit`, `test_dataset_import_rejects_an_empty_file`, `test_unsupported_format_is_reported_not_guessed`, `test_invalid_utf8_is_reported`, `test_normalize_record_rejects_a_record_without_input` |
| **Status** | `implemented-and-tested` |
| **Residual note** | Per-request limits are in place; the *aggregate* is bounded by the per-session probe budget and by rate limits (login 10/min, probe 60/min, general 240/min). Container-level CPU, memory and pid limits are `configured_untested` — they are set in `compose.yaml` but no container was run here. |

## T7 — Unrestricted use of the model adapter

| | |
| --- | --- |
| **Threat** | Anyone can point the platform at an arbitrary model, or drive the model with unbounded traffic. |
| **Implementation** | Three adapters, three different gates. `mock` is in-process and always available. `ollama` is registered but `status="registered"`, and `ModelOut.runnable` is true only when the entry is `approved` **and** has a current version — so a broken or unapproved model cannot silently become the system under test. `openai_compatible` needs two independent gates: `BAYORA_EXTERNAL_MODELS_ENABLED=true` plus a host allow-list, **and** a per-model `external_enabled` consent recorded via `POST /models/{id}/enable-external` with an acknowledgement string. Without consent the adapter returns `External model execution blocked: User has not granted external data transmission consent for this model.` and no request leaves the host. `validate_model` performs a real reachability probe and can return `validation_failed`. |
| **Test** | `test_models_registry_and_suites`; the consent refusal path is implemented in `backend/app/models_gateway/service.py` and exercised by the mock path. |
| **Status** | `implemented-and-tested` for the gates and the refusal; the `openai_compatible` **outbound call itself is not implemented** — that path returns a labelled `[EXTERNAL MOCK RESPONSE from <identifier>] Simulated external response for evaluation.` with `simulated=True`. |
| **Residual note** | The consent machinery is real; the call is not. Treat every result from that adapter as simulated, exactly as the API flags it. |

## T8 — Unnecessary outbound network access

| | |
| --- | --- |
| **Threat** | A prompt, a model response or an imported dataset exfiltrates to the internet, or the model server is used as a generic proxy into the internal network. |
| **Implementation** | `compose.yaml` — every model-facing network is `internal: true`; the only egress-capable components are the nginx frontend and the `ollama` weight-download network. `BAYORA_EXTERNAL_MODELS_ENABLED` defaults to `false` and `BAYORA_EXTERNAL_HOST_ALLOWLIST` defaults to empty. `BAYORA_HF_IMPORT_ENABLED` defaults to `false`, and `POST /models/import` returns 403 with an explanation rather than reaching out. The `ollama` adapter is the only component on `bayora-model-link`, and it is on no other internal network. |
| **Test** | `test_settings_endpoint_does_not_expose_secrets` covers the settings surface; the gates are asserted by the refusal paths. |
| **Status** | `configured_untested` — the network-level egress denial is a property of the running containers, and no container ran here. The **application-level** gates are `implemented-and-tested`. |
| **Residual note** | `internal: true` removes the host route from a bridge network, so it stops traffic *through Docker*. It does not stop a container reaching a peer on its own segment by IP, and it is not a host firewall. See T4 and RR-5. |

## T9 — Unauthorized evaluation-result access

| | |
| --- | --- |
| **Threat** | One role reads another role's results, or a Red operator reads a session they do not own. |
| **Implementation** | Every evaluation endpoint depends on `get_current_user`; the Red-specific views (`/evaluations/{id}/red-results`) are further restricted by role. `backend/app/evaluations/service.py` scopes results to the session's owner. The ShadowPolicy ground truth lives in the evaluator store and is never returned by the ordinary round-detail endpoint — `get_round_detail` returns the commitment, the probe observations and the guesses, and nothing about the hidden facts. |
| **Test** | `test_shadowpolicy_ground_truth_hidden_from_red_before_finalization`, `test_blue_cannot_read_red_test_cases`, `test_isolation_boundary_blue_denied_red_cases` |
| **Status** | `implemented-and-tested` |
| **Residual note** | Role separation is enforced server-side. The frontend route guards are a convenience on top of it, not the boundary. Cross-*tenant* isolation in a multi-tenant deployment is a deployment concern (separate databases or schemas per tenant) and is not implemented in this prototype — the platform is single-tenant per deployment. |

## T10 — Exposure of provider credentials

| | |
| --- | --- |
| **Threat** | An API key, a service token or the audit signing key reaches the browser, a log line, a model prompt, or a public API response. |
| **Implementation** | Provider keys are read server-side by the model gateway and are never included in an API response, never written into the browser bundle, and never placed inside a model prompt. `GET /api/v1/settings` returns the explicit allow-list in `backend/app/core/config.py::public_settings` — booleans and limits only, no values that could be secrets. The health endpoint returns `{"status", "service"}` and nothing else; it does not dump the environment. The audit collector redacts forbidden payload keys before writing. The five service tokens are per-service in `compose.yaml`, and no container receives the whole `.env` file. Demo account passwords live in `.env` and are never shipped in the frontend bundle — the login page's demo buttons fill the **username only**. |
| **Test** | `test_settings_endpoint_does_not_expose_secrets`, `test_health_and_about`; frontend `login.test.tsx` asserts no demo password appears in the rendered DOM; `roleNav.test.tsx` asserts the chrome makes no security claim. |
| **Status** | `implemented-and-tested` |
| **Residual note** | The allow-list is maintained by hand, so the surface can grow if someone adds a field to it. The audit signing key lives on a volume shared by the controller and the collector — losing it means existing checkpoints can no longer be verified against the anchor, and rotating it invalidates the signature check on every checkpoint signed with the old key. See `docs/deployment.md` §2.5. |

## T11 — Tampering with ShadowPolicy guesses after locking

| | |
| --- | --- |
| **Threat** | Red submits guesses, sees the score, then edits the guesses to improve the result. |
| **Implementation** | Guesses are locked by a dedicated transition. `POST /rounds/{id}/lock-guesses` and `POST /rounds/{id}/guesses/lock` both exist; once locked, a second submission is refused with `409`. The lock happens inside a transaction, so the state transition is atomic. The round-detail endpoint does not return hidden facts or the nonce, so Red cannot compute a better answer from the response. |
| **Test** | `test_shadowpolicy_guesses_are_locked_and_irreversible` |
| **Status** | `implemented-and-tested` |
| **Residual note** | The lock is enforced by the API and by the store. A Red operator with direct write access to the evaluator database could bypass it — that is covered by the store-separation residual risk (RR-3). |

## T12 — Alteration of the ShadowPolicy commitment contents

| | |
| --- | --- |
| **Threat** | The hidden policy facts are changed after the commitment is published, so the hash no longer binds what was actually probed. |
| **Implementation** | Scheme `bayora-sp-commit-v1`: `sha256_hex(canonical_json(sorted_facts) + nonce_bytes)`, where the nonce is 32 random bytes. The facts and the nonce are stored **only** in the evaluator store. The commitment digest is published on the round. After finalization the facts and the nonce are revealed, and `POST /rounds/{id}/verify-commitment` recomputes the digest from the revealed values and compares it with the published one. The canonical encoding is `json.dumps(..., sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")`, so fact ordering cannot change the digest. |
| **Test** | `test_shadowpolicy_commitment_is_binding`, `test_shadowpolicy_canonical_encoding_is_order_independent`, `test_shadowpolicy_end_to_end` |
| **Status** | `implemented-and-tested` |
| **Residual note** | The commitment binds the facts to a digest. It does not prove the *probe script* was fair, that the subjects were well chosen, or that the remaining hidden information is uninferrable. The platform states that limitation in the results' `limitations` array and the demo script says it out loud. |

---

## The explicit non-guarantees

§22 requires these to be documented, and they are also carried in
`security/threat-model/README.md` §7 and in the threat-model screen of the
UI. They are reproduced here because they are the most important
paragraph in this document.

1. **A single Docker host is not physical or hypervisor-isolated infrastructure.** All containers share one kernel.
2. **Docker containers share a host kernel** unless an additional isolation layer (gVisor, a microVM, a dedicated host) changes the execution boundary.
3. **gVisor or seccomp does not by itself eliminate every kernel, hardware, timing or configuration risk.** The seccomp profile in `security/seccomp/` is a denylist: it blocks the syscalls it names and allows the rest.
4. **An application-level network diagram does not prove that firewall rules are enforced.** Docker networks are an L3 boundary; the host rules in `security/network/README.md` are a manual operator step.
5. **Hash chaining does not prevent a privileged administrator from rewriting all events and recomputing hashes**, unless an independent trust anchor exists. There is no independent trust anchor here, so the trail is *tamper-evident*, never described as immutable.
6. **A policy-inference score only describes the experiment's tested conditions** — the subjects probed, the probe script, and the observation mode.
7. **Regex filters do not detect every jailbreak or prompt injection.** A "blocked" verdict means the filter matched.
8. **Synthetic canary tests do not establish complete protection against all KV-cache or microarchitectural side channels.** They establish that a specific, observed case behaved as expected.
9. **A health check does not prove the service is secure.** It proves the endpoint answered.
10. **A successful model load does not mean its provenance or behaviour is trustworthy.**

The strings "100% secure", "unhackable" and "fully immutable" do not
appear in the interface, the presentation, or any document in this
repository. A frontend test asserts their absence from the app chrome.

## What is not guaranteed, in one line each

| Claim the platform does **not** make | Where it says so instead |
| --- | --- |
| The isolation boundary is secure | The sidebar says "Isolation status: see Isolation Center"; the Isolation Center shows `configured_untested` for what it cannot observe |
| The audit log is immutable | "Multi-Store SHA-256 (tamper-evident)" in the app chrome; the threat model's "Explicit non-guarantees" |
| The defence is comprehensive | The Blue Console and the report's limitations block label the pattern detector a *limited* control |
| The policy is secret | The ShadowPolicy results state that the score describes the tested conditions only |
| The model is trustworthy | `validate_model` records its own limitations inline; `execution_mode` distinguishes simulated from local |
| The numbers are impressive | Every metric carries a provenance and a sample size; insufficient data shows "Insufficient observations", never a number |

## Reporting

Suspected vulnerabilities should be reported privately to the team rather
than in a public issue. See `security/README.md`.

# Bayora — residual risk register

Companion to `security/threat-model/README.md`. This document is the
**residual-risk table** §22 requires: threat → current mitigation → test
evidence → remaining risk → next improvement. It is written against the
code as it stands, and every "test evidence" cell names a test that
actually ran in this repository.

**How to read the evidence column.** A cell that says
`configured_untested` means the control exists in `compose.yaml` or
`.env` but no container was run under it in the authoring environment,
because Docker is not installed on this machine. A cell that names a test
means the assertion executed and passed. A cell that says *manual* means
the behaviour was verified by reading the code and exercising it by hand,
with no automated assertion.

**The register is the authoritative list of what is not guaranteed.** The
platform's "Explicit non-guarantees" section in the threat model is the
short version of this table; where the two differ, this table is correct.

---

## RR-1 — A privileged administrator can forge the audit trail

| | |
| --- | --- |
| **Threat** | An administrator with host and signing-key access rewrites the audit chain and recomputes a self-consistent forgery. The chain verifies. The forgery is undetectable by the platform. |
| **Current mitigation** | SHA-256 hash chain (`current_hash = SHA256(canonical_event_without_hashes ‖ prev_hash)`), Ed25519-signed checkpoints over the chain head, a periodic background verifier, and an append-only collector with no update/delete code path. |
| **Test evidence** | `test_audit_hash_generation_and_verification`, `test_audit_detects_tampering` (mutating one field breaks the chain at that sequence), `test_audit_detects_sequence_gap`, `test_audit_hash_chain_and_tamper_demo` (the live demo path: `original.ok = true`, `tampered.ok = false`), `test_evaluation_report_audit_chain_is_actually_verified`. |
| **Remaining risk** | **High.** The trust anchor is the collector's own key, on the same host as the chain it anchors. A party that controls the key can produce a forgery the platform will verify as sound. The chain is *tamper-evident*, not *tamper-proof*, and never described as immutable anywhere in the UI. |
| **Next improvement** | Move the root signing key to an offline root or HSM, publish checkpoints to an append-only external sink (RFC 3161 timestamping or a transparency log), and distribute the public key out of band. |

## RR-2 — Model provenance is self-reported

| | |
| --- | --- |
| **Threat** | A model is registered from an unverified origin, or its weights are swapped after registration. The evaluation's "system under test" is not the system that was evaluated. |
| **Current mitigation** | The registry records display name, adapter, identifier, pinned version, revision, `file_sha256` and `config_hash`. `validate_model` re-hashes the file on disk and compares it to the pinned digest. The gateway is the only component that reaches the model. |
| **Test evidence** | `test_models_registry_and_suites`; `validate_model`'s `file_hash` check is exercised through the model API. |
| **Remaining risk** | **Medium.** The registry attests *which bytes were served*, not *where those bytes came from*. There is no signed SBOM, no reproducible build, no upstream signature check. A successful model load says nothing about trustworthiness. |
| **Next improvement** | Sign the registry entry, record a content hash of the weight files as published, and pin the hash at load time in the gateway. |

## RR-3 — Store separation is a configuration intent, not an enforced runtime boundary

| | |
| --- | --- |
| **Threat** | Compromise of the controller process yields read/write access to all four trust domains, including the ShadowPolicy ground truth and the audit chain. |
| **Current mitigation** | Four separate `DeclarativeBase` metadata objects and four separate database URLs, so there are no cross-store foreign keys. In compose mode the stores are also separated by network segment, and Red is not on the internal bus. |
| **Test evidence** | Schema separation is structural (verified by inspection of `backend/app/db/base.py`); network separation is `configured_untested`; the credential-level separation is **not** enforced — `bootstrap_system()` opens all four stores, and the controller process holds all four URLs. |
| **Remaining risk** | **High.** In dev mode there is one process and four SQLite files. In compose mode there are four processes, but the bootstrap still opens all four stores, and a store left unset falls back to a local SQLite path — which would create a divergent, invisible copy of the data. The compose file therefore pins all four URLs on every Python service, with the unowned stores pointing at private local files. Red receives four local SQLite files and zero Postgres credentials, which is the part that matters most; the controller still holds everything. |
| **Next improvement** | Split the bootstrap per service role so each process opens exactly the one store it owns, and give each service exactly one database URL. |

## RR-4 — The cross-session canary is a single observation, not a proof

| | |
| --- | --- |
| **Threat** | Context, KV-cache or prompt-cache state leaks between evaluation sessions, so the model under test is contaminated by earlier sessions. |
| **Current mitigation** | Every evaluation session carries a distinct `context_namespace` (`ns-{owner_id_prefix}-{session_id_prefix}`). The gateway mediates every generation. The isolation check inspects the recorded sessions and fails if any namespace is reused. The mock adapter has a deliberate negative control (`BAYORA_MOCK_SHARED_CONTEXT_BUG=true`) that leaks a canary on purpose, so the detector can be shown to actually fire. |
| **Test evidence** | `test_cross_session_canary_uses_two_distinct_sessions`; the `cross-session-namespace` isolation check. |
| **Remaining risk** | **Medium.** The canary establishes that *one* observed case did or did not leak. It does not establish complete protection against KV-cache reuse, prompt-cache reuse inside a real model server, or microarchitectural channels, which are not observable from the application layer. |
| **Next improvement** | Expand the canary set to a differential battery, run each case against a clean and a contaminated session, and treat a passing canary as evidence about a specific case rather than as proof of isolation. |

## RR-5 — Docker network segmentation is L3, not L7

| | |
| --- | --- |
| **Threat** | A compromised Red process ignores the service tokens and reaches the model gateway, the policy service or the database directly by IP on a shared bridge segment. |
| **Current mitigation** | `red-service` is on `bayora-eval-net` only — not on `bayora-internal-bus` and not on `bayora-db-net`. All model-facing networks are `internal: true`. Per-service shared tokens are required on every outbound call. |
| **Test evidence** | Topology verified by inspection of `compose.yaml` and by the service→network matrix in `docs/architecture.md`. Runtime enforcement is `configured_untested` — no container ran here. Host firewall rules are documented in `security/network/README.md` as a **manual operator step**, not scripted. |
| **Remaining risk** | **Medium.** Docker networks are an L3 boundary on a shared kernel. `red-service` and `model-gateway` share the `bayora-eval-net` bridge, so IP-level reachability between them exists. An application-level network diagram does not prove firewall enforcement. |
| **Next improvement** | Script the `iptables`/`nftables` rules as an idempotent host provisioner, and move the model gateway onto a separate segment from Red so no shared bridge exists between them. |

## RR-6 — Regex and heuristic filters miss novel jailbreaks

| | |
| --- | --- |
| **Threat** | An attack phrasing that the pattern set does not match reaches the model unimpeded. A "blocked" verdict in a report is read as "this attack would have failed". |
| **Current mitigation** | Input validation and policy evaluation run as a real stage of the pipeline before the model is called; output validation runs after; response normalization and a latency floor reduce what the response shape reveals about the rule that fired. The output carries a public `explanation_code` (`POLICY_DENY`), not the rule pattern or the private `rule_id`. |
| **Test evidence** | `test_policy_input_blocks_override`, `test_policy_input_allows_benign`, `test_policy_input_enforces_size_limit`, `test_policy_output_detects_canary`, `test_policy_output_detects_synthetic_secret_and_key`, `test_policy_response_normalization_hides_category`, `test_policy_pattern_validation_rejects_bad_regex`. |
| **Remaining risk** | **High.** This is a structural property of the defence class, not a bug that will be fixed. The detector is explicitly labelled a *limited* control in the UI and in the report's limitations block. |
| **Next improvement** | Add a local transformer classifier guardrail (for example a Llama-Guard-class model) behind the same policy interface, and keep the pattern layer as the fast first pass. |

## RR-7 — Microarchitectural and cache channels are out of reach

| | |
| --- | --- |
| **Threat** | A timing or cache side channel reveals which internal branch a defence policy took, letting Red infer the rule set from response timing. |
| **Current mitigation** | Response normalization plus an 80 ms latency floor in normalized mode, so the observable latency does not vary with which rule matched. |
| **Test evidence** | `test_policy_response_normalization_hides_category`; the mitigation comparison in `test_mitigation_comparison_is_derived_from_real_rounds` compares latency-derived metrics between two policy versions. |
| **Remaining risk** | **Medium.** The latency floor raises the floor; it does not remove the channel, and an attacker with shared-cache access on the same physical hardware is outside the application's reach. A synthetic canary test cannot establish the absence of such a channel. |
| **Next improvement** | Run the model gateway under gVisor or a microVM (Firecracker) on a dedicated host with no shared cache, and treat the latency floor as defence in depth only. |

## RR-8 — One Docker host is not physical isolation

| | |
| --- | --- |
| **Threat** | A kernel exploit, a Docker daemon compromise, or a container escape crosses every boundary in the diagram at once, because all containers share one kernel. |
| **Current mitigation** | Container hardening is configured: `cap_drop: [ALL]`, `no-new-privileges`, non-root uid, read-only root filesystem, `tmpfs` for every writable path, per-service CPU/memory/pid limits, no Docker socket mount, no host networking, no `privileged`. A seccomp-bpf profile is provided for the model gateway, and a gVisor runtime option is documented. |
| **Test evidence** | **None executed.** Every one of these settings is `configured_untested` in this environment because no container runtime was available. The verification procedure in `docs/deployment.md` §5 checks them one by one with `docker inspect`, and each row states exactly what that check proves. |
| **Remaining risk** | **High.** seccomp and gVisor do not eliminate every kernel, hardware, timing or configuration risk on their own. A denylist seccomp profile blocks the syscalls it names and allows the rest. |
| **Next improvement** | Move each trust domain to a dedicated host or VM. gVisor (`runsc`) is a meaningful interim step for the model gateway because it intercepts every syscall rather than a denylist. |

## RR-9 — A green status is not a security verdict

| | |
| --- | --- |
| **Threat** | An operator reads a healthy container, or a green dashboard card, as proof that the isolation boundary holds, and relies on it. |
| **Current mitigation** | Three separate status vocabularies: audit-chain checks (`verified_pass` / `failed`), isolation checks (`verified_pass` / `failed` / `configured_untested` / `simulated` / `unsupported`), and metric provenance (`measured` / `calculated` / `estimated` / `simulated` / `insufficient`). The app chrome deliberately does **not** say "Sandbox Active" or "Isolation Boundary Enforcement Active" — it says "Isolation status: see Isolation Center". |
| **Test evidence** | `frontend/src/tests/roleNav.test.tsx` asserts the chrome contains no `/Isolation Boundary Enforcement Active/i`, no `/Sandbox Active/i`, no `/100% secure/i`, no `/unhackable/i`, no `/fully immutable/i`. `test_security_status_and_isolation_checks` asserts the check run returns a real mix of statuses. |
| **Remaining risk** | **Low** for the platform's own reporting; **High** for the human factor. The platform can only report what it can observe, and it says "configured" when it cannot observe enforcement. |
| **Next improvement** | Make the "what this did not prove" text a required field on every status card rather than an optional detail panel, so it cannot be collapsed away. |

## RR-10 — The platform scores itself

| | |
| --- | --- |
| **Threat** | A scoring bug or a deliberately mis-weighted metric produces a flattering result that the platform presents as evidence of a strong defence. |
| **Current mitigation** | The ShadowPolicy formulas are documented in the code and in the UI, with numerator and denominator shown per metric. Division by zero yields `n/a` with provenance `insufficient`, never `0`. The mitigation comparison is derived from two real, finalized, verifiable rounds, not from stored numbers. The `auditor` role can read the trail but not write to it. |
| **Test evidence** | `test_shadowpolicy_scoring_formulas`, `test_shadowpolicy_division_by_zero_is_insufficient_not_zero`, `test_shadowpolicy_leakage_score_formula`, `test_mitigation_comparison_is_derived_from_real_rounds`, `test_mitigation_comparison_rounds_are_finalized_and_verifiable`, `test_evaluation_report_metrics_have_provenance`. |
| **Remaining risk** | **Medium.** There is no independent scoring path. The same codebase writes the results and grades them. |
| **Next improvement** | Publish the corpus and the scoring code so an external party can re-run it; add a second, independent implementation of the scorer and cross-check the two. |

## RR-11 — Retained content may itself be sensitive

| | |
| --- | --- |
| **Threat** | Prompts and model outputs retained in the audit store contain material the operator would not want persisted, and the audit store is the most sensitive thing the platform holds. |
| **Current mitigation** | `BAYORA_RETAIN_RAW_PROMPTS` defaults to `true` for the synthetic demo. The collector redacts forbidden payload keys before writing. The audit store is on its own network segment and its own database. |
| **Test evidence** | Redaction behaviour is in the collector implementation; the settings allow-list that exposes the flag is asserted by `test_settings_endpoint_does_not_expose_secrets`. |
| **Remaining risk** | **Medium.** Retention is a deliberate demo default, and the platform does not offer per-field redaction policies or a retention window. |
| **Next improvement** | Default `BAYORA_RETAIN_RAW_PROMPTS=false`, add a configurable retention window with a periodic purge, and give the collector a field-level redaction policy rather than a key denylist. |

## RR-12 — A loaded model is not a trustworthy model

| | |
| --- | --- |
| **Threat** | A model entry is treated as safe because it loaded, was health-checked, or was approved. Approval is an administrative act, not an attestation. |
| **Current mitigation** | `execution_mode` distinguishes `simulated` / `local` / `external` / `none`. The mock adapter is labelled simulated in the registry, in the API response, in the report's `data_provenance` and in the response text itself. `validate_model` records its own limitations inline: it confirms metadata, a pinned version, adapter reachability and the local file hash, and states that it does not attest provenance or safety. The health check reports only what the probe observed. |
| **Test evidence** | `test_models_registry_and_suites`; the `_probe_adapter` path returns `unhealthy` with the observed error when the endpoint is unreachable, and the demo script relies on that behaviour. |
| **Remaining risk** | **Low** for the reporting; **High** for interpretation. Approval remains a human judgement. |
| **Next improvement** | Add an explicit, machine-checkable attestation field to the registry entry, so "approved" means "an attestation exists" rather than "an administrator clicked a button". |

---

## Cross-reference

The threat model (`security/threat-model/README.md` §6) carries the same twelve items as R1–R12. `docs/security-controls.md` maps each implemented control to its test. `docs/requirement-mapping.md` maps the build prompt's §1–§25 requirements to implementation, test and status. `docs/test-report.md` records only the tests that actually ran.

## The one-sentence version

Bayora's controls are implemented, and the ones that could not be verified in this environment are labelled `configured_untested` rather than shown as passing. The register above is the list of what that leaves open.

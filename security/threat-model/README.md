# Bayora — threat model

Scope: the Bayora platform as delivered in this repository — a FastAPI
controller with a React SPA, split into services in `compose.yaml`, backed by
PostgreSQL and a local model server.

Method: STRIDE, applied per trust domain.

Status: this is a design-time threat model written by the implementers. It
has not been through an independent review, and the mitigations listed here
are a mixture of "implemented", "configured" and "planned". Every mitigation
carries its real status. Nothing in this document should be read as a
guarantee.

---

## 1. Assets

| # | Asset | Why it matters | Where it lives |
| --- | --- | --- | --- |
| A1 | Adversarial test cases and probe payloads | Core research output; loss cripples the Red Team workflow | controller store, `test_cases` / `test_suites` |
| A2 | Blue Team defense policies | The private defence knowledge; disclosure lets an attacker tune around it | policy store, `defense_policies` |
| A3 | ShadowPolicy ground truth, nonces, private probe traces | The evaluator's private answer key; disclosure invalidates every evaluation | evaluator store, `shadowpolicy_*` |
| A4 | Audit log and its signed checkpoints | The evidence trail; a tampered trail is worthless as evidence | audit store, `audit_events` / `audit_checkpoints` |
| A5 | Model weights and their provenance | Determines what the system actually evaluates | model volume, `model_registry` / `model_versions` |
| A6 | User credentials and session tokens | Account takeover of the Red / Blue / Auditor accounts | controller store, `users` / `auth_sessions` |
| A7 | Service-to-service shared tokens | A single leaked token lets one service impersonate another on the bus | process environment of the relevant service |
| A8 | The dataset corpus | Research asset; contains synthetic prompts and any imported material | dataset tables, `dataset_sources` / `dataset_import_jobs` |
| A9 | Quarantined artefacts | Raw model outputs from adversarial runs; may contain sensitive text | quarantine directory |
| A10 | The platform's own reputation | Bayora is a security product; a false "safe" verdict is the worst outcome it can produce | the evaluation results themselves |

## 2. Trust boundaries

| # | Boundary | Separates | Mechanism |
| --- | --- | --- | --- |
| TB1 | DMZ edge | Untrusted browser / internet ↔ platform | nginx ingress, CORS allow-list, CSRF header requirement, session cookie, rate limits |
| TB2 | Controller ↔ internal bus | Controller ↔ blue / evaluation / model-gateway | Docker network `bayora-internal-bus`, per-service shared tokens |
| TB3 | Controller ↔ eval segment | Controller ↔ Red harness | Docker network `bayora-eval-net`; Red is excluded from the internal bus |
| TB4 | Writers ↔ audit collector | Services ↔ the evidence store | Docker network `bayora-audit-isolated`; append-only collector with no update/delete path |
| TB5 | Services ↔ database host | Services ↔ PostgreSQL | Docker network `bayora-db-net`; Red has no route and no DB URL |
| TB6 | Gateway ↔ model server | Application ↔ the model | Docker network `bayora-model-link`; the gateway is the only component that talks to the model |
| TB7 | Trust domains inside one process | Controller / policy / evaluator / audit stores | Four separate SQLAlchemy metadata objects and four separate database URLs |
| TB8 | Operator ↔ host | Infrastructure operator ↔ the running system | Host firewall rules, Docker daemon, container runtime |

## 3. Actors

| Actor | Trust level | Capability assumed |
| --- | --- | --- |
| Anonymous internet user | untrusted | Can reach the DMZ ingress, can send arbitrary requests, can attempt login and CSRF |
| Authenticated Red operator | low | Can create suites and run adversarial probes against their own tenant; can try to reach other tenants' data or the Blue engine directly |
| Authenticated Blue operator | medium | Can read and write defense policies; should not read Red's private probe material |
| Auditor | medium-read | Can read the audit trail and verify checkpoints; cannot write |
| Administrator | high | Can manage users, models, datasets; holds all the shared tokens in the controller |
| Infrastructure operator | highest | Full root-equivalent on the host: can read every volume, the Docker socket, and the audit signing key |
| Compromised internal service | untrusted-but-inside | Assumed to have the service's own token and network reachability, and to be running arbitrary attacker-controlled prompt text through the model |
| Malicious model provider / poisoned weights | untrusted | Supplies a model that behaves adversarially or leaks context between sessions |

## 4. Entry points

1. `GET/POST /api/v1/*` on the controller, proxied by the frontend's nginx.
2. The Red Team probe submission path — the single place where fully
   attacker-controlled text enters the system.
3. The dataset import path (`dataset_sources`, `dataset_import_jobs`) —
   accepts externally supplied material.
4. The model response path — output is attacker-influenceable text that
   flows back into the platform and, if `BAYORA_RETAIN_RAW_PROMPTS=true`,
   into the audit store.
5. The `ollama` model server's HTTP API on `bayora-model-link`.
6. The audit checkpoint verification path and the periodic verifier.
7. The container runtime and the Docker daemon on the host.
8. The `postgres` service's TCP port.

## 5. Abuse cases and mitigations

Status legend: **implemented** = code exists in `backend/app` and is
exercised; **configured** = set in `compose.yaml` / `.env` but not verified to
work in this environment; **planned** = not built.

| # | Abuse case (STRIDE) | Mitigation | Status |
| --- | --- | --- | --- |
| M1 | Spoofing — an attacker replays a stolen service token to call an internal service | Per-service shared tokens; each service holds only its own token, so a leak of one token does not yield the others. Controller holds all five by necessity | implemented (token values), but the in-process split is **not yet enforced at runtime** — see residual risks R3 |
| M2 | Spoofing — session theft / fixation | Random session tokens, only a SHA-256 hash stored, server-side revocation, TTL, `HttpOnly`/`SameSite` cookie attributes | implemented |
| M3 | Spoofing — CSRF against a mutating endpoint | Custom `X-Bayora-CSRF: 1` header required on mutating methods; CORS allow-list | implemented |
| M4 | Tampering — an actor rewrites an audit event to hide an abuse | Hash-chained events (`prev_hash` → `hash`) plus Ed25519-signed checkpoints; periodic background verification; no update/delete code path in the collector | implemented, with residual risk R1 |
| M5 | Tampering — an actor edits a defence policy to make the system look safe | Policy store is separated from the controller store; only Blue operators can write policies; every policy version is recorded | implemented (store separation), but the **controller currently holds the policy DB URL too** — see R3 |
| M6 | Tampering — model weights are swapped for a poisoned model | Model registry records version and provenance; the gateway is the only path to the model; weights live on a dedicated volume | implemented (registry), provenance is **self-reported, not attested** — see R2 |
| M7 | Repudiation — an operator denies having run a probe | Audit chain records actor, role, session and trace; a signed checkpoint over the chain head binds the sequence | implemented, with residual risk R1 |
| M8 | Information disclosure — the Red harness learns the Blue engine's policy | Red is not on `bayora-internal-bus` and has no DB URL; only the controller and Blue can read the policy store | configured (network + credentials), **runtime enforcement untested** |
| M9 | Information disclosure — model output leaks context between sessions | The gateway mediates every generation; a cross-session canary is part of the isolation checks | implemented as a canary; the canary **does not prove** the absence of a leak — see R4 |
| M10 | Information disclosure — a prompt or model output exfiltrates to the internet | All model-facing networks are `internal: true`; the only egress-capable components are nginx and the model server | configured, untested |
| M11 | Information disclosure — the model server is used as a generic proxy to reach internal services | The gateway is the only member of `bayora-model-link`; the model server is on no other network | configured |
| M12 | Denial of service — a probe floods the model and exhausts the budget | Per-endpoint rate limits (login, probe, general), `max_probe_budget`, `max_prompt_chars` / `max_output_chars` / `max_request_bytes`, `eval_concurrency`, container CPU/memory/pid limits | implemented (limits), container limits **untested** |
| M13 | Denial of service — a container exhausts the host | `mem_limit`, `cpus`, `pids_limit` per service; separate volumes; `restart: unless-stopped` | configured, untested |
| M14 | Elevation of privilege — a container gains host capabilities | `cap_drop: [ALL]`, `no-new-privileges`, non-root uid, read-only root filesystem, no `privileged`, no host networking, no Docker socket mount | configured, untested |
| M15 | Elevation of privilege — a container writes outside its own directory | Read-only root filesystem; per-service named volumes; `tmpfs` for every writable path; quarantine directory confined to the service's own volume | configured, untested |
| M16 | Repudiation — the audit signing key is used to forge a checkpoint | The key is generated with mode 0600 and lives on a dedicated volume shared only by the controller and the collector | implemented, with residual risk R1 |
| M17 | Spoofing — an attacker supplies a malicious dataset import | Import is disabled by default (`BAYORA_HF_IMPORT_ENABLED=false`, `BAYORA_EXTERNAL_MODELS_ENABLED=false`); host allow-list for external model hosts; provenance metadata is recorded for every source | implemented (default-off), import path **not fully reviewed** |
| M18 | Repudiation — the operator cannot prove what the model actually was | `model_versions` records the served model identity; every execution records the model version used | implemented |

## 6. Residual risks

| # | Residual risk | Severity | Why it is not closed | Mitigation / next step |
| --- | --- | --- | --- | --- |
| R1 | A privileged administrator can rewrite the audit chain and recompute a self-consistent forgery, because the trust anchor is the collector's own key, which lives on the same host | **High** | An independent trust anchor is the only thing that defeats a recomputation attack | Move the root signing key to an offline HSM / offline root, publish checkpoints to an append-only external sink (RFC 3161 timestamping or a transparency log), and distribute the public key out of band. Until then, describe the audit trail as *tamper-evident*, never as *tamper-proof* |
| R2 | Model provenance is self-reported by the model registry | Medium | There is no attestation, no signed SBOM, no reproducible hash of the served weights | Record a content hash of the weight files, sign the registry entry, and pin the hash at load time |
| R3 | The trust-domain separation is a configuration intent, not an enforced runtime boundary: the controller process still holds all four database URLs and bootstraps all four stores | **High** | The per-service split of `backend/app` is not finished | Split the bootstrap per service and give each service exactly one database URL. Until then, a compromise of the controller reaches every store, and the network segmentation is the only remaining boundary |
| R4 | The synthetic canary test can only show that *one* observed cross-session leak did or did not occur | Medium | Canary coverage is a small sample of the behaviour space | Expand the canary set, add differential tests, and treat a passing canary as evidence of a specific case rather than as proof of isolation |
| R5 | The Red harness and the model gateway share an L2 segment, so a Red process that bypasses the token can reach the gateway by IP | Medium | Docker's network layer is not a firewall | Host firewall rules (documented, manual, not automated) and application-level token enforcement on every call |
| R6 | Regex and heuristic prompt filters miss novel jailbreaks | **High** | This is a structural limitation of the defence class, not a bug | Treat the filters as one layer. Rely on the evaluator and the human Blue operator for the cases the filters miss. Do not present a "blocked" verdict as a proof of safety |
| R7 | The synthetic canary / evaluation suite does not establish complete protection against KV-cache or microarchitectural side channels | Medium | Such leakage is not observable from the application layer | Do not claim channel isolation. The gateway's mediation reduces the *opportunity*; it does not eliminate the channel. Real channel-attack resistance needs hardware isolation (dedicated host, no shared cache) |
| R8 | A single Docker host is not physical isolation; all containers share one kernel | **High** | A kernel exploit or a Docker daemon compromise crosses every container boundary | Run on dedicated hosts or VMs per trust domain if the threat model requires it. gVisor (`runsc`) materially reduces the kernel-attack surface for the model gateway |
| R9 | A healthy container is not a secure one | Low | Health checks verify liveness, not posture | The isolation checks in the platform are the compensating control; they report `configured_untested` where they cannot verify a control from inside the container |
| R10 | The evaluation results are self-scored by the same platform being evaluated | Medium | There is no independent scoring path | The auditor role and the signed checkpoint are the compensating controls; an external reviewer re-running the corpus remains the strongest check |
| R11 | Prompt and output content retained in the audit store may itself contain sensitive data | Medium | Retention is a deliberate demo choice (`BAYORA_RETAIN_RAW_PROMPTS=true`) | Set `BAYORA_RETAIN_RAW_PROMPTS=false` for production; the collector already redacts forbidden payload keys |
| R12 | A successful model load says nothing about the model's trustworthiness | Low | Loading is a mechanical operation | Provenance (R2) and evaluation (M18) are the real controls; a loaded model is not a trusted model |

## 7. Explicit non-guarantees

These are stated plainly because the platform is a security product and
over-claiming is the failure mode that matters most here.

- **No claim of complete security is made.** No statement in this repository
  should be read as a guarantee that the platform cannot be compromised.
- **The platform has attack surface.** Any system reachable by a network
  attacker does, and this one has several documented gaps (R1, R3, R5, R6,
  R8).
- **The audit log is tamper-evident, not tamper-proof.** The hash chain and
  the signed checkpoints make undetected modification *detectable*. A
  privileged party holding the signing key can still produce a
  self-consistent forgery (R1).
- **One Docker host is not physical isolation.** Containers share a kernel.
  Host-level compromise crosses every boundary in the diagram.
- **seccomp and gVisor do not eliminate all risk.** The seccomp profile in
  `security/seccomp/` is a denylist: it blocks the syscalls it names and
  allows the rest. gVisor is a stronger control because it intercepts every
  syscall, but neither is a proof of isolation.
- **Regex filters miss jailbreaks.** A blocked verdict means the filter
  matched, not that the attack would have failed.
- **Synthetic canary tests do not establish complete KV-cache or
  microarchitectural protection.** They establish that a specific, observed
  case behaved as expected.
- **A health check is not a security control.** It proves the process is
  answering, nothing more.
- **A successful model load is not a statement about model trustworthiness.**
  It means the weights were readable, not that they are safe or authentic.
- **An application-level network diagram is not firewall enforcement.** Docker
  networks are an L3 boundary on a shared kernel. See
  `security/network/README.md`.

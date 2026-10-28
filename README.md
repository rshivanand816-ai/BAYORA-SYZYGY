# BAYORA — Securing Adversarial AI Safety Testing Infrastructure



LOGIN PASSWOPRDS---
ADMIN  ->   username- admin
             Password-> admin-pass
RED    -> username - red
          Password  -> red-pass






### Hack in Hills ’26 | Problem Statement 04 | Team SYZYGY

**Securing the Integrity of Adversarial AI Testing**
Developed by **Team SYZYGY** — Shivanand Rai, Tanish Jain, Aashish Bodal.

---

## 1. Executive Summary & Problem Statement

**Challenge Statement:** *"Securing Adversarial AI Safety Testing Infrastructure"* (Hack in Hills ’26, PS-04).

Adversarial AI safety evaluations require adversarial testers (Red Team), defense engineers (Blue Team), and target language models to interact within a shared infrastructure. In ordinary platforms, this creates severe trust-boundary failures:

1. Defenders can observe active adversarial payloads and adapt defenses prematurely, invalidating benchmarks.
2. Adversaries can inspect or infer hidden defensive guardrails, allowing them to evade filters.
3. The model under test can suffer cross-session memory contamination from adversarial prompts.
4. Findings can be invalidated by environmental leakage or audit log tampering.

**BAYORA** is an adversarial AI safety harness built around a multi-boundary architecture that separates adversaries, defenders, target models, and evaluators, while producing verifiable cryptographic evidence of testing outcomes.

**What the platform claims, and what it does not.** Every number in the interface is produced by the running system, and every claim it cannot verify is labelled. A control that is configured but not observed is reported as `configured_untested`, not as a green check. The audit trail is described as **tamper-evident**, never as immutable. The strings *"100% secure"*, *"unhackable"* and *"fully immutable"* appear nowhere in this repository, and a frontend test asserts their absence from the app chrome.

---

## 2. The Four Principal Isolation Boundaries

```
                      +-----------------------+
                      |   REACT SPA FRONTEND  |
                      +-----------+-----------+
                                  |
                                  v
                      +-----------------------+
                      |   BAYORA CONTROLLER   |
                      |  (Strict RBAC & CSRF) |
                      +----+-------------+----+
                           |             |
         +-----------------+             +-----------------+
         v                                                 v
+------------------+                             +--------------------+
|   RED SERVICE    |                             | BLUE POLICY ENGINE |
| (Blind Probing)  |                             | (Regex, Heuristics)|
+--------+---------+                             +---------+----------+
         |                                                 |
         +-----------------> EVALUATION <------------------+
                                HARNESS
                                   |
                                   v
                         +-------------------+
                         |   MODEL GATEWAY   |
                         | (Sandbox Adapter) |
                         +---------+---------+
                                   |
                                   v
                         +-------------------+
                         |    TARGET LLM     |
                         | (Isolated Memory) |
                         +-------------------+
                                   |
                                   v
                         +-------------------+
                         |  AUDIT COLLECTOR  |
                         | (SHA-256 Ledger)  |
                         +-------------------+
```

1. **Red Payload Confidentiality** — ongoing adversarial test prompts and test suites are withheld from Blue Team until the evaluation concludes. Enforced by API authorization, not by UI hiding alone.
2. **Blue Policy Confidentiality** — the defence engine's rule patterns, private rule IDs and thresholds are never exposed to Red Team tooling or response bodies; a decision returns a public `explanation_code` such as `POLICY_DENY`, not the pattern that fired.
3. **Target Model Context Isolation** — the model gateway isolates session memory contexts by namespace, and the isolation check inspects the recorded sessions for namespace reuse.
4. **Tamper-Evident Auditability** — every evaluation event, probe and policy decision is appended to a SHA-256 hash chain, periodically checkpointed with an Ed25519 signature.

The full component diagram, the service→network→database matrix, the sequence diagram and the trust-boundary table are in [`docs/architecture.md`](docs/architecture.md).

---

## 3. Flagship Innovation: ShadowPolicy

**ShadowPolicy — Blind Policy-Leakage Evaluation** measures whether an adversary can infer a defence policy from permitted observations alone (response text, response class, latency).

### Protocol (`bayora-sp-commit-v1`)

1. **Cryptographic commitment.** Before any probe, the evaluator commits to a set of synthetic policy facts:
   `Commitment = SHA256(CanonicalJSON(sorted_facts) ‖ nonce)`, with a 32-byte random nonce. The facts and the nonce live **only** in the evaluator's store. The encoding is exactly `json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")`, so fact ordering cannot change the digest.
2. **Blind probing.** The Red operator submits probes within a strict budget. The round-detail response contains the commitment, the observations and the guesses — and no facts and no nonce.
3. **Irreversible guess locking.** Guesses are sealed before any ground truth is revealed; a second attempt returns `409`.
4. **Revelation, verification and scoring.** After finalization the facts and the nonce are revealed and `POST /rounds/{id}/verify-commitment` recomputes the digest and compares it with the published one.
5. **Mitigation comparison.** Two real, finalized, verifiable rounds over the same subject set and probe script — one pinned to policy v1, one to v2 — are compared. The numbers are read back out of the recorded rounds, not from a stored baseline.

### Scoring formulas

| Metric | Formula | Division by zero |
| --- | --- | --- |
| Inference coverage | correctly inferred hidden facts ÷ total hidden facts | `n/a`, provenance `insufficient` |
| Precision | correct inferred facts ÷ all submitted positive guesses | `n/a`, provenance `insufficient` |
| Recall | correct inferred facts ÷ hidden facts successfully represented as inferable targets | `n/a`, provenance `insufficient` |

A zero denominator yields `n/a` with provenance `insufficient` — **never `0`**, because 0 is a measurement and nothing was measured.

### The limitation the platform states itself

The leakage score describes *the subjects probed, the probe script used, and this round's observation mode*. It does not establish that the remaining hidden information is uninferrable. A high score means Red did well against this script; a low score does not mean the policy is secret. This appears in the results' `limitations` array, in the API response, and in the demo script.

---

## 4. Architecture & Technology Stack

### Backend — Python 3.11+ / FastAPI

- **Multi-store separation by trust domain.** Four separate SQLAlchemy `DeclarativeBase` stores with four separate database URLs. Cross-store references are plain string IDs; there are deliberately **no cross-database foreign keys**.

  | Store | Holds |
  | --- | --- |
  | `bayora_controller` | users, roles, sessions, model registry, suites, cases, evaluation sessions, executions, findings, dataset sources and imports, isolation checks, resource metrics |
  | `bayora_policy` | defence policies and their immutable versions |
  | `bayora_evaluator` | ShadowPolicy hidden facts, nonces, private probe traces |
  | `bayora_audit` | the append-only hash-chained audit log and its signed checkpoints |

- **Security primitives.** scrypt password hashing (stdlib, N=2¹⁴, r=8, p=1), `hmac.compare_digest` for constant-time comparison, SHA-256-hashed session tokens in an `HttpOnly` `SameSite=lax` cookie, and CSRF via a required `X-Bayora-CSRF: 1` header on every mutating request.
- **Audit chain.** `current_hash = SHA256(canonical_event_without_hashes ‖ prev_hash_hex)`, genesis `prev_hash = "0" * 64`. Append-only: the collector has no update or delete code path.
- **Model gateway.** Three adapters: `mock` (deterministic, **labelled simulated**), `ollama` (a real local HTTP call, with an explicit `[SIMULATED FALLBACK: …]` prefix if the daemon is unreachable), and `openai_compatible` (disabled by default, gated by a host allow-list *and* a per-model consent record).

### Frontend — React 18 / TypeScript / Vite

- **Tailwind CSS v4** dark security-lab theme: `#0B1020` background, `#141C2E` surface, `#44D7F2` cyan, `#5599FF` blue, `#FF626F` red, `#52D6A0` emerald, `#F1BF62` amber, `#E5EAF2` text.
- **TanStack Query** for caching, **React Hook Form + Zod** for validation, **Recharts** for charts, **lucide-react** for icons.
- **Honesty telemetry.** Every metric carries a provenance badge (`measured`, `calculated`, `estimated`, `simulated`, `insufficient`); every isolation check carries one of five statuses (`verified_pass`, `failed`, `configured_untested`, `simulated`, `unsupported`). Insufficient data renders **"Insufficient observations"**, never a number.
- **Role-aware navigation.** The nav is filtered per role, and every route is wrapped in `RequireRole`. The route guard is a *UX* control — the API is the authoritative boundary, and a denied request is recorded as an `authz.denied` security event.

### Deployment — Docker Compose

Nine services, seven networks, nine named volumes. Four networks are `internal: true`; the only egress-capable components are the nginx ingress and the optional model server's weight-download network. Every service runs with `cap_drop: [ALL]`, `no-new-privileges`, a non-root uid, a read-only root filesystem, `tmpfs` for every writable path, and CPU / memory / pid limits. No service mounts the Docker socket; no service uses host networking; no service is `privileged`.

See [`compose.yaml`](compose.yaml) and [`security/network/README.md`](security/network/README.md).

---

## 5. Quick Start

### Option A — dev mode (no Docker)

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
# Frontend, in a second terminal
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` to `http://127.0.0.1:8000`, so the SPA and the API share an origin and the CSRF header requirement still applies. The controller seeds the schema, the demo users, the synthetic dataset sources and two defence policy versions on first start. No model is downloaded and no API key is needed — the default adapter is the deterministic mock.

### Option B — Docker Compose (the intended deployment)

```bash
cp .env.example .env            # Windows: copy .env.example .env
# Replace every change-me-* placeholder. Then:
docker compose up --build
```

- SPA: **http://localhost:8080**
- API controller: `http://127.0.0.1:8000` (loopback only; the browser path is the frontend's `/api/` reverse proxy)
- Health: `http://127.0.0.1:8000/api/v1/health`

Compose aborts with a clear message if a required variable is missing, so a half-filled `.env` fails loudly rather than silently falling back to a default secret. See [`docs/deployment.md`](docs/deployment.md) for secret creation, rotation, and a 10-step post-deployment verification procedure.

---

## 6. Demo accounts and RBAC roles

The system seeds five demo accounts. **The passwords are not in the browser bundle** — the login page's role buttons fill the *username* only, and the page tells you where the password lives.

| Role | Username | Default password (dev only) | What it can reach |
| :--- | :--- | :--- | :--- |
| Administrator | `admin` | `admin-pass` | Everything: users, models, datasets, settings, policy review |
| Red Team | `red` | `red-pass` | Red Workbench, probe submission, ShadowPolicy guessing |
| Red Team 2 | `red2` | `red2-pass` | A second Red operator, for multi-tenant isolation tests |
| Blue Team | `blue` | `blue-pass` | Blue Console, policy versions, mitigation comparisons |
| Auditor | `auditor` | `auditor-pass` | Audit Explorer, chain verification, checkpoints, Isolation Center |

Set `BAYORA_DEMO_ADMIN_PASSWORD`, `BAYORA_DEMO_RED_PASSWORD`, `BAYORA_DEMO_RED2_PASSWORD`, `BAYORA_DEMO_BLUE_PASSWORD` and `BAYORA_DEMO_AUDITOR_PASSWORD` in `.env` to override them, and set `BAYORA_SEED_DEMO_USERS=false` for a real deployment so no demo account is created at all.

**These defaults are development-only.** They are replaced by the `.env` values in any compose deployment, because `.env.example` marks them as required.

---

## 7. Automated tests

```bash
# Backend — 55 tests
cd backend
.venv/Scripts/python.exe -m pytest tests/ -q     # Windows
.venv/bin/python -m pytest tests/ -q             # POSIX

# Frontend — 16 tests
cd frontend
npx vitest run
```

**Current state: 55 backend tests passed, 16 frontend tests passed, 0 failed, 0 skipped.** The full breakdown — what each test actually asserts, and the long list of what was *not* tested — is in [`docs/test-report.md`](docs/test-report.md).

The compose deployment path is **`configured_untested`**: Docker was not installed in the authoring environment, so no image was built, no container was started and no healthcheck ran. The verification procedure that would close this is in `docs/deployment.md` §5.

---

## 8. Documentation index

| Document | Contents |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | Component diagram, service topology table, network-membership table, sequence diagram, trust boundaries, how the platform reports its own status |
| [`docs/api.md`](docs/api.md) | The `/api/v1` surface, error codes, and the frontend route-role table |
| [`docs/deployment.md`](docs/deployment.md) | Compose and dev mode, secrets, health checks, migrations, the 10-step verification procedure, and what it does *not* prove |
| [`docs/model-adapter-guide.md`](docs/model-adapter-guide.md) | The adapter contract, the three adapters, what each proves and does not prove, how to add one |
| [`docs/dataset-import-guide.md`](docs/dataset-import-guide.md) | The importer, the record schema, the `available` vs `not_integrated` catalogue, and five limitations |
| [`docs/security-controls.md`](docs/security-controls.md) | The twelve §22 threats → implementation → test → status, and the explicit non-guarantees |
| [`docs/residual-risks.md`](docs/residual-risks.md) | The residual-risk table: threat → mitigation → test evidence → remaining risk → next improvement |
| [`docs/requirement-mapping.md`](docs/requirement-mapping.md) | §1–§25 requirement → implementation → test → status |
| [`docs/test-report.md`](docs/test-report.md) | What actually ran, what did not, and the threats with and without test evidence |
| [`docs/demo-script.md`](docs/demo-script.md) | The 9-step, 5–7 minute judge demo, with the exact narration and the three lines not to cut |
| [`security/threat-model/README.md`](security/threat-model/README.md) | STRIDE: assets, trust boundaries, actors, entry points, 18 abuse cases, 12 residual risks, explicit non-guarantees |
| [`security/network/README.md`](security/network/README.md) | The segmentation model, the allowed/denied flow matrix, and the host firewall rules an operator must apply by hand |
| [`security/seccomp/bayora-model-gateway.json`](security/seccomp/bayora-model-gateway.json) | The seccomp-bpf denylist profile for the model gateway — `configured_untested` |

### Documentation status convention

Every deliverable distinguishes four states, and uses the same words the UI uses:

| Label | Meaning |
| --- | --- |
| **implemented and tested** | Code exists, is exercised, and a named test asserts it |
| **implemented but not yet tested** | Code exists and is exercised; no automated test asserts this specific property |
| **simulated** | The behaviour is deliberately reproduced, and the platform labels it as such everywhere it appears |
| **planned** | Not built |

---

## 9. Implementation decisions

Recorded here because §25 asks for reasonable decisions to be written down rather than left implicit.

1. **The mock model is the default, and it is labelled `simulated` everywhere.** `execution_mode`, the registry entry, the API response, the report's `data_provenance` and the response text itself all say so. The mock proves the *platform* works; it proves nothing about any language model.
2. **The `openai_compatible` adapter's consent machinery is real, but its outbound call is not implemented.** The two gates (env flag + host allow-list, and a per-model consent record), the refusal string and the audit event are all real and exercised. The call returns a labelled `[EXTERNAL MOCK RESPONSE from …]`. Treat every result from that adapter as simulated.
3. **Four stores, four URLs, no cross-store foreign keys.** The separation is by trust domain, not by deployment convenience, and it holds in dev mode too.
4. **The controller process holds all four database URLs.** The bootstrap opens all four stores, so a controller compromise reaches every store. This is residual risk **R3** (High) and is the top item on the "next engineering tasks" list. Red is the exception that matters most: it receives four local SQLite files and zero Postgres credentials.
5. **Guesses and the commitment are locked in transactions.** A second guess submission returns `409`; the commitment is recomputed and compared after revelation.
6. **The audit trail is described as tamper-evident, everywhere.** The trust anchor is the collector's own key on the same host, so a privileged administrator can produce a self-consistent forgery. That is residual risk **R1** (High), and the wording in the code, the UI and the demo script reflects it.
7. **The sidebar does not claim isolation is active.** It says "Isolation status: see Isolation Center". A green card in this product means "this specific thing was observed", never "the boundary holds".
8. **The pattern-based detector is labelled a *limited* control.** A "blocked" verdict means the filter matched, not that the attack would have failed against a real model.
9. **External dataset corpora are registered as `not_integrated`.** AdvBench, JailbreakBench, HarmBench, ToxiGen, Gandalf/Lakera, NVD/CVE, DARPA Transparent Computing and Anthropic HH-RLHF are catalogue references with their upstream URLs and licence notes. The importer is functional and tested; the corpora themselves are not bundled, and the catalogue says so. The three bundled corpora are `available`.
10. **The `BAYORA_MOCK_SHARED_CONTEXT_BUG` flag is a negative control.** It makes the mock leak a canary on purpose, so the cross-session detector can be shown to actually fire. It is off by default, and the demo script says to turn it off and restart the controller immediately after using it.

---

## 10. Known limitations and the next engineering tasks

Full detail: [`docs/residual-risks.md`](docs/residual-risks.md). The open items, in priority order:

1. **Split the bootstrap per service role** so each process opens exactly one store and holds exactly one database URL. Closes R3.
2. **Introduce an independent trust anchor for the audit trail** — an offline root, an HSM, or a transparency log — and publish checkpoints out of band. Closes R1.
3. **Run the compose deployment** on a Docker host and execute the 10-step verification procedure, then move every `configured_untested` control to a measured status. Closes the largest unverified block.
4. **Script the host firewall rules** as an idempotent provisioner instead of a manual operator step.
5. **Add a local transformer classifier guardrail** behind the same policy interface, so the pattern layer is one layer of two rather than the only one. Addresses R6.
6. **Add a second, independent implementation of the ShadowPolicy scorer** and cross-check the two outputs. Addresses R10.
7. **Write the remaining frontend specs** — model registration, evaluation creation, probe submission, guess locking, results, audit verification, validation errors and API failure states — and a Playwright end-to-end path.
8. **Default `BAYORA_RETAIN_RAW_PROMPTS=false`** and add a retention window with a periodic purge. Addresses R11.

---

## 11. License & attribution

MIT — see [`LICENSE`](LICENSE). Developed for **Hack in Hills ’26** by Team **SYZYGY** (Shivanand Rai, Tanish Jain, Aashish Bodal).

The bundled synthetic dataset is MIT-licensed and documented in
[`datasets/synthetic/PROVENANCE.md`](datasets/synthetic/PROVENANCE.md), which also states which external corpora are **not** integrated.

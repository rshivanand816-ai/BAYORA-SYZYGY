# Bayora — deployment guide

Covers the two supported deployment shapes: **compose mode** (the intended
shape, nine containers) and **dev mode** (one Python process + one Vite dev
server, SQLite stores, mock model).

Everything below was written against the repository as it stands. Where a
step could not be executed in the authoring environment, the document says
so and marks the step **unverified** rather than claiming success.

---

## 1. Prerequisites

| Requirement | Version | Needed for |
| --- | --- | --- |
| Docker Engine + Compose v2 | 24.0+ / v2.20+ | compose mode |
| Python | 3.11+ (3.12 recommended) | dev mode, running the tests |
| Node.js | 20+ | frontend dev server and build |
| `openssl` or Python's `secrets` | any | generating local secrets |

No external API key is required for the basic demo. The default model
adapter is `mock`, which is deterministic and **labelled simulated**
everywhere it appears.

## 2. Compose mode (intended deployment)

### 2.1 Prepare configuration

```sh
git clone <this repository> bayora
cd bayora
cp .env.example .env
```

`.env.example` contains placeholders only. Replace every `change-me-*`
value. `docker compose` marks the service tokens, the database password
and the demo passwords as **required** (`:?` syntax), so a half-filled
`.env` aborts the startup with a clear message rather than silently
falling back to a default.

Generate strong values:

```sh
openssl rand -hex 32            # for each of the 5 service tokens
openssl rand -hex 32            # for the postgres password
```

### 2.2 Start the stack

```sh
docker compose up --build
```

Startup order is enforced by `depends_on` with `condition: service_healthy`:
`postgres` → `api-controller` → `frontend`. The controller bootstraps the
schema, seeds the demo users, the synthetic dataset sources and the two
defence policy versions on first start.

The SPA is on **<http://localhost:8080>**. The controller's own port is
bound to `127.0.0.1:8000` only, so it is reachable from the host but not
from another machine.

### 2.3 Health checks

Every service except the frontend and `ollama` declares a `HEALTHCHECK`.
The controller's is:

```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8000/health || exit 1"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 20s
```

`GET /api/v1/health` returns `{"status", "service"}` and **nothing else** —
no environment dump, no configuration, no secrets. A health check proves
the process is answering; it is not a security control and it does not
assert that isolation is in force.

```sh
curl -fsS http://127.0.0.1:8000/api/v1/health
docker compose ps        # every service should read "healthy"
```

### 2.4 Meaningful startup failures

The stack fails loudly rather than half-starting:

- A missing required variable in `.env` → compose aborts with
  `BAYORA_... must be set in .env`.
- A database that does not come up → the controller never becomes healthy,
  and `depends_on: condition: service_healthy` keeps `frontend` down.
- A model registry entry that fails validation → the entry is recorded with
  `status="validation_failed"` and `runnable=false`; it is not silently
  marked usable.
- An upload that is not a supported model format → the file is moved to the
  quarantine directory and the entry records the rejection reason.

### 2.5 Local secret creation and rotation

**Service tokens.** Each service holds only its own token; the controller
holds all five because it is the only component that calls every other
component. To rotate:

```sh
# 1. Generate the new value
openssl rand -hex 32

# 2. Edit .env — change BAYORA_SERVICE_TOKEN_BLUE, for example.

# 3. Recreate only the affected services
docker compose up -d --force-recreate blue-policy-service api-controller
```

Because every service reads its token from the environment at start time,
rotating is a recreate, not a hot reload. There is no runtime secret
fetch, and no secret is written to a shared filesystem.

**Audit signing key.** The Ed25519 checkpoint key lives at
`BAYORA_AUDIT_SIGNING_KEY_PATH` on the `bayora_audit_keys` volume and is
created with mode `0600` on first use. It is the trust anchor for the
signed checkpoints, so:

- **Back it up** before you need it. Losing it means existing checkpoints
  can no longer be verified against the anchor.
- **Rotating it invalidates verification of every checkpoint signed with
  the old key.** The old checkpoints remain in the store and still verify
  against the *chain*, but their signature check will fail against the new
  key. Rotate only with a documented reason, and record the rotation in the
  audit trail.

**Demo passwords.** Set `BAYORA_DEMO_*_PASSWORD` before the first start.
For a real deployment set `BAYORA_SEED_DEMO_USERS=false` so no demo
account is created at all, and provision real users through
`POST /api/v1/admin/users`.

### 2.6 Windows / Linux / macOS notes

| Platform | Notes |
| --- | --- |
| Linux | The reference platform. All commands work as written. |
| macOS | Docker Desktop runs the engine in a Linux VM; `internal: true` networks behave as documented. Resource limits (`cpus`, `mem_limit`) are enforced by the VM. |
| Windows | Docker Desktop with WSL 2 backend. **Bind mounts are not used for application data** — the compose file uses named volumes, so the WSL filesystem is not involved and the performance caveat disappears. `deploy/` scripts are POSIX `sh`; run them inside a container or WSL. |

The dev mode below works identically on all three.

## 3. Dev mode (no Docker)

Useful for iterating on the code. It uses SQLite for all four stores and
the mock model, so nothing is downloaded and no key is needed.

```sh
# Backend
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt -r requirements-dev.txt   # Windows
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
# POSIX: .venv/bin/python -m uvicorn app.main:app --reload --port 8000

# Frontend, in a second terminal
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Vite proxies `/api` to `http://127.0.0.1:8000` (see
`frontend/vite.config.ts`), so the SPA talks to the same origin and the
CSRF header requirement still applies.

### 3.1 The four stores in dev mode

By default the dev database URLs are SQLite files under `backend/data/`:

| Store | Dev file | What lives there |
| --- | --- | --- |
| controller | `bayora_controller.db` | users, roles, sessions, model registry, suites, cases, evaluation sessions, executions, findings, dataset sources and imports, isolation checks, resource metrics, ShadowPolicy round metadata |
| policy | `bayora_policy.db` | defence policies and their immutable versions |
| evaluator | `bayora_evaluator.db` | ShadowPolicy hidden facts, nonces, private probe traces |
| audit | `bayora_audit.db` | the append-only hash-chained audit log and its checkpoints |

The four stores are **not** merged into one database in dev mode either.
The separation is by trust domain, not by deployment convenience.

> **Dev-mode limitation.** The dev process is a single Python process that
> bootstraps all four stores. The *store* separation is real; the *process*
> separation is not. See residual risk **R3** in
> `security/threat-model/README.md`.

### 3.2 Mock model mode

The `mock` adapter is the default and requires no download. It is
deterministic: the same prompt produces the same output, and every response
that comes from it is flagged `simulated=true` in the API. The adapter
never pretends to be a real model — the simulation is visible in the
response shape, in the `execution_mode` field (`"simulated"`) and in the
`data_provenance` field of the dashboard summary.

To use a real local model instead:

```sh
docker compose up -d ollama
ollama pull llama3.2:3b
```

Then register it in the Model Registry with adapter `ollama` and identifier
`llama3.2:3b`. If the Ollama daemon is not reachable, the adapter falls
back with an explicit `[SIMULATED FALLBACK: ...]` prefix in the response
text — it does not silently pretend the call succeeded.

### 3.3 External model adapters

Disabled by default. To enable:

1. Set `BAYORA_EXTERNAL_MODELS_ENABLED=true` and list the permitted hosts
   in `BAYORA_EXTERNAL_HOST_ALLOWLIST`.
2. Register the model with adapter `openai_compatible`.
3. Call `POST /api/v1/models/{id}/enable-external` with
   `{"consent": true, "acknowledgement": "<text>"}`.

Until step 3 succeeds, the adapter refuses the call and returns
*"External model execution blocked: User has not granted external data
transmission consent for this model."* The API key is read from the
server-side environment; it is never sent to the browser and never placed
inside a model prompt.

## 4. Migrations

Alembic lives in `backend/migrations/`.

```sh
cd backend
alembic -c migrations/alembic.ini upgrade head
```

In compose mode the controller bootstraps the schema with `create_all()` on
first start, so migrations are not required for a fresh demo. They are
required when upgrading an existing deployment, because `create_all` only
creates missing tables — it does not alter existing ones.

## 5. Verification procedure after deployment

Run these in order. Each is a real check with a real observable result; none
of them is a claim about isolation.

| # | Command | Expected | What it actually proves |
| --- | --- | --- | --- |
| 1 | `curl -fsS http://127.0.0.1:8000/api/v1/health` | `{"status":"ok",...}` | the controller process is answering |
| 2 | `docker compose ps` | every service `healthy` | each container's own liveness probe passes |
| 3 | Log in as `red`, open **Blue Console** | "Not authorized for this console" | the SPA's role guard works |
| 4 | `GET /api/v1/blue/policies` as `red` | `403` | the API enforces the boundary, and an `authz.denied` event is written |
| 5 | `POST /api/v1/audit/verify` as `auditor` | `ok: true`, `checked > 0` | the hash chain verifies over the events actually stored |
| 6 | `POST /api/v1/security/isolation-checks/run` as `auditor` | a mix of `verified_pass` and `configured_untested` | which controls the platform could actually verify from inside the container, and which it could not |
| 7 | `docker compose exec api-controller id` | a non-zero uid (10001) | the container runs as a non-root user |
| 8 | `docker inspect $(docker compose ps -q red-service) --format '{{.HostConfig.CapDrop}}'` | `ALL` | capabilities were dropped at container start |
| 9 | `docker inspect $(docker compose ps -q red-service) --format '{{json .NetworkSettings.Networks}}'` | `bayora-eval-net` only | the Red container is not on the internal bus |
| 10 | `docker inspect $(docker compose ps -q red-service) --format '{{.HostConfig.ReadonlyRootfs}}'` | `true` | the root filesystem is read-only |

Step 6 is the one that matters most for honesty: it reports
`configured_untested` for the controls the platform cannot verify from the
inside (seccomp profile enforcement, container CPU/memory limits, network
egress denial). That is the correct answer, not a failure.

## 6. What is *not* verified by this procedure

- That the host firewall rules in `security/network/README.md` are applied.
  They are manual operator steps and are not scripted.
- That the seccomp profile in `security/seccomp/` behaves as intended
  under load. It was authored and reviewed by hand; no container has run
  under it in the authoring environment.
- That the four stores are isolated at the *credential* level. They are
  isolated by database and by network segment, but the controller process
  currently holds all four database URLs (residual risk **R3**).
- Any property of the model itself. A model that loads is not a model that
  is trustworthy or authentic.

# Bayora — architecture documentation

This document describes the deployed stack: its services, their network
membership, their trust boundaries, and the sequence of a full evaluation.
It is written for an operator setting up the platform, not for implementers
who need the codebase reference. The codebase is in
`backend/app/<layer>/service.py`.

## 1. Component diagram

```mermaid
flowchart TB
    subgraph DMZ["DMZ — public reachable"]
        web[nginx SPA on port 8080]
    end
    subgraph CONTROLLER["Controller store (api-controller)"]
        AC[FastAPI app / api-controller]
        SVC[admin service]
    end
    subgraph BUS["internal-bus (internal: true)"]
        BLUE[blue-policy service]
        EVAL[evaluation-service]
        GW[model-gateway]
    end
    subgraph EVAL["eval-net (internal: true)"]
        RED[red-service / Red harness]
        OWL[ollama model server]
    end
    subgraph AUDIT["audit-isolated (internal: true)"]
        AUDIT[audit-collector]
    end
    subgraph DB["postgres"]
        PG[postgres service]
    end

    DMZ --> AC
    blue["blue + admin endpoints live here"] --> BLUE
    eval["evaluation + shadowpolicy endpoints live here"] --> EVAL
    caller["a user or a probe callback reaches here"] --> RED

    BLUE -.->|policy evaluation request| GW
    GW -.->|filtered prompt dispatch| OWL
    BLUE -.->|read policies| PG
    EVAL -.->|read ground truth| PG
    EVAL -.->|append events| AUDIT
    GW -.->|read config / upload weights| PG
    AUDIT -.->|read nothing outbound; anchor only| PG
    RED -.->|submit probes / read observations| AGW

    style DMZ fill:#14233C,stroke:#44D7F2,color:#E5EAF2
    style CONTROLLER fill:#14233C,stroke:#5599FF,color:#E5EAF2
    style BUS fill:#14233C,stroke:#FF626F,color:#E5EAF2
    style EVAL fill:#14233C,stroke:#52D6A0,color:#E5EAF2
    style AUDIT fill:#14233C,stroke:#F1BF62,color:#E5EAF2
    style DB fill:#0E1524,stroke:#8FA0BE,color:#E5EAF2
```

`AGW` is not a literal container name here — in compose mode it is
the controller's local adapter execution path (`backend/app/models_gateway/`).
The diagram shows the *intent* of each hop, not every function call
within a process. A single authoring pass crosses it twice once
hardening is verified.

## 2. Service topology

| Service | Process root / network | DB | Writes to | Read from |
| --- | --- | --- | --- | --- |
| frontend nginx | `frontend`, `bayora-dmz` | none | static SPA | — |
| api-controller | `api-controller`, `bayora-dmz` | `controller` store, shared `postgres` | users, models, suites, audit orchestration, dataset import, isolation checks, ShadowPolicy scoring, dashboard | audit chain input |
| blue-policy-service | `blue-policy-service`, `bayora-internal-bus` + `bayora-db-net` | `policy` store | defense_policies, defense_policy_versions, policy_decisions, security_findings | nothing outbound |
| evaluation-service | `evaluation-service`, `bayora-internal-bus` + `bayora-eval-net` + `bayora-db-net` | `evaluator` store | shadowpolicy_*, isolation_checks, resource_metrics | audit events |
| red-service | `red-service`, `bayora-eval-net` only | none at runtime | probes are recorded by the controller | audit events |
| model-gateway | `model-gateway`, `bayora-internal-bus` + `bayora-eval-net` + `bayora-db-net` | `controller` (weights, provenance) | model_registry updates, model versions | postgres |
| audit-collector | `audit-collector`, `bayora-internal-bus` + `bayora-audit-isolated` + `bayora-db-net` | `audit` store | audit_events append | postgres |
| ollama | `ollama`, `bayora-model-link` + `bayora-model-egress` | none | none | — |
| postgres | `postgres`, `bayora-db-net` | host `pgdata` volume | none | — |

## 3. Network membership in `compose.yaml`

Membership is driven by the per-service `networks:` block. The membership
table is authoritative for compose-mode verification; each service
enforces its own token on every outbound HTTP call in `backend/app` as the
runtime-enforcement check noted in `security/network/README.md`.

| Service | Networks joined | Internal |
| --- | --- | --- |
| frontend | bayora-dmz | false |
| api-controller | bayora-dmz, bayora-internal-bus, bayora-eval-net, bayora-audit-isolated, bayora-db-net | false (public) |
| red-service | bayora-eval-net | true |
| blue-policy-service | bayora-internal-bus, bayora-db-net | true |
| model-gateway | bayora-internal-bus, bayora-eval-net, bayora-db-net | true |
| evaluation-service | bayora-internal-bus, bayora-eval-net, bayora-db-net | true |
| audit-collector | bayora-internal-bus, bayora-audit-isolated, bayora-db-net | true |
| ollama | bayora-model-link, bayora-model-egress | true |
| postgres | bayora-db-net | true |

## 4. Sequence diagram — one full adversarial evaluation

```mermaid
sequenceDiagram
    participant U as Frontend
    participant C as api-controller
    participant B as blue-policy-service
    participant R as red-service
    participant E as evaluation-service
    participant M as model-gateway
    participant A as audit-collector
    participant DB as postgres

    U->>C: POST /evaluations (probe-budget=N, eval_type=automated_suite)
    Note over C,R: Controller creates EvaluationSession; C enforces RBAC
    C->>DB: insert EvaluationSession
    U-->>C: {session_id}

    U->>C: POST /evaluations/{id}/start
    C->>B: GET /policies/{version} (Blue reads own policy)
    B->>DB: read policy (private store, controller has no access)
    C->>C: Evaluate input via B's engine
    C->>M: POST /models/{id}/execute {prompt, context_namespace, canary}
    M->>O: ollama /api/generate (gateway is the only model contact)
    O-->>M: output text + latency
    M->>C: response + lat + simulated flag
    C->>DB: record PolicyDecision

    U->>C: POST /evaluations/{id}/probes (one per case)
    Note over C: Controller runs ProbeResult fixture; audits every decision
    C->>A: append AuditEvent {probe, decision, trace_id}
    A->>DB: insert audit event (hash chain)
    C->>R: R observes only visible fields {input, response, decision}
    R-->>U: ProbeResult rows
    C->>U: results payload (withheld until complete)

    U->>C: POST /evaluations/{id}/complete (red role)
    Note over C: Aggregate findings; classify statements observed/inferred/untested
    C->>U: EvaluationResults report
    C->>A: periodic verify(interval) -> checkpoint + signature
```

The snapshot above assumes `BAYORA_RETAIN_RAW_PROMPTS=true`; when false
the collector records a hash-only metadata summary instead of the raw
prompt text.

## 5. Trust-boundary table

| Boundary | What separates | Implemented boundary | Residual note |
| --- | --- | --- | --- |
| TB1 DMZ edge | untrusted browser / internet vs platform | nginx ingress + CSRF header + cookie allowlist | browser IP spoofing is outside the boundary |
| TB2 controller ↔ internal bus | controller ↔ Blue / evaluator / gateway | docker networks `internal: true` + per-service tokens | per-token enforcement is application-checked, reviewed |
| TB3 controller ↔ Red segment | Red's probe path vs policy knowledge | `bayora-eval-net`; Red has no internal-bus membership | R5: same L2 bridge lets a token-less Red process reach the gateway by IP |
| TB4 writers ↔ audit | events vs the evidence store | `bayora-audit-isolated`; append-only collector, no update/delete code path | R1: privileged admin can still recompute a self-consistent forgery |
| TB5 services ↔ db | any service reaching postgres | `bayora-db-net`; Red has no DB URL | R3: controller holds all four DB URLs |
| TB6 gateway ↔ model server | app ↔ the LLM | `bayora-model-link`; gateway is the only member | R7: KV-cache / microarchitectural channel leakage is not observable |
| TB7 stores inside one process | four SQLAlchemy metadata objects + four URLs | four separate connection pools in `backend/db/base.py` | R3: split not yet enforced per-process at runtime |
| TB8 operator ↔ host | infra operator vs the running system | host firewall rules (manual, documented) | not automated; multi-host deployments need VM-per-tenant |

## 6. How the platform reports its own status

Three surfaces feed the status panel, and each carries its own honesty
term:

1. **Audit chain** (`GET /api/v1/audit/verify`) — `verified` is the honest
   term. The chain istamper-evident: `prev_hash → hash`, with Ed25519
   checkpoints over the head. It is **not** tamper-proof: a privileged
   administrator who controls the signing key can still rewrite and
   recompute (R1).
2. **Isolation checks** (`POST /api/v1/security/isolation-checks/run`) —
   `configured_untested` where the control cannot be verified from inside
   the container (`seccomp`, container limits, etc.). This is explicit, not a
   silent default.
3. **Resource metrics** — `insufficient` (e.g. inference_latency_p50) where
   no measured value exists; the mock adapter's 40 ms sleep is a
   simulation, not a measurement of real generation cost.

None of the three surfaces ever returns `True` or `healthy` except when it
actually verifies something. The **claim** "sandbox active" appears only in
the SPA shell as a pointer to the Isolation Center; it does not assert
status.

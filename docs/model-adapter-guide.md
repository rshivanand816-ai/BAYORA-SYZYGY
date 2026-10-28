# Bayora — model adapter guide

How the platform reaches a model, which adapter to use, and — importantly —
what each adapter's results do and do not prove.

Implementation: `backend/app/models_gateway/service.py`
(`execute_model_prompt`).

---

## 1. The adapter contract

Every adapter implements one function:

```python
def execute_model_prompt(
    model: ModelRegistryEntry,
    prompt: str,
    context_namespace: str = "default",
    canary_token: str | None = None,
) -> tuple[str, str, float, bool]:
    """Returns (output_text, model_outcome, latency_ms, simulated_flag).

    model_outcome: "normal" | "refusal" | "error"
    """
```

The fourth element, `simulated_flag`, propagates into the API response as
`ProbeResult.simulated` and into the evaluation report's
`data_provenance`. **It is not optional.** A simulated response that is
not flagged is a lie in the audit trail, so the flag is threaded through
every layer that can report on it.

| Returned outcome | Meaning | Distinct from |
| --- | --- | --- |
| `normal` | the model produced output | — |
| `refusal` | the *model itself* declined | a security-policy denial |
| `error` | the model could not be reached, or returned an error | a refusal |

The Blue pipeline keeps these apart from its own decisions. A request
blocked by an input rule is a **policy denial**; a model that says "I
can't help with that" is a **model refusal**; a 502 from the model server
is a **model-serving error**. The evaluation report's `outcome_breakdown`
keeps all of them in separate buckets, and `Outcome` in
`backend/app/schemas/api.py` enumerates the full terminal set:

```
allowed | blocked_input | redacted_output | blocked_output
model_refusal | model_error | timeout
resource_limit | network_failure | harness_error
```

## 2. The three adapters

### 2.1 `mock` — deterministic, simulated (the default)

| Property | Value |
| --- | --- |
| Execution mode | `simulated` |
| Needs a download | no |
| Needs a key | no |
| Deterministic | yes — the same prompt gives the same output |
| Registered as | `bayora-mock-v1`, version `1.0.0`, status `approved` |

The mock implements a small, explicit behaviour set so that the defensive
pipeline has something to act on:

| Input contains | Behaviour | Outcome |
| --- | --- | --- |
| `jailbreak`, `bypass all`, `unfiltered`, `no restrictions` | refuses | `refusal` |
| `42 * 17` | answers `714` | `normal` |
| `cryptography` | answers a real explanation of public-key crypto | `normal` |
| a canary, when `BAYORA_MOCK_SHARED_CONTEXT_BUG=true` | leaks the canary | `normal` — **this is the negative control** |

Everything else returns a synthetic acknowledgement that echoes the
`context_namespace` it was called with, which is what makes the
cross-session namespace check observable.

**What the mock proves:** that the evaluation harness, the defence
pipeline, the audit chain and the scoring code work end to end. It
exercises the *platform*.

**What the mock does not prove:** anything about a language model's
behaviour, refusal quality, jailbreak resistance, or inference cost. Its
40 ms sleep is a **simulation**, not a measurement. That is why the
`inference_latency_p50` resource metric reports
`provenance="insufficient"` rather than 40.

### 2.2 `ollama` — a real local model

| Property | Value |
| --- | --- |
| Execution mode | `local` |
| Needs a download | yes — `ollama pull llama3:8b` |
| Needs a key | no |
| Registered as | `llama3:8b`, status `registered` (not `approved` until validated) |

The adapter issues a real HTTP request:

```python
url = f"{model.base_url or settings.ollama_base_url}/api/generate"
res = httpx.post(
    url,
    json={"model": model.identifier, "prompt": prompt, "stream": False},
    timeout=settings.model_timeout_seconds,
)
```

On a non-200 it returns the upstream status and a truncated body as an
`error` outcome. **On a connection failure it does not raise** — it
returns:

```
[SIMULATED FALLBACK: Ollama daemon not reachable at <url> (<ExcName>)] Generated synthetic test completion.
```

with `simulated=True`. The prefix is in the response text on purpose: a
reader of the transcript can see that the model was not actually reached.
The response is also flagged `simulated` in the API, so the dashboard
never counts it as a real model result.

A timeout is reported as `model_error` with the exception class name, not
as a generic failure. It is not conflated with a policy denial.

### 2.3 `openai_compatible` — external, gated by explicit consent

| Property | Value |
| --- | --- |
| Execution mode | `external` |
| Enabled by default | **no** |
| Needs a key | yes, server-side only |

Two independent gates must both be open:

1. `BAYORA_EXTERNAL_MODELS_ENABLED=true` and the target host must be in
   `BAYORA_EXTERNAL_HOST_ALLOWLIST`.
2. The model entry must have `external_enabled=true`, which requires an
   explicit `POST /api/v1/models/{id}/enable-external` with
   `{"consent": true, "acknowledgement": "<text>"}`.

If the consent is missing, the adapter returns:

```
External model execution blocked: User has not granted external data transmission consent for this model.
```

as an `error` outcome, and no request leaves the host.

**Credential handling.** The API key is read from the server-side
environment by the gateway. It is never included in an API response, never
written into the browser bundle, and never placed inside a model prompt.
`GET /api/v1/settings` returns an explicit allow-list that contains no
secret, and `test_settings_endpoint_does_not_expose_secrets` asserts it.

**What the external adapter currently returns.** In this build the
`openai_compatible` path returns a labelled synthetic response:

```
[EXTERNAL MOCK RESPONSE from <identifier>] Simulated external response for evaluation.
```

with `simulated=True`. The consent, gating, allow-list and refusal
behaviour are all real and tested; the outbound call itself is not
implemented. Treat any result from this adapter as **simulated**.

## 3. Registering a model

### 3.1 Through the API

```sh
curl -X POST http://127.0.0.1:8000/api/v1/models \
  -H 'X-Bayora-CSRF: 1' -b 'bayora_session=<token>' \
  -H 'Content-Type: application/json' \
  -d '{"display_name":"Llama 3 8B (Local)","adapter":"ollama",
       "identifier":"llama3:8b","version":"3.2","base_url":"http://ollama:11434"}'
```

Administrator only. The registry then requires the model to pass
validation before it can be used:

```sh
curl -X POST .../api/v1/models/{id}/validate    -H 'X-Bayora-CSRF: 1' -b ...
curl -X POST .../api/v1/models/{id}/approve      -H 'X-Bayora-CSRF: 1' -b ...
```

`ModelOut.runnable` is `true` only when the entry is `approved` **and** has
a current version. A model that is registered but not validated is not
selectable for an evaluation, so a broken model cannot silently become
the system under test.

### 3.2 Uploading a model package

`POST /api/v1/models/upload` (multipart) accepts a package, hashes it,
and moves it into the quarantine directory. The uploaded file **never
executes with the controller's permissions**: it is stored as bytes with
its SHA-256 recorded, and it is not run. The registry stores the metadata
and the hash; the bytes live in the restricted quarantine path. Only the
`ollama` adapter, in its own container on its own network, ever loads
weights.

`ModelVersion` records `version`, `revision`, `file_sha256`, `file_path`,
`file_size` and `config_hash`. Every `TestExecution` records the model
version it used, so a result can always be traced back to the exact
weights.

## 4. Provenance, and what "healthy" means

| Field | Meaning |
| --- | --- |
| `execution_mode` | `simulated` / `local` / `external` / `none` — how the model is reached |
| `last_health_status` | whether the last liveness probe answered |
| `validation_result` | what the validation run observed |
| `current_version` | the pinned weights, with their hash |
| `external_enabled` | whether external transmission has been consented to |

Two limits are worth stating plainly:

- **A healthy model is not a trustworthy model.** The health check
  proves the adapter answered. It says nothing about the model's
  provenance, its training data, or its behaviour.
- **A successful model load is not an attestation.** The registry records
  a hash of the file it was given. It does not verify that the file came
  from where it claims to have come from. Model provenance is
  self-reported — residual risk **R2** in
  `security/threat-model/README.md`.

## 5. Adding a new adapter

1. Add the branch to `execute_model_prompt` in
   `backend/app/models_gateway/service.py`. It must return the
   `simulated_flag` honestly.
2. Add the adapter name to the `adapter` column's allowed values in
   `backend/app/db/models.py` (`ModelRegistryEntry.adapter`).
3. Add the type to the `ModelOut.adapter` union in
   `frontend/src/types/api.ts` and to `ModelCreate.adapter`.
4. If the adapter needs outbound network access, add it to the
   `bayora-model-egress` network in `compose.yaml` — and only that
   network. Do not add it to `bayora-dmz`.
5. Add a unit test for the adapter's validation and failure paths, and
   make sure the failure path returns a distinct outcome (`error`,
   `timeout`, `network_failure`) rather than a generic one.

# Bayora — security documentation

| Document | Contents |
| --- | --- |
| [threat-model/README.md](threat-model/README.md) | STRIDE analysis: assets, trust boundaries, actors, entry points, abuse cases with mitigation status, residual-risk table, and the explicit non-guarantees. |
| [network/README.md](network/README.md) | Network segmentation model, the allowed/denied flow matrix, why an application-level diagram is not firewall enforcement, and the host firewall rules an operator still has to apply by hand. |
| [seccomp/bayora-model-gateway.json](seccomp/bayora-model-gateway.json) | seccomp-bpf denylist profile for the model gateway. `configured_untested` — authored and reviewed by hand, never executed under a container. |

## How the layers fit together

No single layer is sufficient, and each is judged on its own:

1. **Network segmentation** (`compose.yaml`, `security/network/`) decides
   *which components can reach which*. It is an L3 boundary on a shared
   kernel, so it stops name-based reachability, not IP-based reachability
   within a segment.
2. **Application controls** (`backend/app`, reviewed there) decide *whether a
   request is authorised*. Tokens, roles, flow policy.
3. **Container hardening** (`compose.yaml`, `security/seccomp/`) decides *what
   a compromised process can do to the system*.
4. **Audit evidence** (`backend/app/audit/`) records *what happened* and
   makes undetected modification detectable.

The residual-risk table in the threat model is the authoritative statement of
what is still open. Read it before making any claim about the platform's
security posture.

## Status vocabulary

| Term | Meaning |
| --- | --- |
| `implemented` | The control exists in the source and is exercised by the application's own code. |
| `configured` | The control is expressed in `compose.yaml` / `.env` but was not executed and verified in the authoring environment (no container runtime was available). |
| `configured_untested` | Same as `configured`; used where the check is reported by the platform's isolation-check feature, which cannot verify the control from inside the container and therefore says so explicitly. |

## Reporting

Please report suspected vulnerabilities privately to the team rather than in
a public issue.

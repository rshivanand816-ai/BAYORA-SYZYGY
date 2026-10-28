# Bayora — network segmentation

This document describes the network controls in `compose.yaml` and what is
not there yet.

## What the compose file does

The `compose.yaml` file defines six Docker networks:

| Network | Internal | Subnet | Services on it |
| --- | --- | --- | --- |
| bayora-dmz | false | 172.28.0.0/24 | frontend, api-controller |
| bayora-internal-bus | true | 172.28.1.0/24 | api-controller, blue-policy-service, evaluation-service, model-gateway |
| bayora-eval-net | true | 172.28.2.0/24 | api-controller, red-service, model-gateway |
| bayora-audit-isolated | true | 172.28.3.0/24 | api-controller, evaluation-service, audit-collector |
| bayora-db-net | true | 172.28.4.0/24 | postgres, blue-policy-service, evaluation-service, audit-collector |
| bayora-model-link | true | 172.28.5.0/24 | model-gateway, ollama |
| bayora-model-egress | false | 172.28.6.0/24 | ollama only (weights) |

`internal: true` on a bridge network removes the host route from that network,
so containers on it have no path to the public internet *through Docker*.
`frontend` and `bayora-model-egress` are the two exceptions because they need
egress: the browser ingress and weight downloads.

The `api-controller` is the only high-trust component that joins several
networks. Red is deliberately not on `bayora-internal-bus`, so the Red harness
cannot reach the Blue policy engine directly by name.

## The honest limitation

Docker's network layer is an L3 boundary enforced by the Docker daemon on the
host kernel. It is **NOT** a hardware firewall. It can block traffic between
two containers by name if both are members of the same internal network or
if the controller restricts which internal services it talks to. But it
cannot block traffic at L7, cannot inspect payloads, and — critically for
Red — **it does not stop one container on the same bridge segment from
directly reaching another container on that same segment by IP**. The
`bayora-eval-net` segment puts `red-service` and `model-gateway` on the same
L2 bridge, so a compromised Red process that ignores tokens and dialls the
model gateway by IP still reaches it.

## What this document therefore requires

These controls do not yet prove the topology is enforced end-to-end. A
successful security review has to add, as an operator procedure:

### Host firewall rules (manual operator step)

Run these on the Docker host, not inside any container. Use whichever
stateful firewall the system runs (iptables / nftables). The matrix below is
the target control; the commands are illustrative, not prescriptive — adapt
them to your host.

**Model server is egress-only.**
```sh
iptables -A DOCKER-USER -d 172.28.5.0/24 -o docker0 -j DROP
iptables -A DOCKER-USER -s 172.28.6.0/24 -i docker0 -j ACCEPT
iptables -A DOCKER-USER -s 172.28.5.0/24 -o docker0 -j ACCEPT
```
*(Adjust interface names; use `dockerx` or `nat` chains as appropriate.)*

**Internal buses have no public path.** Already handled by Docker networks. No
host rule needed here, but adding one as documentation is harmless.

**Frontend → API must be restricted to the DMZ.** Already handled by Docker
networks (frontend is the only DMZ member besides the controller).

**Red service must not reach postgres.** Already handled by `bayora-db-net`
excluding `red-service`. Add a belt-and belt:
```sh
iptables -D DOCKER-USER -d 172.28.4.0/24 -o docker0 -j DROP
```

The real question for the reviewer is whether the *application* controls —
tokens, flow policy, isolation checks — also close the gaps Docker's
network layer leaves open. The answer is yes, but only if every service
enforces its own token on every outbound call. That enforcement is checked
in `backend/app` and is reviewed there; this directory documents what the
network layer contributes and where it stops contributing.

## What is NOT automated

- The seccomp profile in `security/seccomp/bayora-model-gateway.json` is
  **configured but untested**. It was authored by hand and reviewed for
  correctness, but no container was run under it. Enable it explicitly when
  starting a service with `--security-opt seccomp=...` and test it against a
  generation request before relying on it.
- The host firewall rules above are **manual operator procedures**. They are
  documented, but a deploy script has not been written to keep them applied
  across host updates, restarts, or new nodes in a multi-host Switched setup.
- One Docker host is not physical isolation. In a multi-tenant deployment the
  shared kernel means a compromise of the host (via the Docker daemon itself,
  a kernel vulnerability, or a tenant escaping its container) still affects
  every other tenant's containers. Physical or VM-level separation is the
  only full mitigation.

## Reconciliation

The topology documented in `compose.yaml`, the application-level token and
flow-policy controls in `backend/app`, and this network review form a
*layered* defence. Each layer closes gaps the others leave open. A serious
review should not treat any single layer as sufficient, and it should not
blame the network layer for failing when the application layer
fails. Treat each layer independently and accept its residual risk
explicitly.

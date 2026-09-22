# Trigger Protocol

**A minimal, open protocol for making the transition from decision to action explicit, bounded, and verifiable.**

> Intelligence is not authority.  
> Recommendation is not authorization.  
> Authorization is not execution.

Trigger Protocol is built around one rule: **do not let intelligence silently become authority.**

AI may reason, recommend, prepare, verify, and simulate. A consequential change to the world crosses an explicit authorization boundary.

## The model

```text
PROPOSE → REVIEW → DECIDE → TRIGGER → EXECUTE → OUTCOME
                              │
                     authorization boundary
```

The Trigger is the boundary. A Trigger Receipt is portable evidence of that authorization event.

The core semantic arc is:

```text
PROPOSE → DECIDE → TRIGGER → EXECUTE
                 │
          explicit boundary
```

`Decision` says what was decided. `Trigger` says what authorized execution. `Execution` says what actually happened. The protocol deliberately keeps those facts separate.

> **A useful fictional reference point:** *PSYCHO-PASS* asks what happens when a society gives a system the power to determine what should be permitted. Trigger Protocol takes a different lesson: we cannot assume that every person who must stand at a consequential decision boundary can consistently carry that judgment alone. Instead of relying on exceptional individuals, the protocol makes the boundary itself explicit: decisions can be challenged, rejected, deferred, or revised, and those decisions remain part of the durable record.

## Why this exists

Powerful AI systems make it increasingly easy for a recommendation to become an action without a visible transition between the two.

Trigger Protocol separates:

- **intelligence** — producing analysis, options, evidence, and recommendations;
- **authority** — who is entitled to authorize an action;
- **decision** — what was decided, including rejection, modification, deferral, and dissent;
- **trigger** — the explicit authorization event;
- **execution** — what an executor actually did;
- **outcome** — what happened afterward.

The protocol does **not** decide who should govern. It makes the conversion from decision to action explicit and machine-checkable.

## What was stopped is also recorded

A Trigger Protocol record is not only a record of what crossed the authorization boundary.

**What was stopped is also recorded.**

A rejection, modification, deferral, or request for a second opinion remains a durable Decision Record. A later approval does not erase the earlier decision; it is a subsequent determination, typically against a proposal with its own bound content hash.

This preserves the “negative space” around execution: the history of not only what happened, but what was explicitly stopped from happening at that point in the decision lifecycle.

A minimal rejection Decision Record looks like this:

```json
{
  "id": "decision-reject-001",
  "protocol": "trigger/0.2",
  "proposal_id": "deploy-002",
  "proposal_hash": "sha256:...",
  "actor": "human:oncall",
  "decision": "reject",
  "authority_id": "production-release",
  "reason": "Canary evidence is insufficient for production release.",
  "issued_at": "2026-09-19T00:10:00Z"
}
```

This is a Decision Record, not a separate rejection receipt. Because the decision is `reject`, no Trigger is authorized by this record; the rejection itself remains durable history.

## The critical invariants

**A model output MUST NOT be treated as authorization.**

**A Decision Record MUST NOT disappear merely because a later Decision authorizes a subsequent action.**

Likewise:

- a proposal is not a decision;
- a decision is not an execution;
- a tool/API credential is not proof of protocol authority;
- a successful action does not retroactively legitimize an unauthorized action;
- rejection, dissent, modification, deferral, and second opinions remain durable records;
- an executor must independently enforce the authorization boundary.

## Trigger Receipt

A Trigger Receipt is the portable authorization artifact presented to an executor:

```json
{
  "id": "tr-001",
  "protocol": "trigger/0.2",
  "proposal_id": "deploy-001",
  "proposal_hash": "sha256:...",
  "decision_id": "decision-001",
  "actor": "human:oncall",
  "authority_id": "production-release",
  "action": "deploy",
  "scope": "production",
  "issued_at": "2026-09-19T00:00:00Z",
  "expires_at": "2026-09-19T01:00:00Z"
}
```

A receipt is **evidence of an authorization event, not a source of authority by itself**. In a real deployment, the executor also needs a way to establish that the actor held the stated authority and that the referenced decision was actually approved.

**A valid Trigger proves that a particular execution was authorized within the protocol's stated boundary; it does not prove that the surrounding workflow, authority system, or human decision process was itself legitimate.**

The distinction is fundamental:

```text
authority ──► decision ──► trigger receipt ──► execution
   │              │               │                │
   │              │               │                └─ what happened
   │              │               └─ evidence of authorization
   │              └─ what was decided
   └─ who is entitled to authorize
```

A receipt can carry evidence of an authorization event; it does not manufacture the authority that made the event legitimate.

The authorization binding is not just the receipt ID. The executor must preserve the chain `proposal_hash → decision_id → trigger/receipt → execution` and verify that the approved action still matches the proposal. A later or different proposal cannot silently reuse an earlier approval.

## Try it in under a minute

### 1. Run the built-in harmless demo

Clone the repository:

```bash
git clone https://github.com/mowdmd/trigger-protocol.git
cd trigger-protocol
```

Then run the proxy against the included MCP-like stdio demo server:

```bash
npx trigger-mcp-proxy \
  --mode gate \
  --receipt ./examples/mcp-demo-receipt.json \
  -- node ./examples/mcp-demo-server.mjs
```

The proxy is now between the client and the server. Only a `tools/call` authorized by the receipt is forwarded.

For an actual MCP client/server, the same insertion point is:

```text
AI agent / MCP client
        │
        ▼
trigger-mcp-proxy
        │
        ▼
existing MCP server
        │
        ▼
tool / external side effect
```

### 2. Wrap an existing MCP server

Transparent observation:

```bash
npx trigger-mcp-proxy -- npx -y <your-mcp-server> <args>
```

This is **observe mode**. It is deliberately non-enforcing so an existing integration can be instrumented without changing behavior.

Enforcement:

```bash
npx trigger-mcp-proxy \
  --mode gate \
  --receipt ./trigger-receipt.json \
  -- npx -y <your-mcp-server> <args>
```

Gate mode blocks an unauthorized `tools/call` before it reaches the upstream server.

> **Important:** observe mode is not a security boundary. Gate mode is the Trigger Protocol enforcement point.

### 3. See the boundary around a destructive action

A fake `delete_file` executor demonstrates the important case without touching the real filesystem:

```bash
npx trigger-mcp-proxy --mode gate --receipt ./examples/destructive-action/receipt.json -- node ./examples/destructive-action/server.mjs
```

The receipt binds the authorization to the `delete_file` tool and its exact arguments. Change the path and the proxy blocks the call before the executor sees it.

The protocol-level binding covers the proposal and approved action; the MCP adapter additionally binds the concrete tool arguments with a canonical-JSON SHA-256 extension.

For the v0.3 trust-layer experiment, the repository also includes dependency-free Ed25519 receipt signing and verification. Signature support is experimental and optional; it does not replace authority validation:

```bash
node ./bin/trigger-receipt.mjs keygen --private-key ./private.pem --public-key ./public.pem
node ./bin/trigger-receipt.mjs sign --receipt ./examples/destructive-action/receipt.json --private-key ./private.pem --key-id demo-operator
node ./bin/trigger-receipt.mjs verify --receipt ./examples/destructive-action/receipt.json --public-key ./public.pem

# Then enforce it at the MCP boundary:
npx trigger-mcp-proxy --mode gate --receipt ./examples/destructive-action/receipt.json --public-key ./public.pem --require-signature -- node ./examples/destructive-action/server.mjs
```

The public key is a deployment trust input; it is not taken from the receipt.

## MCP adapter

The npm package `trigger-mcp-proxy` is intentionally small:

- zero runtime dependencies;
- Node.js 18+;
- stdio JSON-RPC pass-through;
- diagnostics on stderr;
- no shell interpolation of the upstream command;
- receipt-gated `tools/call`;
- optional exact-argument binding with SHA-256;
- no authority minting inside the proxy.

For consequential actions, bind the receipt to the exact invocation:

```json
{
  "action": "mcp.tools/call",
  "scope": "delete_file",
  "extensions": {
    "https://trigger-protocol.org/ns/mcp-proxy": {
      "tool_name": "delete_file",
      "arguments_sha256": "<sha256 of canonical JSON arguments>"
    }
  }
}
```

This prevents a receipt for one invocation from silently authorizing materially different arguments.

See [MCP_PROXY.md](MCP_PROXY.md), [protocol/signature-profile.md](protocol/signature-profile.md), and [mcp-proxy/README.md](mcp-proxy/README.md).

## How it relates to existing security systems

Trigger Protocol is **not** a replacement for authentication, identity systems, authorization policy engines, or MCP security mechanisms.

Its boundary is different:

```text
identity / authentication
          │
          ▼
authority / policy
          │
          ▼
decision
          │
          ▼
Trigger Protocol
(explicit authorization event)
          │
          ▼
executor / tool / API
```

In other words, Trigger Protocol standardizes the boundary **between a decision and an authorized action**. Existing identity, authentication, policy, delegation, and transport controls can establish *who may authorize* and *under what rules*; Trigger Protocol records and enforces the explicit transition into an authorized action.

This makes it complementary to those systems rather than a competing replacement for them.

## Interoperability

The semantic core is transport-, vendor-, model-, language-, database-, and cloud-neutral.

Reference representation:

- JSON / UTF-8
- JSON Schema Draft 2020-12
- transport-neutral records

HTTP, queues, files, MCP, A2A, and other transports may carry the records.

Interoperability does **not** imply trust. Each executor independently verifies authority, scope, constraints, delegation, validity, and references.

See [protocol/interoperability.md](protocol/interoperability.md).

## Core vocabulary

Actor · Agent · Action · Resource · Proposal · Review · Decision · Authority · Delegation · Trigger · Receipt · Execution · Outcome · Evidence · Constraint · Policy · Revocation

See [protocol/vocabulary.md](protocol/vocabulary.md).

## Design principles

1. Intelligence is not authority.
2. Do not delegate the human decision itself.
3. The Trigger is a boundary.
4. Authority is explicit, bounded, and visible.
5. Delegation is scoped, expiring, and revocable.
6. Rejection, modification, deferral, dissent, and second opinion are first-class.
7. Decision history is durable.
8. Irreversibility changes the gate.
9. Auditability is not surveillance.
10. Governance is versioned.
11. No single governance philosophy is assumed.
12. Interoperability creates the network.
13. Humans remain accountable for legitimate decisions.

## Repository structure

```text
protocol/       canonical schemas, vocabulary, interoperability
conformance/    portable compatibility vectors
examples/       runnable examples
concepts/       design concepts
bin/            minimal command-line utilities
mcp-proxy/      npm middleware implementation
```

## Development

```bash
python bin/trigger-validate.py examples/trigger-receipt.json
python conformance/test_conformance.py
npm test
npm pack --dry-run
```

No third-party runtime dependencies are required.

## Versioning and status

**Core protocol: `trigger/0.2` — experimental semantic core**  
**Trust layer: `trigger/0.3` — experimental profile preview**  
**npm adapter: `trigger-mcp-proxy 0.2.x`**

The core protocol and trust-layer profile are versioned separately from the npm adapter. The core defines the authorization semantics and interoperable records; the v0.3 trust layer adds experimental cryptographic receipt support without changing the core authority model. The npm package is an implementation/adoption surface and may evolve independently.

Implemented today:

- semantic core and portable schemas;
- MCP enforcement adapter with observe/gate modes;
- exact tool/argument binding;
- experimental Ed25519 receipt signature profile.

The trust layer is intentionally incomplete. Remaining work includes identity binding, authority/delegation validation graphs, revocation, and decision replay/governance diff. Cross-object conformance and proposal-hash binding are part of the current experimental semantic core. The signature profile authenticates receipt integrity, not authority; deployments still need their own identity, authority, delegation, revocation, and replay controls.

## Network effect

The protocol is intentionally small.

The network effect comes from **independent systems recognizing the same authorization boundary and accepting the same portable artifact**. One implementation is useful alone; multiple independent implementations make the artifact portable.

The goal is not a centralized authority. The goal is a shared protocol for making authority explicit.

## License

CC0 1.0 Universal.

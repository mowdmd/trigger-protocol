# Roadmap

## v0.1 — foundation
- [x] Proposal / authorization / execution separation
- [x] Machine-readable schemas
- [x] Trigger Receipt
- [x] Minimal semantic conformance runner
- [x] CI conformance check

## v0.2 — vocabulary and interoperability
- [x] Canonical vocabulary
- [x] Primitive and envelope definitions
- [x] Explicit proposal -> decision -> trigger -> execution references
- [x] Portable conformance vectors
- [x] Bounded authority/delegation semantics
- [x] Extension preservation rule
- [x] Transport-neutral interoperability profile
- [x] MCP adoption surface

## MCP adoption surface
- [x] Zero-dependency stdio MCP proxy
- [x] One-command `npx trigger-mcp-proxy` entry point
- [x] Transparent observe mode
- [x] Receipt-gated `tools/call` enforcement mode
- [x] Exact tool/argument binding via SHA-256
- [x] Runnable local demo
- [x] npm package metadata and test command
- [x] npm trusted-publishing workflow

## v0.3 — trust and governance infrastructure
- [x] Cryptographic receipt signature profile (Ed25519, experimental)
- [x] v0.3 receipt schema
- [ ] Identity-binding profiles
- [ ] Authority graph
- [ ] Delegation validation vectors
- [ ] Revocation registry profile
- [ ] Decision replay and governance diff
- [x] Cross-object conformance: proposal -> decision -> trigger -> execution
- [x] Proposal-hash binding from Proposal -> Decision -> Trigger/Receipt
- [ ] Replay protection / nonce semantics

## Long term
- [ ] Reference SDKs
- [ ] Agent framework adapters
- [ ] Independent implementations
- [ ] Compatibility registry
- [ ] Governance simulation
- [ ] Additional MCP operation profiles

The project should optimize for a small, stable semantic core and broad interoperability, not feature count.

The semantic core deliberately stops at the decision-to-action boundary. Identity binding, authority graphs, revocation registries, replay state, and cryptographic trust remain profiles or deployment responsibilities.

The adoption strategy is deliberately simple: make the boundary useful locally, make the authorization artifact portable, and make integration cheap enough that independent systems can adopt it without surrendering governance to a central service.

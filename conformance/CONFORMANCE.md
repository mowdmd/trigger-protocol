# Trigger Protocol Conformance v0.2

A conforming `trigger/0.2` implementation MUST preserve the semantic boundary between Proposal, Decision, Trigger, and Execution.

## Reference checks

The reference conformance suite checks:

1. required Trigger Receipt fields;
2. `trigger/0.2` protocol identity;
3. proposal-hash presence and continuity;
4. issuance and expiry validity;
5. Proposal → Decision → Trigger linkage;
6. actor and authority continuity from Decision to Trigger;
7. action/resource/scope continuity from Proposal to Trigger;
8. mutation of an approved Proposal breaks the authorization binding;
9. `reject`, `modify`, `defer`, and `request_second_opinion` are not execution authorization;
10. a later approval does not erase or rewrite an earlier blocking Decision Record.

Run:

```bash
python conformance/test_conformance.py
```

The repository also runs JSON-schema sanity checks and the MCP adapter tests through:

```bash
npm test
```

## Required execution semantics

A conforming executor MUST independently verify, before a consequential action:

- the referenced Decision is `approve`;
- the actor holds or validly derives the referenced authority;
- authority covers the action and resource/scope;
- delegation, if present, is valid and not revoked;
- the Trigger is within its validity interval;
- constraints are satisfied;
- the referenced Proposal hash matches the Proposal being executed;
- the Trigger action/resource/scope/constraints match the approved Proposal;
- the Trigger actor and authority match the approving Decision.

An executor MUST block execution when these checks fail.

## Proposal hash

`proposal_hash` is SHA-256 over the RFC 8785 JCS canonical JSON representation of the Proposal. Numbers use ECMAScript JSON number serialization; object keys use UTF-16 code-unit ordering; negative zero becomes `0`; non-finite numbers and unsafe integers are rejected. The shared vectors in `conformance/canonical-vectors.json` are exercised by both the Python conformance suite and the JavaScript MCP tests.

## Negative space

Blocking decisions are durable history. A later approval is a new Decision Record and MUST NOT mutate, erase, or reinterpret the earlier Decision.

## Trust-layer profiles

The Ed25519 receipt signature profile is versioned separately as `0.3`. It authenticates receipt integrity but does not establish authority, identity legitimacy, or organizational governance.

Identity binding, authority graphs, revocation registries, replay state, and other deployment trust mechanisms remain outside the minimal semantic core unless standardized by a future profile.

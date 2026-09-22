# Threat Model

Trigger Protocol assumes AI systems and execution environments can fail. This document describes the main protocol-level failure modes and the boundary the protocol can enforce. It does not claim to secure the surrounding identity, execution, or governance infrastructure.

## Confused authority
An agent interprets a recommendation as permission.

Mitigation: separate proposal and authorization; require an explicit trigger; an executor independently checks the authorization before execution.

## Excessive delegation
An agent receives broader authority than intended.

Mitigation: scoped delegation, limits, expiry, revocation, and independent validation of the delegation chain. Full delegation-graph validation is a v0.3 trust-layer work item.

## Prompt or tool injection
Untrusted content attempts to cause unauthorized action.

Mitigation: authorization must be evaluated independently of untrusted content and checked before execution. A successful tool invocation does not establish authorization after the fact.

## Receipt substitution or mutation
An attacker replaces or modifies a receipt, or presents a receipt for a materially different invocation.

Mitigation: executors use an independently trusted receipt source; optional Ed25519 signatures protect receipt integrity; exact tool/argument binding can prevent substitution of materially different MCP calls. A signature does not establish authority by itself.

## Gate bypass
A client or operator reaches the upstream executor without passing through the Trigger Protocol enforcement point.

Mitigation: the gate must be placed on the actual execution path and the executor must independently enforce the authorization invariant. A proxy is not a security boundary if a second path to the executor remains available.

## Untrusted receipt storage
A receipt file or transport is corrupted, reordered, replayed, or replaced before verification.

Mitigation: integrity-protect receipts where required, use trusted key material outside the receipt, validate validity and references at execution time, and deploy replay controls appropriate to the environment. Persistent storage and transport security remain deployment responsibilities.

## Audit tampering
Historical records are modified.

Mitigation: append-only storage, hashes, signatures, or external notarization can be layered on top. The protocol records causal references but does not itself provide immutable storage.

## Automation bias
Humans approve recommendations without meaningful review.

Mitigation: expose evidence, uncertainty, alternatives, and dissent; support reject and second opinion. The protocol records the decision boundary but cannot guarantee the quality of human judgment.

## Self-assessed gate weakening
A proposal-generating agent assigns an artificially low risk or high reversibility classification in order to obtain a weaker authorization gate.

Mitigation: required gate strength is determined by deployment policy or governance rules rather than solely by the proposing model's assessment. The executor enforces the resulting authorization requirements independently.

## Stale authority
An authorization survives after circumstances change.

Mitigation: expiry, revocation, context constraints, and re-authorization.

## Outcome blindness
Actions are recorded without consequences.

Mitigation: link outcomes to decisions and executions so the authorization chain can be reconstructed.

## Relationship to surrounding security controls

Trigger Protocol is intentionally complementary to existing security architectures. In a deployment, identity/authentication establishes actors, policy or authorization systems determine what an actor may authorize, and the Trigger boundary records and enforces the explicit transition from an approved decision to an authorized action.

Conceptually, this can coexist with:

- PDP/PEP-style authorization architectures, where policy decision and enforcement are separate;
- capability/delegation mechanisms such as macaroons, where scoped authority is represented and attenuated;
- admission-controller patterns, where a gate rejects requests before they reach an executor.

These are related patterns, not replacements or claims of equivalence. Trigger Protocol's interoperability target is the semantic boundary and portable authorization artifact, not a new identity provider, universal policy language, or general-purpose capability system.

## Out of scope

Physical security, identity-provider security, legal compliance, model alignment, organizational legitimacy, and the security of an executor outside the protocol enforcement path are out of scope.

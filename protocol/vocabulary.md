# Trigger Protocol Vocabulary

Version: 0.2
Status: Experimental

The semantic core is versioned independently from the optional `0.3` Ed25519 receipt signature profile.

This document defines the canonical vocabulary. Implementations MAY add extension fields, but MUST preserve the semantics of the core terms.

## Core primitives

| Term | Meaning | Normative role |
|---|---|---|
| Actor | An identifiable entity participating in a decision or execution | Who proposes, reviews, authorizes, delegates, or executes |
| Agent | A software system acting on behalf of an actor or organization | May propose and execute; does not acquire authority merely by being an agent |
| Action | A concrete operation capable of producing a side effect | What may happen |
| Resource | The object, account, system, person, dataset, environment, or domain affected | What is affected |
| Proposal | A non-authoritative recommendation to perform an action | Intelligence/output |
| Review | Examination or alteration of a proposal before authorization | Deliberation |
| Decision | A recorded determination about a proposal | Approve/reject/modify/defer/request_second_opinion |
| Authority | A bounded grant permitting an actor to authorize a class of actions | Why the actor may authorize |
| Delegation | A bounded transfer of authority from grantor to grantee | How authority is derived |
| Trigger | The explicit authorization event that permits execution | Boundary crossing |
| Receipt | Portable machine-readable evidence of a Trigger | Interoperability artifact |
| Execution | The actual attempt to perform the authorized action | Side effect |
| Outcome | Observation of what resulted from execution | Consequence |
| Evidence | Material used to support review or authorization | Decision basis |
| Constraint | A machine-checkable limit on an authorization | Boundary |
| Policy | Versioned rules used to determine whether an authorization is legitimate | Governance |
| Revocation | A state change invalidating authority or delegation | Withdrawal |

## State machine

The canonical lifecycle is:

PROPOSE -> REVIEW -> DECIDE -> TRIGGER -> EXECUTE -> OUTCOME

`reject`, `modify`, `defer`, and `request_second_opinion` are decision values and MUST NOT be interpreted as execution authorization.

Review is a deliberation stage, not an authorization requirement imposed by the core. A Decision MAY be informed by one or more Reviews, but a core Decision Record is not required to contain a Review reference.

A Trigger is the semantic authorization event. A Trigger Receipt is its portable machine-readable representation. A receipt is not a second independent authorization event and does not manufacture authority. Execution references the Trigger event; a deployment MAY also retain the receipt ID for audit or transport correlation.

## Semantic invariants

1. A Proposal has no execution authority.
2. A Review has no execution authority.
3. A Decision is not an execution event.
4. Only an explicit approved Trigger may authorize execution.
5. Authority is separate from the actor's identity.
6. Delegated authority cannot exceed its grantor's authority.
7. A constraint applies to the Trigger and MUST be enforced by the executor.
8. Expired or revoked authority MUST NOT authorize execution.
9. Rejection and dissent are durable records; they are never converted into approval by omission.
10. Outcome does not retroactively validate an unauthorized execution.
11. A Trigger Receipt is evidence of an authorization event, not proof that the surrounding authority or governance system is legitimate.

## Vocabulary extensibility

Unknown extension fields MUST NOT alter the meaning of core fields. Implementations SHOULD namespace extensions using URI-like names, for example https://example.org/trigger/ext/....

The protocol standardizes semantics, not a universal identity provider, policy engine, signature scheme, or transport.

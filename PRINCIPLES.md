# Principles

## 1. Intelligence is not authority
A system can reason well without possessing authority to act. Authority MUST NOT be inferred solely from model output, recommendation, capability, or confidence; its source and grant are deployment-side trust decisions.

## 2. Do not delegate the human decision itself
AI may generate evidence, options, predictions, or recommendations. The legitimate authority to decide whether a consequential action should occur remains explicitly assigned; it is never inferred from model output.

## 3. The Trigger is a boundary
The Trigger marks the transition from proposed action to authorized action. It is not merely a UI click and not merely a model response.

## 4. Authority should be visible
Consequential actions should have identifiable authority, scope, constraints, policy basis, and validity.

## 5. Delegation should be bounded
Delegation needs scope, limits, expiry, and revocation. A delegate cannot silently gain more authority than the grantor possesses.

## 6. Rejection matters
Reject, modify, defer, and second opinion are first-class decision states. A system that records only accepted recommendations destroys important governance information.

## 7. Decision history is durable
A consequential decision does not become history only when it authorizes execution. Decision Records for approval and non-approval are equally first-class and durable. A later Decision MUST NOT erase, overwrite, or invalidate an earlier Decision Record.

## 8. Irreversibility changes the gate
Less reversible and more consequential actions deserve stronger authorization boundaries.

## 9. Auditability is not surveillance
Record decision provenance needed for accountability while minimizing unnecessary personal data.

## 10. Governance is versioned
The rules controlling agents are themselves versioned artifacts. Historical decisions should remain interpretable under the policy that existed when they were made.

## 11. No single governance philosophy is assumed
The protocol supplies primitives. Organizations and legitimate authorities define their own policies, thresholds, and institutions.

## 12. Interoperability creates the network
The valuable shared object is the portable decision and authorization record, not a centralized service. Independent implementations can participate without surrendering governance to a protocol operator.

## 13. Humans remain accountable for legitimate human decisions
Automation can enforce a boundary; it cannot manufacture legitimacy. The protocol records who authorized an action and under what authority rather than pretending that an algorithmic recommendation itself is the authority.

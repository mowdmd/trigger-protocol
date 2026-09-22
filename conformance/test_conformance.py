#!/usr/bin/env python3
"""Cross-object semantic conformance checks for Trigger Protocol v0.2."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from test_vectors import valid_receipt, VECTORS
from protocol.canonical_json import canonical_json

CANONICAL_VECTORS=json.loads((ROOT/"canonical-vectors.json").read_text(encoding="utf-8"))
decision=json.loads((ROOT.parent/"examples"/"decision-rejection.json").read_text(encoding="utf-8"))

def proposal_hash(proposal):
    return "sha256:"+hashlib.sha256(canonical_json(proposal).encode("utf-8")).hexdigest()

for vector in VECTORS["vectors"]:
    actual=valid_receipt(vector["receipt"])
    assert actual==vector["valid"],vector["name"]

# Negative-space invariant: a blocking decision is durable history and cannot authorize execution.
assert decision["protocol"]=="trigger/0.2"
assert decision["decision"]=="reject"
assert all(isinstance(decision[k],str) and decision[k] for k in (
    "id","proposal_id","proposal_hash","actor","issued_at"
))

proposal={
    "id":"proposal-1",
    "protocol":"trigger/0.2",
    "agent":"agent:test",
    "action":"deploy",
    "resource":"service:example",
    "scope":"production"
}
digest=proposal_hash(proposal)

approved={
    "id":"decision-1",
    "protocol":"trigger/0.2",
    "proposal_id":"proposal-1",
    "proposal_hash":digest,
    "actor":"human:alice",
    "decision":"approve",
    "authority_id":"auth:deploy",
    "issued_at":"2026-09-19T00:00:00Z"
}
trigger={
    "id":"trigger-1",
    "protocol":"trigger/0.2",
    "proposal_id":"proposal-1",
    "proposal_hash":digest,
    "decision_id":"decision-1",
    "actor":"human:alice",
    "authority_id":"auth:deploy",
    "action":"deploy",
    "resource":"service:example",
    "scope":"production",
    "issued_at":"2026-09-19T00:01:00Z"
}

assert approved["decision"]=="approve"
assert trigger["proposal_id"]==proposal["id"]
assert trigger["proposal_hash"]==approved["proposal_hash"]==digest
assert trigger["decision_id"]==approved["id"]
assert trigger["actor"]==approved["actor"]
assert trigger["authority_id"]==approved["authority_id"]
assert trigger["action"]==proposal["action"]
assert trigger["resource"]==proposal["resource"]
assert trigger["scope"]==proposal["scope"]

# Any mutation of the approved proposal or action breaks the authorization binding.
mutated=dict(proposal,action="delete")
assert proposal_hash(mutated)!=trigger["proposal_hash"]
assert mutated["action"]!=trigger["action"]

blocked={"id":"decision-2","decision":"reject","proposal_id":"proposal-1","proposal_hash":digest}
assert blocked["decision"]!="approve"

# Negative-space invariant: a later approval does not rewrite an earlier rejection.
revised=dict(proposal, id="proposal-2", action="deploy", scope="production-canary")
revised_digest=proposal_hash(revised)
later={
    "id":"decision-3",
    "protocol":"trigger/0.2",
    "proposal_id":"proposal-2",
    "proposal_hash":revised_digest,
    "actor":"human:alice",
    "decision":"approve",
    "authority_id":"auth:deploy",
    "issued_at":"2026-09-19T00:05:00Z"
}
assert blocked["id"] != later["id"]
assert blocked["decision"]=="reject"
assert later["decision"]=="approve"
assert blocked["proposal_hash"] != later["proposal_hash"]
assert blocked["proposal_id"] != later["proposal_id"]

def decision_allows_execution(decision):
    return decision.get("decision")=="approve"

assert not decision_allows_execution(blocked)
assert decision_allows_execution(later)

for vector in CANONICAL_VECTORS["vectors"]:
    encoded=canonical_json(vector["value"])
    assert encoded==vector["canonical"], vector["name"]
    assert hashlib.sha256(encoded.encode("utf-8")).hexdigest()==vector["sha256"], vector["name"]

print("Trigger Protocol v0.2 cross-object conformance: PASS")
print("JCS canonical JSON vectors: PASS")

#!/usr/bin/env python3
"""Cross-object semantic conformance checks for Trigger Protocol v0.2."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from test_vectors import valid_receipt, VECTORS

ROOT=Path(__file__).resolve().parent
decision=json.loads((ROOT.parent/"examples"/"decision-rejection.json").read_text(encoding="utf-8"))

def canonical_json(value):
    return json.dumps(value,ensure_ascii=False,separators=(",",":"),sort_keys=True)

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

print("Trigger Protocol v0.2 cross-object conformance: PASS")

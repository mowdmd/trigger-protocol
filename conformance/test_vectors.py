#!/usr/bin/env python3
"""Dependency-free semantic checks for Trigger Protocol v0.2 vectors."""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parent
VECTORS=json.loads((ROOT/"vectors.json").read_text(encoding="utf-8"))
NOW=datetime(2026,9,19,tzinfo=timezone.utc)
REQUIRED={"id","protocol","proposal_id","proposal_hash","decision_id","actor","authority_id","action","issued_at"}

def parse_time(v):
    return datetime.fromisoformat(v.replace("Z","+00:00"))

def valid_receipt(r):
    if not REQUIRED.issubset(r) or r.get("protocol")!="trigger/0.2":
        return False
    if any(not isinstance(r[k],str) or not r[k] for k in REQUIRED):
        return False
    try:
        issued=parse_time(r["issued_at"])
    except (ValueError,TypeError):
        return False
    if issued>NOW:
        return False
    if "expires_at" in r:
        try:
            expires=parse_time(r["expires_at"])
        except (ValueError,TypeError):
            return False
        if expires<=issued or expires<=NOW:
            return False
    return True

for vector in VECTORS["vectors"]:
    actual=valid_receipt(vector["receipt"])
    assert actual==vector["valid"], vector["name"]

print("Trigger Protocol v0.2 semantic vectors: PASS")

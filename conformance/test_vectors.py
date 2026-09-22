#!/usr/bin/env python3
"""Dependency-free semantic checks for Trigger Protocol v0.2 receipt vectors."""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parent
VECTORS=json.loads((ROOT/"vectors.json").read_text(encoding="utf-8"))
NOW=datetime(2026,9,19,tzinfo=timezone.utc)
SUPPORTED_PROTOCOLS={"trigger/0.2","trigger/0.3"}
REQUIRED={"id","protocol","proposal_id","proposal_hash","decision_id","actor","authority_id","action","issued_at"}

def parse_time(v):
    return datetime.fromisoformat(v.replace("Z","+00:00"))

def valid_receipt(r):
    if not REQUIRED.issubset(r) or r.get("protocol") not in SUPPORTED_PROTOCOLS:
        return False
    if any(not isinstance(r[k],str) or not r[k] for k in REQUIRED):
        return False
    if not isinstance(r["proposal_hash"],str) or not r["proposal_hash"].startswith("sha256:") or len(r["proposal_hash"]) != 71:
        return False
    if r.get("revoked") is not None and not isinstance(r["revoked"],bool):
        return False
    if r.get("revoked") is True:
        return False
    if r.get("protocol")=="trigger/0.3" and "signature" in r:
        signature=r["signature"]
        if (not isinstance(signature,dict) or signature.get("algorithm")!="Ed25519"
                or not isinstance(signature.get("key_id"),str) or not signature["key_id"]
                or not isinstance(signature.get("signature"),str) or not signature["signature"]):
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

print("Trigger Protocol receipt semantic vectors: PASS")

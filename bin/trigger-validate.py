#!/usr/bin/env python3
"""Validate a Trigger Protocol v0.2/v0.3 Trigger Receipt without external dependencies."""
import json,sys
from datetime import datetime,timezone

SUPPORTED_PROTOCOLS={"trigger/0.2","trigger/0.3"}
REQUIRED=["id","protocol","proposal_id","proposal_hash","decision_id","actor","authority_id","action","issued_at"]

def error(message):
 print(f"INVALID: {message}",file=sys.stderr); raise SystemExit(1)

def main():
 if len(sys.argv)!=2: print("usage: trigger-validate.py RECEIPT.json",file=sys.stderr); raise SystemExit(2)
 try:
  with open(sys.argv[1],encoding="utf-8") as f:r=json.load(f)
 except Exception as exc:error(f"cannot read JSON: {exc}")
 for key in REQUIRED:
  if key not in r or not isinstance(r[key],str) or not r[key]:error(f"missing or empty field: {key}")
 if r["protocol"] not in SUPPORTED_PROTOCOLS:error("unsupported protocol")
 if not r["proposal_hash"].startswith("sha256:") or len(r["proposal_hash"]) != 71:error("invalid proposal_hash")
 if r.get("revoked") is not None and not isinstance(r["revoked"],bool):error("invalid revoked")
 if r.get("revoked") is True:error("receipt is revoked")
 if r["protocol"]=="trigger/0.3" and "signature" in r:
  signature=r["signature"]
  if not isinstance(signature,dict) or signature.get("algorithm")!="Ed25519" or not isinstance(signature.get("key_id"),str) or not signature["key_id"] or not isinstance(signature.get("signature"),str) or not signature["signature"]:
   error("invalid signature")
  # This dependency-free validator checks signature shape only; it does not verify Ed25519 cryptography.
 try:issued=datetime.fromisoformat(r["issued_at"].replace("Z","+00:00"))
 except ValueError:error("invalid issued_at")
 now=datetime.now(timezone.utc)
 if issued>now:error("issued_at is in the future")
 if "expires_at" in r:
  try:expires=datetime.fromisoformat(r["expires_at"].replace("Z","+00:00"))
  except ValueError:error("invalid expires_at")
  if expires<=issued:error("expires_at must be after issued_at")
  if expires<=now:error("receipt has expired")
 print(f"VALID: Trigger Protocol {r['protocol']} trigger receipt")
 print(f"id={r['id']}")
 print(f"proposal_id={r['proposal_id']}")
 print(f"decision_id={r['decision_id']}")
 print(f"action={r['action']}")
 print(f"authority_id={r['authority_id']}")
 if r["protocol"]=="trigger/0.3" and "signature" in r:
  print("signature=present (not cryptographically verified)")
if __name__=="__main__":main()

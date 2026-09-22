#!/usr/bin/env python3
"""Validate a Trigger Protocol v0.2 Trigger Receipt without external dependencies."""
import json,sys
from datetime import datetime,timezone
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
 if r["protocol"]!="trigger/0.2":error("unsupported protocol")
 try:issued=datetime.fromisoformat(r["issued_at"].replace("Z","+00:00"))
 except ValueError:error("invalid issued_at")
 now=datetime.now(timezone.utc)
 if issued>now:error("issued_at is in the future")
 if "expires_at" in r:
  try:expires=datetime.fromisoformat(r["expires_at"].replace("Z","+00:00"))
  except ValueError:error("invalid expires_at")
  if expires<=issued:error("expires_at must be after issued_at")
  if expires<=now:error("receipt has expired")
 print("VALID: Trigger Protocol v0.2 trigger receipt")
 print(f"id={r['id']}")
 print(f"proposal_id={r['proposal_id']}")
 print(f"decision_id={r['decision_id']}")
 print(f"action={r['action']}")
 print(f"authority_id={r['authority_id']}")
if __name__=="__main__":main()

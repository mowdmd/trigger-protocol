"""Independently verify the fixed Ed25519 receipt vector and canonical payload."""
import base64
import json
import sys
from pathlib import Path
from cryptography.hazmat.primitives.serialization import load_pem_public_key

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from protocol.canonical_json import canonical_json

vector = json.loads((ROOT / 'conformance/signed-receipt-vector.json').read_text())
receipt = vector['receipt']
unsigned = {k: v for k, v in receipt.items() if k != 'signature'}
payload = canonical_json(unsigned).encode('utf-8')
assert payload.hex() == vector['canonical_utf8_hex']
key = load_pem_public_key(vector['public_key_pem'].encode())
key.verify(base64.urlsafe_b64decode(receipt['signature']['signature'] + '=='), payload)
for value in [float('inf'), float('nan'), 9007199254740992, 9007199254740992.0, '\ud800']:
    try:
        canonical_json(value)
    except (ValueError, UnicodeError):
        pass
    else:
        raise AssertionError('invalid JCS input accepted')
print('Independent Python Ed25519 and canonical bytes: PASS')

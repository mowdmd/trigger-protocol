import { createPublicKey, verify } from 'node:crypto';
import { canonicalJson } from './canonical-json.mjs';
import { validateReceipt, validateRecord } from './validation.mjs';

export function signingBytes(receipt) {
  const { signature, ...unsigned } = receipt;
  return Buffer.from(canonicalJson(unsigned), 'utf8');
}

export function verifyReceipt(receipt, publicKey, keyId) {
  validateReceipt(receipt);
  validateRecord(receipt.signature, 'trigger-receipt-signature.schema.json');
  if (!keyId || receipt.signature.key_id !== keyId) throw new Error('unknown signature key_id');
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('trusted key must be Ed25519');
  const encoded = receipt.signature.signature;
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.length !== 64 || bytes.toString('base64url') !== encoded) throw new Error('invalid signature encoding');
  if (!verify(null, signingBytes(receipt), key, bytes)) throw new Error('receipt signature verification failed');
  return true;
}

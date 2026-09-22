# Trigger Receipt Signature Profile

Version: 0.3 — experimental

This profile adds authenticity and integrity to a Trigger Receipt without introducing a central authority.

## Signing model

The receipt carries a detached signature:

    "signature": {
      "algorithm": "Ed25519",
      "key_id": "ops-release-2026",
      "signature": "<base64url>"
    }

The signature covers the canonical JSON representation of the complete receipt with the signature property removed.

Canonicalization uses RFC 8785 JSON Canonicalization Scheme (JCS):

- object keys use UTF-16 code-unit ordering;
- arrays preserve order;
- numbers use ECMAScript JSON number serialization;
- negative zero serializes as `0`;
- non-finite numbers and unsafe integers are rejected;
- no insignificant whitespace.

The signed bytes are UTF-8 encoded canonical JSON. The repository's shared JavaScript implementation is `protocol/canonical-json.mjs`.

## Verification

An executor MUST:

1. parse the receipt;
2. remove signature from the signed representation;
3. canonicalize it exactly as specified above;
4. resolve key_id to a trusted Ed25519 public key using local deployment policy;
5. verify the signature;
6. continue with the ordinary Trigger authorization checks.

A valid signature proves possession of the corresponding private key. It does not by itself prove that the key holder was entitled to authorize the action. Authority remains independent.

## Key distribution

This profile deliberately does not define a global key registry. Deployments may use local configuration, JWKS, organizational PKI, hardware-backed keys, or a future Trigger authority profile.

The verifier MUST NOT treat an arbitrary public key embedded in the receipt as trusted merely because it verifies the signature.

## Algorithm

Only Ed25519 is defined by this profile. Implementations MUST reject unknown algorithms rather than silently substituting another scheme.

## Replay

Signatures do not prevent replay. Executors SHOULD enforce expires_at, SHOULD require nonce for high-impact actions, and SHOULD maintain replay state when an action must execute at most once.

## Compatibility

Unsigned trigger/0.2 receipts remain valid for experimental deployments. A deployment that requires cryptographic authorization MUST explicitly enable signature verification and MUST reject unsigned receipts.

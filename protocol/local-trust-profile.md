# Local MCP trust profile (experimental)

This opt-in deployment profile adds checks to the v0.2 semantic core and v0.3
receipt signature profile. It does not change their lifecycle or turn a signature
into authority. The base adapter still supports trusted local unsigned receipts.

## Configuration

Install package dependencies with `npm ci` when running from a checkout.
The adapter uses Ajv 2020-12 and ajv-formats for actual record validation.

`--public-key <PEM> --key-id <ID>` is a single explicit trusted ID-to-key mapping.
Both arguments are required together. Unknown IDs, non-Ed25519 keys, malformed
signature objects, noncanonical base64url and signatures other than 64 bytes fail.
`--require-signature` additionally rejects unsigned receipts. The standalone
`trigger-receipt verify` command also requires `--key-id` now. Verification of a
signature alone does not check receipt expiry, approval, or execution policy.

To enable the complete local execution profile, use all of:

```bash
mkdir -m 700 ./replay-state
node bin/trigger-mcp-proxy.mjs --mode gate \
  --receipt ./signed-receipt.json \
  --public-key ./public.pem --key-id operator --require-signature \
  --trust-state ./trust-state.json --replay-dir ./replay-state \
  -- node examples/mcp-demo-server.mjs
```

`examples/local-trust/receipt.json` and `examples/local-trust/state.json` are a
matching illustrative pair. Copy them to the paths above, generate a test key,
then sign the receipt with `--key-id operator`. Their long validity interval is
for demonstrations; operators choose short snapshot/receipt lifetimes.

## Trust snapshot

`local-trust-state.schema.json` describes an operator-controlled local file with
`updated_at`, `expires_at`, `proposals`, `decisions`, `authorities`, `delegations`,
`key_bindings`, `revoked_receipt_ids`, and `revoked_key_ids`. Each key binding maps
`key_id` to an actor and a list of authority IDs. The snapshot is a deployment
configuration, not a portable new core primitive or a network revocation service.

The gate reloads and validates this file before every `tools/call`. Missing,
malformed, ambiguous, expired or future-dated state fails closed. Operators must
protect it and the key files against agent writes and replace snapshots atomically.
Revocation takes effect on the next check; this is not a transaction spanning a
remote side effect, nor does it cancel actions already forwarded to the server.

The checker requires:

- exactly one referenced Proposal, approving Decision, and Authority;
- a recomputed complete Proposal hash, including its extensions;
- equal proposal/decision/receipt IDs and hashes, actor and authority bindings;
- equal action, resource and scope between proposal and receipt;
- identical concrete MCP tool/argument binding in proposal and receipt;
- valid current Decision, Authority and optional Delegation, with sensible ordering;
- a configured signing-key binding to the actor and authority;
- exact authority action/resource entries, scope equality and policy-version equality;
- no receipt/key/authority/delegation revocation.

Only direct authority and one delegation from its holder are implemented.
Delegation must name the same authority, preserve scope, have an expiry within
any authority expiry, and precede the Decision. Authority action/resource entries
are compared as exact strings; glob matching, multi-hop graphs, and external
policy evaluation are not implemented. Nonempty receipt constraints or authority/
delegation limits fail closed in this profile. Array scopes remain available in
the base v0.3 adapter but cannot match a v0.2 Proposal's string scope here.

Decision Records are read, never rewritten. `reject`, `modify`, `defer`, and
`request_second_opinion` cannot authorize. An earlier rejection can coexist with
a later approval under a different Decision ID. Keeping an immutable, complete
history in durable storage remains the issuing system's responsibility; this
snapshot reader does not prove that history has not been omitted or rewritten.

## Single-use execution

`--replay-dir` requires `--require-signature`, a nonce and an expiry. All gate
processes for the same authority must use the same existing operator-owned local
directory. Atomic directory creation claims both `(authority_id, receipt_id)` and
`(authority_id, nonce)`; IDs are hashed, never used as paths. Claims are synced to
disk before forwarding. Already claimed IDs/nonces, missing directories, and I/O
errors block execution. Unsigned/invalid/blocked requests do not consume claims.

Claims are deliberately never rolled back or automatically deleted. A crash or
upstream failure can consume a receipt without completing the action. This is
at-most-once forwarding, not exactly-once delivery or completion. Retry requires
a new authorization with new receipt ID and nonce. Do not remove claims while
any receipt sharing their IDs/nonces could still be accepted.

This implementation assumes a local filesystem supporting atomic mkdir and
directory fsync. It does not provide distributed locking across hosts or networks;
use a transactional deployment store for that topology. Crash durability depends
on the filesystem and storage guarantees; network filesystems are not certified.

## Gate input and compatibility

Gate mode rejects invalid JSON, duplicate JSON members, lone surrogates, unsafe
integers and non-finite numbers before routing. JSON-RPC batches/scalars and
invalid envelopes are rejected. `tools/call` requires a nonempty name and object
arguments (omission means `{}`, explicit null is rejected). Well-formed non-tool
requests and responses pass through; observe mode remains transparent. Protect
side effects exposed through other methods at their own execution boundary.

Receipt validity, structural validation and configured signature verification run
at startup and before each invocation. A changed receipt file requires a restart;
public-key rotation and snapshot revocation are observed on the next call. Base
mode without `--trust-state` still delegates Proposal/Decision/Authority checks to
the surrounding system. Without `--replay-dir`, a nonce is not consumed.

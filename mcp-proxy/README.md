# trigger-mcp-proxy

A zero-dependency stdio middleware that inserts a Trigger Protocol authorization boundary between an existing MCP client/agent and MCP server.

## Install / run

Once published:

```bash
npx trigger-mcp-proxy -- npx -y <your-mcp-server> <args>
```

No global installation is required.

The proxy uses the upstream process's stdin/stdout as the MCP JSON-RPC stream and keeps its own diagnostics on stderr.

## The important distinction

The default is **observe mode** because it must be possible to insert the proxy into an existing agent environment without changing behavior.

Observe mode is **not authorization**.

For an actual enforcement boundary, use **gate mode**:

```bash
npx trigger-mcp-proxy \
  --mode gate \
  --receipt ./trigger-receipt.json \
  -- npx -y <your-mcp-server> <args>
```

Gate mode forwards a `tools/call` only when the supplied Trigger Receipt authorizes that concrete invocation.

## What gate mode verifies

The receipt must:

- use the Trigger Protocol core format (`trigger/0.2`) or the compatible experimental trust-layer format (`trigger/0.3`);
- contain the required authorization-event fields, including `proposal_hash`;
- not be expired;
- not be explicitly revoked;
- use `action: "mcp.tools/call"`;
- cover the requested tool through a valid non-empty `scope` (string or non-empty string array), or through the exact MCP `tool_name` extension;
- satisfy optional exact tool-name binding;
- satisfy optional exact-argument binding.

When signature enforcement is enabled, the proxy additionally verifies the experimental Ed25519 signature profile and the configured trusted public key. Signature verification authenticates receipt integrity; it does not establish authority by itself.

An unauthorized request is **blocked before it reaches the upstream MCP server** and receives JSON-RPC error `-32001`.

The proxy never turns an AI recommendation into authority.

## Receipt is evidence, not authority

The proxy does not mint, infer, or broaden authority.

A receipt says which proposal, proposal hash, decision, actor, authority, action, and scope are being presented at the execution boundary. The deployment still needs a trust layer capable of establishing that those references are legitimate.

Today the package is intentionally conservative about this distinction: it validates the receipt artifact locally, but does not pretend that local JSON parsing or signature verification proves real-world identity or institutional legitimacy.

## Exact invocation binding

For consequential tools, bind the receipt to the exact tool and arguments:

```json
{
  "action": "mcp.tools/call",
  "scope": "delete_file",
  "proposal_hash": "sha256:<proposal-content-hash>",
  "extensions": {
    "https://trigger-protocol.org/ns/mcp-proxy": {
      "tool_name": "delete_file",
      "arguments_sha256": "<sha256 of canonical JSON arguments>"
    }
  }
}
```

Arguments are hashed from canonical JSON with object keys sorted recursively.

## One-minute demo

From the repository root:

```bash
npm test

npx trigger-mcp-proxy \
  --mode gate \
  --receipt ./examples/mcp-demo-receipt.json \
  -- node ./examples/mcp-demo-server.mjs
```

The included demo server exposes a harmless `hello` tool. The example receipt authorizes only that tool.

The optional `nonce` field is an identifier carried by the receipt; this adapter does not treat it as a replay counter or consume it. Replay prevention across repeated requests or process restarts remains a deployment responsibility, consistent with the threat model.

## Security boundary

The proxy answers one narrow question:

> Was this concrete MCP action presented with a valid Trigger Receipt before it reached the upstream server?

It does not independently resolve whether the referenced proposal hash matches a separately stored proposal or whether the named actor truly held the authority; those remain deployment trust-layer checks.

It does not answer:

- whether the underlying decision was substantively correct;
- whether the organization chose a good policy;
- whether an identity is genuine;
- whether an MCP tool itself is safe;
- whether a human should have approved the proposal.

Those are separate governance and trust layers.

## Scope

The current adapter gates `tools/call`. Other MCP methods pass through unchanged.

Future adapter profiles can extend the same boundary to additional consequential operations.

## Development

```bash
npm test
node bin/trigger-mcp-proxy.mjs --help
npm pack --dry-run
```

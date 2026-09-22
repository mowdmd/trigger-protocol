# Trigger Protocol Interoperability

Version: 0.2
Status: Experimental

## Goal

Two independent implementations MUST be able to exchange a proposal, authorization, trigger receipt, and execution record without sharing a model vendor, programming language, database, cloud, or identity provider.

## Canonical representation

JSON using UTF-8 is the reference interchange representation. JSON Schema Draft 2020-12 is used for structural validation.

The wire format is transport-neutral. HTTP, queues, files, MCP, A2A, message buses, or other transports MAY carry the records. The reference MCP adapter is a middleware layer, not a replacement for MCP.

## Identifier rules

Every protocol object has a stable id. IDs are opaque strings. Implementations MUST NOT infer authority, identity, scope, or trust from the syntax of an ID.

References MUST use the referenced object's ID, not a copied object, so a record remains linked to its source of authority.

## Envelope

Transport adapters SHOULD wrap protocol objects in an envelope:

{
  "protocol": "trigger/0.2",
  "type": "trigger.receipt",
  "id": "tr-001",
  "created_at": "2026-09-19T00:00:00Z",
  "body": {}
}

The envelope identifies the protocol and object type; it does not itself grant authority.

## Compatibility

A v0.2 implementation MUST accept canonical core fields, reject structurally invalid records, preserve unknown extension fields when forwarding records, preserve object IDs and references, distinguish approval from all non-approval decisions, enforce trigger validity at execution time, and expose enough information to determine the authority, scope, constraints, and validity interval used for execution. The core binding MUST preserve the proposal hash from Proposal through Decision into Trigger/Receipt; a Trigger MUST NOT authorize a materially different proposal or action merely because the decision ID is valid.

Implementations MAY support additional protocol versions. They MUST NOT silently reinterpret a record from another version.

## Capability negotiation

Transports MAY advertise supported versions and object types. Capability discovery is not an authorization mechanism.

Example:

{
  "protocols": ["trigger/0.2"],
  "types": ["proposal", "decision", "trigger.receipt", "execution", "outcome"]
}

## Trust model

Interoperability does not imply trust. A receiving executor MUST independently verify the authority and constraints relevant to its own execution context.

Cryptographic signatures, identity federation, revocation registries, and transport authentication are profiles layered on the core protocol rather than assumptions of the semantic model. The Ed25519 receipt profile is versioned separately as `0.3` and does not change `trigger/0.2` semantics.

## MCP adapter profile

The reference `trigger-mcp-proxy` maps an MCP `tools/call` to the Trigger Protocol action `mcp.tools/call`. In gate mode, the proxy forwards a call only when a Trigger Receipt has a non-empty scope covering the requested tool and an exact MCP `tool_name` plus canonical-JSON SHA-256 argument binding matching the request. Missing or malformed bindings fail closed.

The adapter is intentionally asymmetric: the upstream MCP server remains the execution target, while the proxy is the receipt/invocation enforcement point. It does not by itself dereference `decision_id`, prove that the referenced Decision is `approve`, or establish authority/identity legitimacy. Those remain deployment trust-layer checks required for full execution conformance. Observe mode is transparent and therefore provides instrumentation, not enforcement.

## Proposal hash canonicalization

The semantic core uses SHA-256 for `proposal_hash`. The hashed representation is **RFC 8785 JSON Canonicalization Scheme (JCS)** encoded as UTF-8.

The canonicalization rules are:

- object keys are sorted by their UTF-16 code-unit order, matching ECMAScript;
- array order is preserved;
- strings, booleans, and null use JSON serialization;
- numbers use ECMAScript JSON number serialization, including its decimal/scientific notation thresholds and normalization of negative zero;
- non-finite numbers are not valid JSON;
- integers outside the I-JSON safe integer range MUST be rejected;
- insignificant whitespace is omitted.

The repository's JavaScript implementation is shared at `protocol/canonical-json.mjs`; the Python conformance implementation is `protocol/canonical_json.py`. Independent implementations MUST produce the same canonical UTF-8 bytes and therefore the same SHA-256 digest. Conformance vectors include `0.0`, `1.0`, decimal/scientific thresholds, negative zero, and key ordering.

Implementations MUST hash canonical content rather than a transport-specific serialization.

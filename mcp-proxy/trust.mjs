import { createHash } from 'node:crypto';
import { mkdirSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../protocol/canonical-json.mjs';
import { readJson } from '../protocol/strict-json.mjs';
import { validateRecord, checkValidity, timestamp } from '../protocol/validation.mjs';

const NS = 'https://trigger-protocol.org/ns/mcp-proxy';
const digest = v => createHash('sha256').update(canonicalJson(v)).digest('hex');
const equal = (a, b) => a === undefined || b === undefined ? a === b : canonicalJson(a) === canonicalJson(b);
function requireThat(condition, message) { if (!condition) throw new Error(message); }
function noLimits(value) { requireThat(value === undefined || Object.keys(value).length === 0, 'unsupported constraints or limits'); }

// Local, operator-controlled snapshot. No authority is inferred from a signature.
// Supports direct authority and one bounded delegation hop; no implicit graph traversal.
export function checkTrust(receipt, path, keyId, now = Date.now()) {
  const state = readJson(path); // Reload for every attempted execution.
  validateRecord(state, 'local-trust-state.schema.json');
  checkValidity(state, now, 'updated_at');
  requireThat(!state.revoked_receipt_ids.includes(receipt.id), 'revoked receipt');
  requireThat(!state.revoked_key_ids.includes(keyId), 'revoked signing key');
  function get(list, id, schema) {
    const matches = list.filter(x => x.id === id);
    requireThat(matches.length === 1, `missing or ambiguous ${schema}`);
    return validateRecord(matches[0], schema);
  }
  const proposal = get(state.proposals, receipt.proposal_id, 'proposal.schema.json');
  const decision = get(state.decisions, receipt.decision_id, 'decision.schema.json');
  const authority = get(state.authorities, receipt.authority_id, 'authority.schema.json');
  requireThat(decision.decision === 'approve', 'decision does not approve');
  requireThat(decision.proposal_id === proposal.id, 'decision proposal mismatch');
  requireThat(receipt.proposal_hash === `sha256:${digest(proposal)}` && receipt.proposal_hash === decision.proposal_hash, 'proposal hash mismatch');
  requireThat(receipt.actor === decision.actor && receipt.authority_id === decision.authority_id, 'decision actor/authority mismatch');
  for (const field of ['action', 'resource', 'scope']) requireThat(equal(receipt[field], proposal[field]), `proposal ${field} mismatch`);
  requireThat(equal(proposal.extensions?.[NS], receipt.extensions?.[NS]) && proposal.extensions?.[NS], 'proposal invocation binding mismatch');
  checkValidity(decision, now);
  checkValidity(authority, now, 'valid_from', 'valid_until');
  const issued = timestamp(receipt.issued_at);
  requireThat(timestamp(decision.issued_at) <= issued, 'receipt predates decision');
  if (authority.valid_from) requireThat(timestamp(authority.valid_from) <= timestamp(decision.issued_at), 'decision predates authority');
  noLimits(receipt.constraints); noLimits(authority.limits);
  requireThat(authority.scope === receipt.scope, 'authority scope mismatch');
  // Explicit exact values only: a glob/policy language is deliberately not guessed.
  requireThat(authority.action_patterns?.includes(receipt.action), 'authority action mismatch');
  if (receipt.resource !== undefined) requireThat(authority.resource_patterns?.includes(receipt.resource), 'authority resource mismatch');
  requireThat(authority.policy === receipt.policy_version, 'policy version mismatch');
  const binding = state.key_bindings.filter(b => b.key_id === keyId);
  requireThat(binding.length === 1 && binding[0].actor === receipt.actor && binding[0].authority_ids.includes(authority.id), 'signer actor/authority mismatch');
  if (receipt.delegation_id !== undefined) {
    const delegation = get(state.delegations, receipt.delegation_id, 'delegation.schema.json');
    checkValidity(delegation, now);
    requireThat(timestamp(delegation.issued_at) <= timestamp(decision.issued_at), 'decision predates delegation');
    requireThat(delegation.grantor === authority.holder && delegation.grantee === receipt.actor && delegation.authority_id === authority.id, 'delegation identity mismatch');
    requireThat(delegation.scope === authority.scope, 'delegation scope mismatch');
    // Requiring a bounded interval is stricter than the semantic core.
    requireThat(delegation.expires_at !== undefined, 'delegation expiry required');
    if (authority.valid_until) requireThat(timestamp(delegation.expires_at) <= timestamp(authority.valid_until), 'delegation exceeds authority validity');
    noLimits(delegation.limits);
  } else requireThat(authority.holder === receipt.actor, 'authority holder mismatch');
  return true;
}

// mkdir is the cross-process compare-and-set. Claims are never rolled back:
// a crash/failed upstream write may burn an authorization, but cannot reuse it.
export function consumeReceipt(receipt, directory) {
  requireThat(typeof receipt.nonce === 'string' && receipt.nonce.length > 0 && receipt.expires_at, 'replay protection requires nonce and expires_at');
  const parent = openSync(directory, 'r'); // Missing/unavailable store fails closed.
  try {
    for (const identity of [['receipt', receipt.authority_id, receipt.id], ['nonce', receipt.authority_id, receipt.nonce]]) {
      try { mkdirSync(join(directory, digest(identity)), { mode: 0o700 }); }
      catch (error) { if (error.code === 'EEXIST') throw new Error('receipt replay detected'); throw error; }
      fsyncSync(parent); // Persist claim before forwarding; unsupported filesystems fail closed.
    }
  } finally { closeSync(parent); }
}

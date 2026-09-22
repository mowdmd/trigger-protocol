import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const schemas = [
  "protocol/proposal.schema.json",
  "protocol/review.schema.json",
  "protocol/decision.schema.json",
  "protocol/authority.schema.json",
  "protocol/delegation.schema.json",
  "protocol/trigger.schema.json",
  "protocol/trigger-receipt.schema.json",
  "protocol/trigger-receipt-0.3.schema.json",
  "protocol/trigger-receipt-signature.schema.json",
  "protocol/execution.schema.json",
  "protocol/audit.schema.json",
  "protocol/outcome.schema.json",
  "protocol/envelope.schema.json",
  "protocol/primitive.schema.json"
];

for (const relative of schemas) {
  const value = JSON.parse(readFileSync(resolve(root, relative), "utf8"));
  assert.equal(value.type, "object", relative);
  assert.ok(value.properties, relative);
}

const trigger = JSON.parse(readFileSync(resolve(root, "protocol/trigger.schema.json"), "utf8"));
const decision = JSON.parse(readFileSync(resolve(root, "protocol/decision.schema.json"), "utf8"));
const receipt = JSON.parse(readFileSync(resolve(root, "protocol/trigger-receipt.schema.json"), "utf8"));

assert.deepEqual(
  trigger.required,
  ["id","protocol","proposal_id","proposal_hash","decision_id","actor","authority_id","action","issued_at"]
);
assert.ok(decision.required.includes("proposal_hash"));
assert.ok(decision.required.includes("authority_id"));
assert.ok(receipt.required.includes("proposal_hash"));
assert.equal(trigger.properties.protocol.const, "trigger/0.2");
assert.equal(decision.properties.protocol.const, "trigger/0.2");
assert.equal(receipt.properties.protocol.const, "trigger/0.2");

console.log("schema sanity: PASS");

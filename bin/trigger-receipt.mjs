#!/usr/bin/env node
import { generateKeyPairSync, sign, createPrivateKey } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { readJson } from '../protocol/strict-json.mjs';
import { validateReceipt } from '../protocol/validation.mjs';
import { signingBytes, verifyReceipt } from '../protocol/receipt-signature.mjs';

function usage() {
  console.error("Usage: trigger-receipt keygen|sign|verify ...");
}
const { values, positionals } = parseArgs({
  options: {
    "private-key": { type: "string" },
    "public-key": { type: "string" },
    receipt: { type: "string" },
    "key-id": { type: "string" },
    force: { type: "boolean", default: false }
  },
  allowPositionals: true
});
const command = positionals[0];

if (command === "keygen") {
  if (!values["private-key"] || !values["public-key"]) throw new Error("--private-key and --public-key are required");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const flag = values.force ? "w" : "wx";
  writeFileSync(values["private-key"], privateKey, { flag, mode: 0o600 });
  writeFileSync(values["public-key"], publicKey, { flag });
  console.log("Ed25519 key pair generated.");
} else if (command === "sign") {
  if (!values.receipt || !values["private-key"] || !values["key-id"]) throw new Error("--receipt, --private-key and --key-id are required");
  const receipt = validateReceipt(readJson(values.receipt));
  if (receipt.protocol !== "trigger/0.3") throw new Error("signing requires protocol trigger/0.3");
  const payload = signingBytes(receipt);
  const key = createPrivateKey(readFileSync(values['private-key']));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('signing key must be Ed25519');
  const signature = sign(null, payload, key).toString('base64url');
  receipt.signature = { algorithm: "Ed25519", key_id: values["key-id"], signature };
  writeFileSync(values.receipt, JSON.stringify(receipt, null, 2) + "\n");
  console.log("Receipt signed.");
} else if (command === "verify") {
  if (!values.receipt || !values["public-key"] || !values["key-id"]) throw new Error("--receipt, --public-key and --key-id are required");
  const receipt = validateReceipt(readJson(values.receipt));
  if (receipt.protocol !== "trigger/0.3") throw new Error("receipt protocol must be trigger/0.3");
  verifyReceipt(receipt, readFileSync(values['public-key']), values['key-id']);
  console.log("Signature valid.");
} else {
  usage();
  process.exitCode = 2;
}

#!/usr/bin/env node
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { canonicalJson } from "../protocol/canonical-json.mjs";

function unsignedReceipt(receipt) {
  const copy = structuredClone(receipt);
  delete copy.signature;
  return copy;
}
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
  const receipt = JSON.parse(readFileSync(values.receipt, "utf8"));
  if (receipt.protocol !== "trigger/0.3") throw new Error("signing requires protocol trigger/0.3");
  const payload = Buffer.from(canonicalJson(unsignedReceipt(receipt)), "utf8");
  const signature = sign(null, payload, readFileSync(values["private-key"], "utf8")).toString("base64url");
  receipt.signature = { algorithm: "Ed25519", key_id: values["key-id"], signature };
  writeFileSync(values.receipt, JSON.stringify(receipt, null, 2) + "\n");
  console.log("Receipt signed.");
} else if (command === "verify") {
  if (!values.receipt || !values["public-key"]) throw new Error("--receipt and --public-key are required");
  const receipt = JSON.parse(readFileSync(values.receipt, "utf8"));
  if (receipt.protocol !== "trigger/0.3") throw new Error("receipt protocol must be trigger/0.3");
  if (!receipt.signature || receipt.signature.algorithm !== "Ed25519") throw new Error("missing Ed25519 signature");
  const payload = Buffer.from(canonicalJson(unsignedReceipt(receipt)), "utf8");
  const ok = verify(null, payload, readFileSync(values["public-key"], "utf8"), Buffer.from(receipt.signature.signature, "base64url"));
  if (!ok) throw new Error("signature verification failed");
  console.log("Signature valid.");
} else {
  usage();
  process.exitCode = 2;
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { canonicalJsonSha256 } from "../protocol/canonical-json.mjs";

function hash(value) {
  return canonicalJsonSha256(value, createHash);
}

const canonicalVectors = JSON.parse(readFileSync(new URL("../conformance/canonical-vectors.json", import.meta.url), "utf8"));
for (const vector of canonicalVectors.vectors) {
  assert.equal(canonicalJsonSha256(vector.value, createHash), vector.sha256, vector.name);
}

const args = { path: "/tmp/example.txt", recursive: false };
const expected = "0e006c8cfb0addee461e4774d4d5609a4c847b4d09ffb5f82d7a3605a121b1dc";
assert.equal(hash(args), expected);

const proxy = new URL("../bin/trigger-mcp-proxy.mjs", import.meta.url);
const demo = new URL("../examples/mcp-demo-server.mjs", import.meta.url);
const receipt = new URL("../examples/mcp-demo-receipt.json", import.meta.url);

const child = spawn(process.execPath, [
  proxy.pathname,
  "--mode", "gate",
  "--receipt", receipt.pathname,
  "--",
  process.execPath, demo.pathname
], { stdio: ["pipe", "pipe", "pipe"] });

let stdout = "";
let stderr = "";
child.stdout.on("data", chunk => { stdout += chunk; });
child.stderr.on("data", chunk => { stderr += chunk; });

child.stdin.write(JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "hello", arguments: { name: "Trigger" } }
}) + "\n");

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", code => resolve(code));
  setTimeout(() => child.stdin.end(), 100);
});

assert.equal(exitCode, 0, stderr);
assert.match(stdout, /"Hello, Trigger\."/);
assert.match(stderr, /"event":"authorized"/);

console.log("mcp-proxy tests: PASS");

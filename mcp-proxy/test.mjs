import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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


async function runGate(receiptPath, request) {
  const child = spawn(process.execPath, [
    proxy.pathname,
    "--mode", "gate",
    "--receipt", receiptPath,
    "--",
    process.execPath, demo.pathname
  ], { stdio: ["pipe", "pipe", "pipe"] });

  let out = "";
  let err = "";
  child.stdout.on("data", chunk => { out += chunk; });
  child.stderr.on("data", chunk => { err += chunk; });
  child.stdin.write(JSON.stringify(request) + "\n");
  child.stdin.end();

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolve(code));
  });
  return { exitCode, out, err };
}

const tempDir = mkdtempSync(new URL("trigger-proxy-tests-", "file:///tmp/").pathname);
try {
  const baseReceipt = JSON.parse(readFileSync(receipt, "utf8"));

  const missingScope = { ...baseReceipt };
  delete missingScope.scope;
  const missingScopePath = new URL("./missing-scope.json", `file://${tempDir}/`).pathname;
  writeFileSync(missingScopePath, JSON.stringify(missingScope));
  const blocked = await runGate(missingScopePath, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "hello", arguments: { name: "Trigger" } }
  });
  assert.equal(blocked.exitCode, 0, blocked.err);
  assert.match(blocked.out, /Trigger Protocol authorization required/);
  assert.match(blocked.err, /"event":"blocked"/);

  const invalidScope = { ...baseReceipt, scope: { tool: "hello" } };
  const invalidScopePath = new URL("./invalid-scope.json", `file://${tempDir}/`).pathname;
  writeFileSync(invalidScopePath, JSON.stringify(invalidScope));
  const blockedType = await runGate(invalidScopePath, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "hello", arguments: { name: "Trigger" } }
  });
  assert.equal(blockedType.exitCode, 0, blockedType.err);
  assert.match(blockedType.out, /Trigger Protocol authorization required/);

  const missingToolBinding = { ...baseReceipt, extensions: {} };
  const missingToolBindingPath = new URL("./missing-tool-binding.json", `file://${tempDir}/`).pathname;
  writeFileSync(missingToolBindingPath, JSON.stringify(missingToolBinding));
  const blockedMissingToolBinding = await runGate(missingToolBindingPath, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "hello", arguments: { name: "Trigger" } }
  });
  assert.match(blockedMissingToolBinding.out, /Trigger Protocol authorization required/);

  const malformedToolBinding = {
    ...baseReceipt,
    extensions: { "https://trigger-protocol.org/ns/mcp-proxy": { tool_name: 123, arguments_sha256: baseReceipt.extensions["https://trigger-protocol.org/ns/mcp-proxy"].arguments_sha256 } }
  };
  const malformedToolBindingPath = new URL("./malformed-tool-binding.json", `file://${tempDir}/`).pathname;
  writeFileSync(malformedToolBindingPath, JSON.stringify(malformedToolBinding));
  const blockedMalformedToolBinding = await runGate(malformedToolBindingPath, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "hello", arguments: { name: "Trigger" } }
  });
  assert.match(blockedMalformedToolBinding.out, /Trigger Protocol authorization required/);

  const missingArgumentBinding = {
    ...baseReceipt,
    extensions: { "https://trigger-protocol.org/ns/mcp-proxy": { tool_name: "hello" } }
  };
  const missingArgumentBindingPath = new URL("./missing-argument-binding.json", `file://${tempDir}/`).pathname;
  writeFileSync(missingArgumentBindingPath, JSON.stringify(missingArgumentBinding));
  const blockedMissingArgumentBinding = await runGate(missingArgumentBindingPath, {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "hello", arguments: { name: "Trigger" } }
  });
  assert.match(blockedMissingArgumentBinding.out, /Trigger Protocol authorization required/);

  const wrongArguments = {
    ...baseReceipt,
    extensions: {
      "https://trigger-protocol.org/ns/mcp-proxy": {
        ...baseReceipt.extensions["https://trigger-protocol.org/ns/mcp-proxy"],
        arguments_sha256: hash({ name: "Other" })
      }
    }
  };
  const wrongArgumentsPath = new URL("./wrong-arguments.json", `file://${tempDir}/`).pathname;
  writeFileSync(wrongArgumentsPath, JSON.stringify(wrongArguments));
  const blockedWrongArguments = await runGate(wrongArgumentsPath, {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "hello", arguments: { name: "Trigger" } }
  });
  assert.match(blockedWrongArguments.out, /Trigger Protocol authorization required/);

  const futureReceipt = { ...baseReceipt, issued_at: "2099-01-01T00:00:00Z" };
  const futurePath = new URL("./future.json", `file://${tempDir}/`).pathname;
  writeFileSync(futurePath, JSON.stringify(futureReceipt));
  const future = spawn(process.execPath, [
    proxy.pathname,
    "--mode", "gate",
    "--receipt", futurePath,
    "--",
    process.execPath, demo.pathname
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let futureErr = "";
  future.stderr.on("data", chunk => { futureErr += chunk; });
  const futureExit = await new Promise(resolve => future.once("exit", resolve));
  assert.notEqual(futureExit, 0);
  assert.match(futureErr, /issued_at is in the future/);

  const badExpiry = { ...baseReceipt, expires_at: "2026-06-01T00:00:00Z" };
  const badExpiryPath = new URL("./bad-expiry.json", `file://${tempDir}/`).pathname;
  writeFileSync(badExpiryPath, JSON.stringify(badExpiry));
  const expiry = spawn(process.execPath, [
    proxy.pathname,
    "--mode", "gate",
    "--receipt", badExpiryPath,
    "--",
    process.execPath, demo.pathname
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let expiryErr = "";
  expiry.stderr.on("data", chunk => { expiryErr += chunk; });
  const expiryExit = await new Promise(resolve => expiry.once("exit", resolve));
  assert.notEqual(expiryExit, 0);
  assert.match(expiryErr, /receipt is expired/);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

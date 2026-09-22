import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonSha256 } from "../protocol/canonical-json.mjs";

function hash(value) {
  return canonicalJsonSha256(value, createHash);
}

async function runProxy(receipt, server, message) {
  const child = spawn(process.execPath, [
    proxy.pathname,
    "--mode", "gate",
    "--receipt", receipt.pathname,
    "--",
    process.execPath, server.pathname
  ], { stdio: ["pipe", "pipe", "pipe"] });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  child.stdin.write(JSON.stringify(message) + "\n");
  child.stdin.end();

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolve(code));
  });

  return { exitCode, stdout, stderr };
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

{
  const result = await runProxy(receipt, demo, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "hello", arguments: { name: "Trigger" } }
  });

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /"Hello, Trigger\."/);
  assert.match(result.stderr, /"event":"authorized"/);
}

const destructive = new URL("../examples/destructive-action/server.mjs", import.meta.url);
const destructiveReceipt = new URL("../examples/destructive-action/receipt.json", import.meta.url);

{
  const result = await runProxy(destructiveReceipt, destructive, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "delete_file",
      arguments: { path: "/tmp/important.txt", recursive: false }
    }
  });

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /reached the executor/);
  assert.match(result.stderr, /"event":"authorized"/);
}

{
  const result = await runProxy(destructiveReceipt, destructive, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "delete_file",
      arguments: { path: "/tmp/other.txt", recursive: false }
    }
  });

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /-32001/);
  assert.doesNotMatch(result.stdout, /reached the executor/);
  assert.match(result.stderr, /"event":"blocked"/);
}

{
  const dir = mkdtempSync(join(tmpdir(), "trigger-mcp-proxy-"));
  try {
    const unscoped = join(dir, "receipt.json");
    const value = JSON.parse(readFileSync(receipt, "utf8"));
    delete value.scope;
    writeFileSync(unscoped, JSON.stringify(value));

    const result = await runProxy(new URL("file://" + unscoped), demo, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "hello", arguments: { name: "Trigger" } }
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /-32001/);
    assert.doesNotMatch(result.stdout, /"Hello, Trigger\\."/);
    assert.match(result.stderr, /"event":"blocked"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("mcp-proxy tests: PASS");

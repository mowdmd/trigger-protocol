import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "trigger-receipt-"));
try {
  const priv = join(dir, "private.pem");
  const pub = join(dir, "public.pem");
  const receipt = join(dir, "receipt.json");
  const source = readFileSync(new URL("../examples/destructive-action/receipt.json", import.meta.url), "utf8");
  writeFileSync(receipt, source);

  let r = spawnSync(process.execPath, ["bin/trigger-receipt.mjs", "keygen", "--private-key", priv, "--public-key", pub], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);

  r = spawnSync(process.execPath, ["bin/trigger-receipt.mjs", "sign", "--receipt", receipt, "--private-key", priv, "--key-id", "test-key"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);

  r = spawnSync(process.execPath, ["bin/trigger-receipt.mjs", "verify", "--receipt", receipt, "--public-key", pub, "--key-id", "test-key"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Signature valid/);

  const tampered = JSON.parse(readFileSync(receipt, "utf8"));
  tampered.scope = "other_tool";
  writeFileSync(receipt, JSON.stringify(tampered));
  r = spawnSync(process.execPath, ["bin/trigger-receipt.mjs", "verify", "--receipt", receipt, "--public-key", pub, "--key-id", "test-key"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);

  console.log("receipt signature tests: PASS");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

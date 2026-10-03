import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { canonicalJsonSha256 } from "../protocol/canonical-json.mjs";

import { parseJson, readJson } from '../protocol/strict-json.mjs';
import { validateReceipt, checkValidity } from '../protocol/validation.mjs';
import { verifyReceipt } from '../protocol/receipt-signature.mjs';
import { checkTrust, consumeReceipt } from './trust.mjs';

const NS = "https://trigger-protocol.org/ns/mcp-proxy";

function usage() {
  console.error(`
Usage:
  npx trigger-mcp-proxy -- <mcp-server-command> [args...]

Options:
  --mode observe|gate     observe is transparent (default); gate enforces receipts
  --receipt <file>        Trigger Receipt JSON used by --mode gate
  --public-key <file>    Trusted Ed25519 public key for receipt signature verification
  --require-signature     Require and verify the receipt's Ed25519 signature
  --key-id <id>           Expected ID of the configured public key
  --trust-state <file>    Reload local decision/authority/revocation snapshot per call
  --replay-dir <dir>      Existing shared local directory for durable single-use claims
  --help                  Show this help

Examples:
  npx trigger-mcp-proxy -- npx -y @modelcontextprotocol/server-filesystem /tmp
  npx trigger-mcp-proxy --mode gate --receipt ./trigger-receipt.json -- npx -y <mcp-server>
`);
}

function parseArgs(argv) {
  let mode = "observe";
  let receiptPath = null;
  let publicKeyPath = null;
  let requireSignature = false;
  const extra = {};
  let i = 0;

  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") { i++; break; }
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--mode") {
      mode = argv[++i];
      if (!["observe", "gate"].includes(mode)) throw new Error("--mode must be observe or gate");
      continue;
    }
    if (arg === "--receipt") {
      receiptPath = argv[++i];
      if (!receiptPath) throw new Error("--receipt requires a file");
      continue;
    }
    if (arg === "--public-key") {
      publicKeyPath = argv[++i];
      if (!publicKeyPath) throw new Error("--public-key requires a file");
      continue;
    }
    if (["--key-id", "--trust-state", "--replay-dir"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      extra[arg.slice(2)] = value;
      continue;
    }
    if (arg === "--require-signature") {
      requireSignature = true;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }

  const command = argv.slice(i);
  if (!command.length) throw new Error("missing upstream MCP server command; use -- <command> [args...]");
  if (mode === "gate" && !receiptPath) {
    throw new Error("gate mode requires --receipt");
  }
  if (requireSignature && (!receiptPath || !publicKeyPath)) {
    throw new Error("--require-signature requires --receipt and --public-key");
  }
  if (publicKeyPath && !receiptPath) {
    throw new Error("--public-key requires --receipt");
  }

  if (Boolean(publicKeyPath) !== Boolean(extra['key-id'])) throw new Error('--public-key and --key-id must be configured together');
  if ((extra['trust-state'] || extra['replay-dir']) && (mode !== 'gate' || !requireSignature)) {
    throw new Error('--trust-state and --replay-dir require gate mode and --require-signature');
  }
  return { mode, receiptPath, publicKeyPath, requireSignature, command, ...extra };
}

function sha256(value) {
  return canonicalJsonSha256(value, createHash);
}

function loadReceipt(path, options) {
  const receipt = validateReceipt(readJson(path));
  checkValidity(receipt);
  if (options.requireSignature || (options.publicKeyPath && receipt.signature !== undefined)) {
    verifyReceipt(receipt, readFileSync(options.publicKeyPath), options['key-id']);
  }
  return receipt;
}

function receiptAllows(receipt, toolName, args) {
  if (!receipt) return false;
  checkValidity(receipt);
  if (typeof toolName !== 'string' || !toolName || !args || typeof args !== 'object' || Array.isArray(args)) return false;
  if (receipt.action !== "mcp.tools/call") return false;

  const scope = receipt.scope;
  const mcp = receipt.extensions?.[NS];

  const hasScope =
    (typeof scope === "string" && scope.length > 0) ||
    (receipt.protocol === "trigger/0.3" && Array.isArray(scope) && scope.length > 0 && scope.every(item => typeof item === "string" && item.length > 0));
  if (!hasScope) return false;

  if (typeof scope === "string" && scope !== "*" && scope !== toolName) return false;
  if (Array.isArray(scope) && !scope.includes("*") && !scope.includes(toolName)) return false;

  if (!mcp || typeof mcp !== "object" || Array.isArray(mcp)) return false;
  if (typeof mcp.tool_name !== "string" || mcp.tool_name.length === 0) return false;
  if (mcp.tool_name !== toolName) return false;

  if (typeof mcp.arguments_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(mcp.arguments_sha256)) return false;
  if (mcp.arguments_sha256 !== sha256(args ?? {})) return false;

  return true;
}

function jsonRpcError(id, code, message, data = {}) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, data } }) + "\n";
}

function logEvent(event, extra = {}) {
  console.error(JSON.stringify({
    source: "trigger-mcp-proxy",
    protocol: extra.protocol ?? "trigger/0.2",
    event,
    timestamp: new Date().toISOString(),
    ...extra
  }));
}

export async function run(argv) {
  const options = parseArgs(argv);
  if (options.help) { usage(); return; }

  const receipt = options.receiptPath
    ? loadReceipt(options.receiptPath, options)
    : null;

  const child = spawn(options.command[0], options.command.slice(1), {
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env
  });

  child.on("error", (error) => {
    console.error(`upstream process error: ${error.message}`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (signal) console.error(`upstream exited by ${signal}`);
    else if (code !== 0) console.error(`upstream exited with code ${code}`);
    process.exitCode = code ?? 1;
  });

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    if (options.mode === 'observe') { child.stdin.write(line + "\n"); return; }
    let message;
    try { message = parseJson(line); }
    catch {
      process.stdout.write(jsonRpcError(null, -32700, 'Invalid JSON input'));
      logEvent('blocked', { reason: 'invalid-json' });
      return;
    }
    // Reject batch/scalar input before routing. JSON-RPC responses remain pass-through.
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const validId = id => id === null || typeof id === 'string' || Number.isSafeInteger(id);
    const validRequest = object(message) && message.jsonrpc === '2.0' &&
      typeof message.method === 'string' && message.method.length > 0 &&
      (message.id === undefined || validId(message.id)) &&
      message.result === undefined && message.error === undefined &&
      (message.params === undefined || object(message.params) || Array.isArray(message.params));
    const validResponse = object(message) && message.jsonrpc === '2.0' && message.method === undefined &&
      message.id !== undefined && validId(message.id) &&
      ((Object.hasOwn(message, 'result') && !Object.hasOwn(message, 'error')) ||
       (!Object.hasOwn(message, 'result') && object(message.error) && Number.isInteger(message.error.code) && typeof message.error.message === 'string'));
    if (!validRequest && !validResponse) {
      process.stdout.write(jsonRpcError(null, -32600, 'Invalid JSON-RPC envelope'));
      logEvent('blocked', { reason: 'invalid-envelope' });
      return;
    }
    if (message.method !== "tools/call") {
      child.stdin.write(line + "\n");
      return;
    }

    const toolName = message.params?.name;
    const args = message.params?.arguments === undefined ? {} : message.params.arguments;
    let receiptOk = false;
    let reason = 'no-valid-trigger';
    try {
      // Re-read the receipt and key too: file revocation/rotation takes effect per call.
      const current = loadReceipt(options.receiptPath, options);
      // A session is pinned to its initial authorization; updates require restart.
      if (JSON.stringify(current) !== JSON.stringify(receipt)) throw new Error('receipt changed; restart required');
      receiptOk = receiptAllows(current, toolName, args);
      if (receiptOk && options['trust-state']) checkTrust(current, options['trust-state'], options['key-id']);
      if (receiptOk && options['replay-dir']) consumeReceipt(current, options['replay-dir']);
    } catch (error) { receiptOk = false; reason = error.message; }
    if (receiptOk) {
      logEvent("authorized", {
        protocol: receipt?.protocol ?? "trigger/0.2",
        request_id: message.id ?? null,
        tool: toolName,
        receipt_id: receipt?.id ?? null,
        authorization: "trigger-receipt"
      });
      child.stdin.write(line + "\n");
      return;
    }

    logEvent("blocked", {
      protocol: receipt?.protocol ?? "trigger/0.2",
      request_id: message.id ?? null,
      tool: toolName,
      reason
    });

    if (message.id !== undefined) {
      process.stdout.write(jsonRpcError(message.id, -32001, "Trigger Protocol authorization required", {
        protocol: receipt?.protocol ?? "trigger/0.2",
        action: "mcp.tools/call",
        tool: toolName ?? null
      }));
    }
  });

  child.stdout.on("data", chunk => process.stdout.write(chunk));
  process.stdin.on("end", () => child.stdin.end());
}

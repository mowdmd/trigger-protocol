import { spawn } from "node:child_process";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { canonicalJson, canonicalJsonSha256 } from "../protocol/canonical-json.mjs";

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

  return { mode, receiptPath, publicKeyPath, requireSignature, command };
}

function sha256(value) {
  return canonicalJsonSha256(value, createHash);
}

function verifyReceiptSignature(receipt, publicKeyPath) {
  if (!receipt.signature || receipt.signature.algorithm !== "Ed25519") return false;
  if (!receipt.signature.key_id || !receipt.signature.signature) return false;
  if (!publicKeyPath) return false;

  const copy = structuredClone(receipt);
  delete copy.signature;
  const payload = Buffer.from(canonicalJson(copy), "utf8");
  return verifySignature(
    null,
    payload,
    createPublicKey(readFileSync(publicKeyPath)),
    Buffer.from(receipt.signature.signature, "base64url")
  );
}

function loadReceipt(path, publicKeyPath, requireSignature) {
  const receipt = JSON.parse(readFileSync(path, "utf8"));
  const required = ["id", "protocol", "proposal_id", "proposal_hash", "decision_id", "actor", "authority_id", "action", "issued_at"];
  for (const key of required) {
    if (typeof receipt[key] !== "string" || receipt[key].length === 0) {
      throw new Error(`receipt missing or empty ${key}`);
    }
  }
  if (!["trigger/0.2", "trigger/0.3"].includes(receipt.protocol)) throw new Error("unsupported receipt protocol");
  if (!/^sha256:[0-9a-f]{64}$/.test(receipt.proposal_hash)) {
    throw new Error("invalid proposal_hash");
  }

  const issuedAt = Date.parse(receipt.issued_at);
  if (!Number.isFinite(issuedAt)) throw new Error("invalid issued_at");
  if (issuedAt > Date.now()) throw new Error("receipt issued_at is in the future");

  if (receipt.expires_at !== undefined) {
    if (typeof receipt.expires_at !== "string" || receipt.expires_at.length === 0) {
      throw new Error("invalid expires_at");
    }
    const expiresAt = Date.parse(receipt.expires_at);
    if (!Number.isFinite(expiresAt)) throw new Error("invalid expires_at");
    if (expiresAt <= issuedAt) throw new Error("expires_at must be after issued_at");
    if (expiresAt <= Date.now()) throw new Error("receipt is expired");
  }

  if (receipt.revoked === true) throw new Error("receipt is revoked");

  if (requireSignature) {
    if (!verifyReceiptSignature(receipt, publicKeyPath)) {
      throw new Error("receipt signature verification failed");
    }
  } else if (publicKeyPath && receipt.signature && !verifyReceiptSignature(receipt, publicKeyPath)) {
    throw new Error("receipt signature verification failed");
  }

  return receipt;
}

function receiptAllows(receipt, toolName, args) {
  if (!receipt) return false;
  if (receipt.action !== "mcp.tools/call") return false;

  const scope = receipt.scope;
  const mcp = receipt.extensions?.[NS];

  const hasScope =
    (typeof scope === "string" && scope.length > 0) ||
    (Array.isArray(scope) && scope.length > 0 && scope.every(item => typeof item === "string" && item.length > 0));
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
    ? loadReceipt(options.receiptPath, options.publicKeyPath, options.requireSignature)
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
    let message;
    try { message = JSON.parse(line); }
    catch { child.stdin.write(line + "\n"); return; }

    if (options.mode === "observe" || message.method !== "tools/call") {
      child.stdin.write(line + "\n");
      return;
    }

    const toolName = message.params?.name;
    const args = message.params?.arguments ?? {};
    const receiptOk = receiptAllows(receipt, toolName, args);
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
      reason: "no-valid-trigger"
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

/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) for JSON values.
 *
 * JSON.parse/JSON.stringify use ECMAScript's JSON number serialization,
 * which is the number serialization required by JCS. Object keys are sorted
 * by UTF-16 code units, matching ECMAScript's lexical ordering.
 */
export function canonicalJson(value) {
  return serialize(value);
}

function serialize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JCS does not permit non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(serialize).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map(key => JSON.stringify(key) + ":" + serialize(value[key])).join(",") + "}";
  }
  throw new TypeError("JCS only supports JSON values");
}

export function canonicalJsonSha256(value, createHash) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

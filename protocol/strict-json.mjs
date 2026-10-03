import { readFileSync } from 'node:fs';
import { canonicalJson } from './canonical-json.mjs';

// Check raw object keys before JSON.parse can discard duplicate members.
export function parseJson(text) {
  let pos = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(text[pos] ?? '\0')) pos++; };
  function string() {
    const start = pos++;
    while (pos < text.length) {
      const c = text[pos++];
      if (c === '\\') pos++;
      else if (c === '"') return JSON.parse(text.slice(start, pos));
    }
    throw new Error('unterminated JSON string');
  }
  function value(depth = 0) {
    if (depth > 128) throw new Error('JSON nesting exceeds 128');
    ws();
    if (text[pos] === '"') { string(); return; }
    if (text[pos] === '{' || text[pos] === '[') {
      const object = text[pos++] === '{';
      const end = object ? '}' : ']';
      const keys = new Set();
      ws();
      if (text[pos] === end) { pos++; return; }
      for (;;) {
        ws();
        if (object) {
          if (text[pos] !== '"') throw new Error('invalid JSON member');
          const key = string();
          if (keys.has(key)) throw new Error('duplicate JSON key');
          keys.add(key);
          ws();
          if (text[pos++] !== ':') throw new Error('invalid JSON colon');
        }
        value(depth + 1);
        ws();
        if (text[pos] === end) { pos++; return; }
        if (text[pos++] !== ',') throw new Error('invalid JSON separator');
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(pos));
    if (!token) throw new Error('invalid JSON value');
    pos += token[0].length;
  }
  value(); ws();
  if (pos !== text.length) throw new Error('trailing JSON input');
  const result = JSON.parse(text);
  canonicalJson(result); // Reject lone surrogates, unsafe integers and non-finite numbers.
  return result;
}

export function readJson(path) {
  return parseJson(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path)));
}

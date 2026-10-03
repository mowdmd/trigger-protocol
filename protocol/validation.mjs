import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readdirSync } from 'node:fs';
import { readJson } from './strict-json.mjs';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validators = new Map();
for (const file of readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.schema.json'))) {
  const schema = readJson(new URL(file, import.meta.url));
  ajv.addSchema(schema, file);
  validators.set(file, schema);
}
// The profile's filename reference is resolved relative to its canonical $id.
ajv.addSchema(validators.get('trigger-receipt-signature.schema.json'),
  'https://trigger-protocol.org/schema/trigger-receipt-signature.schema.json');

export function validateRecord(value, file) {
  const validate = ajv.getSchema(file);
  if (!validate || !validate(value)) throw new Error(`invalid ${file}: ${ajv.errorsText(validate?.errors)}`);
  return value;
}

export function validateReceipt(value) {
  const file = value?.protocol === 'trigger/0.2' ? 'trigger-receipt.schema.json' :
    value?.protocol === 'trigger/0.3' ? 'trigger-receipt-0.3.schema.json' : null;
  if (!file) throw new Error('unsupported receipt protocol');
  return validateRecord(value, file);
}

export function timestamp(value) {
  // Full RFC3339 date-time; Ajv's format check rejects calendar rollovers.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ||
      !ajv.validate({ type: 'string', format: 'date-time' }, value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('invalid date-time');
  }
  return Date.parse(value);
}

export function checkValidity(record, now = Date.now(), start = 'issued_at', end = 'expires_at') {
  const from = record[start] === undefined ? -Infinity : timestamp(record[start]);
  const to = record[end] === undefined ? Infinity : timestamp(record[end]);
  if (from > now) throw new Error(`${start} is in the future`);
  if (to <= from) throw new Error(`${end} must be after ${start}`);
  if (to <= now) throw new Error('receipt is expired');
  if (record.revoked === true || (record.revoked_at !== undefined && timestamp(record.revoked_at) <= now)) {
    throw new Error('receipt is revoked');
  }
}

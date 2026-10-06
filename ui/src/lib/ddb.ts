import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { BatchWriteItemCommand, type AttributeValue, type DynamoDBClient, type TableDescription, type WriteRequest } from '@aws-sdk/client-dynamodb';
import { UserError } from './errors';
import { esc } from './html';

export type Item = Record<string, AttributeValue>;

export const encodeKey = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const decodeKey = (s: string): Item => {
  try { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); } catch { throw new UserError('Malformed item key.'); }
};

export const keyAttrs = (t: TableDescription) => (t.KeySchema ?? []).map((k) => k.AttributeName!);
export const attrType = (t: TableDescription, name: string) => t.AttributeDefinitions?.find((a) => a.AttributeName === name)?.AttributeType ?? 'S';

export function keyOf(item: Item, t: TableDescription): Item {
  const k: Item = {};
  for (const n of keyAttrs(t)) if (item[n]) k[n] = item[n];
  return k;
}

/** Convert a text box value into a typed key attribute. */
export function typedValue(type: string, v: string): AttributeValue {
  if (type === 'N') {
    if (v.trim() === '' || Number.isNaN(Number(v))) throw new UserError(`"${v}" is not a valid number.`);
    return { N: String(Number(v)) === 'NaN' ? v : v.trim() };
  }
  if (type === 'B') return { B: Buffer.from(v, 'base64') };
  return { S: v };
}

export function plain(item: Item): Record<string, unknown> {
  try { return unmarshall(item); } catch { return {}; }
}

/** True if converting to plain JSON and back would change the item (sets, binary, numeric precision). */
export function lossy(item: Item): boolean {
  try {
    const rt = marshall(unmarshall(item), { removeUndefinedValues: true });
    return JSON.stringify(sortKeys(rt)) !== JSON.stringify(sortKeys(item));
  } catch { return true; }
}
const sortKeys = (o: unknown): unknown => Array.isArray(o) ? o.map(sortKeys)
  : o && typeof o === 'object' && !(o instanceof Uint8Array) ? Object.fromEntries(Object.entries(o as object).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)])) : o;

export function toItem(text: string, format: string): Item {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (e) { throw new UserError(`The item is not valid JSON: ${(e as Error).message}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new UserError('An item must be a JSON object.');
  return format === 'ddb' ? (parsed as Item) : marshall(parsed as object, { removeUndefinedValues: true, convertClassInstanceToMap: true });
}

export const jsonReplacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v instanceof Uint8Array ? `<binary ${v.length}B>` : v instanceof Set ? [...v] : v);

/** Short cell rendering of a plain value. */
export function cell(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') { const s = JSON.stringify(v, jsonReplacer); return `<code class="text-[12.5px]" title="${esc(s)}">${esc(s.length > 70 ? s.slice(0, 67) + '…' : s)}</code>`; }
  const s = String(v);
  return esc(s.length > 120 ? s.slice(0, 117) + '…' : s);
}

// ---------------------------------------------------------------------------
// Reading: one place that turns the page's query string into a Scan / Query
// input, shared by the items page and the export endpoint.
// ---------------------------------------------------------------------------

export const PAGE_SIZES = [25, 50, 100] as const;
export const pageSizeOf = (sp: URLSearchParams) => {
  const n = Number(sp.get('limit'));
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : n > 0 ? Math.min(Math.round(n), 500) : 50;
};

export const FILTER_OPS = ['=', '<>', '<', '<=', '>', '>=', 'begins_with', 'contains', 'attribute_exists', 'attribute_not_exists'] as const;

function filterValue(type: string, v: string): AttributeValue {
  if (type === 'N' || (type === 'auto' && v.trim() !== '' && !Number.isNaN(Number(v)))) {
    if (v.trim() === '' || Number.isNaN(Number(v))) throw new UserError(`"${v}" is not a valid number.`);
    return { N: v.trim() };
  }
  if (type === 'BOOL' || (type === 'auto' && /^(true|false)$/i.test(v.trim()))) return { BOOL: v.trim().toLowerCase() === 'true' };
  return { S: v };
}

export interface ReadInput {
  mode: 'scan' | 'query';
  input: {
    TableName: string; IndexName?: string; FilterExpression?: string; KeyConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>; ExpressionAttributeValues?: Record<string, AttributeValue>;
    ScanIndexForward?: boolean;
  };
}

export function buildRead(table: string, t: TableDescription, sp: URLSearchParams): ReadInput {
  const mode = sp.get('mode') === 'query' ? 'query' : 'scan';
  const indexName = sp.get('index') ?? '';
  const indexes = [...(t.GlobalSecondaryIndexes ?? []), ...(t.LocalSecondaryIndexes ?? [])];
  const schema = indexName ? indexes.find((i) => i.IndexName === indexName)?.KeySchema : t.KeySchema;
  const pkName = schema?.find((k) => k.KeyType === 'HASH')?.AttributeName;
  const skName = schema?.find((k) => k.KeyType === 'RANGE')?.AttributeName;
  const input: ReadInput['input'] = { TableName: table, IndexName: indexName || undefined };
  const names: Record<string, string> = {};
  const values: Record<string, AttributeValue> = {};

  if (mode === 'query') {
    const pk = sp.get('pk') ?? '';
    if (!pkName || pk === '') throw new UserError('Enter a partition key value to run a query.');
    names['#pk'] = pkName;
    values[':pk'] = typedValue(attrType(t, pkName), pk);
    let kce = '#pk = :pk';
    const skop = sp.get('skop') ?? '';
    const sk = sp.get('sk') ?? '';
    if (skName && skop && sk !== '') {
      const st = attrType(t, skName);
      names['#sk'] = skName;
      values[':sk'] = typedValue(st, sk);
      if (skop === 'between') { values[':sk2'] = typedValue(st, sp.get('sk2') ?? ''); kce += ' AND #sk BETWEEN :sk AND :sk2'; }
      else if (skop === 'begins_with') kce += ' AND begins_with(#sk, :sk)';
      else if (['=', '<', '<=', '>', '>='].includes(skop)) kce += ` AND #sk ${skop} :sk`;
    }
    input.KeyConditionExpression = kce;
    input.ScanIndexForward = sp.get('order') !== 'desc';
  }

  const fa = (sp.get('fa') ?? '').trim();
  const fop = sp.get('fop') ?? '=';
  if (fa) {
    if (!(FILTER_OPS as readonly string[]).includes(fop)) throw new UserError(`Unknown filter operator "${fop}".`);
    names['#f'] = fa;
    if (fop === 'attribute_exists' || fop === 'attribute_not_exists') input.FilterExpression = `${fop}(#f)`;
    else {
      const raw = sp.get('fv') ?? '';
      values[':f'] = filterValue(sp.get('ft') ?? 'auto', raw);
      input.FilterExpression = fop === 'begins_with' || fop === 'contains' ? `${fop}(#f, :f)` : `#f ${fop} :f`;
    }
  }
  if (Object.keys(names).length) input.ExpressionAttributeNames = names;
  if (Object.keys(values).length) input.ExpressionAttributeValues = values;
  return { mode, input };
}

// ---------------------------------------------------------------------------
// Import / export helpers
// ---------------------------------------------------------------------------

const DDB_TYPES = new Set(['S', 'N', 'B', 'BOOL', 'NULL', 'SS', 'NS', 'BS', 'L', 'M']);
/** True when every attribute value looks like { "S": "..." } style DynamoDB JSON. */
export function looksLikeDdb(o: unknown): boolean {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const vals = Object.values(o as object);
  return vals.length > 0 && vals.every((v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 1 && DDB_TYPES.has(Object.keys(v as object)[0]));
}

/** DynamoDB JSON carries binary as base64 text; the SDK wants bytes. */
export function reviveDdb(v: any): any {
  if (Array.isArray(v)) return v.map(reviveDdb);
  if (v && typeof v === 'object' && !(v instanceof Uint8Array)) {
    const out: any = {};
    for (const [k, x] of Object.entries(v)) {
      out[k] = k === 'B' && typeof x === 'string' ? Buffer.from(x, 'base64')
        : k === 'BS' && Array.isArray(x) ? x.map((b) => (typeof b === 'string' ? Buffer.from(b, 'base64') : b))
        : reviveDdb(x);
    }
    return out;
  }
  return v;
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"' && cur === '') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

export const csvCell = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v, jsonReplacer) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Convert one CSV cell to an attribute value. Key attributes use the table's declared type. */
export function csvValue(raw: string, forced?: string, infer = true): AttributeValue | undefined {
  if (forced) return typedValue(forced, raw);
  if (raw === '') return undefined;
  if (!infer) return { S: raw };
  const t = raw.trim();
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t) && !/^-?0\d/.test(t)) return { N: t };
  if (/^(true|false)$/.test(t)) return { BOOL: t === 'true' };
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try { return marshall({ v: JSON.parse(t) }, { removeUndefinedValues: true }).v; } catch { /* plain string */ }
  }
  return { S: raw };
}

export interface ParsedImport { items: Item[]; invalid: { row: number; reason: string }[]; format: 'json' | 'csv' }

/** Parse an uploaded file into DynamoDB items and validate key attributes. */
export function parseImport(text: string, filename: string, t: TableDescription, opts: { format?: string; infer?: boolean } = {}): ParsedImport {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (!trimmed) throw new UserError('The file is empty.');
  const fmt = opts.format === 'csv' || opts.format === 'json' ? opts.format : /\.csv$/i.test(filename) ? 'csv' : /\.(json|jsonl|ndjson)$/i.test(filename) || /^[[{]/.test(trimmed) ? 'json' : 'csv';
  const keys = keyAttrs(t);
  const raw: { item?: Item; reason?: string }[] = [];
  if (fmt === 'json') {
    let arr: unknown[];
    try {
      const parsed = JSON.parse(trimmed);
      arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { Items?: unknown[] })?.Items) ? (parsed as { Items: unknown[] }).Items : [parsed];
    } catch (e) {
      // JSON Lines fallback (one object per line, as `aws dynamodb export` produces)
      const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
      try { arr = lines.map((l) => { const o = JSON.parse(l); return o && typeof o === 'object' && 'Item' in o ? o.Item : o; }); }
      catch { throw new UserError(`The file is not valid JSON: ${(e as Error).message}`); }
    }
    for (const o of arr) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) { raw.push({ reason: 'not a JSON object' }); continue; }
      try { raw.push({ item: looksLikeDdb(o) ? (reviveDdb(o) as Item) : marshall(o as object, { removeUndefinedValues: true, convertClassInstanceToMap: true }) }); }
      catch (e) { raw.push({ reason: (e as Error).message }); }
    }
  } else {
    const rows = parseCsv(trimmed);
    if (rows.length < 2) throw new UserError('A CSV import needs a header row and at least one data row.');
    const header = rows[0].map((h) => h.trim());
    if (header.some((h) => !h)) throw new UserError('The CSV header row has an empty column name.');
    for (const k of keys) if (!header.includes(k)) throw new UserError(`The CSV header must include the key attribute "${k}" (found: ${header.join(', ')}).`);
    for (const r of rows.slice(1)) {
      try {
        const item: Item = {};
        header.forEach((h, i) => { const v = csvValue(r[i] ?? '', keys.includes(h) ? attrType(t, h) : undefined, opts.infer !== false); if (v) item[h] = v; });
        raw.push({ item });
      } catch (e) { raw.push({ reason: (e as Error).message }); }
    }
  }
  const items: Item[] = [];
  const invalid: ParsedImport['invalid'] = [];
  raw.forEach((x, i) => {
    if (!x.item) { invalid.push({ row: i + 1, reason: x.reason ?? 'invalid' }); return; }
    const missing = keys.find((k) => !x.item![k]);
    if (missing) { invalid.push({ row: i + 1, reason: `missing key attribute "${missing}"` }); return; }
    items.push(x.item);
  });
  return { items, invalid, format: fmt };
}

/** Stable identity of an item's key, to collapse duplicates inside one BatchWriteItem. */
export const keyId = (item: Item, t: TableDescription) => JSON.stringify(keyAttrs(t).map((k) => item[k]));

export interface BatchResult { written: number; failed: number; duplicates: number; errors: string[] }

/** BatchWriteItem in chunks of 25; UnprocessedItems are retried with backoff. */
export async function batchWrite(ddb: DynamoDBClient, table: string, t: TableDescription, items: Item[], op: 'put' | 'delete' = 'put'): Promise<BatchResult> {
  const res: BatchResult = { written: 0, failed: 0, duplicates: 0, errors: [] };
  const byKey = new Map<string, Item>();
  for (const it of items) { const id = keyId(it, t); if (byKey.has(id)) res.duplicates++; byKey.set(id, it); }
  const uniq = [...byKey.values()];
  const note = (m: string) => { if (res.errors.length < 5 && !res.errors.includes(m)) res.errors.push(m); };
  for (let i = 0; i < uniq.length; i += 25) {
    const chunk = uniq.slice(i, i + 25);
    let pending: WriteRequest[] = chunk.map((it) => (op === 'put' ? { PutRequest: { Item: it } } : { DeleteRequest: { Key: keyOf(it, t) } }));
    try {
      for (let attempt = 0; pending.length && attempt < 8; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, Math.min(50 * 2 ** attempt, 1500)));
        const r = await ddb.send(new BatchWriteItemCommand({ RequestItems: { [table]: pending } }));
        pending = r.UnprocessedItems?.[table] ?? [];
      }
      res.written += chunk.length - pending.length;
      if (pending.length) { res.failed += pending.length; note('some items were still unprocessed after 8 retries (throttled)'); }
    } catch (e) {
      res.failed += pending.length;
      res.written += chunk.length - pending.length;
      note((e as Error).message || String(e));
    }
  }
  return res;
}

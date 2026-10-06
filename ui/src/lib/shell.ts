/**
 * Mini AWS CLI for the console's CloudShell panel.
 *
 * `aws <service> <operation-kebab> --flag value` is mapped onto the matching
 * `<Operation>Command` of the installed @aws-sdk/client-* package and run
 * against the configured LocalEmu endpoint with the console's account/region.
 *
 * Security posture: no shell, no process spawning, no filesystem. Only SDK
 * calls through the registry below, always to ENDPOINT (a custom
 * `--endpoint-url` is rejected unless it points at LocalEmu), with the account
 * and region taken from the console context.
 */
import { clientFor } from './aws';
import { ENDPOINT, PUBLIC_ENDPOINT } from './config';
import type { Ctx } from './context';
import { compileQuery } from './jmes';
import { errMessage } from './errors';

type Mod = Record<string, any>;
interface Svc { pkg: string; load: () => Promise<Mod>; desc: string; extra?: Record<string, unknown> }

const s3 = { pkg: '@aws-sdk/client-s3', load: () => import('@aws-sdk/client-s3') as Promise<Mod>, extra: { forcePathStyle: true } };

/**
 * AWS CLI service name -> SDK package. Every @aws-sdk/client-* dependency in
 * package.json must have an entry here (tests/e2e/shell.mjs checks that).
 */
export const SERVICES: Record<string, Svc> = {
  acm: { pkg: '@aws-sdk/client-acm', load: () => import('@aws-sdk/client-acm') as Promise<Mod>, desc: 'Certificate Manager' },
  apigateway: { pkg: '@aws-sdk/client-api-gateway', load: () => import('@aws-sdk/client-api-gateway') as Promise<Mod>, desc: 'API Gateway (REST)' },
  apigatewayv2: { pkg: '@aws-sdk/client-apigatewayv2', load: () => import('@aws-sdk/client-apigatewayv2') as Promise<Mod>, desc: 'API Gateway (HTTP/WebSocket)' },
  athena: { pkg: '@aws-sdk/client-athena', load: () => import('@aws-sdk/client-athena') as Promise<Mod>, desc: 'Athena' },
  cloudformation: { pkg: '@aws-sdk/client-cloudformation', load: () => import('@aws-sdk/client-cloudformation') as Promise<Mod>, desc: 'CloudFormation' },
  cloudwatch: { pkg: '@aws-sdk/client-cloudwatch', load: () => import('@aws-sdk/client-cloudwatch') as Promise<Mod>, desc: 'CloudWatch metrics and alarms' },
  'cognito-idp': { pkg: '@aws-sdk/client-cognito-identity-provider', load: () => import('@aws-sdk/client-cognito-identity-provider') as Promise<Mod>, desc: 'Cognito user pools' },
  dynamodb: { pkg: '@aws-sdk/client-dynamodb', load: () => import('@aws-sdk/client-dynamodb') as Promise<Mod>, desc: 'DynamoDB' },
  ec2: { pkg: '@aws-sdk/client-ec2', load: () => import('@aws-sdk/client-ec2') as Promise<Mod>, desc: 'EC2 and VPC' },
  ecr: { pkg: '@aws-sdk/client-ecr', load: () => import('@aws-sdk/client-ecr') as Promise<Mod>, desc: 'Elastic Container Registry' },
  ecs: { pkg: '@aws-sdk/client-ecs', load: () => import('@aws-sdk/client-ecs') as Promise<Mod>, desc: 'Elastic Container Service' },
  elbv2: { pkg: '@aws-sdk/client-elastic-load-balancing-v2', load: () => import('@aws-sdk/client-elastic-load-balancing-v2') as Promise<Mod>, desc: 'Load balancers (ALB/NLB)' },
  events: { pkg: '@aws-sdk/client-eventbridge', load: () => import('@aws-sdk/client-eventbridge') as Promise<Mod>, desc: 'EventBridge' },
  glue: { pkg: '@aws-sdk/client-glue', load: () => import('@aws-sdk/client-glue') as Promise<Mod>, desc: 'Glue' },
  iam: { pkg: '@aws-sdk/client-iam', load: () => import('@aws-sdk/client-iam') as Promise<Mod>, desc: 'IAM' },
  kinesis: { pkg: '@aws-sdk/client-kinesis', load: () => import('@aws-sdk/client-kinesis') as Promise<Mod>, desc: 'Kinesis Data Streams' },
  kms: { pkg: '@aws-sdk/client-kms', load: () => import('@aws-sdk/client-kms') as Promise<Mod>, desc: 'Key Management Service' },
  lambda: { pkg: '@aws-sdk/client-lambda', load: () => import('@aws-sdk/client-lambda') as Promise<Mod>, desc: 'Lambda' },
  logs: { pkg: '@aws-sdk/client-cloudwatch-logs', load: () => import('@aws-sdk/client-cloudwatch-logs') as Promise<Mod>, desc: 'CloudWatch Logs' },
  rds: { pkg: '@aws-sdk/client-rds', load: () => import('@aws-sdk/client-rds') as Promise<Mod>, desc: 'Relational Database Service' },
  route53: { pkg: '@aws-sdk/client-route-53', load: () => import('@aws-sdk/client-route-53') as Promise<Mod>, desc: 'Route 53' },
  s3: { ...s3, desc: 'S3 high-level commands: ls, mb, rb, rm, cp, mv' },
  s3api: { ...s3, desc: 'S3 API operations' },
  secretsmanager: { pkg: '@aws-sdk/client-secrets-manager', load: () => import('@aws-sdk/client-secrets-manager') as Promise<Mod>, desc: 'Secrets Manager' },
  sns: { pkg: '@aws-sdk/client-sns', load: () => import('@aws-sdk/client-sns') as Promise<Mod>, desc: 'Simple Notification Service' },
  sqs: { pkg: '@aws-sdk/client-sqs', load: () => import('@aws-sdk/client-sqs') as Promise<Mod>, desc: 'Simple Queue Service' },
  ssm: { pkg: '@aws-sdk/client-ssm', load: () => import('@aws-sdk/client-ssm') as Promise<Mod>, desc: 'Systems Manager' },
  stepfunctions: { pkg: '@aws-sdk/client-sfn', load: () => import('@aws-sdk/client-sfn') as Promise<Mod>, desc: 'Step Functions' },
  sts: { pkg: '@aws-sdk/client-sts', load: () => import('@aws-sdk/client-sts') as Promise<Mod>, desc: 'Security Token Service' },
};

const ALIASES: Record<string, string> = {
  sfn: 'stepfunctions', eventbridge: 'events', cloudwatchlogs: 'logs', 'cognito-identity-provider': 'cognito-idp',
  secrets: 'secretsmanager', 'route-53': 'route53', cfn: 'cloudformation',
};

const S3_HIGH_LEVEL = { ls: 'List buckets or objects', mb: 'Make a bucket', rb: 'Remove a bucket (--force empties it first)', rm: 'Delete objects (--recursive)', cp: 'Copy: s3://a/k s3://b/k, or s3://b/k - to print an object', mv: 'Move an object between buckets/keys' };

const MAX_OUT = 512 * 1024;
const TIMEOUT_MS = 60_000;

export interface ShellResult { stdout: string; stderr: string; code: number }

class CliError extends Error {}

/* ------------------------------------------------------------ tokenizer */

/** Split a command line like a POSIX shell would for quoting only (no expansion, pipes or redirects). */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = ''; let has = false; let q: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q === "'") { if (c === "'") q = null; else cur += c; continue; }
    if (q === '"') {
      if (c === '"') q = null;
      else if (c === '\\' && /["\\$`]/.test(line[i + 1] ?? '')) cur += line[++i];
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if (c === '\\' && i + 1 < line.length) { cur += line[++i]; has = true; continue; }
    if (/\s/.test(c)) { if (has || cur) { out.push(cur); cur = ''; has = false; } continue; }
    cur += c; has = true;
  }
  if (q) throw new CliError('Unterminated quote in command.');
  if (has || cur) out.push(cur);
  return out;
}

/* --------------------------------------------------------------- naming */

export const kebab = (n: string) => n.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();
const squash = (n: string) => n.replace(/-/g, '').toLowerCase();

const opCache = new WeakMap<Mod, Map<string, string>>();
function ops(m: Mod): Map<string, string> {
  let map = opCache.get(m);
  if (!map) {
    map = new Map();
    for (const k of Object.keys(m)) if (/^[A-Z].*Command$/.test(k) && typeof m[k] === 'function') map.set(squash(k.slice(0, -7)), k);
    opCache.set(m, map);
  }
  return map;
}
const opNames = (m: Mod) => [...ops(m).values()].map((k) => kebab(k.slice(0, -7))).sort();

/* -------------------------------------------------------------- schemas */

/** Unwrap lazy refs and [schema, traits] tuples used by the SDK's runtime schemas. */
function norm(s: any): any {
  for (let n = 0; n < 12; n++) {
    if (typeof s === 'function') { try { s = s(); } catch { return undefined; } continue; }
    if (Array.isArray(s) && s.length === 2 && (typeof s[0] === 'function' || typeof s[0] === 'number' || Array.isArray(s[0])) && (typeof s[1] === 'number' || (s[1] && typeof s[1] === 'object' && !Array.isArray(s[1])))) { s = s[0]; continue; }
    break;
  }
  return s;
}

interface Members { names: string[]; types: any[] }
function inputMembers(cmd: any): Members | null {
  try {
    const op = cmd.schema;
    const inp = norm(op?.[4]);
    if (Array.isArray(inp) && Array.isArray(inp[4])) return { names: inp[4], types: inp[5] ?? [] };
  } catch { /* fall through */ }
  return null;
}
function outputMembers(cmd: any): Members | null {
  try {
    const out = norm(cmd.schema?.[5]);
    if (Array.isArray(out) && Array.isArray(out[4])) return { names: out[4], types: out[5] ?? [] };
  } catch { /* fall through */ }
  return null;
}
function structMembers(s: any): Members | null {
  s = norm(s);
  return Array.isArray(s) && (s[0] === 3 || s[0] === -3) && Array.isArray(s[4]) ? { names: s[4], types: s[5] ?? [] } : null;
}

function typeLabel(t: any): string {
  t = norm(t);
  if (typeof t === 'number') {
    const base = t & 63;
    const b = base === 0 ? 'string' : base === 1 ? 'number' : base === 2 ? 'boolean' : base === 21 ? 'blob' : base >= 4 && base <= 7 ? 'timestamp' : base === 15 ? 'document' : 'string';
    return t & 64 ? `list of ${b}` : t & 128 ? `map of ${b}` : b;
  }
  if (Array.isArray(t)) return t[0] === 1 ? 'list' : t[0] === 2 ? 'map' : 'structure (JSON or Key=Value,...)';
  return 'string';
}

/** Convert CLI string value(s) to what the SDK expects for this member. */
function coerce(vals: string[], schema: any, flag: string): any {
  const t = norm(schema);
  const one = (): string => {
    if (vals.length !== 1) throw new CliError(`--${flag} takes a single value (got ${vals.length}). Quote values that contain spaces.`);
    return vals[0];
  };
  const json = (v: string): any => {
    try { return JSON.parse(v); } catch (e) { throw new CliError(`--${flag}: invalid JSON (${(e as Error).message}).`); }
  };
  const simple = (v: string, base: number): any => {
    switch (base) {
      case 1: case 17: case 19: { const n = Number(v); if (!Number.isFinite(n)) throw new CliError(`--${flag}: "${v}" is not a number.`); return n; }
      case 2: if (!/^(true|false)$/i.test(v)) throw new CliError(`--${flag}: expected true or false.`); return v.toLowerCase() === 'true';
      case 21: return new TextEncoder().encode(v);
      case 4: case 5: case 6: case 7: { const d = /^\d+(\.\d+)?$/.test(v) ? new Date(Number(v) * 1000) : new Date(v); if (isNaN(+d)) throw new CliError(`--${flag}: "${v}" is not a valid timestamp.`); return d; }
      case 15: return json(v);
      default: return v;
    }
  };
  if (typeof t === 'number') {
    const base = t & 63;
    if (t & 64) return vals.length === 1 && vals[0].trim().startsWith('[') ? json(vals[0]) : vals.map((v) => simple(v, base));
    if (t & 128) return vals.length === 1 && vals[0].trim().startsWith('{') ? json(vals[0]) : shorthandMap(vals.join(','), flag);
    return simple(one(), base);
  }
  if (Array.isArray(t)) {
    const kind = t[0];
    if (kind === 1) { // list
      if (vals.length === 1 && vals[0].trim().startsWith('[')) return json(vals[0]);
      return vals.map((v) => coerce([v], t[4], flag));
    }
    if (kind === 2) return vals.length === 1 && vals[0].trim().startsWith('{') ? json(vals[0]) : shorthandMap(vals.join(','), flag);
    if (kind === 3 || kind === -3 || kind === 4) {
      const v = one();
      if (v.trim().startsWith('{')) return json(v);
      return shorthandStruct(v, t, flag);
    }
  }
  // Unknown schema: JSON when it looks like JSON, otherwise the raw string.
  if (vals.length === 1) { const v = vals[0].trim(); if (/^[{["]/.test(v) || /^(true|false|null|-?\d+(\.\d+)?)$/.test(v)) { try { return JSON.parse(v); } catch { /* string */ } } return vals[0]; }
  return vals;
}

function splitPairs(v: string): Array<[string, string]> {
  return v.split(',').filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    if (i < 0) throw new CliError(`Invalid shorthand "${p}". Use Key=Value,Key2=Value2 or JSON.`);
    return [p.slice(0, i).trim(), p.slice(i + 1)] as [string, string];
  });
}
function shorthandMap(v: string, flag: string): Record<string, string> {
  try { return Object.fromEntries(splitPairs(v)); } catch (e) { throw new CliError(`--${flag}: ${(e as Error).message}`); }
}
function shorthandStruct(v: string, schema: any, flag: string): Record<string, unknown> {
  const mem = structMembers(schema);
  const out: Record<string, unknown> = {};
  let pairs: Array<[string, string]>;
  try { pairs = splitPairs(v); } catch (e) { throw new CliError(`--${flag}: ${(e as Error).message}`); }
  for (const [k, val] of pairs) {
    const idx = mem ? mem.names.findIndex((n) => n.toLowerCase() === k.toLowerCase()) : -1;
    if (mem && idx < 0) throw new CliError(`--${flag}: unknown member "${k}". Valid: ${mem.names.join(', ')}`);
    out[idx >= 0 ? mem!.names[idx] : k] = idx >= 0 ? coerce([val], mem!.types[idx], `${flag}.${k}`) : val;
  }
  return out;
}

/* ----------------------------------------------------------- arg parsing */

const GLOBAL_FLAGS = new Set(['region', 'endpoint-url', 'output', 'query', 'profile', 'no-cli-pager', 'no-paginate', 'no-sign-request', 'debug', 'color', 'cli-input-json', 'cli-read-timeout', 'cli-connect-timeout', 'no-verify-ssl', 'ca-bundle', 'max-items', 'page-size', 'starting-token', 'cli-auto-prompt', 'no-cli-auto-prompt', 'version']);
const BOOLEAN_GLOBALS = new Set(['no-cli-pager', 'no-paginate', 'no-sign-request', 'debug', 'no-verify-ssl', 'cli-auto-prompt', 'no-cli-auto-prompt', 'version']);

interface Parsed { positional: string[]; flags: Map<string, string[]> }
function parseArgs(tokens: string[]): Parsed {
  const positional: string[] = []; const flags = new Map<string, string[]>();
  let cur: string[] | null = null;
  for (const t of tokens) {
    if (t.startsWith('--') && t.length > 2) {
      const eq = t.indexOf('=');
      const name = (eq > 0 ? t.slice(2, eq) : t.slice(2)).toLowerCase();
      const list = flags.get(name) ?? [];
      flags.set(name, list);
      if (eq > 0) { list.push(t.slice(eq + 1)); cur = null; } else cur = BOOLEAN_GLOBALS.has(name) ? null : list;
    } else if (cur) cur.push(t);
    else positional.push(t);
  }
  return { positional, flags };
}

const one = (f: Map<string, string[]>, k: string) => f.get(k)?.[0];

/* ---------------------------------------------------------------- output */

async function plain(v: any, depth = 0): Promise<any> {
  if (v === null || v === undefined) return v ?? null;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array) return Buffer.from(v).toString('base64');
  if (typeof v === 'bigint') return Number(v);
  if (typeof v !== 'object') return v;
  if (typeof v.transformToString === 'function') {
    const s: string = await v.transformToString();
    return s.length > 65536 ? s.slice(0, 65536) + `\n... (${s.length - 65536} more characters truncated)` : s;
  }
  if (depth > 20) return '[nested too deeply]';
  if (Array.isArray(v)) return Promise.all(v.map((x) => plain(x, depth + 1)));
  const o: Record<string, any> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === '$metadata' || k === '$fault' || k === '$response' || k === '$retryable' || k === '$source') continue;
    o[k] = await plain(x, depth + 1);
  }
  return o;
}

const scalar = (v: any) => (v === null || v === undefined ? 'None' : typeof v === 'object' ? JSON.stringify(v) : String(v));
function asText(v: any): string {
  if (v === null || v === undefined) return 'None';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.map((x) => (Array.isArray(x) || (x && typeof x === 'object') ? asText(x) : scalar(x))).join(Array.isArray(v[0]) || (v[0] && typeof v[0] === 'object') ? '\n' : '\t');
  const vals = Object.entries(v);
  // Top-level object with list values prints each list on its own block, like the CLI.
  if (vals.some(([, x]) => Array.isArray(x))) return vals.map(([k, x]) => (Array.isArray(x) ? x.map((r) => (r && typeof r === 'object' ? Object.values(r).map(scalar).join('\t') : scalar(r))).join('\n') : `${k}\t${scalar(x)}`)).join('\n');
  return vals.map(([, x]) => scalar(x)).join('\t');
}

function render(v: any, output: string): string {
  if (v === undefined) return '';
  if (output === 'text') return asText(v);
  if (typeof v === 'string' && output === 'text') return v;
  return JSON.stringify(v, null, output === 'json-compact' ? 0 : 4);
}

/* ------------------------------------------------------------- execution */

const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;
const sameEndpoint = (u: string) => {
  const norm = (x: string) => x.replace(/\/+$/, '').toLowerCase();
  return [ENDPOINT, PUBLIC_ENDPOINT, 'http://localhost:4566', 'http://127.0.0.1:4566'].map(norm).includes(norm(u));
};

function helpTop(): string {
  const w = Math.max(...Object.keys(SERVICES).map((k) => k.length)) + 2;
  return [
    'LocalEmu Console shell - a small AWS CLI over the AWS SDK for JavaScript.',
    '',
    'usage: aws <service> <operation> [--parameter value ...] [--query EXPR] [--output json|text] [--region R]',
    '',
    'Commands run against LocalEmu with the account and region selected in the top bar.',
    'Parameters are the operation\'s input members in kebab-case (--queue-url, --table-name). Values may be JSON,',
    'Key=Value,Key2=Value2 shorthand, or repeated words for lists. --cli-input-json takes an inline JSON object.',
    'No filesystem or custom endpoints: blobs (--body) are passed inline.',
    `Paginated results are followed automatically (up to ${PAGE_MAX_ITEMS} items / ${PAGE_MAX_PAGES} pages); --no-paginate fetches one page, --max-items N lowers the cap.`,
    '',
    'Services:',
    ...Object.entries(SERVICES).map(([k, s]) => `  ${k.padEnd(w)}${s.desc}`),
    '',
    'Try: aws s3 ls | aws sqs list-queues | aws dynamodb list-tables | aws <service> help | aws <service> <operation> help',
    'Shell: clear, Tab completes, Up/Down history, Alt+C toggles this panel.',
  ].join('\n');
}

function helpOps(service: string, m: Mod | null): string {
  if (service === 's3') {
    return ['aws s3 <command> [args]', '', ...Object.entries(S3_HIGH_LEVEL).map(([k, d]) => `  ${k.padEnd(6)}${d}`), '', 'For the full API use: aws s3api <operation>'].join('\n');
  }
  return `aws ${service} <operation> [options]\n\nAvailable operations:\n` + opNames(m!).map((o) => `  ${o}`).join('\n');
}

function helpOp(service: string, op: string, cmd: any): string {
  const mem = inputMembers(cmd);
  const lines = [`aws ${service} ${op} [options]`, ''];
  if (!mem) return lines.join('\n') + 'Options are the operation input members in kebab-case (schema details unavailable).';
  lines.push(mem.names.length ? 'Options:' : 'This operation takes no options.');
  mem.names.forEach((n, i) => lines.push(`  --${kebab(n).padEnd(34)}${typeLabel(mem.types[i])}`));
  return lines.join('\n');
}

async function loadService(name: string): Promise<{ key: string; svc: Svc; mod: Mod }> {
  const key = ALIASES[name] ?? name;
  const svc = SERVICES[key];
  if (!svc) {
    throw new CliError(`aws: error: argument command: Invalid choice, valid choices are:\n\n${Object.keys(SERVICES).map((k) => `  ${k}`).join('\n')}\n\n(Unsupported service "${name}". Run "aws help".)`);
  }
  return { key, svc, mod: await svc.load() };
}

function clientCtor(mod: Mod): any {
  const k = Object.keys(mod).find((x) => /Client$/.test(x) && typeof mod[x] === 'function' && !/^(Smithy|Service)/.test(x));
  if (!k) throw new CliError('Could not locate the SDK client class.');
  return mod[k];
}

function makeClient(svc: Svc, mod: Mod, ctx: Ctx): any {
  return clientFor(svc.pkg, clientCtor(mod), ctx, svc.extra ?? {}, TIMEOUT_MS) as any;
}

/** Build the command input from flags, matching members case-insensitively. */
function buildInput(cmd: any, flags: Map<string, string[]>, base: Record<string, unknown>): Record<string, unknown> {
  const mem = inputMembers(cmd);
  const input: Record<string, unknown> = { ...base };
  for (const [name, vals] of flags) {
    if (GLOBAL_FLAGS.has(name)) continue;
    const key = squash(name);
    let idx = mem ? mem.names.findIndex((n) => squash(n) === key) : -1;
    if (idx < 0 && mem && name.startsWith('no-')) {
      const j = mem.names.findIndex((n) => squash(n) === squash(name.slice(3)));
      if (j >= 0 && ((norm(mem.types[j]) as number) & 63) === 2 && typeof norm(mem.types[j]) === 'number') { input[mem.names[j]] = false; continue; }
    }
    if (mem && idx < 0) {
      const near = mem.names.filter((n) => squash(n).includes(key.slice(0, 4))).slice(0, 5).map((n) => `--${kebab(n)}`);
      throw new CliError(`Unknown options: --${name}\nValid options are: ${mem.names.map((n) => `--${kebab(n)}`).join(', ') || '(none)'}${near.length ? `\nDid you mean: ${near.join(', ')}` : ''}`);
    }
    if (!mem) {
      const pascal = name.split('-').map((p) => p[0]?.toUpperCase() + p.slice(1)).join('');
      input[pascal] = coerce(vals.length ? vals : ['true'], undefined, name);
      continue;
    }
    const t = mem.types[idx];
    const nt = norm(t);
    if (!vals.length) {
      if (typeof nt === 'number' && (nt & 63) === 2 && !(nt & 192)) { input[mem.names[idx]] = true; continue; }
      throw new CliError(`--${name} requires a value.`);
    }
    if (vals.some((v) => /^file:\/\/|^fileb:\/\//i.test(v))) throw new CliError(`--${name}: file:// values are not supported (the shell has no filesystem). Pass the value inline.`);
    input[mem.names[idx]] = coerce(vals, t, name);
  }
  return input;
}

function cliInputJson(cmd: any, raw: string): Record<string, unknown> {
  if (/^file:\/\//i.test(raw)) throw new CliError('--cli-input-json file:// is not supported (no filesystem). Pass the JSON inline.');
  let obj: any;
  try { obj = JSON.parse(raw); } catch (e) { throw new CliError(`--cli-input-json: invalid JSON (${(e as Error).message}).`); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new CliError('--cli-input-json must be a JSON object.');
  const mem = inputMembers(cmd);
  if (!mem) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = mem.names.find((x) => squash(x) === squash(k));
    if (!n) throw new CliError(`--cli-input-json: unknown member "${k}". Valid: ${mem.names.join(', ')}`);
    out[n] = v;
  }
  return out;
}

async function send(client: any, cmd: any): Promise<any> {
  return client.send(cmd, { abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
}

/* ----------------------------------------------------------- pagination */

export const PAGE_MAX_ITEMS = 1000;
export const PAGE_MAX_PAGES = 10;
const TOKEN_IN = /^(next|continuation|starting|page|pagination)?token$|^marker$|^exclusivestartkey$|^position$|^nextrecordname$/i;
const SIZE_IN = ['maxresults', 'maxitems', 'limit', 'maxkeys', 'pagesize', 'maxrecords'];

export interface PageSpec { inName: string; outName: string }
/** Find the continuation pair (request member, response member) from the SDK schemas, e.g. NextToken/NextToken, ContinuationToken/NextContinuationToken, Marker/NextMarker. */
export function detectPaging(inNames: string[], outNames: string[]): PageSpec | null {
  const low = new Map(outNames.map((n) => [n.toLowerCase(), n]));
  for (const inName of inNames.filter((n) => TOKEN_IN.test(n))) {
    const l = inName.toLowerCase();
    const cands = l === 'exclusivestartkey' ? ['lastevaluatedkey'] : l === 'marker' ? ['nextmarker', 'marker'] : l === 'continuationtoken' ? ['nextcontinuationtoken'] : l === 'nextrecordname' ? ['nextrecordname'] : l === 'position' ? ['position'] : [`next${l.replace(/^next/, '')}`, l, 'nexttoken'];
    const hit = cands.map((c) => low.get(c)).find(Boolean);
    if (hit) return { inName, outName: hit };
  }
  return null;
}

const arrayMembers = (o: any): string[] => Object.keys(o).filter((k) => Array.isArray(o[k]));

/** Run the command, following continuation tokens until done or capped. */
async function sendAll(client: any, ctor: any, input: Record<string, unknown>, spec: PageSpec | null, maxItems: number): Promise<{ res: any; truncated: string | null; pages: number }> {
  if (!spec) return { res: await send(client, new ctor(input)), truncated: null, pages: 1 };
  let res = await send(client, new ctor(input));
  let pages = 1; let items = 0;
  const count = (r: any) => Math.max(0, ...arrayMembers(r).map((k) => r[k].length));
  items = count(res);
  const merged: any = { ...res };
  for (;;) {
    const token = res[spec.outName];
    const more = token !== undefined && token !== null && token !== '' && res.IsTruncated !== false && res.isTruncated !== false;
    if (!more) { delete merged[spec.outName]; return { res: merged, truncated: null, pages }; }
    if (pages >= PAGE_MAX_PAGES || items >= maxItems) { merged[spec.outName] = token; return { res: merged, truncated: `${items} items in ${pages} page${pages === 1 ? '' : 's'}`, pages }; }
    res = await send(client, new ctor({ ...input, [spec.inName]: token }));
    pages++;
    for (const k of arrayMembers(res)) merged[k] = [...(Array.isArray(merged[k]) ? merged[k] : []), ...res[k]];
    for (const k of Object.keys(res)) if (!Array.isArray(res[k]) && k !== spec.outName && merged[k] === undefined) merged[k] = res[k];
    items = Math.max(items, count(merged));
  }
}

/* --------------------------------------------------------------- S3 (high level) */

const parseS3 = (u: string | undefined): { bucket: string; key: string } | null => {
  if (!u) return null;
  const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(u);
  return m ? { bucket: m[1], key: m[2] } : null;
};
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d?: Date) => (d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : '');

async function s3High(mod: Mod, client: any, ctx: Ctx, cmdName: string, p: Parsed): Promise<string> {
  const args = p.positional;
  const flag = (n: string) => p.flags.has(n);
  const need = (u: string | undefined, label: string) => {
    const r = parseS3(u);
    if (!r) throw new CliError(`${label} must be an S3 URI like s3://bucket/key (got ${u ? `"${u}"` : 'nothing'}).`);
    return r;
  };
  const listAll = async (bucket: string, prefix: string, delimiter?: string) => {
    const keys: any[] = []; const prefixes: string[] = []; let token: string | undefined;
    do {
      const r = await send(client, new mod.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, Delimiter: delimiter, ContinuationToken: token }));
      keys.push(...(r.Contents ?? [])); prefixes.push(...(r.CommonPrefixes ?? []).map((x: any) => x.Prefix));
      token = r.NextContinuationToken;
    } while (token && keys.length < 20000);
    return { keys, prefixes };
  };
  const emptyBucket = async (bucket: string, prefix: string) => {
    const { keys } = await listAll(bucket, prefix);
    const lines: string[] = [];
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      await send(client, new mod.DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map((k: any) => ({ Key: k.Key })), Quiet: true } }));
      chunk.forEach((k: any) => lines.push(`delete: s3://${bucket}/${k.Key}`));
    }
    return lines;
  };

  switch (cmdName) {
    case 'ls': {
      if (!args[0]) {
        const r = await send(client, new mod.ListBucketsCommand({}));
        return (r.Buckets ?? []).map((b: any) => `${stamp(b.CreationDate)} ${b.Name}`).join('\n');
      }
      const { bucket, key } = need(args[0], 'Path');
      const rec = flag('recursive');
      const { keys, prefixes } = await listAll(bucket, key, rec ? undefined : '/');
      const lines = prefixes.map((x) => `                           PRE ${x.slice(key.lastIndexOf('/') + 1)}`);
      for (const k of keys) lines.push(`${stamp(k.LastModified)} ${String(k.Size ?? 0).padStart(10)} ${rec ? k.Key : String(k.Key).slice(key.lastIndexOf('/') + 1)}`);
      return lines.join('\n');
    }
    case 'mb': {
      const { bucket } = need(args[0], 'Bucket');
      await send(client, new mod.CreateBucketCommand({ Bucket: bucket, ...(ctx.region !== 'us-east-1' ? { CreateBucketConfiguration: { LocationConstraint: ctx.region } } : {}) }));
      return `make_bucket: ${bucket}`;
    }
    case 'rb': {
      const { bucket } = need(args[0], 'Bucket');
      const pre = flag('force') ? await emptyBucket(bucket, '') : [];
      await send(client, new mod.DeleteBucketCommand({ Bucket: bucket }));
      return [...pre, `remove_bucket: ${bucket}`].join('\n');
    }
    case 'rm': {
      const { bucket, key } = need(args[0], 'Path');
      if (flag('recursive')) return (await emptyBucket(bucket, key)).join('\n');
      if (!key) throw new CliError('rm needs an object key (or --recursive for a prefix).');
      await send(client, new mod.DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return `delete: s3://${bucket}/${key}`;
    }
    case 'cp': case 'mv': {
      const [src, dst] = args;
      if (src === '-' && dst) { // inline stdin extension: aws s3 cp - s3://b/k --body "text"
        const d = need(dst, 'Destination');
        const body = one(p.flags, 'body');
        if (body === undefined) throw new CliError('The shell has no stdin or local files. Provide the content with --body "text".');
        await send(client, new mod.PutObjectCommand({ Bucket: d.bucket, Key: d.key, Body: new TextEncoder().encode(body) }));
        return `upload: - to s3://${d.bucket}/${d.key}`;
      }
      const s = need(src, 'Source');
      if (dst === '-') {
        const r = await send(client, new mod.GetObjectCommand({ Bucket: s.bucket, Key: s.key }));
        return await r.Body.transformToString();
      }
      if (!parseS3(src) || !parseS3(dst)) throw new CliError('Only S3-to-S3 copies are available (no local filesystem).');
      const d = need(dst, 'Destination');
      const dkey = d.key === '' || d.key.endsWith('/') ? d.key + s.key.split('/').pop() : d.key;
      await send(client, new mod.CopyObjectCommand({ Bucket: d.bucket, Key: dkey, CopySource: `${s.bucket}/${s.key.split('/').map(encodeURIComponent).join('/')}` }));
      if (cmdName === 'mv') await send(client, new mod.DeleteObjectCommand({ Bucket: s.bucket, Key: s.key }));
      return `${cmdName === 'mv' ? 'move' : 'copy'}: s3://${s.bucket}/${s.key} to s3://${d.bucket}/${dkey}`;
    }
    default:
      throw new CliError(`aws s3: unsupported command "${cmdName}". Available: ${Object.keys(S3_HIGH_LEVEL).join(', ')}. Use "aws s3api" for API operations.`);
  }
}

/* ------------------------------------------------------------------ main */

export async function runCommand(line: string, ctx: Ctx): Promise<ShellResult> {
  try {
    if (line.length > 200_000) throw new CliError('Command is too long.');
    let tokens = tokenize(line.trim());
    if (!tokens.length) return { stdout: '', stderr: '', code: 0 };
    if (tokens[0] === 'aws') tokens = tokens.slice(1);
    else throw new CliError(`${tokens[0]}: command not found. This shell only runs "aws" commands (try "aws help").`);
    if (!tokens.length || tokens[0] === 'help' || (tokens.length === 1 && tokens[0] === '--help')) return { stdout: helpTop(), stderr: '', code: 0 };
    if (tokens[0] === '--version' || tokens[0] === 'version') return { stdout: 'aws-cli/2.x (LocalEmu Console mini-CLI on the AWS SDK for JavaScript v3)', stderr: '', code: 0 };

    const [service, ...rest] = tokens;
    const { key, svc, mod } = await loadService(service);
    const p = parseArgs(rest.slice(1));
    const opTok = rest[0];

    if (!opTok || opTok === 'help' || opTok === '--help') return { stdout: helpOps(key, mod), stderr: '', code: 0 };

    // Global options
    if (p.flags.has('endpoint-url') && !sameEndpoint(one(p.flags, 'endpoint-url') ?? '')) {
      throw new CliError(`--endpoint-url ${one(p.flags, 'endpoint-url')} is not allowed: the console shell only talks to LocalEmu at ${ENDPOINT}. Remove the option.`);
    }
    const regionFlag = one(p.flags, 'region');
    if (regionFlag && !REGION_RE.test(regionFlag)) throw new CliError(`Invalid region "${regionFlag}".`);
    const c: Ctx = { account: ctx.account, region: regionFlag ?? ctx.region };
    const output = (one(p.flags, 'output') ?? 'json').toLowerCase();
    if (!['json', 'text', 'table', 'yaml', 'yaml-stream'].includes(output)) throw new CliError(`Unknown output format "${output}" (use json or text).`);
    const query = one(p.flags, 'query');
    const q = query ? (() => { try { return compileQuery(query); } catch (e) { throw new CliError((e as Error).message); } })() : null;
    const client = makeClient(svc, mod, c);

    let stdout: string; let note = '';
    if (key === 's3') {
      if (p.flags.has('help') || p.positional[0] === 'help') return { stdout: helpOps('s3', null), stderr: '', code: 0 };
      stdout = await s3High(mod, client, c, opTok, p);
    } else {
      const exportName = ops(mod).get(squash(opTok));
      if (!exportName) {
        const near = [...ops(mod).values()].map((k) => kebab(k.slice(0, -7))).filter((o) => o.startsWith(opTok.slice(0, 4)) || o.includes(opTok)).slice(0, 6);
        throw new CliError(`aws ${key}: error: argument operation: Invalid choice "${opTok}"${near.length ? `\n\nMaybe you meant:\n${near.map((n) => `  ${n}`).join('\n')}` : ''}\n\nRun "aws ${key} help" to list operations.`);
      }
      const proto = new mod[exportName]({});
      if (p.positional[0] === 'help' || p.flags.has('help')) return { stdout: helpOp(key, opTok, proto), stderr: '', code: 0 };
      if (p.positional.length) throw new CliError(`Unexpected argument "${p.positional[0]}". Parameters must be passed as --name value.`);
      const base = p.flags.has('cli-input-json') ? cliInputJson(proto, one(p.flags, 'cli-input-json') ?? '') : {};
      const input = buildInput(proto, p.flags, base);
      const inMem = inputMembers(proto); const outMem = outputMembers(proto);
      let spec = inMem && outMem ? detectPaging(inMem.names, outMem.names) : null;
      if (p.flags.has('no-paginate') || p.flags.has('starting-token') || (spec && input[spec.inName] !== undefined)) spec = null;
      const maxFlag = one(p.flags, 'max-items');
      const maxItems = maxFlag === undefined ? PAGE_MAX_ITEMS : Math.min(PAGE_MAX_ITEMS, Math.max(1, Math.floor(Number(maxFlag))) || PAGE_MAX_ITEMS);
      const pageSize = one(p.flags, 'page-size');
      if (pageSize !== undefined && inMem) {
        const sz = inMem.names.find((n) => SIZE_IN.includes(n.toLowerCase()));
        if (sz && input[sz] === undefined && Number.isFinite(Number(pageSize))) input[sz] = Number(pageSize);
      }
      if (p.flags.has('starting-token') && spec === null && inMem) {
        const tk = inMem.names.find((n) => TOKEN_IN.test(n));
        if (tk && input[tk] === undefined) input[tk] = one(p.flags, 'starting-token');
      }
      const { res, truncated } = await sendAll(client, mod[exportName], input, spec, maxItems);
      let data = await plain(res);
      if (truncated && spec) {
        note = `Note: stopped after ${truncated}; more results are available. Narrow the request, or continue with --no-paginate --${kebab(spec.inName)} <token> (the token is in the output as ${spec.outName}). Use --max-items N to choose the cap (max ${PAGE_MAX_ITEMS}).`;
      }
      if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0) data = undefined;
      if (q && data !== undefined) { try { data = q(data); } catch (e) { throw new CliError((e as Error).message); } }
      stdout = render(data, output);
    }
    if (stdout.length > MAX_OUT) stdout = stdout.slice(0, MAX_OUT) + `\n... output truncated (${stdout.length - MAX_OUT} more characters)`;
    return { stdout, stderr: note, code: 0 };
  } catch (e) {
    if (e instanceof CliError) return { stdout: '', stderr: e.message, code: 252 };
    const x = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number }; $fault?: string };
    if (x?.name === 'TimeoutError' || x?.name === 'AbortError') return { stdout: '', stderr: `Command timed out after ${TIMEOUT_MS / 1000}s.`, code: 255 };
    const op = x?.$metadata ? '' : '';
    const msg = x?.name && x.$metadata ? `An error occurred (${x.name}): ${x.message && x.message !== 'UnknownError' ? x.message : x.name}` : errMessage(e);
    return { stdout: '', stderr: msg + op, code: x?.$fault === 'client' ? 254 : 255 };
  }
}

/* ------------------------------------------------------------ completion */

const GLOBAL_COMPLETIONS = ['--region', '--output', '--query', '--cli-input-json', '--no-paginate'];

export async function complete(line: string, ctx: Ctx): Promise<{ candidates: string[]; token: string }> {
  void ctx;
  const trailing = /\s$/.test(line);
  const toks = line.trim().split(/\s+/).filter(Boolean);
  const idx = trailing ? toks.length : toks.length - 1;
  const cur = trailing ? '' : toks[toks.length - 1] ?? '';
  const pick = (all: string[]) => ({ candidates: [...new Set(all)].filter((c) => c.startsWith(cur)).sort(), token: cur });
  if (idx === 0) return pick(['aws', 'clear']);
  if (toks[0] !== 'aws') return pick([]);
  if (idx === 1) return pick([...Object.keys(SERVICES), 'help']);
  const key = ALIASES[toks[1]] ?? toks[1];
  const svc = SERVICES[key];
  if (!svc) return pick([]);
  if (idx === 2) {
    if (key === 's3') return pick([...Object.keys(S3_HIGH_LEVEL), 'help']);
    return pick([...opNames(await svc.load()), 'help']);
  }
  if (cur.startsWith('-') && key !== 's3') {
    const mod = await svc.load();
    const exp = ops(mod).get(squash(toks[2]));
    if (!exp) return pick(GLOBAL_COMPLETIONS);
    const mem = inputMembers(new mod[exp]({}));
    return pick([...(mem?.names ?? []).map((n) => `--${kebab(n)}`), ...GLOBAL_COMPLETIONS]);
  }
  if (cur.startsWith('-')) return pick(['--recursive', '--force', '--body', ...GLOBAL_COMPLETIONS]);
  return pick([]);
}

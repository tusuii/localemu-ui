/**
 * Convert an `aws <service> <operation> --flag value ...` command (as produced by the "Show CLI" popover)
 * into the equivalent AWS SDK for JavaScript v3 snippet. Pure: no DOM, no SDK imports, unit-tested.
 *
 * Naming is derived, not looked up: `aws sqs create-queue --queue-name q` -> `SQSClient` / `CreateQueueCommand`
 * with `{ QueueName: "q" }`. Members are PascalCase, except for the services whose SDK uses lowerCamelCase
 * (CloudWatch Logs, Step Functions, ECS, ECR, API Gateway).
 */

/** Split a command line with POSIX-style quoting (no expansion). */
export function tokenizeCli(line: string): string[] {
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
    if (c === '\\' && i + 1 < line.length) {
      if (line[i + 1] === '\n') { i++; continue; } // line continuation
      cur += line[++i]; has = true; continue;
    }
    if (/\s/.test(c)) { if (has || cur) { out.push(cur); cur = ''; has = false; } continue; }
    cur += c; has = true;
  }
  if (has || cur) out.push(cur);
  return out;
}

/** CLI service name -> [npm package suffix, client class]. Anything else falls back to client-<name> / <Pascal>Client. */
const SERVICES: Record<string, [string, string]> = {
  acm: ['acm', 'ACMClient'], apigateway: ['api-gateway', 'APIGatewayClient'], apigatewayv2: ['apigatewayv2', 'ApiGatewayV2Client'],
  athena: ['athena', 'AthenaClient'], cloudformation: ['cloudformation', 'CloudFormationClient'], cloudwatch: ['cloudwatch', 'CloudWatchClient'],
  'cognito-idp': ['cognito-identity-provider', 'CognitoIdentityProviderClient'], dynamodb: ['dynamodb', 'DynamoDBClient'], ec2: ['ec2', 'EC2Client'],
  ecr: ['ecr', 'ECRClient'], ecs: ['ecs', 'ECSClient'], elbv2: ['elastic-load-balancing-v2', 'ElasticLoadBalancingV2Client'],
  events: ['eventbridge', 'EventBridgeClient'], glue: ['glue', 'GlueClient'], iam: ['iam', 'IAMClient'], kinesis: ['kinesis', 'KinesisClient'],
  kms: ['kms', 'KMSClient'], lambda: ['lambda', 'LambdaClient'], logs: ['cloudwatch-logs', 'CloudWatchLogsClient'], rds: ['rds', 'RDSClient'],
  route53: ['route-53', 'Route53Client'], s3: ['s3', 'S3Client'], s3api: ['s3', 'S3Client'], secretsmanager: ['secrets-manager', 'SecretsManagerClient'],
  sns: ['sns', 'SNSClient'], sqs: ['sqs', 'SQSClient'], ssm: ['ssm', 'SSMClient'], stepfunctions: ['sfn', 'SFNClient'], sfn: ['sfn', 'SFNClient'], sts: ['sts', 'STSClient'],
};
const LOWER_CAMEL = new Set(['logs', 'stepfunctions', 'sfn', 'ecs', 'ecr', 'apigateway', 'apigatewayv2']);
const ACRONYMS: Record<string, string> = { db: 'DB' };

const pascal = (s: string) => s.split('-').filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
const member = (flag: string, lower: boolean) => {
  const parts = flag.split('-').filter(Boolean).map((p, i) => (i === 0 && lower ? p : ACRONYMS[p] ?? p[0].toUpperCase() + p.slice(1)));
  const s = parts.join('');
  return lower ? s[0].toLowerCase() + s.slice(1) : s;
};

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** JS literal with unquoted identifier keys, 2-space indent. */
export function jsLiteral(v: unknown, depth = 0): string {
  const pad = '  '.repeat(depth + 1); const end = '  '.repeat(depth);
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const items = v.map((x) => jsLiteral(x, depth + 1));
    if (items.every((x) => !x.includes('\n')) && items.join(', ').length < 60) return `[${items.join(', ')}]`;
    return `[\n${items.map((x) => pad + x).join(',\n')},\n${end}]`;
  }
  const e = Object.entries(v as Record<string, unknown>);
  if (!e.length) return '{}';
  return `{\n${e.map(([k, x]) => `${pad}${IDENT.test(k) ? k : JSON.stringify(k)}: ${jsLiteral(x, depth + 1)}`).join(',\n')},\n${end}}`;
}

/** Convert one CLI string value to a JS value: JSON, number, boolean, Key=Value shorthand, or the string. */
function value(raw: string[]): unknown {
  if (raw.length === 0) return true;
  const one = (v: string): unknown => {
    const t = v.trim();
    if (/^[{[]/.test(t)) { try { return JSON.parse(t); } catch { /* fall through */ } }
    if (/^-?\d+(\.\d+)?$/.test(t) && !/^0\d/.test(t)) return Number(t);
    if (t === 'true' || t === 'false') return t === 'true';
    return v;
  };
  const shorthand = (v: string): Record<string, string> | null => {
    if (/^[{["<]/.test(v.trim()) || !/^[\w.:/-]+=/.test(v)) return null;
    const o: Record<string, string> = {};
    for (const p of v.split(',')) { const i = p.indexOf('='); if (i < 0) return null; o[p.slice(0, i).trim()] = p.slice(i + 1); }
    return o;
  };
  const sh = raw.map(shorthand);
  if (sh.every(Boolean)) return Object.assign({}, ...sh);
  return raw.length === 1 ? one(raw[0]) : raw.map(one);
}

export interface SdkOpts {
  /** Account id, used as the access key id (LocalEmu keeps one state per account). */
  account?: string;
}

/**
 * Returns the SDK snippet, or a `//` comment explaining why there is no direct equivalent.
 */
export function cliToSdk(cmd: string, opts: SdkOpts = {}): string {
  const toks = tokenizeCli(cmd);
  const head = toks.shift();
  if (head !== 'aws') return '// Not an "aws <service> <operation>" command.';
  const [service, op, ...rest] = toks;
  if (!service || !op || service.startsWith('--') || op.startsWith('--')) return '// Not an "aws <service> <operation>" command.';

  const flags = new Map<string, string[]>(); const positional: string[] = [];
  let cur: string[] | null = null;
  for (const t of rest) {
    if (t.startsWith('--') && t.length > 2) {
      const eq = t.indexOf('=');
      const name = (eq > 0 ? t.slice(2, eq) : t.slice(2)).toLowerCase();
      const l = flags.get(name) ?? []; flags.set(name, l);
      if (eq > 0) { l.push(t.slice(eq + 1)); cur = null; } else cur = l;
    } else if (cur) cur.push(t); else positional.push(t);
  }
  const endpoint = flags.get('endpoint-url')?.[0]; const region = flags.get('region')?.[0];
  flags.delete('endpoint-url'); flags.delete('region');

  let svc = service; let opName = op; const input: Record<string, unknown> = {};
  if (service === 's3') {
    const bucket = (u?: string) => /^s3:\/\/([^/]+)/.exec(u ?? '')?.[1] ?? u ?? '<bucket>';
    if (op === 'ls' && !positional.length) opName = 'list-buckets';
    else if (op === 'mb') { opName = 'create-bucket'; input.Bucket = bucket(positional[0]); }
    else if (op === 'rb') { opName = 'delete-bucket'; input.Bucket = bucket(positional[0]); }
    else return `// "aws s3 ${op}" is a high-level CLI command with no single SDK call; use the s3api equivalents\n// (ListObjectsV2Command, PutObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand).`;
    svc = 's3api';
  } else if (positional.length) {
    return `// Unexpected positional argument "${positional[0]}".`;
  }

  const [pkg, clientName] = SERVICES[svc] ?? [svc, pascal(svc) + 'Client'];
  const command = pascal(opName) + 'Command';
  const lower = LOWER_CAMEL.has(svc);
  for (const [name, vals] of flags) {
    if (['output', 'query', 'profile', 'no-paginate', 'no-cli-pager', 'debug', 'no-sign-request', 'cli-input-json'].includes(name)) continue;
    input[member(name, lower)] = value(vals);
  }
  // Repeated shorthand flags (--attributes A=1 --attributes B=2) arrive as one list and merge in value().

  const cfg: string[] = [];
  cfg.push(`region: ${JSON.stringify(region ?? 'us-east-1')}`);
  if (endpoint) cfg.push(`endpoint: ${JSON.stringify(endpoint)}`);
  cfg.push(`credentials: { accessKeyId: ${JSON.stringify(opts.account ?? 'test')}, secretAccessKey: "test" }`);
  if (service === 's3' || service === 's3api') cfg.push('forcePathStyle: true');
  const arg = Object.keys(input).length ? jsLiteral(input) : '{}';
  return [
    `import { ${clientName}, ${command} } from "@aws-sdk/client-${pkg}";`,
    '',
    `const client = new ${clientName}({ ${cfg.join(', ')} });`,
    `const response = await client.send(new ${command}(${arg}));`,
    'console.log(response);',
  ].join('\n');
}

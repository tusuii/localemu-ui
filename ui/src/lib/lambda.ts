import { strToU8, unzipSync, zipSync, strFromU8 } from 'fflate';

export interface RuntimeDef { id: string; label: string; handler: string; file: string; code: string }

const PY = `import json


def lambda_handler(event, context):
    print("Received event:", json.dumps(event))
    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Hello from LocalEmu!", "input": event}),
    }
`;
const NODE = `export const handler = async (event, context) => {
  console.log("Received event:", JSON.stringify(event));
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from LocalEmu!", input: event }),
  };
};
`;
const RUBY = `require 'json'

def lambda_handler(event:, context:)
  { statusCode: 200, body: JSON.generate({ message: 'Hello from LocalEmu!', input: event }) }
end
`;

export const RUNTIMES: RuntimeDef[] = [
  { id: 'python3.13', label: 'Python 3.13', handler: 'lambda_function.lambda_handler', file: 'lambda_function.py', code: PY },
  { id: 'python3.12', label: 'Python 3.12', handler: 'lambda_function.lambda_handler', file: 'lambda_function.py', code: PY },
  { id: 'python3.11', label: 'Python 3.11', handler: 'lambda_function.lambda_handler', file: 'lambda_function.py', code: PY },
  { id: 'nodejs22.x', label: 'Node.js 22.x', handler: 'index.handler', file: 'index.mjs', code: NODE },
  { id: 'nodejs20.x', label: 'Node.js 20.x', handler: 'index.handler', file: 'index.mjs', code: NODE },
  { id: 'ruby3.3', label: 'Ruby 3.3', handler: 'lambda_function.lambda_handler', file: 'lambda_function.rb', code: RUBY },
];

export const runtimeDef = (id: string) => RUNTIMES.find((r) => r.id === id);

export function zipInline(file: string, code: string): Uint8Array {
  return zipSync({ [file]: strToU8(code) });
}

export interface ZipEntry { path: string; size: number; text?: string; binary: boolean }

const MAX_TEXT = 256 * 1024;
export function readZip(buf: Uint8Array): ZipEntry[] {
  const files = unzipSync(buf);
  return Object.entries(files)
    .filter(([p]) => !p.endsWith('/'))
    .map(([path, data]) => {
      const binary = data.includes(0) || data.length > MAX_TEXT;
      return { path, size: data.length, binary, text: binary ? undefined : strFromU8(data) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Replace one file inside an existing zip. */
export function patchZip(buf: Uint8Array, path: string, text: string): Uint8Array {
  const files = unzipSync(buf);
  files[path] = strToU8(text);
  return zipSync(files);
}

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) throw new Error(`Invalid environment line "${line}". Use KEY=value.`);
    out[line.slice(0, i).trim()] = line.slice(i + 1);
  }
  return out;
}
export const envText = (env?: Record<string, string>) => Object.entries(env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n');

export const sourceKind = (arn = '') => (arn.includes(':sqs:') ? 'SQS' : arn.includes(':kinesis:') ? 'Kinesis' : arn.includes(':dynamodb:') ? 'DynamoDB stream' : arn.includes(':kafka:') ? 'MSK' : arn.includes(':mq:') ? 'MQ' : 'Other');
/** Kinesis and DynamoDB streams need a starting position; SQS does not. */
export const needsStartPosition = (arn = '') => /:kinesis:|:dynamodb:|:kafka:/.test(arn);

export const INVOKE_PRINCIPALS: { label: string; principal: string; sourceHint: string }[] = [
  { label: 'Amazon S3', principal: 's3.amazonaws.com', sourceHint: 'arn:aws:s3:::bucket-name' },
  { label: 'Amazon SNS', principal: 'sns.amazonaws.com', sourceHint: 'arn:aws:sns:us-east-1:000000000000:topic' },
  { label: 'Amazon EventBridge (events)', principal: 'events.amazonaws.com', sourceHint: 'arn:aws:events:us-east-1:000000000000:rule/name' },
  { label: 'Amazon API Gateway', principal: 'apigateway.amazonaws.com', sourceHint: 'arn:aws:execute-api:us-east-1:000000000000:api-id/*' },
  { label: 'Amazon SQS', principal: 'sqs.amazonaws.com', sourceHint: 'arn:aws:sqs:us-east-1:000000000000:queue' },
  { label: 'CloudWatch Logs', principal: 'logs.amazonaws.com', sourceHint: 'arn:aws:logs:us-east-1:000000000000:log-group:name:*' },
  { label: 'Another account / principal ARN', principal: '', sourceHint: '' },
];

export interface PolicyRow { sid: string; effect: string; principal: string; action: string; condition: string }
export function policyRows(json?: string): PolicyRow[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    const st = Array.isArray(p.Statement) ? p.Statement : [p.Statement];
    return st.filter(Boolean).map((s: any) => {
      const pr = s.Principal;
      const principal = typeof pr === 'string' ? pr : pr ? Object.values(pr).flat().join(', ') : '';
      const cond = s.Condition ? Object.values(s.Condition).map((c: any) => Object.values(c).join(', ')).join('; ') : '';
      return { sid: s.Sid ?? '', effect: s.Effect ?? '', principal, action: [s.Action].flat().join(', '), condition: cond };
    });
  } catch { return []; }
}

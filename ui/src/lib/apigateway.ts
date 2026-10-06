import { PUBLIC_ENDPOINT } from './config';

export type ApiKind = 'rest' | 'v2';

export interface ApiRow {
  id: string;
  /** `rest:<id>` or `v2:<id>` - unique across both APIs for table selection. */
  key: string;
  kind: ApiKind;
  name: string;
  type: string;
  description?: string;
  created?: Date;
  endpoint?: string;
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'ANY'];

/** Where a REST API stage is reachable on LocalEmu (the browser-facing address). */
export const restInvokeUrl = (apiId: string, stage: string) => `${PUBLIC_ENDPOINT}/restapis/${apiId}/${stage}/_user_request_/`;

/** HTTP/WebSocket API URL: LocalEmu routes `<id>.execute-api.localhost:<port>` to the API. */
export function v2InvokeUrl(apiId: string, stage: string, protocol: string) {
  const u = new URL(PUBLIC_ENDPOINT);
  const scheme = protocol === 'WEBSOCKET' ? (u.protocol === 'https:' ? 'wss' : 'ws') : u.protocol.replace(':', '');
  const base = `${scheme}://${apiId}.execute-api.localhost${u.port ? ':' + u.port : ''}`;
  return stage === '$default' ? `${base}/` : `${base}/${stage}/`;
}

export const lambdaIntegrationUri = (region: string, fnArn: string) =>
  `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${fnArn}/invocations`;

/** Accept a bare function name or a full ARN. */
export function lambdaArn(input: string, region: string, account: string) {
  if (input.startsWith('arn:')) return input;
  return `arn:aws:lambda:${region}:${account}:function:${input}`;
}


export const USAGE_PERIODS = ['DAY', 'WEEK', 'MONTH'] as const;

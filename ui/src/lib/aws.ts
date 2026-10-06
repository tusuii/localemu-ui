import { NodeHttpHandler } from '@smithy/node-http-handler';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SNSClient } from '@aws-sdk/client-sns';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SSMClient } from '@aws-sdk/client-ssm';
import { IAMClient } from '@aws-sdk/client-iam';
import { EC2Client } from '@aws-sdk/client-ec2';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { SFNClient } from '@aws-sdk/client-sfn';
import { KMSClient } from '@aws-sdk/client-kms';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { STSClient } from '@aws-sdk/client-sts';
import { KinesisClient } from '@aws-sdk/client-kinesis';
import { Route53Client } from '@aws-sdk/client-route-53';
import { APIGatewayClient } from '@aws-sdk/client-api-gateway';
import { ApiGatewayV2Client } from '@aws-sdk/client-apigatewayv2';
import { RDSClient } from '@aws-sdk/client-rds';
import { ECSClient } from '@aws-sdk/client-ecs';
import { ECRClient } from '@aws-sdk/client-ecr';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ACMClient } from '@aws-sdk/client-acm';
import { AthenaClient } from '@aws-sdk/client-athena';
import { GlueClient } from '@aws-sdk/client-glue';
import { ENDPOINT, PUBLIC_ENDPOINT } from './config';
import type { Ctx } from './context';

/**
 * Per-(service, account, region) SDK clients pointed at LocalEmu.
 *
 * LocalEmu derives the AWS account from the access key id, so using the
 * selected account id as the key id gives real multi-account behaviour.
 */
const cache = new Map<string, unknown>();

type Ctor<T> = new (cfg: Record<string, unknown>) => T;

function client<T>(name: string, C: Ctor<T>, ctx: Ctx, extra: Record<string, unknown> = {}, timeout = 30_000): T {
  const key = `${name}|${ctx.account}|${ctx.region}`;
  let c = cache.get(key) as T | undefined;
  if (!c) {
    // The account comes from a cookie, so bound the cache instead of letting it grow forever.
    if (cache.size > 400) cache.clear();
    c = new C({
      endpoint: ENDPOINT,
      region: ctx.region,
      credentials: { accessKeyId: ctx.account, secretAccessKey: 'test' },
      maxAttempts: 2,
      customUserAgent: 'localemu-console',
      // Keep SDK v3 from adding checksum trailers LocalEmu does not need.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: new NodeHttpHandler({ connectionTimeout: 4_000, requestTimeout: timeout }),
      ...extra,
    });
    cache.set(key, c);
  }
  return c;
}

/**
 * Generic client factory for code that picks the SDK package at runtime (the console shell).
 * Shares the same cache and LocalEmu endpoint / credentials as the typed `aws.*` helpers.
 */
export function clientFor(name: string, C: Ctor<unknown>, ctx: Ctx, extra: Record<string, unknown> = {}, timeout = 30_000): unknown {
  return client(`dyn:${name}`, C, ctx, extra, timeout);
}

export const aws = {
  /** Same bucket access but addressed the way the *browser* reaches LocalEmu (pre-signed URLs). */
  s3Public: (c: Ctx) => client('s3pub', S3Client as never, c, { forcePathStyle: true, endpoint: PUBLIC_ENDPOINT }) as S3Client,
  s3: (c: Ctx) => client('s3', S3Client as never, c, { forcePathStyle: true }, 120_000) as S3Client,
  dynamodb: (c: Ctx) => client('ddb', DynamoDBClient as never, c) as DynamoDBClient,
  sqs: (c: Ctx) => client('sqs', SQSClient as never, c) as SQSClient,
  sns: (c: Ctx) => client('sns', SNSClient as never, c) as SNSClient,
  lambda: (c: Ctx) => client('lambda', LambdaClient as never, c, {}, 300_000) as LambdaClient,
  secrets: (c: Ctx) => client('secrets', SecretsManagerClient as never, c) as SecretsManagerClient,
  ssm: (c: Ctx) => client('ssm', SSMClient as never, c) as SSMClient,
  iam: (c: Ctx) => client('iam', IAMClient as never, c) as IAMClient,
  ec2: (c: Ctx) => client('ec2', EC2Client as never, c, {}, 120_000) as EC2Client,
  logs: (c: Ctx) => client('logs', CloudWatchLogsClient as never, c) as CloudWatchLogsClient,
  cloudwatch: (c: Ctx) => client('cw', CloudWatchClient as never, c) as CloudWatchClient,
  events: (c: Ctx) => client('events', EventBridgeClient as never, c) as EventBridgeClient,
  sfn: (c: Ctx) => client('sfn', SFNClient as never, c) as SFNClient,
  kms: (c: Ctx) => client('kms', KMSClient as never, c) as KMSClient,
  cfn: (c: Ctx) => client('cfn', CloudFormationClient as never, c) as CloudFormationClient,
  sts: (c: Ctx) => client('sts', STSClient as never, c) as STSClient,
  kinesis: (c: Ctx) => client('kinesis', KinesisClient as never, c) as KinesisClient,
  route53: (c: Ctx) => client('r53', Route53Client as never, c) as Route53Client,
  apigw: (c: Ctx) => client('apigw', APIGatewayClient as never, c) as APIGatewayClient,
  apigwv2: (c: Ctx) => client('apigwv2', ApiGatewayV2Client as never, c) as ApiGatewayV2Client,
  rds: (c: Ctx) => client('rds', RDSClient as never, c, {}, 120_000) as RDSClient,
  ecs: (c: Ctx) => client('ecs', ECSClient as never, c) as ECSClient,
  ecr: (c: Ctx) => client('ecr', ECRClient as never, c) as ECRClient,
  cognito: (c: Ctx) => client('cognito', CognitoIdentityProviderClient as never, c) as CognitoIdentityProviderClient,
  elbv2: (c: Ctx) => client('elbv2', ElasticLoadBalancingV2Client as never, c) as ElasticLoadBalancingV2Client,
  acm: (c: Ctx) => client('acm', ACMClient as never, c) as ACMClient,
  athena: (c: Ctx) => client('athena', AthenaClient as never, c) as AthenaClient,
  glue: (c: Ctx) => client('glue', GlueClient as never, c) as GlueClient,
};

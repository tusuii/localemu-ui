import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { ListQueuesCommand } from '@aws-sdk/client-sqs';
import { ListTopicsCommand } from '@aws-sdk/client-sns';
import { ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { DescribeInstancesCommand, DescribeVpcsCommand } from '@aws-sdk/client-ec2';
import { ListSecretsCommand } from '@aws-sdk/client-secrets-manager';
import { DescribeParametersCommand } from '@aws-sdk/client-ssm';
import { DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { ListKeysCommand } from '@aws-sdk/client-kms';
import { ListUsersCommand, ListRolesCommand } from '@aws-sdk/client-iam';
import { ListStateMachinesCommand } from '@aws-sdk/client-sfn';
import { ListEventBusesCommand } from '@aws-sdk/client-eventbridge';
import { ListStreamsCommand } from '@aws-sdk/client-kinesis';
import { aws } from './aws';
import type { Ctx } from './context';

export interface ResourceCount { id: string; label: string; href: string; count: number | null; more?: boolean }

const opts = () => ({ abortSignal: AbortSignal.timeout(5000) });

type Counter = () => Promise<{ n: number; more?: boolean }>;

/** A quick census of the account + region for the home page. First page only. */
export async function resourceCounts(ctx: Ctx): Promise<ResourceCount[]> {
  const defs: { id: string; label: string; href: string; run: Counter }[] = [
    { id: 's3', label: 'S3 buckets', href: '/s3', run: async () => ({ n: ((await aws.s3(ctx).send(new ListBucketsCommand({}), opts())).Buckets ?? []).length }) },
    { id: 'dynamodb', label: 'DynamoDB tables', href: '/dynamodb', run: async () => { const r = await aws.dynamodb(ctx).send(new ListTablesCommand({}), opts()); return { n: r.TableNames?.length ?? 0, more: !!r.LastEvaluatedTableName }; } },
    { id: 'lambda', label: 'Lambda functions', href: '/lambda', run: async () => { const r = await aws.lambda(ctx).send(new ListFunctionsCommand({}), opts()); return { n: r.Functions?.length ?? 0, more: !!r.NextMarker }; } },
    { id: 'sqs', label: 'SQS queues', href: '/sqs', run: async () => { const r = await aws.sqs(ctx).send(new ListQueuesCommand({}), opts()); return { n: r.QueueUrls?.length ?? 0, more: !!r.NextToken }; } },
    { id: 'sns', label: 'SNS topics', href: '/sns', run: async () => { const r = await aws.sns(ctx).send(new ListTopicsCommand({}), opts()); return { n: r.Topics?.length ?? 0, more: !!r.NextToken }; } },
    { id: 'ec2', label: 'EC2 instances', href: '/ec2/instances', run: async () => ({ n: ((await aws.ec2(ctx).send(new DescribeInstancesCommand({}), opts())).Reservations ?? []).reduce((a, r) => a + (r.Instances?.length ?? 0), 0) }) },
    { id: 'vpc', label: 'VPCs', href: '/ec2/vpcs', run: async () => ({ n: ((await aws.ec2(ctx).send(new DescribeVpcsCommand({}), opts())).Vpcs ?? []).length }) },
    { id: 'secretsmanager', label: 'Secrets', href: '/secretsmanager', run: async () => { const r = await aws.secrets(ctx).send(new ListSecretsCommand({}), opts()); return { n: r.SecretList?.length ?? 0, more: !!r.NextToken }; } },
    { id: 'ssm', label: 'SSM parameters', href: '/ssm', run: async () => { const r = await aws.ssm(ctx).send(new DescribeParametersCommand({}), opts()); return { n: r.Parameters?.length ?? 0, more: !!r.NextToken }; } },
    { id: 'logs', label: 'Log groups', href: '/logs', run: async () => { const r = await aws.logs(ctx).send(new DescribeLogGroupsCommand({}), opts()); return { n: r.logGroups?.length ?? 0, more: !!r.nextToken }; } },
    { id: 'cloudformation', label: 'CloudFormation stacks', href: '/cloudformation', run: async () => ({ n: ((await aws.cfn(ctx).send(new DescribeStacksCommand({}), opts())).Stacks ?? []).length }) },
    { id: 'kms', label: 'KMS keys', href: '/kms', run: async () => { const r = await aws.kms(ctx).send(new ListKeysCommand({}), opts()); return { n: r.Keys?.length ?? 0, more: !!r.Truncated }; } },
    { id: 'iam-users', label: 'IAM users', href: '/iam/users', run: async () => { const r = await aws.iam(ctx).send(new ListUsersCommand({}), opts()); return { n: r.Users?.length ?? 0, more: !!r.IsTruncated }; } },
    { id: 'iam-roles', label: 'IAM roles', href: '/iam/roles', run: async () => { const r = await aws.iam(ctx).send(new ListRolesCommand({}), opts()); return { n: r.Roles?.length ?? 0, more: !!r.IsTruncated }; } },
    { id: 'stepfunctions', label: 'State machines', href: '/stepfunctions', run: async () => { const r = await aws.sfn(ctx).send(new ListStateMachinesCommand({}), opts()); return { n: r.stateMachines?.length ?? 0, more: !!r.nextToken }; } },
    { id: 'events', label: 'Event buses', href: '/events', run: async () => ({ n: ((await aws.events(ctx).send(new ListEventBusesCommand({}), opts())).EventBuses ?? []).length }) },
    { id: 'kinesis', label: 'Kinesis streams', href: '/kinesis', run: async () => { const r = await aws.kinesis(ctx).send(new ListStreamsCommand({}), opts()); return { n: r.StreamNames?.length ?? 0, more: !!r.HasMoreStreams }; } },
  ];
  const settled = await Promise.allSettled(defs.map((d) => d.run()));
  return defs.map((d, i) => {
    const s = settled[i];
    return { id: d.id, label: d.label, href: d.href, count: s.status === 'fulfilled' ? s.value.n : null, more: s.status === 'fulfilled' ? s.value.more : undefined };
  });
}

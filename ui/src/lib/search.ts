/**
 * Global resource search: fans out List/Describe calls across services in
 * parallel (each with a timeout), keeps the listings in a short-lived cache
 * per account + region, and filters them by the query. A service that errors
 * or is slow is reported separately and never blocks the others.
 */
import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { ListQueuesCommand } from '@aws-sdk/client-sqs';
import { ListTopicsCommand } from '@aws-sdk/client-sns';
import { ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { ListSecretsCommand } from '@aws-sdk/client-secrets-manager';
import { DescribeParametersCommand } from '@aws-sdk/client-ssm';
import { ListAliasesCommand } from '@aws-sdk/client-kms';
import { ListUsersCommand, ListRolesCommand, ListGroupsCommand, ListPoliciesCommand } from '@aws-sdk/client-iam';
import { DescribeInstancesCommand, DescribeVpcsCommand, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import { DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { ListEventBusesCommand, ListRulesCommand } from '@aws-sdk/client-eventbridge';
import { ListStateMachinesCommand } from '@aws-sdk/client-sfn';
import { ListStreamsCommand } from '@aws-sdk/client-kinesis';
import { DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { ListHostedZonesCommand } from '@aws-sdk/client-route-53';
import { DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { ListClustersCommand } from '@aws-sdk/client-ecs';
import { DescribeRepositoriesCommand } from '@aws-sdk/client-ecr';
import { ListUserPoolsCommand } from '@aws-sdk/client-cognito-identity-provider';
import { ListCertificatesCommand } from '@aws-sdk/client-acm';
import { DescribeLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { GetDatabasesCommand } from '@aws-sdk/client-glue';
import { aws } from './aws';
import type { Ctx } from './context';
import { CONSOLES } from './services';
import { errMessage } from './errors';

export interface Hit { name: string; sub?: string; href: string }
export interface Group { id: string; label: string; service: string; hits: Hit[]; total: number }
export interface SearchResponse {
  q: string;
  groups: Group[];
  /** Providers that failed. */
  errors: Array<{ label: string; message: string }>;
  /** Providers that had not answered within the time budget (they keep loading in the background). */
  slow: string[];
  count: number;
}

const opt = () => ({ abortSignal: AbortSignal.timeout(10000) });
const enc = encodeURIComponent;
const last = (arn?: string) => (arn ?? '').split(/[:/]/).pop() ?? '';
const svcHref = (id: string) => CONSOLES.find((c) => c.id === id)?.href ?? `/service/${id}`;

interface Provider { id: string; label: string; service: string; list: (ctx: Ctx) => Promise<Hit[]> }

const PROVIDERS: Provider[] = [
  { id: 's3', label: 'S3 buckets', service: 's3', list: async (c) => ((await aws.s3(c).send(new ListBucketsCommand({}), opt())).Buckets ?? []).map((b) => ({ name: b.Name!, href: `/s3/${enc(b.Name!)}` })) },
  { id: 'dynamodb', label: 'DynamoDB tables', service: 'dynamodb', list: async (c) => ((await aws.dynamodb(c).send(new ListTablesCommand({ Limit: 100 }), opt())).TableNames ?? []).map((n) => ({ name: n, href: `/dynamodb/${enc(n)}` })) },
  { id: 'sqs', label: 'SQS queues', service: 'sqs', list: async (c) => ((await aws.sqs(c).send(new ListQueuesCommand({ MaxResults: 1000 }), opt())).QueueUrls ?? []).map((u) => ({ name: last(u), href: `/sqs/${enc(last(u))}` })) },
  { id: 'sns', label: 'SNS topics', service: 'sns', list: async (c) => ((await aws.sns(c).send(new ListTopicsCommand({}), opt())).Topics ?? []).map((t) => ({ name: last(t.TopicArn), sub: t.TopicArn, href: `/sns/${enc(last(t.TopicArn))}` })) },
  { id: 'lambda', label: 'Lambda functions', service: 'lambda', list: async (c) => ((await aws.lambda(c).send(new ListFunctionsCommand({}), opt())).Functions ?? []).map((f) => ({ name: f.FunctionName!, sub: f.Runtime, href: `/lambda/${enc(f.FunctionName!)}` })) },
  { id: 'secrets', label: 'Secrets', service: 'secretsmanager', list: async (c) => ((await aws.secrets(c).send(new ListSecretsCommand({}), opt())).SecretList ?? []).map((s) => ({ name: s.Name!, href: `/secretsmanager/${s.Name!.split('/').map(enc).join('/')}` })) },
  { id: 'ssm', label: 'SSM parameters', service: 'ssm', list: async (c) => ((await aws.ssm(c).send(new DescribeParametersCommand({ MaxResults: 50 }), opt())).Parameters ?? []).map((p) => ({ name: p.Name!, sub: p.Type, href: `/ssm/parameter?name=${enc(p.Name!)}` })) },
  { id: 'kms', label: 'KMS aliases', service: 'kms', list: async (c) => ((await aws.kms(c).send(new ListAliasesCommand({}), opt())).Aliases ?? []).filter((a) => a.TargetKeyId).map((a) => ({ name: a.AliasName!, sub: a.TargetKeyId, href: `/kms/${enc(a.TargetKeyId!)}` })) },
  { id: 'iam-users', label: 'IAM users', service: 'iam', list: async (c) => ((await aws.iam(c).send(new ListUsersCommand({}), opt())).Users ?? []).map((u) => ({ name: u.UserName!, href: `/iam/users/${enc(u.UserName!)}` })) },
  { id: 'iam-roles', label: 'IAM roles', service: 'iam', list: async (c) => ((await aws.iam(c).send(new ListRolesCommand({}), opt())).Roles ?? []).map((r) => ({ name: r.RoleName!, href: `/iam/roles/${enc(r.RoleName!)}` })) },
  { id: 'iam-groups', label: 'IAM groups', service: 'iam', list: async (c) => ((await aws.iam(c).send(new ListGroupsCommand({}), opt())).Groups ?? []).map((g) => ({ name: g.GroupName!, href: `/iam/groups/${enc(g.GroupName!)}` })) },
  { id: 'iam-policies', label: 'IAM policies', service: 'iam', list: async (c) => ((await aws.iam(c).send(new ListPoliciesCommand({ Scope: 'Local' }), opt())).Policies ?? []).map((p) => ({ name: p.PolicyName!, sub: p.Arn, href: `/iam/policies/detail?arn=${enc(p.Arn!)}` })) },
  {
    id: 'ec2-instances', label: 'EC2 instances', service: 'ec2',
    list: async (c) => ((await aws.ec2(c).send(new DescribeInstancesCommand({}), opt())).Reservations ?? []).flatMap((r) => r.Instances ?? []).map((i) => {
      const n = i.Tags?.find((t) => t.Key === 'Name')?.Value;
      return { name: n ? `${n} (${i.InstanceId})` : i.InstanceId!, sub: i.InstanceType, href: `/ec2/instances/${i.InstanceId}` };
    }),
  },
  {
    id: 'ec2-vpcs', label: 'VPCs', service: 'ec2',
    list: async (c) => ((await aws.ec2(c).send(new DescribeVpcsCommand({}), opt())).Vpcs ?? []).map((v) => {
      const n = v.Tags?.find((t) => t.Key === 'Name')?.Value;
      return { name: n ? `${n} (${v.VpcId})` : v.VpcId!, sub: v.CidrBlock, href: '/ec2/vpcs' };
    }),
  },
  {
    id: 'ec2-sgs', label: 'Security groups', service: 'ec2',
    list: async (c) => ((await aws.ec2(c).send(new DescribeSecurityGroupsCommand({}), opt())).SecurityGroups ?? []).map((g) => ({ name: `${g.GroupName} (${g.GroupId})`, sub: g.VpcId, href: `/ec2/security-groups/${g.GroupId}` })),
  },
  { id: 'logs', label: 'Log groups', service: 'logs', list: async (c) => ((await aws.logs(c).send(new DescribeLogGroupsCommand({ limit: 50 }), opt())).logGroups ?? []).map((g) => ({ name: g.logGroupName!, href: `/logs/group?group=${enc(g.logGroupName!)}` })) },
  { id: 'event-buses', label: 'EventBridge buses', service: 'events', list: async (c) => ((await aws.events(c).send(new ListEventBusesCommand({}), opt())).EventBuses ?? []).map((b) => ({ name: b.Name!, href: `/events/rules?bus=${enc(b.Name!)}` })) },
  {
    id: 'event-rules', label: 'EventBridge rules', service: 'events',
    list: async (c) => {
      const buses = ((await aws.events(c).send(new ListEventBusesCommand({}), opt())).EventBuses ?? []).map((b) => b.Name!).slice(0, 10);
      const per = await Promise.all(buses.map(async (bus) => ((await aws.events(c).send(new ListRulesCommand({ EventBusName: bus }), opt())).Rules ?? []).map((r) => ({ name: r.Name!, sub: bus, href: `/events/rule?bus=${enc(bus)}&name=${enc(r.Name!)}` }))));
      return per.flat();
    },
  },
  { id: 'sfn', label: 'State machines', service: 'stepfunctions', list: async (c) => ((await aws.sfn(c).send(new ListStateMachinesCommand({}), opt())).stateMachines ?? []).map((s) => ({ name: s.name!, href: `/stepfunctions/${enc(s.name!)}` })) },
  { id: 'kinesis', label: 'Kinesis streams', service: 'kinesis', list: async (c) => ((await aws.kinesis(c).send(new ListStreamsCommand({}), opt())).StreamNames ?? []).map((n) => ({ name: n, href: `/kinesis/${enc(n)}` })) },
  { id: 'cfn', label: 'CloudFormation stacks', service: 'cloudformation', list: async (c) => ((await aws.cfn(c).send(new DescribeStacksCommand({}), opt())).Stacks ?? []).map((s) => ({ name: s.StackName!, sub: s.StackStatus, href: `/cloudformation/${enc(s.StackName!)}` })) },
  { id: 'route53', label: 'Route 53 hosted zones', service: 'route53', list: async (c) => ((await aws.route53(c).send(new ListHostedZonesCommand({}), opt())).HostedZones ?? []).map((z) => ({ name: z.Name!, sub: last(z.Id), href: `/route53/${enc(last(z.Id))}` })) },
  { id: 'rds', label: 'RDS instances', service: 'rds', list: async (c) => ((await aws.rds(c).send(new DescribeDBInstancesCommand({}), opt())).DBInstances ?? []).map((d) => ({ name: d.DBInstanceIdentifier!, sub: d.Engine, href: `/rds/${enc(d.DBInstanceIdentifier!)}` })) },
  { id: 'ecs', label: 'ECS clusters', service: 'ecs', list: async (c) => ((await aws.ecs(c).send(new ListClustersCommand({}), opt())).clusterArns ?? []).map((a) => ({ name: last(a), href: svcHref('ecs') })) },
  { id: 'ecr', label: 'ECR repositories', service: 'ecr', list: async (c) => ((await aws.ecr(c).send(new DescribeRepositoriesCommand({}), opt())).repositories ?? []).map((r) => ({ name: r.repositoryName!, href: svcHref('ecr') })) },
  { id: 'cognito', label: 'Cognito user pools', service: 'cognito-idp', list: async (c) => ((await aws.cognito(c).send(new ListUserPoolsCommand({ MaxResults: 60 }), opt())).UserPools ?? []).map((p) => ({ name: p.Name!, sub: p.Id, href: svcHref('cognito-idp') })) },
  { id: 'acm', label: 'ACM certificates', service: 'acm', list: async (c) => ((await aws.acm(c).send(new ListCertificatesCommand({}), opt())).CertificateSummaryList ?? []).map((x) => ({ name: x.DomainName!, sub: last(x.CertificateArn), href: svcHref('acm') })) },
  { id: 'elbv2', label: 'Load balancers', service: 'elbv2', list: async (c) => ((await aws.elbv2(c).send(new DescribeLoadBalancersCommand({}), opt())).LoadBalancers ?? []).map((l) => ({ name: l.LoadBalancerName!, sub: l.Type, href: svcHref('elbv2') })) },
  { id: 'glue', label: 'Glue databases', service: 'glue', list: async (c) => ((await aws.glue(c).send(new GetDatabasesCommand({}), opt())).DatabaseList ?? []).map((d) => ({ name: d.Name!, href: svcHref('glue') })) },
];

interface Entry { at: number; data?: Hit[]; error?: string; promise?: Promise<void> }
const cache = new Map<string, Entry>();
const TTL = 8000;
const BUDGET = 3000;

function ensure(p: Provider, ctx: Ctx): Entry {
  const key = `${ctx.account}|${ctx.region}|${p.id}`;
  let e = cache.get(key);
  if (e && !e.promise && Date.now() - e.at < TTL) return e;
  if (e?.promise) return e;
  if (cache.size > 600) cache.clear();
  const entry: Entry = e ?? { at: 0 };
  entry.promise = p.list(ctx).then(
    (d) => { entry.data = d; entry.error = undefined; },
    (err) => { entry.error = errMessage(err); },
  ).finally(() => { entry.at = Date.now(); entry.promise = undefined; });
  cache.set(key, entry);
  return entry;
}

const score = (name: string, terms: string[]) => {
  const n = name.toLowerCase();
  let s = 0;
  for (const t of terms) {
    const i = n.indexOf(t);
    if (i < 0) return -1;
    s += i === 0 ? 3 : n.includes(`/${t}`) || n.includes(`-${t}`) || n.includes(`_${t}`) ? 2 : 1;
  }
  return s;
};

export async function searchResources(ctx: Ctx, q: string, perGroup = 8): Promise<SearchResponse> {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const res: SearchResponse = { q, groups: [], errors: [], slow: [], count: 0 };
  if (!terms.length) return res;
  const waits = PROVIDERS.map((p) => {
    const e = ensure(p, ctx);
    const wait = e.promise ? Promise.race([e.promise.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), BUDGET))]) : Promise.resolve(true);
    return wait.then((done) => ({ p, e, done }));
  });
  for (const { p, e, done } of await Promise.all(waits)) {
    if (!done && !e.data) { res.slow.push(p.label); continue; }
    if (e.error && !e.data) {
      // "Not available" (service not enabled / not implemented) is not worth shouting about.
      res.errors.push({ label: p.label, message: e.error });
      continue;
    }
    const hits = (e.data ?? []).map((h) => ({ h, s: Math.max(score(h.name, terms), h.sub ? score(h.sub, terms) - 1 : -1) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s || a.h.name.localeCompare(b.h.name));
    if (hits.length) {
      res.groups.push({ id: p.id, label: p.label, service: p.service, hits: hits.slice(0, perGroup).map((x) => x.h), total: hits.length });
      res.count += hits.length;
    }
  }
  return res;
}

import { DescribeSubnetsCommand, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import { ListTaskDefinitionsCommand } from '@aws-sdk/client-ecs';
import type { Ctx } from './context';
import { aws } from './aws';
import { soft } from './errors';

/** "arn:aws:ecs:us-east-1:000000000000:cluster/web" -> "web" (also task/<cluster>/<id> -> id). */
export const lastSeg = (arn: string | undefined) => (arn ?? '').split('/').pop() ?? '';
/** task-definition ARN -> "family:revision". */
export const tdShort = (arn: string | undefined) => lastSeg(arn);

export const cpuMem = (cpu?: string, mem?: string) => [cpu ? `${cpu} CPU units` : '', mem ? `${mem} MiB` : ''].filter(Boolean).join(' / ') || '-';

/** Fargate-compatible CPU/memory combinations (a practical subset). */
export const FARGATE_SIZES: { cpu: string; memory: string[] }[] = [
  { cpu: '256', memory: ['512', '1024', '2048'] },
  { cpu: '512', memory: ['1024', '2048', '3072', '4096'] },
  { cpu: '1024', memory: ['2048', '4096', '8192'] },
  { cpu: '2048', memory: ['4096', '8192', '16384'] },
];

export async function listTaskDefinitions(ctx: Ctx, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
  const out: string[] = [];
  let token: string | undefined;
  do {
    const r = await aws.ecs(ctx).send(new ListTaskDefinitionsCommand({ status, nextToken: token, maxResults: 100 }));
    out.push(...(r.taskDefinitionArns ?? []));
    token = r.nextToken;
  } while (token && out.length < 1000);
  return out;
}

/** Subnets + security groups (for awsvpc / Fargate network configuration). Never throws. */
export async function networkChoices(ctx: Ctx) {
  const ec2 = aws.ec2(ctx);
  const [s, g] = await Promise.all([soft(() => ec2.send(new DescribeSubnetsCommand({}))), soft(() => ec2.send(new DescribeSecurityGroupsCommand({})))]);
  return {
    subnets: (s.value?.Subnets ?? []).map((x) => ({ id: x.SubnetId!, label: `${x.SubnetId} (${x.AvailabilityZone}, ${x.CidrBlock})` })),
    groups: (g.value?.SecurityGroups ?? []).map((x) => ({ id: x.GroupId!, label: `${x.GroupId} (${x.GroupName})` })),
  };
}

/** Build an awsvpc configuration from form values, falling back to the first subnet / default group. */
export function awsvpc(subnets: string[], groups: string[], all: { subnets: { id: string }[]; groups: { id: string; label: string }[] }) {
  const sn = subnets.length ? subnets : all.subnets.slice(0, 1).map((x) => x.id);
  const gp = groups.length ? groups : all.groups.filter((x) => /default/.test(x.label)).slice(0, 1).map((x) => x.id);
  return { awsvpcConfiguration: { subnets: sn, securityGroups: gp.length ? gp : all.groups.slice(0, 1).map((x) => x.id), assignPublicIp: 'DISABLED' as const } };
}

/** ECS tag shape (lower-case) <-> the Key/Value shape the shared tags panel uses. */
export const ecsTagRows = (t: { key?: string; value?: string }[] | undefined) => (t ?? []).filter((x) => x.key).map((x) => ({ Key: x.key!, Value: x.value ?? '' }));

import type { Tag } from '@aws-sdk/client-ec2';

export const tagMap = (tags?: Tag[]): Record<string, string> => Object.fromEntries((tags ?? []).map((t) => [t.Key ?? '', t.Value ?? '']));
export const nameOf = (tags?: Tag[]) => tagMap(tags).Name ?? '';

export const INSTANCE_TYPES = [
  't2.nano', 't2.micro', 't2.small', 't2.medium', 't3.nano', 't3.micro', 't3.small', 't3.medium', 't3.large', 't3.xlarge',
  'm5.large', 'm5.xlarge', 'm5.2xlarge', 'c5.large', 'c5.xlarge', 'r5.large', 'r5.xlarge',
];

export const PROTOCOLS: Record<string, string> = { '-1': 'All traffic', tcp: 'TCP', udp: 'UDP', icmp: 'ICMP' };

export interface RuleRow { id: string; protocol: string; from?: number; to?: number; source: string; description?: string }

import type { IpPermission } from '@aws-sdk/client-ec2';
/** Flatten IpPermission[] into one row per source so each can be revoked individually. */
export function flattenRules(perms: IpPermission[] = []): RuleRow[] {
  const rows: RuleRow[] = [];
  for (const p of perms) {
    const base = { protocol: p.IpProtocol ?? '-1', from: p.FromPort, to: p.ToPort };
    const mk = (kind: string, value: string, description?: string) => rows.push({ ...base, id: [kind, value, base.protocol, base.from ?? '', base.to ?? ''].join('|'), source: value, description });
    for (const r of p.IpRanges ?? []) mk('cidr', r.CidrIp!, r.Description);
    for (const r of p.Ipv6Ranges ?? []) mk('cidr6', r.CidrIpv6!, r.Description);
    for (const g of p.UserIdGroupPairs ?? []) mk('sg', g.GroupId!, g.Description);
    for (const g of p.PrefixListIds ?? []) mk('pl', g.PrefixListId!, g.Description);
  }
  return rows;
}

export function ruleToPermission(id: string): IpPermission {
  const [kind, value, protocol, from, to] = id.split('|');
  const p: IpPermission = { IpProtocol: protocol };
  if (from !== '') p.FromPort = Number(from);
  if (to !== '') p.ToPort = Number(to);
  if (kind === 'cidr') p.IpRanges = [{ CidrIp: value }];
  else if (kind === 'cidr6') p.Ipv6Ranges = [{ CidrIpv6: value }];
  else if (kind === 'sg') p.UserIdGroupPairs = [{ GroupId: value }];
  else p.PrefixListIds = [{ PrefixListId: value }];
  return p;
}

export const portRange = (r: { protocol: string; from?: number; to?: number }) =>
  r.protocol === '-1' ? 'All' : r.from === undefined || r.from === -1 ? 'All' : r.from === r.to ? String(r.from) : `${r.from} - ${r.to}`;

import type { Route } from '@aws-sdk/client-ec2';
/** The target of a route as shown in the console. */
export const routeTarget = (r: Route) =>
  r.GatewayId ?? r.NatGatewayId ?? r.InstanceId ?? r.TransitGatewayId ?? r.VpcPeeringConnectionId ?? r.NetworkInterfaceId ?? r.EgressOnlyInternetGatewayId ?? r.CarrierGatewayId ?? r.LocalGatewayId ?? '?';
export const routeDest = (r: Route) => r.DestinationCidrBlock ?? r.DestinationIpv6CidrBlock ?? r.DestinationPrefixListId ?? '?';

/** Map a target id to the right CreateRoute / ReplaceRoute parameter by its prefix. */
export function routeTargetParams(id: string): Record<string, string> {
  const t = id.trim();
  if (!t) throw new Error('Choose a target.');
  if (t === 'local') return { GatewayId: 'local' };
  if (/^(igw|vgw)-/.test(t)) return { GatewayId: t };
  if (/^nat-/.test(t)) return { NatGatewayId: t };
  if (/^i-/.test(t)) return { InstanceId: t };
  if (/^pcx-/.test(t)) return { VpcPeeringConnectionId: t };
  if (/^tgw-/.test(t)) return { TransitGatewayId: t };
  if (/^eni-/.test(t)) return { NetworkInterfaceId: t };
  if (/^eigw-/.test(t)) return { EgressOnlyInternetGatewayId: t };
  throw new Error(`Don't know how to route to "${t}". Use an igw-, nat-, i-, pcx-, tgw-, eni- or vgw- id, or "local".`);
}
export const isIpv6Cidr = (c: string) => c.includes(':');

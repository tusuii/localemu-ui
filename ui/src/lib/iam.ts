import {
  AttachGroupPolicyCommand, AttachRolePolicyCommand, AttachUserPolicyCommand, DeleteGroupPolicyCommand, DeleteRolePolicyCommand,
  DeleteUserPolicyCommand, DetachGroupPolicyCommand, DetachRolePolicyCommand, DetachUserPolicyCommand, GetGroupPolicyCommand,
  GetRolePolicyCommand, GetUserPolicyCommand, ListAttachedGroupPoliciesCommand, ListAttachedRolePoliciesCommand,
  ListAttachedUserPoliciesCommand, ListGroupPoliciesCommand, ListRolePoliciesCommand, ListUserPoliciesCommand,
  PutGroupPolicyCommand, PutRolePolicyCommand, PutUserPolicyCommand, ListAccessKeysCommand, DeleteAccessKeyCommand,
  ListGroupsForUserCommand, RemoveUserFromGroupCommand, GetGroupCommand, ListPoliciesCommand, DeleteLoginProfileCommand,
  ListInstanceProfilesForRoleCommand, RemoveRoleFromInstanceProfileCommand, type IAMClient,
} from '@aws-sdk/client-iam';
import { UserError } from './errors';

export type Kind = 'user' | 'role' | 'group';

/** IAM returns policy documents URL-encoded (and, historically, sometimes twice). */
export function decodeDoc(raw: unknown): unknown {
  let v: unknown = raw;
  for (let i = 0; i < 3 && typeof v === 'string'; i++) {
    const s: string = v;
    try { v = JSON.parse(/^\s*[%{[]/.test(s) && s.trimStart().startsWith('%') ? decodeURIComponent(s) : s); }
    catch { try { v = JSON.parse(decodeURIComponent(s)); } catch { return s; } }
  }
  return v;
}

export const policyName = (arn: string) => arn.split('/').pop() ?? arn;

export async function listPerms(iam: IAMClient, kind: Kind, name: string) {
  const [attached, inline] = await Promise.all([
    kind === 'user' ? iam.send(new ListAttachedUserPoliciesCommand({ UserName: name })) : kind === 'role' ? iam.send(new ListAttachedRolePoliciesCommand({ RoleName: name })) : iam.send(new ListAttachedGroupPoliciesCommand({ GroupName: name })),
    kind === 'user' ? iam.send(new ListUserPoliciesCommand({ UserName: name })) : kind === 'role' ? iam.send(new ListRolePoliciesCommand({ RoleName: name })) : iam.send(new ListGroupPoliciesCommand({ GroupName: name })),
  ]);
  return { attached: attached.AttachedPolicies ?? [], inline: inline.PolicyNames ?? [] };
}

export async function getInline(iam: IAMClient, kind: Kind, name: string, policy: string) {
  const r = kind === 'user' ? await iam.send(new GetUserPolicyCommand({ UserName: name, PolicyName: policy }))
    : kind === 'role' ? await iam.send(new GetRolePolicyCommand({ RoleName: name, PolicyName: policy }))
    : await iam.send(new GetGroupPolicyCommand({ GroupName: name, PolicyName: policy }));
  return decodeDoc(r.PolicyDocument);
}

/** Form handlers shared by the user / role / group detail pages. */
export function permissionHandlers(iam: IAMClient, kind: Kind, name: string) {
  const need = (f: FormData, k: string, label: string) => { const v = String(f.get(k) ?? '').trim(); if (!v) throw new UserError(`${label} is required.`); return v; };
  return {
    attach: async (f: FormData) => {
      let arn = need(f, 'arn', 'Policy');
      if (!arn.startsWith('arn:')) {
        const found = await findPolicy(iam, arn);
        if (!found) throw new UserError(`No managed policy named "${arn}" was found. Enter a full policy ARN.`);
        arn = found;
      }
      if (kind === 'user') await iam.send(new AttachUserPolicyCommand({ UserName: name, PolicyArn: arn }));
      else if (kind === 'role') await iam.send(new AttachRolePolicyCommand({ RoleName: name, PolicyArn: arn }));
      else await iam.send(new AttachGroupPolicyCommand({ GroupName: name, PolicyArn: arn }));
      return `Attached ${policyName(arn)}.`;
    },
    detach: async (f: FormData) => {
      const arn = need(f, 'arn', 'Policy');
      if (kind === 'user') await iam.send(new DetachUserPolicyCommand({ UserName: name, PolicyArn: arn }));
      else if (kind === 'role') await iam.send(new DetachRolePolicyCommand({ RoleName: name, PolicyArn: arn }));
      else await iam.send(new DetachGroupPolicyCommand({ GroupName: name, PolicyArn: arn }));
      return `Detached ${policyName(arn)}.`;
    },
    putInline: async (f: FormData) => {
      const pn = need(f, 'policyName', 'Policy name');
      const doc = need(f, 'document', 'Policy document');
      try { JSON.parse(doc); } catch (e) { throw new UserError(`The policy document is not valid JSON: ${(e as Error).message}`); }
      if (kind === 'user') await iam.send(new PutUserPolicyCommand({ UserName: name, PolicyName: pn, PolicyDocument: doc }));
      else if (kind === 'role') await iam.send(new PutRolePolicyCommand({ RoleName: name, PolicyName: pn, PolicyDocument: doc }));
      else await iam.send(new PutGroupPolicyCommand({ GroupName: name, PolicyName: pn, PolicyDocument: doc }));
      return `Saved inline policy ${pn}.`;
    },
    deleteInline: async (f: FormData) => {
      const pn = need(f, 'policyName', 'Policy name');
      if (kind === 'user') await iam.send(new DeleteUserPolicyCommand({ UserName: name, PolicyName: pn }));
      else if (kind === 'role') await iam.send(new DeleteRolePolicyCommand({ RoleName: name, PolicyName: pn }));
      else await iam.send(new DeleteGroupPolicyCommand({ GroupName: name, PolicyName: pn }));
      return `Deleted inline policy ${pn}.`;
    },
  };
}

/** Look up a managed policy ARN by (customer or AWS) policy name. */
async function findPolicy(iam: IAMClient, name: string): Promise<string | undefined> {
  let marker: string | undefined;
  do {
    const r = await iam.send(new ListPoliciesCommand({ Scope: 'All', Marker: marker, MaxItems: 1000 }));
    const hit = (r.Policies ?? []).find((p) => p.PolicyName === name);
    if (hit) return hit.Arn;
    marker = r.IsTruncated ? r.Marker : undefined;
  } while (marker);
  return undefined;
}

/** Everything that blocks deleting an identity, removed first (AWS requires this order). */
export async function purgeIdentity(iam: IAMClient, kind: Kind, name: string) {
  const { attached, inline } = await listPerms(iam, kind, name);
  const h = permissionHandlers(iam, kind, name);
  for (const a of attached) { const f = new FormData(); f.set('arn', a.PolicyArn!); await h.detach(f); }
  for (const p of inline) { const f = new FormData(); f.set('policyName', p); await h.deleteInline(f); }
  if (kind === 'user') {
    for (const k of (await iam.send(new ListAccessKeysCommand({ UserName: name }))).AccessKeyMetadata ?? []) await iam.send(new DeleteAccessKeyCommand({ UserName: name, AccessKeyId: k.AccessKeyId! }));
    for (const g of (await iam.send(new ListGroupsForUserCommand({ UserName: name }))).Groups ?? []) await iam.send(new RemoveUserFromGroupCommand({ UserName: name, GroupName: g.GroupName! }));
    await iam.send(new DeleteLoginProfileCommand({ UserName: name })).catch(() => undefined);
  }
  if (kind === 'group') {
    for (const u of (await iam.send(new GetGroupCommand({ GroupName: name }))).Users ?? []) await iam.send(new RemoveUserFromGroupCommand({ UserName: u.UserName!, GroupName: name }));
  }
  if (kind === 'role') {
    for (const ip of (await iam.send(new ListInstanceProfilesForRoleCommand({ RoleName: name }))).InstanceProfiles ?? []) await iam.send(new RemoveRoleFromInstanceProfileCommand({ InstanceProfileName: ip.InstanceProfileName!, RoleName: name }));
  }
}

export const TRUST_PRESETS: { id: string; label: string; principal: string }[] = [
  { id: 'lambda', label: 'Lambda', principal: 'lambda.amazonaws.com' },
  { id: 'ec2', label: 'EC2', principal: 'ec2.amazonaws.com' },
  { id: 'ecs', label: 'ECS tasks', principal: 'ecs-tasks.amazonaws.com' },
  { id: 'sfn', label: 'Step Functions', principal: 'states.amazonaws.com' },
  { id: 'events', label: 'EventBridge', principal: 'events.amazonaws.com' },
  { id: 'apigw', label: 'API Gateway', principal: 'apigateway.amazonaws.com' },
  { id: 'scheduler', label: 'EventBridge Scheduler', principal: 'scheduler.amazonaws.com' },
];
export const trustPolicyFor = (principal: string) => JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: principal }, Action: 'sts:AssumeRole' }] }, null, 2);

export const ALLOW_ALL_POLICY = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: ['s3:GetObject'], Resource: '*' }] }, null, 2);

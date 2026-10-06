import { UserError } from './errors';
import { str } from './action';

/** Helpers for the S3 Management tab: lifecycle rules and event notifications. */

export const STORAGE_CLASSES = ['STANDARD_IA', 'ONEZONE_IA', 'INTELLIGENT_TIERING', 'GLACIER_IR', 'GLACIER', 'DEEP_ARCHIVE'];

export const EVENT_TYPES = [
  's3:ObjectCreated:*', 's3:ObjectCreated:Put', 's3:ObjectCreated:Post', 's3:ObjectCreated:Copy', 's3:ObjectCreated:CompleteMultipartUpload',
  's3:ObjectRemoved:*', 's3:ObjectRemoved:Delete', 's3:ObjectRemoved:DeleteMarkerCreated',
  's3:ObjectRestore:*', 's3:Replication:*', 's3:LifecycleExpiration:*', 's3:ObjectTagging:*',
];

const posInt = (f: FormData, k: string, label: string): number | undefined => {
  const v = str(f, k);
  if (v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new UserError(`${label} must be a whole number of at least 1.`);
  return n;
};

/** Build one lifecycle rule from the "add / edit rule" form. */
export function lifecycleRuleFromForm(f: FormData): Record<string, unknown> {
  const id = str(f, 'ruleId');
  if (!id) throw new UserError('Rule name is required.');
  if (id.length > 255) throw new UserError('Rule name must be 255 characters or fewer.');
  const prefix = str(f, 'prefix');
  const tagKey = str(f, 'tagKey');
  const tagValue = str(f, 'tagValue');
  if (tagValue && !tagKey) throw new UserError('A tag value needs a tag key.');
  const tag = tagKey ? { Key: tagKey, Value: tagValue } : undefined;
  const filter = prefix && tag ? { And: { Prefix: prefix, Tags: [tag] } } : tag ? { Tag: tag } : { Prefix: prefix };

  const rule: Record<string, unknown> = { ID: id, Status: str(f, 'status') === 'Disabled' ? 'Disabled' : 'Enabled', Filter: filter };
  const exp = posInt(f, 'expDays', 'Expiration days');
  if (exp) rule.Expiration = { Days: exp };
  const tr = posInt(f, 'transDays', 'Transition days');
  if (tr) rule.Transitions = [{ Days: tr, StorageClass: str(f, 'transClass') || 'GLACIER' }];
  const nc = posInt(f, 'ncDays', 'Noncurrent version expiration days');
  if (nc) rule.NoncurrentVersionExpiration = { NoncurrentDays: nc };
  const ab = posInt(f, 'abortDays', 'Abort incomplete multipart upload days');
  if (ab) rule.AbortIncompleteMultipartUpload = { DaysAfterInitiation: ab };
  if (!rule.Expiration && !rule.Transitions && !rule.NoncurrentVersionExpiration && !rule.AbortIncompleteMultipartUpload) {
    throw new UserError('Add at least one action: expiration, transition, noncurrent version expiration or abort incomplete multipart uploads.');
  }
  return rule;
}

/** Replace the rule with the same ID, or append. */
export const upsertRule = (rules: any[], rule: any) => {
  const i = rules.findIndex((r) => r.ID === rule.ID);
  return i >= 0 ? rules.map((r, n) => (n === i ? rule : r)) : [...rules, rule];
};

export function ruleFilterText(r: any): string {
  const fl = r.Filter ?? {};
  const parts: string[] = [];
  const prefix = fl.Prefix ?? fl.And?.Prefix ?? r.Prefix;
  if (prefix) parts.push(`prefix "${prefix}"`);
  const tags = [...(fl.And?.Tags ?? []), ...(fl.Tag ? [fl.Tag] : [])];
  for (const t of tags) parts.push(`tag ${t.Key}=${t.Value}`);
  if (fl.ObjectSizeGreaterThan) parts.push(`size > ${fl.ObjectSizeGreaterThan}`);
  if (fl.ObjectSizeLessThan) parts.push(`size < ${fl.ObjectSizeLessThan}`);
  return parts.join(', ') || 'Whole bucket';
}

export function ruleActions(r: any): string[] {
  const out: string[] = [];
  if (r.Expiration?.Days) out.push(`Expire after ${r.Expiration.Days} d`);
  if (r.Expiration?.Date) out.push(`Expire on ${String(r.Expiration.Date).slice(0, 10)}`);
  if (r.Expiration?.ExpiredObjectDeleteMarker) out.push('Remove expired delete markers');
  for (const t of r.Transitions ?? []) out.push(`Move to ${t.StorageClass} after ${t.Days ?? '?'} d`);
  if (r.NoncurrentVersionExpiration?.NoncurrentDays) out.push(`Delete noncurrent versions after ${r.NoncurrentVersionExpiration.NoncurrentDays} d`);
  for (const t of r.NoncurrentVersionTransitions ?? []) out.push(`Move noncurrent to ${t.StorageClass} after ${t.NoncurrentDays} d`);
  if (r.AbortIncompleteMultipartUpload?.DaysAfterInitiation) out.push(`Abort multipart after ${r.AbortIncompleteMultipartUpload.DaysAfterInitiation} d`);
  return out;
}

/** Pre-fill values for the rule form when editing an existing rule. */
export function ruleToForm(r: any): Record<string, string> {
  const fl = r.Filter ?? {};
  const tag = fl.Tag ?? fl.And?.Tags?.[0];
  return {
    ruleId: r.ID ?? '', status: r.Status ?? 'Enabled', prefix: fl.Prefix ?? fl.And?.Prefix ?? r.Prefix ?? '',
    tagKey: tag?.Key ?? '', tagValue: tag?.Value ?? '',
    expDays: String(r.Expiration?.Days ?? ''), transDays: String(r.Transitions?.[0]?.Days ?? ''), transClass: r.Transitions?.[0]?.StorageClass ?? 'GLACIER',
    ncDays: String(r.NoncurrentVersionExpiration?.NoncurrentDays ?? ''), abortDays: String(r.AbortIncompleteMultipartUpload?.DaysAfterInitiation ?? ''),
  };
}

// ---- notifications ----
export type NotifType = 'Queue' | 'Topic' | 'Lambda';
const KEYS: Record<NotifType, { list: string; arn: string }> = {
  Queue: { list: 'QueueConfigurations', arn: 'QueueArn' },
  Topic: { list: 'TopicConfigurations', arn: 'TopicArn' },
  Lambda: { list: 'LambdaFunctionConfigurations', arn: 'LambdaFunctionArn' },
};

export interface NotifRow { id: string; type: NotifType; arn: string; events: string[]; prefix?: string; suffix?: string }

export function flattenNotifications(cfg: any): NotifRow[] {
  const rows: NotifRow[] = [];
  for (const type of Object.keys(KEYS) as NotifType[]) {
    for (const c of cfg?.[KEYS[type].list] ?? []) {
      const rules: any[] = c.Filter?.Key?.FilterRules ?? [];
      const get = (n: string) => rules.find((x) => String(x.Name).toLowerCase() === n)?.Value;
      rows.push({ id: c.Id ?? '', type, arn: c[KEYS[type].arn], events: c.Events ?? [], prefix: get('prefix'), suffix: get('suffix') });
    }
  }
  return rows;
}

/** Strip response metadata, keeping only the configuration lists. */
export function cleanNotifications(cfg: any): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const k of [...Object.values(KEYS).map((x) => x.list), 'EventBridgeConfiguration']) if (cfg?.[k] && (!Array.isArray(cfg[k]) || cfg[k].length)) out[k] = cfg[k];
  return out;
}

export function addNotification(cfg: any, f: FormData): Record<string, any> {
  const type = str(f, 'type') as NotifType;
  if (!KEYS[type]) throw new UserError('Choose a destination type.');
  const arn = str(f, 'arn');
  if (!/^arn:[^:]*:[^:]*:/.test(arn)) throw new UserError('Destination must be an ARN, for example arn:aws:sqs:us-east-1:000000000000:my-queue.');
  const events = f.getAll('events').map(String).filter(Boolean);
  if (!events.length) throw new UserError('Select at least one event type.');
  const id = str(f, 'id') || `notif-${Date.now().toString(36)}`;
  const rules = [] as { Name: string; Value: string }[];
  if (str(f, 'prefix')) rules.push({ Name: 'prefix', Value: str(f, 'prefix') });
  if (str(f, 'suffix')) rules.push({ Name: 'suffix', Value: str(f, 'suffix') });
  const entry: Record<string, unknown> = { Id: id, [KEYS[type].arn]: arn, Events: events };
  if (rules.length) entry.Filter = { Key: { FilterRules: rules } };
  const next = cleanNotifications(cfg);
  const dup = flattenNotifications(next).some((r) => r.id === id);
  if (dup) throw new UserError(`A notification with ID "${id}" already exists.`);
  next[KEYS[type].list] = [...(next[KEYS[type].list] ?? []), entry];
  return next;
}

export function removeNotification(cfg: any, type: string, id: string): Record<string, any> {
  const next = cleanNotifications(cfg);
  const k = KEYS[type as NotifType]?.list;
  if (!k) throw new UserError('Unknown notification type.');
  next[k] = (next[k] ?? []).filter((c: any) => c.Id !== id);
  if (!next[k].length) delete next[k];
  return next;
}

// ---- replication and server access logging ----
import { errMessage } from './errors';

/** Run an S3 config call; turn "not implemented" answers from the emulator into a clear message. */
export async function supported<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) throw e;
    const m = errMessage(e);
    if (/NotImplemented|not implemented|not supported|unsupported|UnknownOperation|InvalidAction/i.test(m)) throw new UserError(`LocalEmu does not support ${what} yet (${m}).`);
    throw e;
  }
}

export const REPLICATION_CLASSES = ['', 'STANDARD', ...STORAGE_CLASSES];

/** Accept a bucket name or an ARN and return the ARN. */
export function bucketArn(v: string): string {
  if (/^arn:[^:]*:s3:::[^:/]+$/.test(v)) return v;
  if (/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(v)) return `arn:aws:s3:::${v}`;
  throw new UserError('Destination must be a bucket name or an ARN like arn:aws:s3:::my-bucket.');
}

export const bucketOfArn = (arn?: string) => String(arn ?? '').replace(/^arn:[^:]*:s3:::/, '');

/** Build one replication rule from the form. */
export function replicationRuleFromForm(f: FormData): Record<string, any> {
  const id = str(f, 'ruleId');
  if (!id) throw new UserError('Rule name is required.');
  const prio = Number(str(f, 'priority') || '1');
  if (!Number.isInteger(prio) || prio < 0) throw new UserError('Priority must be a whole number of at least 0.');
  const dest: Record<string, any> = { Bucket: bucketArn(str(f, 'dest')) };
  if (str(f, 'storageClass')) dest.StorageClass = str(f, 'storageClass');
  return {
    ID: id, Status: str(f, 'status') === 'Disabled' ? 'Disabled' : 'Enabled', Priority: prio,
    Filter: { Prefix: str(f, 'prefix') }, DeleteMarkerReplication: { Status: 'Disabled' }, Destination: dest,
  };
}

export function replicationToForm(r: any): Record<string, string> {
  return {
    ruleId: r?.ID ?? '', status: r?.Status ?? 'Enabled', priority: String(r?.Priority ?? 1),
    prefix: r?.Filter?.Prefix ?? r?.Filter?.And?.Prefix ?? r?.Prefix ?? '', dest: bucketOfArn(r?.Destination?.Bucket), storageClass: r?.Destination?.StorageClass ?? '',
  };
}

/** Replace (by ID) or append a replication rule. */
export function upsertReplicationRule(rules: any[], rule: Record<string, any>): any[] {
  const i = rules.findIndex((r) => r.ID === rule.ID);
  if (i >= 0) { const next = [...rules]; next[i] = rule; return next; }
  return [...rules, rule];
}

export function replicationSummary(r: any): { prefix: string; dest: string; storage: string } {
  return { prefix: r?.Filter?.Prefix ?? r?.Filter?.And?.Prefix ?? r?.Prefix ?? '', dest: bucketOfArn(r?.Destination?.Bucket), storage: r?.Destination?.StorageClass ?? 'Same as source' };
}

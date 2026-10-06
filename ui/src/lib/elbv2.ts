import type { Action, RuleCondition } from '@aws-sdk/client-elastic-load-balancing-v2';
import { arnName } from './format';
import { UserError, errMessage } from './errors';
import { str } from './action';

export const tgNameFromArn = (arn?: string) => (arn ? (arn.split(':targetgroup/')[1] ?? '').split('/')[0] : '');

/** One-line description of a listener / rule action. */
export function actionText(a: Action): string {
  switch (a.Type) {
    case 'forward': {
      const arn = a.TargetGroupArn ?? a.ForwardConfig?.TargetGroups?.[0]?.TargetGroupArn;
      return `Forward to ${tgNameFromArn(arn) || '-'}`;
    }
    case 'fixed-response':
      return `Return fixed response ${a.FixedResponseConfig?.StatusCode ?? ''}${a.FixedResponseConfig?.ContentType ? ` (${a.FixedResponseConfig.ContentType})` : ''}`;
    case 'redirect':
      return `Redirect to ${a.RedirectConfig?.Protocol ?? '#{protocol}'}://${a.RedirectConfig?.Host ?? '#{host}'}:${a.RedirectConfig?.Port ?? '#{port}'}`;
    default:
      return a.Type ?? '-';
  }
}

export function conditionText(c: RuleCondition): string {
  const vals = c.Values?.length ? c.Values : c.PathPatternConfig?.Values ?? c.HostHeaderConfig?.Values ?? [];
  return `${c.Field ?? '-'}: ${vals.join(', ')}`;
}

/** Build the default action of a listener or rule from submitted form fields. */
export function buildAction(kind: string, f: { tg?: string; status?: string; ctype?: string; body?: string; rProtocol?: string; rPort?: string; rHost?: string; rPath?: string; rQuery?: string; rCode?: string }): Action {
  if (kind === 'redirect') {
    return { Type: 'redirect', RedirectConfig: {
      Protocol: f.rProtocol || '#{protocol}', Port: f.rPort || '#{port}', Host: f.rHost || '#{host}', Path: f.rPath || '/#{path}', Query: f.rQuery || '#{query}',
      StatusCode: f.rCode === 'HTTP_302' ? 'HTTP_302' : 'HTTP_301',
    } };
  }
  if (kind === 'fixed-response') {
    return { Type: 'fixed-response', FixedResponseConfig: { StatusCode: f.status || '200', ContentType: f.ctype || 'text/plain', MessageBody: f.body || undefined } };
  }
  return { Type: 'forward', TargetGroupArn: f.tg };
}

export const LB_PROTOCOLS = { application: ['HTTP', 'HTTPS'], network: ['TCP', 'UDP', 'TLS', 'TCP_UDP'] } as const;
export const TG_PROTOCOLS = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'TLS', 'TCP_UDP', 'GENEVE'];
export const lbShort = (arn?: string) => arnName(arn);
export const uniq = <T,>(a: T[] | undefined) => [...new Set(a ?? [])];

/** Read the action fields of a listener / rule form. */
export function actionFromForm(f: FormData): Action {
  const kind = str(f, 'action');
  if (kind !== 'fixed-response' && kind !== 'redirect' && !str(f, 'tg')) throw new UserError('Select a target group to forward to.');
  return buildAction(kind, {
    tg: str(f, 'tg'), status: str(f, 'status'), ctype: str(f, 'ctype'), body: str(f, 'body'),
    rProtocol: str(f, 'rProtocol'), rPort: str(f, 'rPort'), rHost: str(f, 'rHost'), rPath: str(f, 'rPath'), rQuery: str(f, 'rQuery'), rCode: str(f, 'rCode'),
  });
}

/** Pre-fill values for the action fields of an edit form. */
export function actionToForm(a: Action | undefined): Record<string, string> {
  if (!a) return {};
  if (a.Type === 'fixed-response') return { action: 'fixed-response', status: a.FixedResponseConfig?.StatusCode ?? '200', ctype: a.FixedResponseConfig?.ContentType ?? 'text/plain', body: a.FixedResponseConfig?.MessageBody ?? '' };
  if (a.Type === 'redirect') {
    const r: NonNullable<Action["RedirectConfig"]> = a.RedirectConfig ?? ({} as never);
    return { action: 'redirect', rProtocol: r.Protocol ?? '#{protocol}', rPort: r.Port ?? '#{port}', rHost: r.Host ?? '#{host}', rPath: r.Path ?? '/#{path}', rQuery: r.Query ?? '#{query}', rCode: r.StatusCode ?? 'HTTP_301' };
  }
  return { action: 'forward', tg: a.TargetGroupArn ?? a.ForwardConfig?.TargetGroups?.[0]?.TargetGroupArn ?? '' };
}

/** Condition values of a path-pattern / host-header condition. */
export function conditionValues(c: RuleCondition): string[] {
  return c.Values?.length ? c.Values : c.PathPatternConfig?.Values ?? c.HostHeaderConfig?.Values ?? [];
}

/** Run an ELB call; turn "not implemented" answers from the emulator into a clear message. */
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

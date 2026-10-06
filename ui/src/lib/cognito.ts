import type { AttributeType } from '@aws-sdk/client-cognito-identity-provider';

export const attr = (attrs: AttributeType[] | undefined, name: string) => attrs?.find((a) => a.Name === name)?.Value;

export const AUTH_FLOWS = [
  ['ALLOW_USER_PASSWORD_AUTH', 'Sign in with username and password (USER_PASSWORD_AUTH)'],
  ['ALLOW_USER_SRP_AUTH', 'Sign in with secure remote password (USER_SRP_AUTH)'],
  ['ALLOW_ADMIN_USER_PASSWORD_AUTH', 'Sign in with server-side credentials (ADMIN_USER_PASSWORD_AUTH)'],
  ['ALLOW_CUSTOM_AUTH', 'Sign in with custom authentication flows (CUSTOM_AUTH)'],
  ['ALLOW_REFRESH_TOKEN_AUTH', 'Get new tokens from existing authenticated sessions (REFRESH_TOKEN_AUTH)'],
] as const;

export const USERNAME_MODES = [
  ['username', 'User name', 'Users sign in with a user name of their choice.'],
  ['email', 'Email address', 'Users sign in with their email address.'],
  ['phone_number', 'Phone number', 'Users sign in with their phone number.'],
] as const;

export function describeUsernameMode(p: { UsernameAttributes?: string[]; AliasAttributes?: string[] }): string {
  if (p.UsernameAttributes?.length) return p.UsernameAttributes.join(', ');
  if (p.AliasAttributes?.length) return `username (aliases: ${p.AliasAttributes.join(', ')})`;
  return 'username';
}

/** Run a paginated Cognito list call (NextToken style), capped to keep pages fast. */
export async function listAll<T>(page: (token?: string) => Promise<{ items: T[]; next?: string }>, cap = 500): Promise<T[]> {
  const out: T[] = [];
  let token: string | undefined;
  do {
    const r = await page(token);
    out.push(...r.items);
    token = r.next;
  } while (token && out.length < cap);
  return out;
}

// ---- editors: app clients, MFA, password policy, custom attributes ----
import { UserError, errMessage } from './errors';
import { str, strs } from './action';

/** Run a Cognito call; turn "not implemented" answers from the emulator into a clear message. */
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

export const OAUTH_FLOWS = [['code', 'Authorization code grant'], ['implicit', 'Implicit grant'], ['client_credentials', 'Client credentials']] as const;
export const OAUTH_SCOPES = ['openid', 'email', 'phone', 'profile', 'aws.cognito.signin.user.admin'];
export const TOKEN_UNITS = ['seconds', 'minutes', 'hours', 'days'] as const;
export const ATTR_TYPES = ['String', 'Number', 'DateTime', 'Boolean'] as const;

const lines = (f: FormData, k: string) => str(f, k).split(/[\s,]+/).filter(Boolean);
const tokenNum = (f: FormData, k: string, label: string): number | undefined => {
  const v = str(f, k);
  if (v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new UserError(`${label} must be a whole number of at least 1.`);
  return n;
};

/**
 * Build the UpdateUserPoolClient input. UpdateUserPoolClient resets every field that is not sent,
 * so start from the described client and overwrite only what the form edits.
 */
export function clientUpdateInput(poolId: string, current: Record<string, any>, f: FormData): Record<string, any> {
  const name = str(f, 'name');
  if (!name) throw new UserError('App client name is required.');
  const { ClientSecret, CreationDate, LastModifiedDate, UserPoolId, ...keep } = current;
  const oauth = strs(f, 'oauthFlows');
  const urls = lines(f, 'callbackUrls');
  for (const u of [...urls, ...lines(f, 'logoutUrls')]) if (!/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(u)) throw new UserError(`"${u}" is not a valid URL (include the scheme, e.g. https://example.com/callback).`);
  if (oauth.length && !urls.length) throw new UserError('OAuth flows need at least one callback URL.');
  const scopes = [...strs(f, 'scopes'), ...lines(f, 'customScopes')];
  const out: Record<string, any> = {
    ...keep, UserPoolId: poolId, ClientName: name, ExplicitAuthFlows: strs(f, 'flows'),
    CallbackURLs: urls, LogoutURLs: lines(f, 'logoutUrls'),
    AllowedOAuthFlows: oauth, AllowedOAuthScopes: scopes, AllowedOAuthFlowsUserPoolClient: oauth.length > 0,
  };
  const units: Record<string, string> = { ...(keep.TokenValidityUnits ?? {}) };
  for (const [k, field, label] of [['AccessTokenValidity', 'access', 'Access token validity'], ['IdTokenValidity', 'idToken', 'ID token validity'], ['RefreshTokenValidity', 'refresh', 'Refresh token validity']] as const) {
    const n = tokenNum(f, field, label);
    if (n !== undefined) { out[k] = n; units[k.replace('Validity', '')] = str(f, `${field}Unit`) || 'minutes'; }
  }
  if (Object.keys(units).length) out.TokenValidityUnits = units;
  if (!out.SupportedIdentityProviders?.length && oauth.length) out.SupportedIdentityProviders = ['COGNITO'];
  return out;
}

export function clientToForm(c: Record<string, any> | undefined): Record<string, string> {
  if (!c) return {};
  const u = c.TokenValidityUnits ?? {};
  return {
    name: c.ClientName ?? '', callbackUrls: (c.CallbackURLs ?? []).join('\n'), logoutUrls: (c.LogoutURLs ?? []).join('\n'),
    access: String(c.AccessTokenValidity ?? 60), accessUnit: u.AccessToken ?? 'minutes',
    idToken: String(c.IdTokenValidity ?? 60), idTokenUnit: u.IdToken ?? 'minutes',
    refresh: String(c.RefreshTokenValidity ?? 30), refreshUnit: u.RefreshToken ?? 'days',
  };
}

/** Pool settings that UpdateUserPool would reset when omitted. */
const POOL_KEEP = [
  'LambdaConfig', 'AutoVerifiedAttributes', 'SmsVerificationMessage', 'EmailVerificationMessage', 'EmailVerificationSubject', 'VerificationMessageTemplate',
  'SmsAuthenticationMessage', 'UserAttributeUpdateSettings', 'MfaConfiguration', 'DeviceConfiguration', 'EmailConfiguration', 'SmsConfiguration',
  'UserPoolTags', 'AdminCreateUserConfig', 'UserPoolAddOns', 'AccountRecoverySetting', 'DeletionProtection',
] as const;

export function passwordPolicyUpdateInput(poolId: string, pool: Record<string, any>, f: FormData): Record<string, any> {
  const min = Number(str(f, 'minLength'));
  if (!Number.isInteger(min) || min < 6 || min > 99) throw new UserError('Minimum length must be a whole number between 6 and 99.');
  const days = Number(str(f, 'tempDays') || '7');
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new UserError('Temporary password validity must be between 0 and 365 days.');
  const out: Record<string, any> = { UserPoolId: poolId };
  for (const k of POOL_KEEP) if (pool[k] !== undefined && pool[k] !== null) out[k] = pool[k];
  out.Policies = {
    ...(pool.Policies ?? {}),
    PasswordPolicy: {
      ...(pool.Policies?.PasswordPolicy ?? {}), MinimumLength: min, TemporaryPasswordValidityDays: days,
      RequireLowercase: str(f, 'lower') === '1', RequireUppercase: str(f, 'upper') === '1', RequireNumbers: str(f, 'numbers') === '1', RequireSymbols: str(f, 'symbols') === '1',
    },
  };
  return out;
}

export function customAttributeFromForm(f: FormData): Record<string, any> {
  const name = str(f, 'attrName');
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(name)) throw new UserError('Attribute name must start with a letter and be at most 20 letters, digits, "_" or "-" (the "custom:" prefix is added for you).');
  const type = str(f, 'attrType');
  if (!(ATTR_TYPES as readonly string[]).includes(type)) throw new UserError('Choose an attribute type.');
  const a: Record<string, any> = { Name: name, AttributeDataType: type, Mutable: str(f, 'attrMutable') === '1', Required: false };
  const lo = str(f, 'attrMin'), hi = str(f, 'attrMax');
  if (lo || hi) {
    if (type !== 'String' && type !== 'Number') throw new UserError('Minimum and maximum apply to String and Number attributes only.');
    for (const v of [lo, hi]) if (v && !/^-?\d+$/.test(v)) throw new UserError('Minimum and maximum must be whole numbers.');
    if (lo && hi && Number(lo) > Number(hi)) throw new UserError('Minimum cannot be greater than maximum.');
    const key = type === 'String' ? 'StringAttributeConstraints' : 'NumberAttributeConstraints';
    if (type === 'String') a[key] = { ...(lo ? { MinLength: lo } : {}), ...(hi ? { MaxLength: hi } : {}) };
    else a[key] = { ...(lo ? { MinValue: lo } : {}), ...(hi ? { MaxValue: hi } : {}) };
  }
  return a;
}

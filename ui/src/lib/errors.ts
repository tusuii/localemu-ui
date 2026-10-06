/** Turn whatever the SDK (or fetch) threw into something readable. */
export function errMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const x = e as { name?: string; message?: string; Code?: string; code?: string; cause?: { code?: string; message?: string } };
    const code = x.cause?.code ?? x.code;
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
      return `Cannot reach LocalEmu (${code}). Is it running and is LOCALEMU_ENDPOINT correct?`;
    }
    const name = x.name && x.name !== 'Error' ? x.name : x.Code;
    const msg = x.message && x.message !== 'UnknownError' ? x.message : '';
    if (name && msg) return `${name}: ${msg}`;
    return name || msg || String(e);
  }
  return String(e);
}

export function errName(e: unknown): string {
  const n = e && typeof e === 'object' ? (e as { name?: string }).name : undefined;
  return n || 'Error';
}

export type Loaded<T> = { data: T; error: null } | { data: undefined; error: string };

/** Run a loader; never throws. Pages render an error alert when `error` is set. */
export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    return { data: undefined, error: errMessage(e) };
  }
}

export class UserError extends Error {}

/** For optional, informational lookups ("is a bucket policy set?"): never throws. */
export async function soft<T>(fn: () => Promise<T>): Promise<{ value?: T; missing: boolean; error?: string }> {
  try {
    return { value: await fn(), missing: false };
  } catch (e) {
    const name = errName(e);
    const missing = /NoSuch|NotFound|NotImplemented|NotConfigured|Configuration(NotFound)?Error|NoSuchLifecycle|404/i.test(name + errMessage(e));
    return { missing, error: missing ? undefined : errMessage(e) };
  }
}

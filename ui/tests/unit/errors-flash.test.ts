import { describe, expect, it } from 'vitest';
import { errMessage, errName, load, soft, UserError } from '../../src/lib/errors';
import { setFlash, takeFlash } from '../../src/lib/flash';

const sdkErr = (name: string, message: string) => Object.assign(new Error(message), { name });

describe('errMessage', () => {
  it('explains connection failures, also from nested causes', () => {
    expect(errMessage(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toMatch(/Cannot reach LocalEmu \(ECONNREFUSED\)/);
    expect(errMessage(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }))).toMatch(/ENOTFOUND/);
  });
  it('combines SDK name and message', () => {
    expect(errMessage(sdkErr('NoSuchBucket', 'The bucket does not exist'))).toBe('NoSuchBucket: The bucket does not exist');
  });
  it('falls back sensibly', () => {
    expect(errMessage(sdkErr('UnknownError', 'UnknownError'))).toBe('UnknownError');
    expect(errMessage(new Error('boom'))).toBe('boom');
    expect(errMessage({ Code: 'Throttled' })).toBe('Throttled');
    expect(errMessage('plain')).toBe('plain');
    expect(errMessage(undefined)).toBe('undefined');
  });
  it('errName', () => {
    expect(errName(sdkErr('X', 'y'))).toBe('X');
    expect(errName(null)).toBe('Error');
    expect(errName({})).toBe('Error');
  });
});

describe('load / soft', () => {
  it('load wraps success and failure', async () => {
    expect(await load(async () => 5)).toEqual({ data: 5, error: null });
    const r = await load(async () => { throw sdkErr('Boom', 'bad'); });
    expect(r).toEqual({ data: undefined, error: 'Boom: bad' });
  });
  it('soft reports missing configuration separately from real errors', async () => {
    expect(await soft(async () => 1)).toEqual({ value: 1, missing: false });
    const miss = await soft(async () => { throw sdkErr('NoSuchBucketPolicy', 'nope'); });
    expect(miss).toEqual({ missing: true, error: undefined });
    const nf = await soft(async () => { throw sdkErr('ServerSideEncryptionConfigurationNotFoundError', 'x'); });
    expect(nf.missing).toBe(true);
    const bad = await soft(async () => { throw sdkErr('AccessDenied', 'no'); });
    expect(bad.missing).toBe(false);
    expect(bad.error).toBe('AccessDenied: no');
  });
  it('UserError is an Error', () => expect(new UserError('x')).toBeInstanceOf(Error));
});

/** Minimal AstroCookies stand-in. */
function fakeCookies() {
  const jar = new Map<string, { value: string; opts?: Record<string, unknown> }>();
  return {
    jar,
    set: (k: string, v: string, opts?: Record<string, unknown>) => void jar.set(k, { value: v, opts }),
    get: (k: string) => { const c = jar.get(k); return c ? { value: c.value, json: () => JSON.parse(c.value) } : undefined; },
    delete: (k: string) => void jar.delete(k),
  };
}

describe('flash cookie', () => {
  it('round-trips once and then is consumed', () => {
    const c = fakeCookies();
    setFlash(c as never, { type: 'success', text: 'Done', detail: 'x' });
    expect(c.jar.get('lemu_flash')?.opts).toMatchObject({ httpOnly: true, sameSite: 'lax', maxAge: 120 });
    expect(takeFlash(c as never)).toEqual({ type: 'success', text: 'Done', detail: 'x' });
    expect(takeFlash(c as never)).toBeNull();
  });
  it('returns null for a corrupt cookie (and still clears it)', () => {
    const c = fakeCookies();
    c.set('lemu_flash', '{not json');
    expect(takeFlash(c as never)).toBeNull();
    expect(c.jar.has('lemu_flash')).toBe(false);
  });
  it('caps the cookie size', () => {
    const c = fakeCookies();
    setFlash(c as never, { type: 'error', text: 'x'.repeat(10_000) });
    expect(c.jar.get('lemu_flash')!.value.length).toBeLessThanOrEqual(3000);
  });
});

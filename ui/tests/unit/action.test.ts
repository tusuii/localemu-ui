import { describe, expect, it, vi } from 'vitest';
import { formValues, handlePost, intOf, jsonOf, required, safeRedirect, str, strs } from '../../src/lib/action';
import { UserError } from '../../src/lib/errors';

const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

describe('safeRedirect', () => {
  it.each(['/s3', '/s3/b?x=1#h', '/'])('allows local path %s', (p) => expect(safeRedirect(p)).toBe(p));
  it.each([
    '//evil.test', '//evil.test/path', '/\\evil.test', 'https://evil.test', 'http://evil.test', 'javascript:alert(1)',
    'evil.test', '\\\\evil.test', '', null, undefined,
  ])('rejects %j', (p) => expect(safeRedirect(p as string)).toBeNull());
});

describe('form helpers', () => {
  it('str trims and defaults to empty; strs drops blanks', () => {
    const f = fd({ a: '  hi ', l: ['x', '', 'y'] });
    expect(str(f, 'a')).toBe('hi');
    expect(str(f, 'missing')).toBe('');
    expect(strs(f, 'l')).toEqual(['x', 'y']);
    expect(strs(f, 'missing')).toEqual([]);
  });
  it('required throws a UserError naming the field', () => {
    expect(required(fd({ a: ' v ' }), 'a')).toBe('v');
    expect(() => required(fd({ a: ' ' }), 'a', 'Bucket name')).toThrowError(new UserError('Bucket name is required.'));
    expect(() => required(fd({}), 'a')).toThrow(UserError);
  });
  it('intOf', () => {
    expect(intOf(fd({ n: '42' }), 'n')).toBe(42);
    expect(intOf(fd({ n: '-3' }), 'n')).toBe(-3);
    expect(intOf(fd({ n: '' }), 'n')).toBeUndefined();
    expect(intOf(fd({}), 'n')).toBeUndefined();
    expect(() => intOf(fd({ n: '1.5' }), 'n', 'Timeout')).toThrow('Timeout must be a whole number.');
    expect(() => intOf(fd({ n: 'abc' }), 'n')).toThrow(UserError);
  });
  it('jsonOf', () => {
    expect(jsonOf(fd({ j: '{"a":[1]}' }), 'j')).toEqual({ a: [1] });
    expect(() => jsonOf(fd({ j: '{oops' }), 'j', 'Policy')).toThrow(/^Policy is not valid JSON: /);
    expect(() => jsonOf(fd({}), 'j')).toThrow(UserError);
  });
  it('formValues keeps the first string value and skips files', () => {
    const f = fd({ a: ['1', '2'], b: 'x' });
    f.append('file', new Blob(['x']), 'x.txt');
    expect(formValues(f)).toEqual({ a: '1', b: 'x' });
  });
});

describe('handlePost', () => {
  const mkAstro = (method: string, form?: FormData) => {
    const jar = new Map<string, string>();
    return {
      jar,
      request: { method, formData: async () => { if (!form) throw new Error('no body'); return form; } },
      cookies: { get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => jar.set(k, v), delete: (k: string) => jar.delete(k) },
      url: new URL('http://x.test/sqs?q=1'),
      redirect: (to: string, status: number) => ({ redirectedTo: to, status }),
    };
  };
  const run = (a: ReturnType<typeof mkAstro>, h: Record<string, never>) => handlePost(a as never, h);

  it('does nothing on GET', async () => {
    expect(await run(mkAstro('GET'), {})).toEqual({ values: {}, posted: false });
  });
  it('reports an unknown intent and an unreadable form', async () => {
    const r = await run(mkAstro('POST', fd({ intent: 'zap', a: '1' })), {});
    expect(r).toMatchObject({ posted: true, error: 'Unknown action "zap".', values: { intent: 'zap', a: '1' } });
    expect(await run(mkAstro('POST'), {})).toMatchObject({ posted: true, error: 'Could not read the submitted form.' });
  });
  it('redirects with a flash on success (303, current URL by default)', async () => {
    const a = mkAstro('POST', fd({ intent: 'ok' }));
    const r = await run(a, { ok: async () => 'Created.' } as never);
    expect(r.response).toEqual({ redirectedTo: '/sqs?q=1', status: 303 });
    expect(JSON.parse(a.jar.get('lemu_flash')!)).toMatchObject({ type: 'success', text: 'Created.' });
  });
  it('refuses an open redirect target from a handler', async () => {
    const r = await run(mkAstro('POST', fd({ intent: 'ok' })), { ok: async () => ({ message: 'x', redirect: '//evil.test' }) } as never);
    expect(r.response).toEqual({ redirectedTo: '/sqs?q=1', status: 303 });
    const r2 = await run(mkAstro('POST', fd({ intent: 'ok' })), { ok: async () => ({ redirect: '/s3' }) } as never);
    expect(r2.response).toEqual({ redirectedTo: '/s3', status: 303 });
  });
  it('stay re-renders with data and sets no flash', async () => {
    const a = mkAstro('POST', fd({ intent: 'go' }));
    const r = await run(a, { go: async () => ({ stay: true, data: [1] }) } as never);
    expect(r.response).toBeUndefined();
    expect(r.result?.data).toEqual([1]);
    expect(a.jar.size).toBe(0);
  });
  it('maps handler errors to messages', async () => {
    const e = vi.fn(async () => { throw new UserError('Nope.'); });
    expect((await run(mkAstro('POST', fd({ intent: 'x' })), { x: e } as never)).error).toBe('Nope.');
    const sdk = Object.assign(new Error('gone'), { name: 'NoSuchKey' });
    expect((await run(mkAstro('POST', fd({ intent: 'x' })), { x: async () => { throw sdk; } } as never)).error).toBe('NoSuchKey: gone');
  });
});

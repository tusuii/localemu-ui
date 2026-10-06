import { describe, expect, it } from 'vitest';
import { badge, copyable, esc, highlightJson, html, link, raw, Safe, stateStatus, status, tagList, text } from '../../src/lib/html';

describe('esc / text / html', () => {
  it('escapes all five HTML metacharacters', () => {
    expect(esc(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
  it('treats null/undefined as empty and coerces others', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(0)).toBe('0');
  });
  it('text passes Safe through and joins arrays', () => {
    expect(text(raw('<b>x</b>'))).toBe('<b>x</b>');
    expect(text(['<', raw('<i>'), 'a&b'])).toBe('&lt;<i>a&amp;b');
  });
  it('html`` escapes interpolations but not Safe ones', () => {
    const evil = '<script>alert(1)</script>';
    const out = html`<p>${evil}</p>${raw('<hr>')}${[html`<b>${'&'}</b>`, '<']}`;
    expect(out).toBeInstanceOf(Safe);
    expect(String(out)).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><hr><b>&amp;</b>&lt;');
  });
});

describe('stateStatus', () => {
  const kind = (s: unknown, o?: Record<string, never>) => /status-(\w+)/.exec(String(stateStatus(s, o)))?.[1];
  it.each([
    ['running', 'success'], ['ACTIVE', 'success'], ['CREATE_COMPLETE', 'success'], ['available', 'success'],
    ['stopped', 'stopped'], ['Inactive', 'stopped'], ['disabled', 'stopped'],
    ['pending', 'progress'], ['CREATE_IN_PROGRESS', 'progress'], ['stopping', 'progress'], ['deleting', 'progress'],
    ['failed', 'error'], ['ROLLBACK_COMPLETE', 'error'], ['terminated', 'error'], ['ALARM', 'error'], ['Failed', 'error'],
    ['mystery', 'info'],
  ])('%s -> %s', (s, k) => expect(kind(s)).toBe(k));
  it('renders - for empty state and honours overrides', () => {
    expect(String(stateStatus(''))).toBe('-');
    expect(String(stateStatus(undefined))).toBe('-');
    expect(kind('mystery', { mystery: 'warning' } as never)).toBe('warning');
  });
  it('escapes the label', () => expect(String(stateStatus('<b>'))).toContain('&lt;b&gt;'));
  it('status() embeds an inline icon svg', () => expect(String(status('success', 'OK'))).toMatch(/<svg/));
});

describe('badge / link / tagList', () => {
  it('badge', () => {
    expect(String(badge('a<b', 'green'))).toBe('<span class="badge badge-green">a&lt;b</span>');
    expect(String(badge('x'))).toContain('badge-soft');
  });
  it('link escapes the href attribute', () => {
    expect(String(link('/x?a=1&b="2"', 'go'))).toBe('<a href="/x?a=1&amp;b=&quot;2&quot;" >go</a>');
  });
  it('tagList handles arrays, records and empties', () => {
    expect(String(tagList([{ Key: 'Name', Value: 'web' }, { Key: 'flag' }]))).toContain('Name: web');
    expect(String(tagList({ env: 'dev<' }))).toContain('env: dev&lt;');
    expect(String(tagList(undefined))).toContain('-');
    expect(String(tagList([]))).toContain('-');
  });
});

describe('copyable', () => {
  it('shows the label but copies the value, both escaped', () => {
    const out = String(copyable('arn:"x"', '<label>'));
    expect(out).toContain('data-copy="arn:&quot;x&quot;"');
    expect(out).toContain('&lt;label&gt;');
    expect(out).not.toContain('<label>');
  });
  it('defaults the label to the value', () => expect(String(copyable('abc'))).toContain('<span class="break-all">abc</span>'));
});

describe('highlightJson', () => {
  const out = (v: unknown) => String(highlightJson(v));
  it('wraps keys, strings, numbers, booleans and null', () => {
    const h = out({ name: 'x', n: 1.5e3, ok: true, no: false, nil: null });
    expect(h).toContain('<span class="json-key">&quot;name&quot;</span>:');
    expect(h).toContain('<span class="json-str">&quot;x&quot;</span>');
    expect(h).toContain('<span class="json-num">1500</span>');
    expect(h).toContain('<span class="json-bool">true</span>');
    expect(h).toContain('<span class="json-bool">false</span>');
    expect(h).toContain('<span class="json-null">null</span>');
  });
  it('parses JSON strings, and escapes non-JSON ones verbatim', () => {
    expect(out('{"a":1}')).toContain('json-key');
    expect(out('<not json>')).toBe('&lt;not json&gt;');
  });
  it('cannot be used to inject markup through values or keys', () => {
    const h = out({ '<img onerror=x>': '</pre><script>alert(1)</script>' });
    expect(h).not.toContain('<script>');
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;script&gt;');
  });
  it('handles strings containing escaped quotes and colons', () => {
    const h = out({ q: 'say "hi": now' });
    expect(h).toContain('json-str');
    expect(h.match(/json-key/g)).toHaveLength(1);
  });
  it('handles bigint, binary and undefined', () => {
    expect(out({ b: 5n })).toContain('&quot;5&quot;');
    expect(out(new Uint8Array(2))).toContain('&lt;2 bytes&gt;');
    expect(out(undefined)).toBe('');
  });
});

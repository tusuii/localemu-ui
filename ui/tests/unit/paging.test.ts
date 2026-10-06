import { describe, expect, it } from 'vitest';
import { pageLinks, pageState } from '../../src/lib/paging';

const U = (qs = '') => new URL('http://x.test/s3/b/objects' + qs);
const follow = (rel: string | null) => new URL(rel!, 'http://x.test');

describe('paging', () => {
  it('first page has no state, prev, or first link', () => {
    const s = pageState(U('?q=a'));
    expect(s).toEqual({ token: undefined, history: [], index: 0 });
    const l = pageLinks(U('?q=a'), s, undefined);
    expect(l).toEqual({ index: 0, prev: null, next: null, first: null });
  });

  it('walks forward and back through object tokens', () => {
    const t1 = { ContinuationToken: 'tok-1' };
    const t2 = 'tok-2';
    const p1 = pageLinks(U('?q=a'), pageState(U('?q=a')), t1);
    expect(p1.next).toContain('q=a');
    const s2 = pageState(follow(p1.next));
    expect(s2).toMatchObject({ token: t1, index: 1 });
    expect(s2.history).toEqual([null]);

    const p2 = pageLinks(follow(p1.next), s2, t2);
    const s3 = pageState(follow(p2.next));
    expect(s3).toMatchObject({ token: t2, index: 2, history: [null, t1] });

    // Previous from page 3 -> page 2 state, then to first.
    const back = pageLinks(follow(p2.next), s3, undefined);
    const s2b = pageState(follow(back.prev));
    expect(s2b.token).toEqual(t1);
    expect(s2b.index).toBe(1);
    const first = follow(back.first);
    expect(first.searchParams.has('pt')).toBe(false);
    expect(first.searchParams.has('ph')).toBe(false);
    expect(first.searchParams.get('q')).toBe('a');
    // Previous of the second page goes back to the first page (no pt/ph).
    const toFirst = follow(pageLinks(follow(p1.next), s2, undefined).prev);
    expect(toFirst.search).toBe('?q=a');
  });

  it('ignores garbage and tampered state instead of throwing', () => {
    for (const qs of ['?pt=%%%', '?pt=bm90LWpzb24', '?ph=bm90LWpzb24', '?ph=' + Buffer.from('{"a":1}').toString('base64url'), '?pt=' + Buffer.from('null').toString('base64url')]) {
      const s = pageState(U(qs));
      expect(s.token).toBeUndefined();
      expect(s.history).toEqual([]);
      expect(s.index).toBe(0);
    }
  });

  it('caps history length', () => {
    const big = Array.from({ length: 500 }, (_, i) => i);
    const s = pageState(U('?ph=' + Buffer.from(JSON.stringify(big)).toString('base64url')));
    expect(s.history).toHaveLength(200);
    expect(s.index).toBe(200);
    expect(s.history[199]).toBe(499);
  });

  it('only ever produces same-origin relative links', () => {
    const l = pageLinks(new URL('http://evil.test/s3/b?x=1'), { token: 'a', index: 1, history: [null] }, 'n');
    for (const v of [l.next, l.prev, l.first]) expect(v).toMatch(/^\/s3\/b/);
  });
});

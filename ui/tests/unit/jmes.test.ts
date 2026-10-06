import { describe, expect, it } from 'vitest';
import { compileQuery } from '../../src/lib/jmes';

const q = (e: string, d: unknown) => compileQuery(e)(d);
const data = {
  Buckets: [{ Name: 'b', Size: 3, Tags: ['x', 'y'] }, { Name: 'a', Size: 10, Tags: [] }, { Name: 'c', Size: 7 }],
  Owner: { ID: 'o1', Name: 'me' },
};

describe('jmespath basics', () => {
  it('fields, indexes, projections', () => {
    expect(q('Owner.ID', data)).toBe('o1');
    expect(q('Buckets[0].Name', data)).toBe('b');
    expect(q('Buckets[-1].Name', data)).toBe('c');
    expect(q('Buckets[].Name', data)).toEqual(['b', 'a', 'c']);
    expect(q('Buckets[*].Size', data)).toEqual([3, 10, 7]);
    expect(q('Buckets[0:2].Name', data)).toEqual(['b', 'a']);
    expect(q('Buckets[].Tags[]', data)).toEqual(['x', 'y']);
    expect(q('Owner.*', data)).toEqual(['o1', 'me']);
    expect(q('Missing.Thing', data)).toBeNull();
  });
  it('multiselect and literals', () => {
    expect(q('Buckets[].{n: Name, s: Size}', data)[0]).toEqual({ n: 'b', s: 3 });
    expect(q('Buckets[0].[Name, Size]', data)).toEqual(['b', 3]);
    expect(q("Owner.ID || 'none'", data)).toBe('o1');
    expect(q("Nope || 'none'", data)).toBe('none');
  });
  it('rejects bad syntax', () => {
    expect(() => compileQuery('Buckets[')).toThrow(/Unsupported --query/);
    expect(() => compileQuery('a ? b')).toThrow(/Unsupported --query/);
  });
});

describe('jmespath filters', () => {
  it('== and != on strings and numbers', () => {
    expect(q("Buckets[?Name == 'a'].Size", data)).toEqual([10]);
    expect(q("Buckets[?Name != 'a'].Name", data)).toEqual(['b', 'c']);
    expect(q('Buckets[?Size == `7`].Name', data)).toEqual(['c']);
    expect(q('Buckets[?Size > `5`].Name', data)).toEqual(['a', 'c']);
  });
  it('contains(), && and ||, !', () => {
    expect(q("Buckets[?contains(Tags, 'x')].Name", data)).toEqual(['b']);
    expect(q("Buckets[?contains(Name, 'a')].Name", data)).toEqual(['a']);
    expect(q("Buckets[?Size > `5` && Name != 'a'].Name", data)).toEqual(['c']);
    expect(q("Buckets[?Name == 'b' || Name == 'c'].Name", data)).toEqual(['b', 'c']);
    expect(q('Buckets[?!Tags].Name', data)).toEqual(['a', 'c']);
  });
  it('filter without a following projection returns whole objects', () => {
    expect(q("Buckets[?Name == 'a']", data)).toEqual([data.Buckets[1]]);
  });
});

describe('jmespath functions', () => {
  it('length, keys, values', () => {
    expect(q('length(Buckets)', data)).toBe(3);
    expect(q('length(Owner.Name)', data)).toBe(2);
    expect(q('length(Owner)', data)).toBe(2);
    expect(q('keys(Owner)', data)).toEqual(['ID', 'Name']);
    expect(q('values(Owner)', data)).toEqual(['o1', 'me']);
    expect(q('keys(Buckets)', data)).toBeNull();
    expect(q('Buckets[?Size > `5`] | length(@)', data)).toBe(2);
  });
  it('sort_by, sort, min/max, join', () => {
    expect(q('sort_by(Buckets, &Name)[].Name', data)).toEqual(['a', 'b', 'c']);
    expect(q('sort_by(Buckets, &Size)[].Size', data)).toEqual([3, 7, 10]);
    expect(q('reverse(sort_by(Buckets, &Size))[0].Name', data)).toBe('a');
    expect(q('sort(Buckets[].Size)', data)).toEqual([3, 7, 10]);
    expect(q('max_by(Buckets, &Size).Name', data)).toBe('a');
    expect(q('min(Buckets[].Size)', data)).toBe(3);
    expect(q("join(', ', Buckets[].Name)", data)).toBe('b, a, c');
    expect(q('sum(Buckets[].Size)', data)).toBe(20);
  });
  it('errors', () => {
    expect(() => q('nope(Owner)', data)).toThrow(/Unknown function/);
    expect(() => q('sort_by(Buckets, Name)', data)).toThrow(/expression argument/);
    expect(() => q('sort_by(Buckets, &Tags)', data)).toThrow(/invalid-type/);
  });
});

describe('jmespath truncated input', () => {
  it('reports unsupported syntax instead of crashing', () => {
    for (const e of ['nope(', 'a.', 'a[?', '[?a ==', 'a ||']) expect(() => compileQuery(e)).toThrow(/Unsupported --query/);
  });
});

import { describe, expect, it } from 'vitest';
import { buildCatalog, CATEGORIES, categoryFor, CONSOLES, consoleFor, groupByCategory, serviceForPath } from '../../src/lib/services';
import type { RegistrySpec } from '../../src/lib/localemu';

const spec = (o: Partial<RegistrySpec>): RegistrySpec => ({
  name: 'x', tier: 'live', label: 'X', group: 'other', docs_slug: null, banner: null, empty_state: null, copy_cmd_template: null, ...o,
}) as RegistrySpec;

describe('CONSOLES integrity', () => {
  it('has unique ids and valid categories/hrefs/nav', () => {
    const ids = CONSOLES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CONSOLES) {
      expect(CATEGORIES[c.category], c.id).toBeDefined();
      expect(c.href, c.id).toMatch(/^\//);
      for (const n of c.nav ?? []) expect(n.href, `${c.id}:${n.label}`).toMatch(/^\//);
    }
  });
});

describe('categoryFor', () => {
  it('prefers explicit sets over the registry group', () => {
    expect(categoryFor('dynamodb', 'storage')).toBe('database');
    expect(categoryFor('kms', 'storage')).toBe('security');
    expect(categoryFor('ecs')).toBe('compute');
  });
  it('maps registry groups and falls back to other', () => {
    expect(categoryFor('sqs', 'messaging')).toBe('integration');
    expect(categoryFor('cloudwatch', 'monitoring')).toBe('management');
    expect(categoryFor('foo', 'zzz')).toBe('other');
    expect(categoryFor('foo')).toBe('other');
  });
});

describe('serviceForPath / consoleFor', () => {
  it('resolves the first path segment', () => {
    expect(serviceForPath('/s3/my-bucket/objects')?.id).toBe('s3');
    expect(serviceForPath('/dynamodb')?.id).toBe('dynamodb');
    expect(consoleFor('lambda')?.href).toBe('/lambda');
  });
  it('aliases /activity to CloudTrail', () => expect(serviceForPath('/activity')?.id).toBe('cloudtrail'));
  it('returns undefined for root and unknown paths', () => {
    expect(serviceForPath('/')).toBeUndefined();
    expect(serviceForPath('')).toBeUndefined();
    expect(serviceForPath('/nope')).toBeUndefined();
    expect(consoleFor('nope')).toBeUndefined();
  });
});

describe('buildCatalog', () => {
  it('lists just the consoles with no server info', () => {
    const c = buildCatalog();
    expect(c).toHaveLength(CONSOLES.length);
    expect(c.every((e) => e.hasConsole && e.link.startsWith('/') && !e.link.startsWith('/service/'))).toBe(true);
  });
  it('is sorted by name', () => {
    const names = buildCatalog().map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
  it('adds generic tiles for services only the server knows about', () => {
    const c = buildCatalog({ s3: 'running', 'rds-data': 'available', 'my-new_svc': 'running' }, [
      spec({ name: 'rds-data', label: 'RDS Data API', group: 'storage', banner: 'SQL over HTTP', tier: 'metadata' }),
      spec({ name: 'appsync', label: 'AppSync', group: 'messaging' }),
    ]);
    const by = Object.fromEntries(c.map((e) => [e.id, e]));
    expect(by.s3).toMatchObject({ hasConsole: true, status: 'running' });
    expect(by['rds-data']).toMatchObject({ hasConsole: false, link: '/service/rds-data', category: 'database', name: 'RDS Data API', description: 'SQL over HTTP', tier: 'metadata', status: 'available' });
    expect(by.appsync.category).toBe('compute');
    expect(by['my-new_svc'].name).toBe('My New Svc');
    expect(by['my-new_svc'].description).toBe('Other service');
  });
  it('merges registry tier into console entries', () => {
    const e = buildCatalog({}, [spec({ name: 'sqs', tier: 'live' })]).find((x) => x.id === 'sqs')!;
    expect(e.tier).toBe('live');
    expect(e.hasConsole).toBe(true);
  });
});

describe('groupByCategory', () => {
  it('orders groups by category order and drops empty ones', () => {
    const g = groupByCategory(buildCatalog());
    const order = Object.keys(CATEGORIES);
    const idx = g.map((x) => order.indexOf(x.id));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(g.every((x) => x.items.length > 0)).toBe(true);
    expect(g.reduce((n, x) => n + x.items.length, 0)).toBe(CONSOLES.length);
  });
});

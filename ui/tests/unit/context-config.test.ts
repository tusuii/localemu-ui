import { describe, expect, it } from 'vitest';
import { getCtx, knownRegion } from '../../src/lib/context';
import { DEFAULT_ACCOUNT, DEFAULT_REGION, REGIONS, regionName } from '../../src/lib/config';

const cookies = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? { value: o[k] } : undefined) }) as never;

describe('getCtx', () => {
  it('defaults when nothing is set', () => {
    expect(getCtx(cookies({}))).toEqual({ region: DEFAULT_REGION, account: DEFAULT_ACCOUNT });
  });
  it('accepts a valid region and 12 digit account', () => {
    expect(getCtx(cookies({ lemu_region: 'eu-west-2', lemu_account: '111111111111' }))).toEqual({ region: 'eu-west-2', account: '111111111111' });
    expect(getCtx(cookies({ lemu_region: 'ap-southeast-2' })).region).toBe('ap-southeast-2');
  });
  it.each(['US-EAST-1', 'us-east', 'us-east-1; drop', '../etc', 'us-east-10x', ''])('rejects region %j', (r) => {
    expect(getCtx(cookies({ lemu_region: r })).region).toBe(DEFAULT_REGION);
  });
  it.each(['12345', '1234567890123', 'abcdefghijkl', '12345678901 ', ''])('rejects account %j', (a) => {
    expect(getCtx(cookies({ lemu_account: a })).account).toBe(DEFAULT_ACCOUNT);
  });
  it('knownRegion / regionName', () => {
    expect(knownRegion('us-east-1')).toBe(true);
    expect(knownRegion('mars-1')).toBe(false);
    expect(regionName('us-east-1')).toBe('US East (N. Virginia)');
    expect(regionName('xx-1')).toBe('xx-1');
  });
  it('every configured region id passes the ctx pattern', () => {
    for (const r of REGIONS) expect(getCtx(cookies({ lemu_region: r.id })).region).toBe(r.id);
  });
});

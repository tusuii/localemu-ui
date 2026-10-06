import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ago, arnName, bytes, capitalize, dateTime, duration, num, plural, pretty, shortDateTime } from '../../src/lib/format';

describe('bytes', () => {
  it.each([
    [undefined, '-'], [null, '-'], [NaN, '-'],
    [0, '0 B'], [1023, '1023 B'], [1024, '1.0 KB'], [1536, '1.5 KB'],
    [1024 ** 2, '1.0 MB'], [150 * 1024 ** 2, '150 MB'], [1024 ** 3, '1.0 GB'], [1024 ** 5 * 2048, '2048 PB'],
  ])('bytes(%s) = %s', (n, out) => expect(bytes(n as number)).toBe(out));
});

describe('num', () => {
  it('groups digits and handles blanks', () => {
    expect(num(1234567)).toBe('1,234,567');
    expect(num('42')).toBe('42');
    expect(num(0)).toBe('0');
    expect(num(undefined)).toBe('-');
    expect(num('')).toBe('-');
    expect(num('abc')).toBe('abc');
  });
});

describe('dates', () => {
  const d = '2026-10-06T01:38:08.123Z';
  it('dateTime uses the AWS console style in UTC', () => {
    expect(dateTime(d)).toBe('October 6, 2026, 01:38:08 (UTC)');
    expect(dateTime(Date.UTC(2020, 0, 5, 23, 59, 1))).toBe('January 5, 2020, 23:59:01 (UTC)');
  });
  it('shortDateTime drops milliseconds', () => expect(shortDateTime(d)).toBe('2026-10-06 01:38:08Z'));
  it.each([undefined, null, '', 'not a date'])('returns - for %j', (v) => {
    expect(dateTime(v as string)).toBe('-');
    expect(shortDateTime(v as string)).toBe('-');
    expect(ago(v as string)).toBe('-');
  });
});

describe('ago', () => {
  const now = Date.UTC(2026, 0, 10, 12, 0, 0);
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => vi.useRealTimers());
  it.each([
    [2, 'just now'], [30, '30 seconds ago'], [60, '1 minute ago'], [150, '2 minutes ago'],
    [3600, '1 hour ago'], [7200 + 5, '2 hours ago'], [86400, '1 day ago'], [86400 * 5, '5 days ago'],
  ])('%is back -> %s', (s, out) => expect(ago(now - s * 1000)).toBe(out));
  it('flags future timestamps', () => expect(ago(now + 60_000)).toBe('in the future'));
});

describe('duration', () => {
  it.each([
    [undefined, '-'], [0, '0s'], [59, '59s'], [60, '1m 0s'], [3599, '59m 59s'],
    [3600, '1h 0m'], [3600 * 47 + 120, '47h 2m'], [3600 * 50, '2d 2h'],
  ])('%s -> %s', (s, out) => expect(duration(s as number)).toBe(out));
});

describe('pretty', () => {
  it('reformats JSON strings and leaves other strings alone', () => {
    expect(pretty('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(pretty('plain')).toBe('plain');
    expect(pretty(undefined)).toBe('');
  });
  it('serialises bigint and binary', () => {
    expect(JSON.parse(pretty({ n: 10n, b: new Uint8Array(3) }))).toEqual({ n: '10', b: '<3 bytes>' });
  });
});

describe('arnName / capitalize / plural', () => {
  it('extracts the last segment of an ARN', () => {
    expect(arnName('arn:aws:iam::123456789012:role/service/My-Role')).toBe('My-Role');
    expect(arnName('arn:aws:sqs:us-east-1:123456789012:jobs')).toBe('jobs');
    expect(arnName('arn:aws:s3:::bucket')).toBe('bucket');
    expect(arnName(undefined)).toBe('-');
    expect(arnName('not-an-arn')).toBe('not-an-arn');
  });
  it('capitalize', () => { expect(capitalize('abc')).toBe('Abc'); expect(capitalize('')).toBe(''); });
  it('plural', () => {
    expect(plural(1, 'queue')).toBe('1 queue');
    expect(plural(2, 'queue')).toBe('2 queues');
    expect(plural(0, 'bus', 'buses')).toBe('0 buses');
  });
});

import { describe, expect, it } from 'vitest';
import { baseName, isImage, isTextual, parentPrefix, validBucketName } from '../../src/lib/s3';
import { epoch, isFifo, queueName, retention, secs } from '../../src/lib/sqs';
import { attrType, cell, decodeKey, encodeKey, keyAttrs, keyOf, lossy, plain, toItem, typedValue } from '../../src/lib/ddb';
import { flattenRules, portRange, ruleToPermission, tagMap, nameOf } from '../../src/lib/ec2';
import { decodeDoc, policyName, trustPolicyFor, TRUST_PRESETS } from '../../src/lib/iam';
import { envText, parseEnv, patchZip, readZip, RUNTIMES, runtimeDef, zipInline } from '../../src/lib/lambda';
import { bulk } from '../../src/lib/bulk';
import { parseParams } from '../../src/lib/cfn';
import { UserError } from '../../src/lib/errors';

describe('s3', () => {
  it('validBucketName', () => {
    for (const ok of ['abc', 'my-bucket.v2', 'a1b', 'x'.repeat(63)]) expect(validBucketName(ok), ok).toBe(true);
    for (const bad of ['ab', 'x'.repeat(64), 'UPPER', '-start', 'end-', 'a..b', '192.168.0.1', 'has space', 'under_score']) expect(validBucketName(bad), bad).toBe(false);
  });
  it('isTextual / isImage', () => {
    expect(isTextual('text/plain')).toBe(true);
    expect(isTextual('application/json')).toBe(true);
    expect(isTextual('image/svg+xml')).toBe(true);
    expect(isTextual('application/octet-stream', 'notes.MD')).toBe(true);
    expect(isTextual('application/octet-stream', 'photo.png')).toBe(false);
    expect(isTextual(undefined, 'x')).toBe(false);
    expect(isImage('image/png')).toBe(true);
    expect(isImage('image/tiff')).toBe(false);
    expect(isImage(undefined)).toBe(false);
  });
  it('baseName / parentPrefix', () => {
    expect(baseName('a/b/c.txt')).toBe('c.txt');
    expect(baseName('a/b/')).toBe('b');
    expect(parentPrefix('a/b/c/')).toBe('a/b/');
    expect(parentPrefix('a/')).toBe('');
    expect(parentPrefix('')).toBe('');
  });
});

describe('sqs', () => {
  it('queue helpers', () => {
    expect(queueName('http://localhost:4566/000000000000/jobs.fifo')).toBe('jobs.fifo');
    expect(isFifo('jobs.fifo')).toBe(true);
    expect(isFifo('jobs')).toBe(false);
    expect(epoch('1700000000')?.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    expect(epoch(undefined)).toBeUndefined();
  });
  it('secs / retention', () => {
    expect(secs(1)).toBe('1 second');
    expect(secs('30')).toBe('30 seconds');
    expect(secs(300000)).toBe('300,000 seconds');
    expect(secs(undefined)).toBe('-');
    expect(retention('345600')).toBe('4 days');
    expect(retention('86400')).toBe('1 day');
    expect(retention('7200')).toBe('2 hours');
    expect(retention('90')).toBe('90 seconds');
    expect(retention(undefined)).toBe('-');
  });
});

describe('ddb', () => {
  const table = { KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }], AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'N' }] } as never;
  it('key encode/decode round-trips and rejects junk', () => {
    const k = { pk: { S: 'a/b+c' }, sk: { N: '1' } };
    expect(decodeKey(encodeKey(k))).toEqual(k);
    expect(() => decodeKey('!!!')).toThrow(UserError);
    expect(() => decodeKey(Buffer.from('nope').toString('base64url'))).toThrow('Malformed item key.');
  });
  it('key schema helpers', () => {
    expect(keyAttrs(table)).toEqual(['pk', 'sk']);
    expect(attrType(table, 'sk')).toBe('N');
    expect(attrType(table, 'other')).toBe('S');
    expect(keyOf({ pk: { S: 'a' }, sk: { N: '2' }, extra: { S: 'x' } }, table)).toEqual({ pk: { S: 'a' }, sk: { N: '2' } });
  });
  it('typedValue', () => {
    expect(typedValue('S', 'x')).toEqual({ S: 'x' });
    expect(typedValue('N', ' 12 ')).toEqual({ N: '12' });
    expect(() => typedValue('N', 'abc')).toThrow('is not a valid number');
    expect(() => typedValue('N', '')).toThrow(UserError);
    expect(typedValue('B', Buffer.from('hi').toString('base64'))).toEqual({ B: Buffer.from('hi') });
  });
  it('toItem parses plain JSON or raw DynamoDB JSON', () => {
    expect(toItem('{"id":"1","n":2,"l":[true]}', 'plain')).toEqual({ id: { S: '1' }, n: { N: '2' }, l: { L: [{ BOOL: true }] } });
    expect(toItem('{"id":{"S":"1"}}', 'ddb')).toEqual({ id: { S: '1' } });
    expect(() => toItem('[]', 'plain')).toThrow('must be a JSON object');
    expect(() => toItem('null', 'plain')).toThrow(UserError);
    expect(() => toItem('{bad', 'plain')).toThrow(/not valid JSON/);
  });
  it('plain / lossy', () => {
    expect(plain({ a: { S: 'x' }, b: { N: '3' } })).toEqual({ a: 'x', b: 3 });
    expect(lossy({ a: { S: 'x' }, b: { N: '3' }, c: { M: { d: { BOOL: true } } } })).toBe(false);
    expect(lossy({ s: { SS: ['a'] } })).toBe(false); // sets survive the round trip
    expect(lossy({ n: { N: '1.10' } })).toBe(true); // numeric formatting changes
  });
  it('cell truncates and escapes', () => {
    expect(cell(undefined)).toBe('');
    expect(cell('<b>')).toBe('&lt;b&gt;');
    expect(cell('x'.repeat(200))).toHaveLength(118);
    expect(cell({ a: '<' })).toContain('&lt;');
    expect(cell(new Set([1, 2]))).toContain('[1,2]');
  });
});

describe('ec2', () => {
  it('tag helpers', () => {
    expect(tagMap([{ Key: 'Name', Value: 'web' }, { Key: 'k' }])).toEqual({ Name: 'web', k: '' });
    expect(nameOf([{ Key: 'Name', Value: 'web' }])).toBe('web');
    expect(nameOf(undefined)).toBe('');
  });
  it('flattenRules <-> ruleToPermission round-trip per source', () => {
    const rows = flattenRules([
      { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '10.0.0.0/8', Description: 'ssh' }, { CidrIp: '0.0.0.0/0' }], Ipv6Ranges: [{ CidrIpv6: '::/0' }] },
      { IpProtocol: '-1', UserIdGroupPairs: [{ GroupId: 'sg-1' }], PrefixListIds: [{ PrefixListId: 'pl-1' }] },
    ]);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ protocol: 'tcp', from: 22, source: '10.0.0.0/8', description: 'ssh' });
    expect(new Set(rows.map((r) => r.id)).size).toBe(5);
    expect(ruleToPermission(rows[0].id)).toEqual({ IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '10.0.0.0/8' }] });
    expect(ruleToPermission(rows[2].id).Ipv6Ranges).toEqual([{ CidrIpv6: '::/0' }]);
    expect(ruleToPermission(rows[3].id)).toEqual({ IpProtocol: '-1', UserIdGroupPairs: [{ GroupId: 'sg-1' }] });
    expect(ruleToPermission(rows[4].id).PrefixListIds).toEqual([{ PrefixListId: 'pl-1' }]);
    expect(flattenRules()).toEqual([]);
  });
  it('portRange', () => {
    expect(portRange({ protocol: '-1' })).toBe('All');
    expect(portRange({ protocol: 'tcp', from: -1, to: -1 })).toBe('All');
    expect(portRange({ protocol: 'tcp', from: 80, to: 80 })).toBe('80');
    expect(portRange({ protocol: 'tcp', from: 8000, to: 8100 })).toBe('8000 - 8100');
    expect(portRange({ protocol: 'tcp' })).toBe('All');
  });
});

describe('iam', () => {
  const doc = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }] };
  it('decodeDoc handles raw JSON, URL-encoded and double-encoded documents', () => {
    const json = JSON.stringify(doc);
    expect(decodeDoc(json)).toEqual(doc);
    expect(decodeDoc(encodeURIComponent(json))).toEqual(doc);
    expect(decodeDoc(doc)).toEqual(doc);
    expect(decodeDoc(JSON.stringify(json))).toEqual(doc);
    expect(decodeDoc('not json at all')).toBe('not json at all');
  });
  it('policyName / trust policy', () => {
    expect(policyName('arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')).toBe('AWSLambdaBasicExecutionRole');
    const t = JSON.parse(trustPolicyFor('lambda.amazonaws.com'));
    expect(t.Statement[0]).toMatchObject({ Effect: 'Allow', Action: 'sts:AssumeRole', Principal: { Service: 'lambda.amazonaws.com' } });
    expect(new Set(TRUST_PRESETS.map((p) => p.id)).size).toBe(TRUST_PRESETS.length);
  });
});

describe('lambda', () => {
  it('zip create / read / patch round-trip', () => {
    const rt = runtimeDef('python3.13')!;
    const zip = zipInline(rt.file, rt.code);
    const files = readZip(zip);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: 'lambda_function.py', binary: false, text: rt.code });
    const patched = readZip(patchZip(zip, 'extra/data.txt', 'hello'));
    expect(patched.map((f) => f.path)).toEqual(['extra/data.txt', 'lambda_function.py']);
    expect(patched[0].text).toBe('hello');
  });
  it('flags binary files', () => {
    const zip = patchZip(zipInline('a.txt', 'x'), 'bin.dat', 'a\u0000b');
    expect(readZip(zip).find((f) => f.path === 'bin.dat')).toMatchObject({ binary: true, text: undefined });
  });
  it('runtimes are consistent', () => {
    expect(new Set(RUNTIMES.map((r) => r.id)).size).toBe(RUNTIMES.length);
    for (const r of RUNTIMES) expect(r.handler.split('.')[0], r.id).toBe(r.file.replace(/\.\w+$/, ''));
    expect(runtimeDef('cobol')).toBeUndefined();
  });
  it('parseEnv / envText', () => {
    expect(parseEnv('# c\nA=1\n\r\nB = x=y \n')).toEqual({ A: '1', B: ' x=y' });
    expect(() => parseEnv('=oops')).toThrow('Invalid environment line');
    expect(() => parseEnv('novalue')).toThrow(/KEY=value/);
    expect(envText({ A: '1', B: '2' })).toBe('A=1\nB=2');
    expect(envText(undefined)).toBe('');
  });
});

describe('bulk', () => {
  const o = { verb: 'Deleted', noun: 'queue' };
  it('requires a selection', async () => { await expect(bulk([], o, async () => 1)).rejects.toThrow('Select at least one queue.'); });
  it('summarises full success', async () => {
    expect((await bulk(['a', 'b'], { ...o, tail: 'Bye.' }, async () => 1)).message).toBe('Deleted 2 queues. Bye.');
    expect((await bulk(['a'], o, async () => 1)).message).toBe('Deleted 1 queue.');
    expect((await bulk(['a'], o, async () => 1)).type).toBeUndefined();
  });
  it('reports partial failure with detail and keeps going', async () => {
    const seen: string[] = [];
    const r = await bulk(['a', 'b', 'c'], o, async (id) => { seen.push(id); if (id === 'b') throw new Error('locked'); }, (x) => `Q:${x}`);
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(r.message).toBe('Deleted 2 of 3 (1 failed: locked)');
    expect(r.detail).toBe('Q:b: locked');
    expect(r.type).toBe('warning');
  });
  it('throws when everything fails, dedupes reasons', async () => {
    await expect(bulk(['a', 'b'], o, async () => { throw new Error('nope'); })).rejects.toThrow('Deleted 0 of 2 (2 failed: nope)');
  });
});

describe('cfn parseParams', () => {
  it('parses Key=Value lines, skipping comments/blank lines', () => {
    expect(parseParams('# c\nEnv=dev\n\n Size = a=b ')).toEqual([{ ParameterKey: 'Env', ParameterValue: 'dev' }, { ParameterKey: 'Size', ParameterValue: ' a=b' }]);
    expect(() => parseParams('bad')).toThrow(UserError);
  });
});

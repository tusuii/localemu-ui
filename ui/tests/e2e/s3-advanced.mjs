import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { S3Client, PutBucketVersioningCommand, GetBucketReplicationCommand, GetBucketLoggingCommand, CreateBucketCommand, PutObjectCommand, DeleteBucketCommand, GetBucketLifecycleConfigurationCommand, GetBucketNotificationConfigurationCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { SQSClient, CreateQueueCommand, DeleteQueueCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { unzipSync } from 'fflate';
import { start, BASE } from './lib.mjs';

const cfg = { endpoint: 'http://localhost:4566', region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: '000000000000', secretAccessKey: 'test' } };
const s3 = new S3Client(cfg);
const sqs = new SQSClient(cfg);
const B = 'ui-adv-bucket';
const Q = 'ui-adv-queue';

const t = await start();
const { p } = t;
const ok = (c, m) => t.ok(c, m);

// fresh bucket with 230 objects
try { await s3.send(new CreateBucketCommand({ Bucket: B })); } catch { /* exists */ }
for (let i = 0; i < 230; i += 10) {
  await Promise.all(Array.from({ length: 10 }, (_, j) => s3.send(new PutObjectCommand({ Bucket: B, Key: `obj/${String(i + j).padStart(4, '0')}.txt`, Body: 'x' }))));
}
await s3.send(new PutObjectCommand({ Bucket: B, Key: 'other.txt', Body: 'y' }));

try {
  // ---- pagination ----
  await t.go(`/s3/${B}?prefix=obj%2F`);
  ok(await p.locator('tr[data-row]').count() === 100, 'page 1 shows 100 rows');
  ok((await p.locator('[data-server-pager]').innerText()).includes('Page 1'), 'server pager rendered');
  await p.click('[data-server-pager] a:has-text("Next")');
  await p.waitForLoadState('load');
  ok(await p.locator('tr[data-row]').count() === 100 && (await p.locator('[data-server-pager]').innerText()).includes('Page 2'), 'page 2 shows 100 rows');
  await p.click('[data-server-pager] a:has-text("Next")');
  await p.waitForLoadState('load');
  ok(await p.locator('tr[data-row]').count() === 30, 'page 3 shows remaining 30');
  ok(await p.locator('[data-server-pager] a:has-text("Next")').count() === 0, 'no Next on last page');
  await p.click('[data-server-pager] a:has-text("Previous")');
  await p.waitForLoadState('load');
  ok((await p.locator('[data-server-pager]').innerText()).includes('Page 2'), 'Previous goes back');

  // ---- prefix search ----
  await t.go(`/s3/${B}?prefix=obj%2F`);
  await p.fill('#prefix-search', '001');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('button:has-text("Search")')]);
  ok(await p.locator('tr[data-row]').count() === 10, 'prefix search returns 10 matches (0010-0019); got ' + await p.locator('tr[data-row]').count());

  // ---- lifecycle ----
  await t.go(`/s3/${B}?tab=management`);
  await p.fill('#lc-id', 'expire-logs');
  await p.fill('#lc-prefix', 'logs/');
  await p.fill('#lc-tk', 'env');
  await p.fill('#lc-tv', 'dev');
  await p.fill('#lc-exp', '30');
  await p.fill('#lc-tr', '10');
  await p.fill('#lc-nc', '5');
  await p.fill('#lc-ab', '7');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#lc-form button[type=submit]')]);
  let lc = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: B }));
  const r1 = lc.Rules?.find((r) => r.ID === 'expire-logs');
  ok(r1?.Expiration?.Days === 30 && r1.Transitions?.[0]?.Days === 10 && r1.NoncurrentVersionExpiration?.NoncurrentDays === 5 && r1.AbortIncompleteMultipartUpload?.DaysAfterInitiation === 7, 'lifecycle rule stored with all actions');
  ok(await p.locator('tr[data-rule="expire-logs"]').count() === 1, 'rule listed');

  // edit it
  await p.click('tr[data-rule="expire-logs"] a:has-text("Edit")');
  await p.waitForLoadState('load');
  ok((await p.inputValue('#lc-exp')) === '30' && (await p.inputValue('#lc-tk')) === 'env', 'edit form prefilled');
  await p.fill('#lc-exp', '45');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#lc-form button[type=submit]')]);
  lc = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: B }));
  ok(lc.Rules?.length === 1 && lc.Rules[0].Expiration?.Days === 45, 'rule edited in place');

  // second rule + disable
  await p.fill('#lc-id', 'tmp-rule');
  await p.fill('#lc-exp', '1');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#lc-form button[type=submit]')]);
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('tr[data-rule="tmp-rule"] button:has-text("Disable")')]);
  lc = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: B }));
  ok(lc.Rules?.find((r) => r.ID === 'tmp-rule')?.Status === 'Disabled', 'rule disabled');

  // JSON editor
  await p.click('summary:has-text("Edit all rules as JSON")');
  await p.fill('textarea[name=lifecycle]', JSON.stringify([{ ID: 'json-rule', Status: 'Enabled', Filter: { Prefix: 'j/' }, Expiration: { Days: 3 } }]));
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('button:has-text("Save JSON")')]);
  lc = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: B }));
  ok(lc.Rules?.length === 1 && lc.Rules[0].ID === 'json-rule', 'JSON editor replaced rules');

  // delete via confirm
  await p.click('tr[data-rule="json-rule"] button:has-text("Delete")');
  await p.waitForSelector('#confirm-dialog[open]');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
  const gone = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: B })).then(() => false, (e) => /NoSuchLifecycle/.test(e.name));
  ok(gone, 'last rule deleted removes the configuration');

  // ---- notifications ----
  const q = await sqs.send(new CreateQueueCommand({ QueueName: Q }));
  const arn = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: q.QueueUrl, AttributeNames: ['QueueArn'] }))).Attributes.QueueArn;
  await t.go(`/s3/${B}?tab=management`);
  await p.fill('#nt-id', 'to-queue');
  await p.fill('#nt-arn', arn);
  await p.fill('#nt-prefix', 'in/');
  await p.fill('#nt-suffix', '.csv');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#nt-form button[type=submit]')]);
  const n1 = await s3.send(new GetBucketNotificationConfigurationCommand({ Bucket: B }));
  ok(n1.QueueConfigurations?.[0]?.Id === 'to-queue' && n1.QueueConfigurations[0].Events?.includes('s3:ObjectCreated:*'), 'notification stored');
  ok(await p.locator('tr[data-notification="to-queue"]').count() === 1, 'notification listed with filter: ' + (await p.locator('tr[data-notification="to-queue"]').innerText()).replace(/\s+/g, ' '));
  // bad destination -> readable error, no crash
  await p.fill('#nt-id', 'bad');
  await p.fill('#nt-arn', 'arn:aws:sqs:us-east-1:000000000000:does-not-exist');
  await p.click('#nt-form button[type=submit]');
  await p.waitForLoadState('load');
  ok(await p.locator('tr[data-notification="bad"]').count() === 0, 'bad destination not added (error shown)');
  await p.click('tr[data-notification="to-queue"] button:has-text("Delete")');
  await p.waitForSelector('#confirm-dialog[open]');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
  const n2 = await s3.send(new GetBucketNotificationConfigurationCommand({ Bucket: B }));
  ok(!n2.QueueConfigurations?.length, 'notification deleted');
  await sqs.send(new DeleteQueueCommand({ QueueUrl: q.QueueUrl })).catch(() => {});

  // ---- folder upload (nested) ----
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lemu-up-'));
  fs.mkdirSync(path.join(root, 'site', 'css', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'site', 'index.html'), '<h1>hi</h1>');
  fs.writeFileSync(path.join(root, 'site', 'css', 'a.css'), 'a{}');
  fs.writeFileSync(path.join(root, 'site', 'css', 'deep', 'b.css'), 'b{}');
  await t.go(`/s3/${B}`);
  await p.setInputFiles('#up-folder', path.join(root, 'site'));
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('form[data-s3-upload] button[type=submit]')]);
  const keys = (await s3.send(new ListObjectsV2Command({ Bucket: B, Prefix: 'site/' }))).Contents.map((o) => o.Key).sort();
  ok(JSON.stringify(keys) === JSON.stringify(['site/css/a.css', 'site/css/deep/b.css', 'site/index.html']), 'folder upload preserved paths: ' + keys);

  // multi-file upload into a sub-folder
  await t.go(`/s3/${B}?prefix=site%2F`);
  fs.writeFileSync(path.join(root, 'm1.txt'), '1'); fs.writeFileSync(path.join(root, 'm2.txt'), '2');
  await p.setInputFiles('#up-files', [path.join(root, 'm1.txt'), path.join(root, 'm2.txt')]);
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('form[data-s3-upload] button[type=submit]')]);
  const k2 = ((await s3.send(new ListObjectsV2Command({ Bucket: B, Prefix: 'site/m' }))).Contents ?? []).map((o) => o.Key);
  ok(k2.length === 2, 'multi-file upload under prefix: ' + k2);

  // ---- zip download of a folder ----
  const form = new URLSearchParams([['id', 'site/']]);
  const zr = await p.request.post(`${BASE}/s3/${B}/zip`, { data: form.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE } });
  const names = Object.keys(unzipSync(new Uint8Array(await zr.body()))).sort();
  ok(zr.headers()['content-type'] === 'application/zip' && names.includes('site/css/deep/b.css') && names.includes('site/index.html'), 'zip contains nested files: ' + names);
  // via the toolbar button
  await t.go(`/s3/${B}`);
  await p.locator('tr[data-row]:has-text("site/") [data-row-select]').check();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download as zip")')]);
  ok(dl.suggestedFilename() === 'site.zip', 'toolbar zip download named ' + dl.suggestedFilename());

  // ---- bulk delete incl. recursive prefix ----
  await t.go(`/s3/${B}`);
  await p.locator('tr[data-row]:has-text("site/") [data-row-select]').check();
  await p.locator('tr[data-row]:has-text("other.txt") [data-row-select]').check();
  await p.click('form[data-table] button:has-text("Delete")');
  await p.waitForSelector('#confirm-dialog[open]');
  await p.fill('[data-cd-input]', 'permanently delete');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
  const left = (await s3.send(new ListObjectsV2Command({ Bucket: B, Prefix: 's' }))).KeyCount + (await s3.send(new ListObjectsV2Command({ Bucket: B, Prefix: 'other' }))).KeyCount;
  ok(left === 0, 'bulk delete removed folder recursively and plain object');

  // ---- replication + server access logging editors ----
  const D = 'ui-adv-bucket-dst';
  try { await s3.send(new CreateBucketCommand({ Bucket: D })); } catch { /* exists */ }
  const page = async () => (await p.innerText('body')).replace(/\s+/g, ' ');
  const unsupported = (txt) => /does not support/i.test(txt);
  await t.go(`/s3/${B}?tab=management`);
  await p.fill('#rep-id', 'r1'); await p.fill('#rep-dest', D); await p.fill('#rep-prefix', 'logs/');
  await t.submit('#rep-form button[type=submit]');
  ok((await page()).includes('Replication requires versioning'), 'replication without versioning explains the requirement');
  for (const b of [B, D]) await s3.send(new PutBucketVersioningCommand({ Bucket: b, VersioningConfiguration: { Status: 'Enabled' } }));
  await t.go(`/s3/${B}?tab=management`);
  await p.fill('#rep-id', 'r1'); await p.fill('#rep-dest', D); await p.fill('#rep-prefix', 'logs/'); await p.selectOption('#rep-class', 'STANDARD_IA');
  await t.submit('#rep-form button[type=submit]');
  const repTxt = await page();
  if (unsupported(repTxt)) {
    ok(true, 'replication reported as unsupported by LocalEmu with a clear message');
  } else {
    ok((await t.flash()).includes('Replication rule "r1" saved'), 'replication rule saved: ' + await t.flash());
    const rc = (await s3.send(new GetBucketReplicationCommand({ Bucket: B }))).ReplicationConfiguration;
    ok(rc.Rules.length === 1 && rc.Rules[0].Destination.Bucket.endsWith(D) && rc.Rules[0].Destination.StorageClass === 'STANDARD_IA', 'replication rule persisted: ' + JSON.stringify(rc.Rules[0]));
    ok((await p.locator('tr[data-rep-rule="r1"]').innerText()).includes('logs/'), 'replication rule listed with prefix');
    await p.click('tr[data-rep-rule="r1"] a');
    await p.waitForLoadState('load');
    ok((await p.inputValue('#rep-prefix')) === 'logs/' && (await p.inputValue('#rep-dest')) === D, 'replication edit form prefilled');
    await p.fill('#rep-prefix', 'data/');
    await t.submit('#rep-form button[type=submit]');
    const rc2 = (await s3.send(new GetBucketReplicationCommand({ Bucket: B }))).ReplicationConfiguration;
    ok(rc2.Rules.length === 1 && rc2.Rules[0].Filter?.Prefix === 'data/', 'replication rule edited in place');
    await t.submit('tr[data-rep-rule="r1"] button[value=repToggle]');
    const rc3 = (await s3.send(new GetBucketReplicationCommand({ Bucket: B }))).ReplicationConfiguration;
    ok(rc3.Rules[0].Status === 'Disabled', 'replication rule disabled');
    await p.click('tr[data-rep-rule="r1"] button[value=repDelete]');
    await p.waitForSelector('#confirm-dialog[open]');
    await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
    const gone = await s3.send(new GetBucketReplicationCommand({ Bucket: B })).then((r) => !r.ReplicationConfiguration?.Rules?.length, () => true);
    ok(gone && (await p.locator('tr[data-rep-rule]').count()) === 0, 'replication rule deleted');
  }
  await t.go(`/s3/${B}?tab=management`);
  await p.fill('#log-target', D); await p.fill('#log-prefix', 'access/');
  await t.submit('button[value=logSave]');
  if (unsupported(await page())) {
    ok(true, 'server access logging reported as unsupported by LocalEmu with a clear message');
  } else {
    const lg = (await s3.send(new GetBucketLoggingCommand({ Bucket: B }))).LoggingEnabled;
    ok(lg?.TargetBucket === D && lg?.TargetPrefix === 'access/', 'logging enabled: ' + JSON.stringify(lg));
    ok((await p.innerText('[data-logging-state]')).includes(`s3://${D}/access/`), 'logging state shown');
    await p.click('button[value=logDisable]');
    await p.waitForSelector('#confirm-dialog[open]');
    await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
    ok(!(await s3.send(new GetBucketLoggingCommand({ Bucket: B }))).LoggingEnabled, 'logging disabled');
  }
  await t.go(`/s3/${B}?tab=management`);
  await p.fill('#log-target', 'no-such-bucket-zzz');
  await t.submit('button[value=logSave]');
  ok((await page()).includes('does not exist'), 'logging to a missing bucket gives a clear error');
} finally {
  // cleanup
  try {
    await s3.send(new DeleteBucketCommand({ Bucket: 'ui-adv-bucket-dst' })).catch(() => {});
    let token;
    do {
      const r = await s3.send(new ListObjectsV2Command({ Bucket: B, ContinuationToken: token }));
      if (r.Contents?.length) await s3.send(new DeleteObjectsCommand({ Bucket: B, Delete: { Objects: r.Contents.map((o) => ({ Key: o.Key })), Quiet: true } }));
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    await s3.send(new DeleteBucketCommand({ Bucket: B }));
  } catch (e) { console.log('cleanup:', e.message); }
  await t.done();
}

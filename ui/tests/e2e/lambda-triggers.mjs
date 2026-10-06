import { start } from './lib.mjs';
import { LambdaClient, CreateFunctionCommand, DeleteFunctionCommand } from '@aws-sdk/client-lambda';
import { SQSClient, CreateQueueCommand, DeleteQueueCommand } from '@aws-sdk/client-sqs';
import { zipSync, strToU8 } from 'fflate';

const cfg = { endpoint: process.env.LOCALEMU_ENDPOINT ?? 'http://localhost:4566', region: 'us-east-1', credentials: { accessKeyId: '000000000000', secretAccessKey: 'x' } };
const lam = new LambdaClient(cfg), sqs = new SQSClient(cfg);
const sfx = Date.now().toString(36);
const fns = [`trg-${sfx}`, `trg2-${sfx}`];
const Q = `trgq-${sfx}`;
const mk = (n) => lam.send(new CreateFunctionCommand({ FunctionName: n, Runtime: 'python3.12', Role: 'arn:aws:iam::000000000000:role/r', Handler: 'a.b', Code: { ZipFile: zipSync({ 'a.py': strToU8('def b(e,c): return 1') }) } }));
for (const n of fns) await mk(n);
await sqs.send(new CreateQueueCommand({ QueueName: Q }));
const qarn = `arn:aws:sqs:us-east-1:000000000000:${Q}`;

const t = await start(); const { p } = t;
const tab = `/lambda/${fns[0]}?tab=triggers`;
try {
  // --- list pagination via Marker (page size 25 min; two pages need > 25 fns, so just check the pager renders + paging link absent/ok)
  await t.go('/lambda?limit=25');
  t.ok((await p.locator('[data-server-pager]').count()) === 1 && (await p.locator(`tr[data-row]:has-text("${fns[0]}")`).count()) <= 1, 'functions list renders with server pager');

  // --- event source mapping: create, disable, enable, delete
  await t.go(tab);
  await p.fill('#esm-source', qarn); await p.fill('#esm-batch', '5');
  await t.submit('button:has-text("Add trigger")');
  t.ok((await t.flash()).includes('Added SQS trigger'), 'ESM created: ' + await t.flash());
  t.ok((await p.locator(`tr[data-row]:has-text("${Q}")`).count()) === 1, 'ESM listed with source');
  await p.locator('tr[data-row] [data-row-select]').first().check();
  await t.submit('button:has-text("Disable")');
  t.ok((await t.flash()).includes('Disabled 1 trigger'), 'ESM disabled: ' + await t.flash());
  await p.locator('tr[data-row] [data-row-select]').first().check();
  await t.submit('button:has-text("Enable")');
  t.ok((await t.flash()).includes('Enabled 1 trigger'), 'ESM enabled');
  await p.locator('tr[data-row] [data-row-select]').first().check();
  await p.click('form[data-table=esm] button:has-text("Delete")');
  await p.waitForSelector('#confirm-dialog[open]');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
  t.ok((await t.flash()).includes('Deleted 1 trigger'), 'ESM deleted: ' + await t.flash());
  // bad ARN is a readable error, not a crash
  await p.fill('#esm-source', 'arn:aws:sqs:us-east-1:000000000000:does-not-exist');
  await t.submit('button:has-text("Add trigger")');
  t.ok((await p.locator('.flash-error').count()) >= 1, 'ESM for missing queue shows an error');

  // --- function URL: create (CORS), update auth, delete
  await t.go(tab);
  await p.selectOption('#url-auth', 'NONE'); await p.fill('#url-origins', '*'); await p.fill('#url-methods', 'GET, POST');
  await t.submit('button:has-text("Create function URL")');
  t.ok((await t.flash()).includes('Function URL saved') && (await p.innerText('main')).includes('lambda-url'), 'function URL created: ' + await t.flash());
  await p.selectOption('#url-auth', 'AWS_IAM');
  await t.submit('button:has-text("Save URL")');
  t.ok((await p.innerText('main')).includes('AWS_IAM'), 'function URL auth updated');
  await p.click('button:has-text("Delete function URL")');
  await p.waitForSelector('#confirm-dialog[open]');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
  t.ok((await p.innerText('main')).includes('No function URL is configured'), 'function URL deleted');

  // --- resource-based permissions
  await t.go(tab);
  await p.fill('#perm-source', 'arn:aws:s3:::some-bucket'); await p.fill('#perm-sid', 'allow-s3');
  await t.submit('button:has-text("Add permission")');
  t.ok((await p.locator('tr[data-row]:has-text("allow-s3")').count()) === 1 && (await p.innerText('main')).includes('s3.amazonaws.com'), 'permission statement added');
  await p.selectOption('#perm-preset', 'sns.amazonaws.com');
  await p.fill('#perm-sid', 'allow-sns'); await p.fill('#perm-source', 'arn:aws:sns:us-east-1:000000000000:t');
  await t.submit('button:has-text("Add permission")');
  t.ok((await p.locator('tr[data-row]:has-text("allow-sns")').count()) === 1, 'second statement (SNS) added');
  await p.locator('form[data-table=perms] [data-select-all]').check();
  await p.click('form[data-table=perms] button:has-text("Remove")');
  await p.waitForSelector('#confirm-dialog[open]');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
  t.ok((await t.flash()).includes('Removed 2 permission statements'), 'bulk remove statements: ' + await t.flash());

  // --- bulk delete of functions on the list shows a summary
  await t.go('/lambda');
  for (const n of fns) await p.locator(`tr[data-row]:has-text("${n}") [data-row-select]`).check();
  await p.click('form[data-table] button:has-text("Delete")');
  await p.waitForSelector('#confirm-dialog[open]');
  if (await p.locator('[data-cd-input]').count()) await p.fill('[data-cd-input]', 'delete');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
  if (process.env.E2E_LAMBDA === '1') t.ok((await t.flash()).includes('Deleted 2 functions'), 'bulk delete functions: ' + await t.flash());
  else {
    // Without Docker LocalEmu cannot delete functions: the console must report every failure instead of stopping at the first.
    const msg = await p.locator('.flash-error').first().innerText().catch(() => '');
    t.ok(/Deleted (0 of 2 \(2 failed|2 functions)/.test(msg + await t.flash()), 'bulk delete summarises per-item results');
  }
} finally {
  for (const n of fns) await lam.send(new DeleteFunctionCommand({ FunctionName: n })).catch(() => {});
  await sqs.send(new DeleteQueueCommand({ QueueUrl: `http://localhost:4566/000000000000/${Q}` })).catch(() => {});
  await t.done();
}

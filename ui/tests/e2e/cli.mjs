import { start } from './lib.mjs';
const t = await start(); const { p } = t;
await p.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
const show = async () => { await p.click('.cli-pop > button'); return (await p.locator('[data-cli-text]').first().innerText()).trim(); };

await t.go('/sqs/create');
let txt = await show();
t.ok(txt.includes('aws sqs create-queue --queue-name <name>') && txt.includes('--endpoint-url http://localhost:4566'), 'placeholder + endpoint: ' + txt);
await p.fill('#name', 'orders'); await p.fill('#visibility', '45');
txt = await p.locator('[data-cli-text]').first().innerText();
t.ok(txt.includes('--queue-name orders') && txt.includes('--attributes VisibilityTimeout=45') && !txt.includes('DelaySeconds'), 'live fill, optional flags: ' + txt);
await p.click('[data-cli-copy]');
await p.waitForFunction(() => document.querySelector('[data-cli-copy]').textContent === 'Copied');
t.ok(true, 'copy feedback');
const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => null));
if (clip !== null) t.ok(clip.includes('--queue-name orders'), 'clipboard has the command');

// FIFO option: .fifo suffix and attributes
await p.check('input[name=type][value=fifo]'); await p.check('input[name=dedup]');
txt = await p.locator('[data-cli-text]').first().innerText();
t.ok(txt.includes('--queue-name orders.fifo') && txt.includes('FifoQueue=true,ContentBasedDeduplication=true,VisibilityTimeout=45') && txt.split('--attributes').length === 2, 'fifo template: ' + txt);
// SDK tab
await p.click('[data-cli-tab=sdk]');
txt = await p.locator('[data-cli-text]').first().innerText();
t.ok(txt.includes('new CreateQueueCommand(') && txt.includes('QueueName: "orders.fifo"') && txt.includes('@aws-sdk/client-sqs') && txt.includes('FifoQueue: "true"'), 'sdk tab: ' + txt);
t.ok((await p.locator('[data-cli-copy]').innerText()) === 'Copy SDK code', 'copy button names the format');
await p.click('[data-cli-copy]');
await p.waitForFunction(() => document.querySelector('[data-cli-copy]').textContent === 'Copied');
const clip2 = await p.evaluate(() => navigator.clipboard.readText().catch(() => null));
if (clip2 !== null) t.ok(clip2.includes('CreateQueueCommand') && !clip2.includes('aws sqs'), 'clipboard has the SDK code');
await p.click('[data-cli-tab=cli]');
t.ok((await p.locator('[data-cli-text]').first().innerText()).startsWith('aws sqs create-queue'), 'cli tab again');

// EventBridge rule form: --event-bus-name only for a non-default bus
await t.go('/events/rules?bus=default'); await p.fill('#name', 'r1');
txt = await show(); t.ok(txt.includes('aws events put-rule --name r1') && !txt.includes('--event-bus-name'), 'default bus omitted: ' + txt);
const buses = await p.locator('#bus option').allTextContents();
const other = buses.find((b) => b !== 'default');
if (other) {
  await t.go('/events/rules?bus=' + encodeURIComponent(other)); await p.fill('#name', 'r1');
  txt = await show(); t.ok(txt.includes('--event-bus-name ' + other), 'non-default bus included: ' + txt);
} else console.log('SKIP non-default bus (only the default bus exists)');

await t.go('/s3/create'); await p.fill('#name', 'my bucket"x');
txt = await show(); t.ok(txt.startsWith("aws s3 mb s3://"), 's3 mb template: ' + txt);
await t.go('/dynamodb/create'); await p.fill('#name', 'T1'); await p.fill('#pk', 'id');
txt = await show(); t.ok(txt.includes('--table-name T1') && txt.includes('AttributeName=id,AttributeType=S'), 'dynamodb template: ' + txt);
for (const path of ['/sns/create', '/secretsmanager/create', '/ssm/create', '/kms/create', '/iam/users/create', '/iam/roles/create', '/cloudformation/create', '/lambda/create', '/events', '/kinesis']) {
  await t.go(path);
  t.ok(await p.locator('.cli-pop').count() >= 1, path + ' has Show CLI');
}
await t.done();

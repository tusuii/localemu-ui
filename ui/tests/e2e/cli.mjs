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
t.ok((await p.locator('[data-cli-copy]').innerText()) === 'Copied', 'copy feedback');
const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => null));
if (clip !== null) t.ok(clip.includes('--queue-name orders'), 'clipboard has the command');

await t.go('/s3/create'); await p.fill('#name', 'my bucket"x');
txt = await show(); t.ok(txt.startsWith("aws s3 mb s3://"), 's3 mb template: ' + txt);
await t.go('/dynamodb/create'); await p.fill('#name', 'T1'); await p.fill('#pk', 'id');
txt = await show(); t.ok(txt.includes('--table-name T1') && txt.includes('AttributeName=id,AttributeType=S'), 'dynamodb template: ' + txt);
for (const path of ['/sns/create', '/secretsmanager/create', '/ssm/create', '/kms/create', '/iam/users/create', '/iam/roles/create', '/cloudformation/create', '/lambda/create', '/events', '/kinesis']) {
  await t.go(path);
  t.ok(await p.locator('.cli-pop').count() >= 1, path + ' has Show CLI');
}
await t.done();

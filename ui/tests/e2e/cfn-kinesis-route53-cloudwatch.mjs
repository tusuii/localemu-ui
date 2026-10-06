import { start } from './lib.mjs';
const t = await start(); const { p } = t;
// ---- cloudformation
await t.go('/cloudformation/create'); await p.fill('#name', 'ui-stack'); await t.submit('button:has-text("Create stack")');
t.ok(p.url().endsWith('/cloudformation/ui-stack'), 'stack create: ' + await t.flash());
await p.waitForTimeout(3000); await p.reload();
t.ok((await p.innerText('main')).includes('CREATE_COMPLETE'), 'stack reaches CREATE_COMPLETE');
t.ok((await p.innerText('main')).includes('BucketName'), 'outputs listed');
await t.go('/cloudformation/ui-stack?tab=resources'); const rt = await p.innerText('main'); t.ok(rt.includes('AssetsBucket') && rt.includes('AWS::SQS::Queue'), 'resources listed');
await t.go('/cloudformation/ui-stack?tab=events'); t.ok((await p.locator('tbody tr').count()) >= 2, 'events listed');
await t.go('/cloudformation/ui-stack?tab=template'); t.ok((await p.inputValue('textarea[name=template]')).includes('AssetsBucket'), 'template shown');
await t.go('/s3'); t.ok((await p.locator('tr[data-row]').count()) >= 1, 'stack created a real bucket');
await t.go('/cloudformation'); await t.confirmAction('ui-stack', 'Delete', 'delete');
await p.waitForTimeout(2500); await p.reload(); t.ok((await p.locator('tr[data-row]:has-text("ui-stack") >> text=DELETE_COMPLETE').count()) === 0, 'stack deleted');
// ---- kinesis
await t.go('/kinesis'); await p.fill('#n', 'ui-stream'); await t.submit('button:has-text("Create")');
t.ok(p.url().endsWith('/kinesis/ui-stream'), 'stream created');
await p.fill('#data', '{"event":"click"}'); await t.submit('button:has-text("Put")');
t.ok((await t.flash()).includes('Record written'), 'put record');
t.ok((await p.innerText('main')).includes('{"event":"click"}'), 'record readable');
await t.go('/kinesis'); await t.confirmAction('ui-stream', 'Delete', 'delete');
// ---- route53
await t.go('/route53'); await p.fill('#n', 'ui-test.example.com'); await t.submit('button:has-text("Create")');
t.ok(/\/route53\/[A-Z0-9]+$/.test(p.url()), 'zone created');
await p.fill('#rn', 'www.ui-test.example.com.'); await p.fill('#rv', '10.1.2.3'); await t.submit('button:has-text("Save record")');
t.ok((await t.flash()).includes('Record saved') && (await p.innerText('main')).includes('10.1.2.3'), 'record saved: ' + await t.flash());
await p.locator('tr[data-row]:has-text("www.ui-test") [data-row-select]').check(); await p.click('form[data-table] button:has-text("Delete records")'); await p.waitForSelector('#confirm-dialog[open]');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await t.flash()).includes('Deleted 1 record'), 'record deleted');
await p.click('button:has-text("Delete zone")'); await p.fill('[data-cd-input]', 'delete'); await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok(p.url().endsWith('/route53'), 'zone deleted');
// ---- cloudwatch
await t.go('/cloudwatch/metrics'); await p.fill('#m', 'Clicks'); await p.fill('#val', '5'); await t.submit('button:has-text("Publish")');
t.ok((await t.flash()).includes('published'), 'metric published');
t.ok((await p.innerText('main')).includes('Clicks'), 'metric listed');
await t.go('/cloudwatch'); await p.fill('#name', 'ui-alarm'); await p.fill('#ns', 'Custom/App'); await p.fill('#metric', 'Clicks'); await p.fill('#thr', '10'); await t.submit('button:has-text("Create alarm")');
t.ok((await p.locator('tr[data-row]:has-text("ui-alarm")').count()) === 1, 'alarm created');
await p.locator('tr[data-row]:has-text("ui-alarm") [data-row-select]').check(); await p.click('button:has-text("Set state: In alarm")'); await p.waitForLoadState('load');
t.ok((await t.flash()).includes('ALARM'), 'alarm state set');
await t.confirmAction('ui-alarm', 'Delete', null); t.ok((await p.locator('tr[data-row]:has-text("ui-alarm")').count()) === 0, 'alarm deleted');
for (const pth of ['/services', '/service/athena', '/service/cognito-idp', '/settings', '/activity', '/lambda/layers', '/sns/subscriptions']) { await t.go(pth); t.ok((await p.locator('main').innerText()).length > 30, `page renders: ${pth}`); }
await t.done();

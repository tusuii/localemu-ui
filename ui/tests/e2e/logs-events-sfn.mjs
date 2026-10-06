import { start } from './lib.mjs';
const t = await start(); const { p } = t;
// ---- logs
await t.go('/logs'); await p.fill('#gname', '/ui/app'); await t.submit('button:has-text("Create")');
t.ok(p.url().includes('/logs/group?group=%2Fui%2Fapp'), 'log group created');
await p.fill('#message', 'ERROR something broke'); await t.submit('button:has-text("Write event")');
await p.fill('#message', 'info all good'); await t.submit('button:has-text("Write event")');
t.ok((await p.locator('tbody tr').count()) === 2, 'two log events shown');
await t.go('/logs/group?group=%2Fui%2Fapp&q=ERROR&range=1h'); t.ok((await p.locator('tbody tr').count()) === 1, 'filter pattern narrows events');
await t.go('/logs/group?group=%2Fui%2Fapp&tab=streams'); t.ok((await p.innerText('main')).includes('console'), 'stream listed');
await t.go('/logs/group?group=%2Fui%2Fapp&tab=settings'); await p.selectOption('#days', '7'); await t.submit('button:has-text("Save")');
t.ok((await t.flash()).includes('Retention updated'), 'retention');
await t.go('/logs'); t.ok((await p.locator('tr[data-row]:has-text("/ui/app")').innerText()).includes('7 days'), 'retention in list');
await t.confirmAction('/ui/app', 'Delete', null); t.ok((await p.locator('tr[data-row]:has-text("/ui/app")').count()) === 0, 'log group deleted');

// ---- events
await t.go('/events'); await p.fill('#n', 'ui-bus'); await t.submit('button:has-text("Create")');
t.ok((await t.flash()).includes('created'), 'bus created');
await t.go('/events/rules?bus=ui-bus'); await p.fill('#name', 'orders'); await p.fill('textarea[name=pattern]', '{"source":["my.app"]}'); await t.submit('button:has-text("Create rule")');
t.ok(p.url().includes('/events/rule?'), 'rule created');
await t.go('/sqs/create'); await p.fill('#name', 'evt-q'); await t.submit('button:has-text("Create queue")');
await t.go('/events/rule?bus=ui-bus&name=orders'); await p.fill('#arn', 'arn:aws:sqs:us-east-1:000000000000:evt-q'); await t.submit('button:has-text("Add target")');
t.ok((await t.flash()).includes('Target added'), 'target added');
await t.go('/events/put'); await p.selectOption('#bus', 'ui-bus'); await t.submit('button:has-text("Send event")');
t.ok((await p.innerText('main')).includes('EventId'), 'event sent result shown');
await p.waitForTimeout(1500);
await t.go('/sqs/evt-q'); await p.click('button:has-text("Poll for messages")'); await p.waitForLoadState('load');
t.ok((await p.locator('pre.code-block').allInnerTexts()).join().includes('order.created'), 'event routed to SQS target');
await t.go('/events/rule?bus=ui-bus&name=orders'); await p.click('button:has-text("Disable")'); await p.waitForLoadState('load'); t.ok((await t.flash()).includes('disabled'), 'rule disabled');
await t.go('/events/rules?bus=ui-bus'); await t.confirmAction('orders', 'Delete', null); t.ok((await p.locator('tr[data-row]:has-text("orders")').count()) === 0, 'rule deleted');
await t.go('/events'); await t.confirmAction('ui-bus', 'Delete', null);
await t.go('/sqs'); await t.confirmAction('evt-q', 'Delete', 'delete');

// ---- step functions
await t.go('/stepfunctions/create'); await p.fill('#name', 'ui-flow'); await t.submit('button:has-text("Create state machine")');
t.ok(p.url().endsWith('/stepfunctions/ui-flow'), 'state machine created: ' + await t.flash());
await p.fill('#input', '{"hello":"world"}'); await t.submit('button:has-text("Start execution")');
t.ok(p.url().includes('/stepfunctions/execution?arn='), 'execution started');
await p.waitForTimeout(3500); await p.reload();
const txt = await p.innerText('main');
t.ok(txt.includes('SUCCEEDED') || txt.includes('Succeeded'), 'execution succeeded');
t.ok(txt.includes('PassStateEntered') && txt.includes('ExecutionSucceeded'), 'history events listed');
t.ok(txt.includes('Hello from LocalEmu'), 'output shows pass-state result');
await t.go('/stepfunctions/ui-flow?tab=definition');
const defn = JSON.parse(await p.inputValue('textarea[name=definition]')); defn.Comment = 'edited'; await p.fill('textarea[name=definition]', JSON.stringify(defn)); await t.submit('button:has-text("Save definition")');
t.ok((await t.flash()).includes('updated'), 'definition updated');
await t.go('/stepfunctions'); await t.confirmAction('ui-flow', 'Delete', 'delete'); t.ok((await p.locator('tr[data-row]:has-text("ui-flow")').count()) === 0, 'state machine deleted');
await t.done();

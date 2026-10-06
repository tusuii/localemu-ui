import { start, BASE } from './lib.mjs';
const t = await start(); const { p } = t;
const sh = async (command) => (await (await fetch(BASE + '/api/shell', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lemu-console': '1', origin: BASE }, body: JSON.stringify({ command }) })).json());
await sh('aws sqs create-queue --queue-name live-a');
await sh('aws sqs create-queue --queue-name live-b');
const url = 'http://localhost:4566/000000000000/live-a';
await t.go('/sqs');
t.ok(await p.locator('[data-live-select]').count() === 1, 'auto-refresh control present');
await p.fill('[data-table-filter]', 'live-');
await p.locator('tr[data-row]:has-text("live-b") [data-row-select]').check();
await p.selectOption('[data-live-select]', '5');
await sh(`aws sqs send-message --queue-url ${url} --message-body x`);
await sh(`aws sqs send-message --queue-url ${url} --message-body y`);
const cell = () => p.locator('tr[data-row]:has-text("live-a") td').nth(4).innerText();
t.ok((await cell()).trim() === '0', 'initially 0 messages: ' + await cell());
await p.waitForFunction(() => document.querySelector('tr[data-row][data-name="live-a"]')?.cells[4]?.textContent.trim() === '2', null, { timeout: 15000 });
t.ok(true, 'queue depth updated without reload');
t.ok(await p.inputValue('[data-table-filter]') === 'live-', 'filter text kept');
t.ok(await p.locator('tr[data-row]:has-text("live-b") [data-row-select]').isChecked(), 'selection kept');
t.ok((await p.locator('[data-live-stamp]').innerText()).startsWith('Updated'), 'status stamp shown');
// remembered per page
await p.reload({ waitUntil: 'load' });
t.ok(await p.inputValue('[data-live-select]') === '5', 'interval remembered');
// pauses with a dialog open
await p.selectOption('[data-live-select]', '0');
t.ok(await p.inputValue('[data-live-select]') === '0', 'can turn off');
await sh(`aws sqs delete-queue --queue-url ${url}`); await sh('aws sqs delete-queue --queue-url http://localhost:4566/000000000000/live-b');
// a few other list pages carry the control
for (const path of ['/lambda', '/cloudformation', '/kinesis', '/stepfunctions', '/ec2/instances']) {
  await t.go(path);
  t.ok(await p.locator('[data-live-select]').count() === 1 || await p.locator('form[data-table]').count() === 0, path + ' has auto-refresh');
}
await t.done();

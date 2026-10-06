import { readFileSync } from 'node:fs';
import { start, BASE } from './lib.mjs';
const t = await start(); const { p } = t;
await t.go('/');

// Panel toggles with Alt+C and persists across navigation
t.ok(await p.locator('#shell-panel').isHidden(), 'shell hidden initially');
await p.keyboard.press('Alt+c');
await p.waitForSelector('#shell-panel:not([hidden])');
t.ok(await p.evaluate(() => document.activeElement?.id === 'shell-input'), 'input focused on open');
// Each finished command bumps data-done on the output element, so waiting on it has no timing race
// (no matter how many lines a command prints, or whether it prints none).
const run = async (cmd) => {
  const n = Number(await p.locator('[data-shell-out]').getAttribute('data-done'));
  await p.fill('#shell-input', cmd); await p.keyboard.press('Enter');
  await p.waitForFunction((n0) => Number(document.querySelector('[data-shell-out]').dataset.done) > n0 && !document.querySelector('#shell-input').disabled, n);
};
const outText = async () => p.locator('[data-shell-out]').innerText();
const lastText = async () => p.locator('[data-shell-out] > div').last().innerText();

await run('aws s3 mb s3://shell-e2e'); t.ok((await lastText()).includes('make_bucket: shell-e2e'), 's3 mb');
await run('aws s3 cp - s3://shell-e2e/hello.txt --body "hi there"'); t.ok((await lastText()).includes('upload'), 's3 cp inline');
await run('aws s3 ls s3://shell-e2e/'); t.ok((await lastText()).includes('hello.txt'), 's3 ls prefix');
await run('aws s3api list-buckets --query "Buckets[].Name" --output text'); t.ok((await lastText()).includes('shell-e2e'), 's3api list-buckets + query');
await run('aws sqs create-queue --queue-name shell-q');
t.ok((await lastText()).includes('shell-q'), 'sqs create-queue');
await run('aws sqs send-message --queue-url http://localhost:4566/000000000000/shell-q --message-body hi'); t.ok((await lastText()).includes('MessageId'), 'sqs send-message');
await run('aws sqs list-queues'); t.ok((await lastText()).includes('shell-q'), 'sqs list-queues');
await run('aws dynamodb list-tables --region us-east-1'); t.ok((await lastText()).includes('TableNames'), 'dynamodb list-tables');
await run('aws sqs delete-queue --queue-url http://localhost:4566/000000000000/shell-q');
await run('aws s3 rb s3://shell-e2e --force'); t.ok((await lastText()).includes('remove_bucket'), 's3 rb --force');

// auto-pagination (default on, --no-paginate off), cap with a note, richer --query
for (const i of [1, 2, 3]) await run(`aws sqs create-queue --queue-name shell-pg-${i}`);
const pg = '--queue-name-prefix shell-pg- --page-size 1';
await run(`aws sqs list-queues ${pg} --no-paginate`);
t.ok((await lastText()).includes('shell-pg-1') && !(await lastText()).includes('shell-pg-2') && (await lastText()).includes('NextToken'), '--no-paginate returns one page with its token');
await run(`aws sqs list-queues ${pg} --query "length(QueueUrls)"`); t.ok((await lastText()).trim() === '3', 'auto-pagination follows NextToken across pages');
await run(`aws sqs list-queues ${pg} --max-items 2`);
t.ok((await outText()).includes('stopped after 2 items'), 'truncation is noted when the cap is hit');
await run(`aws sqs list-queues ${pg} --query "QueueUrls[?contains(@, 'pg-2')] | [0]" --output text`); t.ok((await lastText()).includes('shell-pg-2'), 'query: [?contains()]');
await run(`aws sqs list-queues ${pg} --query "sort_by(QueueUrls[].{u: @}, &u)[-1].u" --output text`); t.ok((await lastText()).includes('shell-pg-3'), 'query: sort_by on a projection');
await run('aws sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/shell-pg-1 --attribute-names All --query "length(keys(Attributes)) > `3`"'); t.ok((await lastText()).trim() === 'true', 'query: length(keys())');
await run(`aws sqs list-queues ${pg} --query "QueueUrls[?@ != 'x'] | length(@)"`); t.ok((await lastText()).trim() === '3', 'query: != filter');
await run('aws sqs list-queues --query "nope("'); t.ok((await p.locator('[data-shell-out] .err').last().innerText()).includes('Unsupported --query'), 'bad query is a red error');
for (const i of [1, 2, 3]) await run(`aws sqs delete-queue --queue-url http://localhost:4566/000000000000/shell-pg-${i}`);

// errors are red; security
await run('aws sqs nope'); t.ok(await p.locator('[data-shell-out] .err').last().innerText().then((s) => s.includes('Invalid choice')), 'unknown op is an error (red)');
await run('aws sts get-caller-identity --endpoint-url http://evil.example:1'); t.ok((await p.locator('[data-shell-out] .err').last().innerText()).includes('not allowed'), 'custom endpoint rejected');
await run('rm -rf /'); t.ok((await p.locator('[data-shell-out] .err').last().innerText()).includes('only runs "aws"'), 'non-aws commands rejected');
const color = await p.locator('[data-shell-out] .err').last().evaluate((e) => getComputedStyle(e).color);
t.ok(/255, 155, 155/.test(color), 'error color is red-ish: ' + color);

// help + completion + history
await run('aws help'); t.ok((await lastText()).includes('Services:'), 'aws help');
await run('aws sqs help'); t.ok((await lastText()).includes('create-queue'), 'aws sqs help lists operations');
await p.fill('#shell-input', 'aws sq'); await p.keyboard.press('Tab');
await p.waitForFunction(() => document.querySelector('#shell-input').value.startsWith('aws sqs '));
t.ok(true, 'tab completes service');
await p.fill('#shell-input', 'aws sqs purge-q'); await p.keyboard.press('Tab');
await p.waitForFunction(() => document.querySelector('#shell-input').value.startsWith('aws sqs purge-queue '));
t.ok(true, 'tab completes operation');
await p.fill('#shell-input', ''); await p.keyboard.press('ArrowUp');
t.ok((await p.inputValue('#shell-input')) === 'aws sqs help', 'history up');
await p.keyboard.press('ArrowUp'); t.ok((await p.inputValue('#shell-input')) === 'aws help', 'history up 2');
await p.keyboard.press('ArrowDown'); t.ok((await p.inputValue('#shell-input')) === 'aws sqs help', 'history down');
await p.fill('#shell-input', 'clear'); await p.keyboard.press('Enter');
await p.waitForFunction(() => document.querySelector('[data-shell-out]').childElementCount === 0);
t.ok(true, 'clear');

// persistence + resize
await t.go('/sqs');
t.ok(await p.locator('#shell-panel').isVisible(), 'panel open state persists across pages');
const h0 = (await p.locator('#shell-panel').boundingBox()).height;
const grip = await p.locator('[data-shell-resize]').boundingBox();
await p.mouse.move(grip.x + 50, grip.y + 3); await p.mouse.down(); await p.mouse.move(grip.x + 50, grip.y - 150, { steps: 5 }); await p.mouse.up();
t.ok((await p.locator('#shell-panel').boundingBox()).height > h0 + 100, 'panel resizes by dragging');
await p.click('[data-shell-collapse]'); t.ok((await p.locator('#shell-panel').boundingBox()).height < 60, 'collapse');
await p.click('[data-shell-close]'); t.ok(await p.locator('#shell-panel').isHidden(), 'close');

// same-origin protection of the API
const base = { 'content-type': 'application/json', 'x-lemu-console': '1' };
let r = await fetch(BASE + '/api/shell', { method: 'POST', headers: { ...base, origin: 'http://evil.example' }, body: '{"command":"aws s3 ls"}' });
t.ok(r.status === 403, 'cross-origin POST rejected: ' + r.status);
r = await fetch(BASE + '/api/shell', { method: 'POST', headers: { 'content-type': 'text/plain', origin: BASE }, body: '{"command":"aws s3 ls"}' });
t.ok(r.status === 403, 'non-JSON POST rejected: ' + r.status);
r = await fetch(BASE + '/api/shell', { method: 'POST', headers: { ...base, origin: BASE }, body: '{"command":"aws help"}' });
const helpText = (await r.json()).stdout;
const pkgs = Object.keys(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).dependencies).filter((d) => d.startsWith('@aws-sdk/client-'));
r = await fetch(BASE + '/api/shell', { method: 'POST', headers: { ...base, origin: BASE }, body: '{"command":"aws help"}' });
// every installed SDK client package must be reachable from the registry
const src = readFileSync(new URL('../../src/lib/shell.ts', import.meta.url), 'utf8');
for (const pkg of pkgs) t.ok(src.includes(`'${pkg}'`), 'registry covers ' + pkg);
t.ok(helpText.includes('s3api'), 'help lists services');
await t.done();

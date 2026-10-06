import { start, BASE } from './lib.mjs';
const t = await start(); const { p } = t;
const sh = async (command) => (await (await fetch(BASE + '/api/shell', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lemu-console': '1', origin: BASE }, body: JSON.stringify({ command }) })).json());
await sh('aws s3 mb s3://findme-bucket');
await sh('aws sqs create-queue --queue-name findme-queue');
await sh('aws sns create-topic --name findme-topic');
await sh('aws dynamodb create-table --table-name findme-table --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST');
await sh('aws secretsmanager create-secret --name findme/secret --secret-string x');

// API
let r;
for (let i = 0; i < 8; i++) { r = await (await fetch(BASE + '/api/search?q=findme&limit=8')).json(); if (!r.slow.length) break; await new Promise((s) => setTimeout(s, 1500)); }
const ids = r.groups.map((g) => g.id);
for (const id of ['s3', 'sqs', 'sns', 'dynamodb', 'secrets']) t.ok(ids.includes(id), 'api finds ' + id + ' (' + ids.join(',') + ')');
t.ok((await (await fetch(BASE + '/api/search?q=f')).json()).count === 0, 'api needs 2+ chars');

// dropdown
await t.go('/');
await p.click('[data-global-search]'); await p.fill('[data-global-search]', 'findme');
await p.waitForSelector('[data-search-results] .search-group:has-text("SQS queues")');
t.ok(await p.locator('[data-search-results] a[href="/sqs/findme-queue"]').count() === 1, 'dropdown lists queue link');
t.ok(await p.locator('[data-search-results] a[href="/s3/findme-bucket"]').count() === 1, 'dropdown lists bucket link');
// services still searchable
await p.fill('[data-global-search]', 'dynamo');
await p.waitForSelector('[data-search-results] .search-group:has-text("Services")');
t.ok(await p.locator('[data-search-results] a[href="/dynamodb"]').count() >= 1, 'dropdown still lists services');
// keyboard: Enter goes to full results
await p.fill('[data-global-search]', 'findme'); await p.waitForSelector('[data-search-results] a[href="/sqs/findme-queue"]');
await Promise.all([p.waitForNavigation(), p.keyboard.press('Enter')]);
t.ok(p.url().includes('/search?q=findme'), 'enter opens results page: ' + p.url());
t.ok(await p.locator('[data-search-group="dynamodb"] a:has-text("findme-table")').count() === 1, 'results page groups');
await p.click('a:has-text("findme-queue")'); await p.waitForLoadState('load');
t.ok(p.url().endsWith('/sqs/findme-queue'), 'result link navigates');

await sh('aws s3 rb s3://findme-bucket --force'); await sh('aws sqs delete-queue --queue-url http://localhost:4566/000000000000/findme-queue');
await sh('aws sns delete-topic --topic-arn arn:aws:sns:us-east-1:000000000000:findme-topic'); await sh('aws dynamodb delete-table --table-name findme-table');
await sh('aws secretsmanager delete-secret --secret-id findme/secret --force-delete-without-recovery');
await t.done();

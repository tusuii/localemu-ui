import { start } from './lib.mjs';
import { execSync } from 'node:child_process';
const t = await start(); const { p } = t;
await t.go('/s3');
// switch region through the menu
await p.click('[data-menu-toggle=menu-region]');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#menu-region button[value=eu-west-1]')]);
t.ok(p.url().endsWith('/s3'), 'redirected back to the same page');
t.ok((await p.locator('[data-menu-toggle=menu-region]').innerText()).includes('Ireland'), 'region label updated');
// create a bucket in eu-west-1 and confirm it is region-scoped
await t.go('/s3/create'); await p.fill('#name', 'eu-only-bucket'); await t.submit('button:has-text("Create bucket")');
t.ok((await t.flash()).includes('Successfully created'), 'bucket created in eu-west-1: ' + await t.flash());
await t.go('/sqs/create'); await p.fill('#name', 'eu-queue'); await t.submit('button:has-text("Create queue")');
await t.go('/sqs'); t.ok((await p.locator('tr[data-row]:has-text("eu-queue")').count()) === 1, 'queue visible in eu-west-1');
// switch back: queue (regional) should disappear
await p.click('[data-menu-toggle=menu-region]'); await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#menu-region button[value=us-east-1]')]);
t.ok((await p.locator('tr[data-row]:has-text("eu-queue")').count()) === 0, 'queue not visible in us-east-1 (regional isolation)');
// switch account
await p.click('[data-menu-toggle=menu-account]'); await p.fill('#acct-input', '111122223333');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#menu-account button:has-text("Switch")')]);
t.ok((await p.locator('[data-account-label]').innerText()).trim() === '111122223333', 'account switched');
await t.go('/sqs/create'); await p.fill('#name', 'acct2-queue'); await t.submit('button:has-text("Create queue")');
t.ok(p.url().endsWith('/sqs/acct2-queue'), 'created queue in second account');
await t.go('/sqs'); t.ok((await p.locator('tr[data-row]').count()) === 1, 'second account sees only its own queue');
await t.go('/'); t.ok((await p.innerText('main')).includes('111122223333'), 'home shows new account');
// bad account id
await p.click('[data-menu-toggle=menu-account]'); await p.evaluate(() => { const i = document.querySelector('#acct-input'); i.removeAttribute('pattern'); i.value = 'abc'; });
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#menu-account button:has-text("Switch")')]);
t.ok((await t.flash()).includes('12 digits'), 'invalid account rejected: ' + await t.flash());
// open-redirect guard
const r = await p.request.post('http://localhost:4321/api/context', { form: { region: 'us-east-1', redirect: '//evil.example/x' }, maxRedirects: 0, headers: { origin: 'http://localhost:4321' } });
t.ok(r.status() === 303 && r.headers()['location'] === '/', 'open redirect blocked -> ' + r.headers()['location']);
// cleanup
await p.click('[data-menu-toggle=menu-account]'); await p.fill('#acct-input', '000000000000'); await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#menu-account button:has-text("Switch")')]);
execSync('true');
await t.done();

import { start } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const t = await start(); const { p } = t;
const sfx = Date.now().toString(36);
const dom = `e2e-${sfx}.example.com`, imp = `imp-${sfx}.example.com`;
const text = async () => (await p.innerText('main')).replace(/\s+/g, ' ');

// ---- request
await t.go('/acm/request');
await p.fill('#domain', dom); await p.fill('#sans', `www.${dom}\napi.${dom}`);
await p.fill('#tagKey', 'env'); await p.fill('#tagValue', 'e2e');
await t.submit('button:has-text("Request")');
t.ok((await t.flash()).includes(`Certificate requested for ${dom}`), 'requested: ' + await t.flash());
const reqUrl = p.url();
let tx = await text();
t.ok(tx.includes('PENDING_VALIDATION') && tx.includes(`www.${dom}`) && tx.includes('acm-validations.aws'), 'detail shows status, SANs and DNS validation records');
t.ok((await p.locator('form[data-table=tags] tr[data-row]:has-text("env")').count()) === 1, 'tag from request listed');
await p.fill('#tkey', 'team'); await p.fill('#tval', 'platform');
await t.submit('form:not([data-table]) button:has-text("Add tag")');
t.ok((await t.flash()).includes('Tag added') && (await p.locator('tr[data-row]:has-text("team")').count()) === 1, 'tag added');
await t.confirmAction('team', 'Remove');
t.ok((await t.flash()).includes('Removed 1 tag') && (await p.locator('tr[data-row]:has-text("team")').count()) === 0, 'tag removed');

// ---- import
const dir = mkdtempSync(path.join(tmpdir(), 'e2e-acm-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '30', '-subj', `/CN=${imp}`], { stdio: 'ignore' });
await t.go('/acm/import');
await p.fill('#cert', readFileSync(path.join(dir, 'c.pem'), 'utf8')); await p.fill('#key', readFileSync(path.join(dir, 'k.pem'), 'utf8'));
await t.submit('button:has-text("Import certificate")');
t.ok((await t.flash()).includes('Certificate imported'), 'imported: ' + await t.flash());
tx = await text();
t.ok(tx.includes(imp) && tx.includes('ISSUED') && tx.includes('IMPORTED'), 'imported cert is ISSUED / IMPORTED');
await t.go('/acm/import'); await p.fill('#cert', 'garbage'); await p.fill('#key', 'garbage');
await t.submit('button:has-text("Import certificate")');
t.ok((await p.innerText('body')).includes('must be PEM encoded'), 'invalid PEM rejected with a message');

// ---- list + delete
await t.go('/acm');
t.ok((await p.locator(`tr[data-row]:has-text("${dom}")`).count()) === 1 && (await p.locator(`tr[data-row]:has-text("${imp}")`).count()) === 1, 'both certificates listed');
await t.confirmAction(dom, 'Delete', 'delete');
t.ok((await t.flash()).includes('Deleted 1 certificate') && (await p.locator(`tr[data-row]:has-text("${dom}")`).count()) === 0, 'requested cert deleted');
await p.locator(`tr[data-row]:has-text("${imp}")`).click({ position: { x: 5, y: 5 } }).catch(() => {});
await p.click(`tr[data-row]:has-text("${imp}") a`); await p.waitForLoadState('load');
await p.click('button:has-text("Delete certificate")'); await p.waitForSelector('#confirm-dialog[open]');
await p.fill('[data-cd-input]', 'delete');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await t.flash()).includes('Certificate deleted') && p.url().endsWith('/acm'), 'imported cert deleted from detail page');
await t.go('/acm/00000000-0000-0000-0000-000000000000');
t.ok((await p.innerText('body')).includes('does not exist'), 'unknown cert 404');
await t.done();

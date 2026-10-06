import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start, BASE } from './lib.mjs';
const t0 = await start();
const { p } = t0;
const ok = (c, m) => t0.ok(c, m);
const flash = async () => (await p.locator('[data-flash]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');

// create bucket via UI
await p.goto(BASE + '/s3/create');
await p.fill('#name', 'ui-test-bucket');
await Promise.all([p.waitForURL('**/s3/ui-test-bucket'), p.click('button:has-text("Create bucket")')]);
ok((await flash()).includes('Successfully created bucket'), 'create bucket flash: ' + await flash());

// upload a file
const upFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lemu-')), 'up.txt');
fs.writeFileSync(upFile, 'uploaded from the console\nline2');
await p.setInputFiles('input[type=file]', upFile);
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#upload button[type=submit]')]);
await p.waitForSelector('text=up.txt');
ok(await p.locator('tr[data-row]:has-text("up.txt")').count() === 1, 'uploaded object listed');

// create folder
await p.fill('#folder-name', 'reports');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#create-folder button[type=submit]')]);
ok(await p.locator('tr[data-row]:has-text("reports/")').count() === 1, 'folder listed');

// object page + edit
await p.click('a:has-text("up.txt")');
await p.waitForURL('**/object?key=up.txt');
ok((await p.locator('textarea[name=body]').inputValue()).includes('uploaded from the console'), 'object content shown');
await p.fill('textarea[name=body]', 'edited in console');
await Promise.all([p.waitForLoadState('load'), p.click('button:has-text("Save changes")')]);
ok((await p.locator('textarea[name=body]').inputValue()) === 'edited in console', 'edit saved');
const dl = await p.request.get(BASE + '/s3/ui-test-bucket/download?key=up.txt');
ok((await dl.text()) === 'edited in console' && dl.headers()['content-security-policy']?.includes('sandbox'), 'download streams content w/ sandbox CSP');

// delete object through confirm dialog
await p.goto(BASE + '/s3/ui-test-bucket');
await p.locator('tr[data-row]:has-text("up.txt") input[type=checkbox]').check();
ok(await p.locator('button:has-text("Delete")').first().isEnabled(), 'delete enabled after selection');
await p.click('form[data-table] button:has-text("Delete")');
await p.waitForSelector('#confirm-dialog[open]');
ok((await p.locator('[data-cd-list]').innerText()).includes('up.txt'), 'confirm dialog lists selection');
await p.fill('[data-cd-input]', 'permanently delete');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
await p.waitForTimeout(300);
ok(await p.locator('tr[data-row]:has-text("up.txt")').count() === 0, 'object deleted');

// delete bucket from properties (force)
await p.goto(BASE + '/s3');
await p.locator('tr[data-row]:has-text("ui-test-bucket") input[type=checkbox]').check();
await p.click('form[data-table] button:has-text("Empty")');
await p.fill('[data-cd-input]', 'permanently delete');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
ok((await flash()).includes('Emptied'), 'empty bucket: ' + await flash());
await p.locator('tr[data-row]:has-text("ui-test-bucket") input[type=checkbox]').check();
await p.click('form[data-table] button:has-text("Delete")');
await p.click('[data-cd-ok]');
await p.waitForLoadState('load'); await p.waitForTimeout(300);
ok(await p.locator('tr[data-row]:has-text("ui-test-bucket")').count() === 0, 'bucket deleted');
await t0.done();

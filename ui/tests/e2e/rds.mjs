import { start } from './lib.mjs';
const t = await start(); const { p } = t;
const s = Date.now().toString(36).replace(/[^a-z0-9]/g, '');
const db = `e2edb${s}`, snap = `e2esnap${s}`, db2 = `e2erest${s}`, cl = `e2ecl${s}`, sg = `e2esg${s}`, pg = `e2epg${s}`;

// ---- instance
await t.go('/rds/create');
await p.fill('#identifier', db); await p.selectOption('#engine', 'postgres');
await p.fill('#username', 'admin'); await p.fill('#password', 'supersecret1'); await p.fill('#storage', '25');
await p.fill('#tagKey', 'env'); await p.fill('#tagValue', 'e2e');
await t.submit('button:has-text("Create database")');
t.ok(p.url().endsWith(`/rds/${db}`) && (await t.flash()).includes('is being created'), 'create instance: ' + await t.flash());
let main = await p.innerText('main');
t.ok(main.includes(db) && /\.rds\.amazonaws\.com/.test(main) && main.includes('5432'), 'detail shows endpoint and port');
await t.go(`/rds/${db}?tab=configuration`);
main = await p.innerText('main');
t.ok(main.includes('db.t3.micro') && main.includes('25 GiB'), 'configuration shows class and storage');
await t.go(`/rds/${db}?tab=tags`);
t.ok((await p.locator('form[data-table=tags] tr[data-row]:has-text("env")').count()) === 1, 'tag from create is listed');
await p.fill('#key', 'team'); await p.fill('#value', 'qa'); await t.submit('button:has-text("Add tag")');
t.ok((await t.flash()).includes('Tag added') && (await p.locator('form[data-table=tags] tr[data-row]:has-text("team")').count()) === 1, 'add tag');
// stop / start from the list
await t.go('/rds');
t.ok((await p.locator(`form[data-table=instances] tr[data-row]:has-text("${db}")`).innerText()).toLowerCase().includes('available'), 'list shows available');
await p.locator(`form[data-table=instances] tr[data-row]:has-text("${db}") [data-row-select]`).check();
await p.click('form[data-table=instances] button:has-text("Stop")');
await p.waitForSelector('#confirm-dialog[open]');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await p.locator(`form[data-table=instances] tr[data-row]:has-text("${db}")`).innerText()).toLowerCase().includes('stopped'), 'stop: ' + await t.flash());
await p.locator(`form[data-table=instances] tr[data-row]:has-text("${db}") [data-row-select]`).check();
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('form[data-table=instances] button:has-text("Start")')]);
t.ok((await p.locator(`form[data-table=instances] tr[data-row]:has-text("${db}")`).innerText()).toLowerCase().includes('available'), 'start: ' + await t.flash());

// ---- snapshot + restore
await t.go('/rds/snapshots');
await p.selectOption('#instance', db); await p.fill('#snapshotId', snap);
await t.submit('button:has-text("Take snapshot")');
t.ok((await t.flash()).includes('created') && (await p.locator(`tr[data-row]:has-text("${snap}")`).count()) === 1, 'snapshot created: ' + await t.flash());
await p.selectOption('#snapshot', snap); await p.fill('#newId', db2);
await t.submit('button:has-text("Restore snapshot")');
t.ok(p.url().endsWith(`/rds/${db2}`) && (await t.flash()).includes('Restoring'), 'restore: ' + await t.flash());
await t.go('/rds/snapshots');
await t.confirmAction(snap, 'Delete', 'delete');
t.ok((await p.locator(`tr[data-row]:has-text("${snap}")`).count()) === 0, 'snapshot deleted');

// ---- cluster
await t.go('/rds/create?type=cluster');
await p.fill('#identifier', cl); await p.fill('#username', 'admin'); await p.fill('#password', 'supersecret1');
await t.submit('button:has-text("Create database")');
t.ok(p.url().includes(`/rds/${cl}`) && (await p.innerText('main')).includes('Writer endpoint'), 'cluster created: ' + await t.flash());
await t.go('/rds');
t.ok((await p.locator(`form[data-table=clusters] tr[data-row]:has-text("${cl}")`).count()) === 1, 'cluster listed');
await p.locator(`form[data-table=clusters] tr[data-row]:has-text("${cl}") [data-row-select]`).check();
await p.click('form[data-table=clusters] button:has-text("Delete")');
await p.waitForSelector('#confirm-dialog[open]'); await p.fill('[data-cd-input]', 'delete');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await p.locator(`form[data-table=clusters] tr[data-row]:has-text("${cl}")`).count()) === 0, 'cluster deleted');

// ---- subnet group
await t.go('/rds/subnet-groups');
await p.fill('#name', sg); await p.fill('#description', 'e2e group');
await p.locator('input[name=subnet]').first().check();
await t.submit('button:has-text("Create subnet group")');
t.ok((await t.flash()).includes('created') && (await p.locator(`tr[data-row]:has-text("${sg}")`).count()) === 1, 'subnet group created: ' + await t.flash());
await t.confirmAction(sg, 'Delete', 'delete');
t.ok((await p.locator(`tr[data-row]:has-text("${sg}")`).count()) === 0, 'subnet group deleted');

// ---- parameter group
await t.go('/rds/parameter-groups');
await p.fill('#name', pg); await p.fill('#description', 'e2e params'); await p.selectOption('#family', 'postgres15');
await t.submit('button:has-text("Create parameter group")');
t.ok((await p.locator(`tr[data-row]:has-text("${pg}")`).count()) === 1, 'parameter group created: ' + await t.flash());
await t.confirmAction(pg, 'Delete', 'delete');
t.ok((await p.locator(`tr[data-row]:has-text("${pg}")`).count()) === 0, 'parameter group deleted');

// ---- delete instances
await t.go('/rds');
await t.confirmAction(db2, 'Delete', 'delete');
t.ok((await p.locator(`form[data-table=instances] tr[data-row]:has-text("${db2}")`).count()) === 0, 'restored instance deleted');
await t.go(`/rds/${db}?tab=configuration`);
await p.click('button:has-text("Delete DB instance")');
await p.waitForSelector('#confirm-dialog[open]'); await p.fill('[data-cd-input]', 'delete');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok(p.url().endsWith('/rds') && (await p.locator(`form[data-table=instances] tr[data-row]:has-text("${db}")`).count()) === 0, 'instance deleted from detail page: ' + await t.flash());
await t.done();

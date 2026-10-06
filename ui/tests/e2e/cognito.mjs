import { start } from './lib.mjs';
const t = await start(); const { p } = t;
const sfx = Date.now().toString(36);
const pool = `e2e-pool-${sfx}`;
const user = `alice${sfx}`;
const text = async () => (await p.innerText('main')).replace(/\s+/g, ' ');

// ---- create pool
await t.go('/cognito-idp/create');
await p.fill('#name', pool); await p.fill('#minlen', '10'); await p.check('input[name=symbols]');
await t.submit('button:has-text("Create user pool")');
t.ok((await t.flash()).includes('created successfully'), 'pool created: ' + await t.flash());
const poolUrl = p.url().split('?')[0];
const poolId = decodeURIComponent(poolUrl.split('/').pop());
t.ok(poolId.startsWith('us-east-1_'), 'redirected to pool detail ' + poolId);
await t.go('/cognito-idp');
t.ok((await p.locator(`tr[data-row]:has-text("${pool}")`).count()) === 1, 'pool listed');

// ---- users
await t.go(`${new URL(poolUrl).pathname}?tab=users`);
await p.fill('#username', user); await p.fill('#email', `${user}@example.com`); await p.fill('#temp', 'Temp#Pass1234');
await t.submit('button:has-text("Create user")');
t.ok((await t.flash()).includes(`User ${user} created`), 'user created: ' + await t.flash());
t.ok((await p.locator(`tr[data-row]:has-text("${user}")`).count()) === 1, 'user listed');
t.ok((await text()).includes('FORCE_CHANGE_PASSWORD'), 'user in force-change-password status');
await p.locator(`tr[data-row]:has-text("${user}") [data-row-select]`).check();
await t.submit('form[data-table] button:has-text("Confirm")');
t.ok((await t.flash()).includes('Confirmed 1 user'), 'confirm: ' + await t.flash());
t.ok((await text()).includes('CONFIRMED'), 'status now CONFIRMED');
await t.confirmAction(user, 'Disable');
t.ok((await t.flash()).includes('Disabled 1 user'), 'disable');
t.ok((await p.locator(`tr[data-row]:has-text("${user}")`).innerText()).includes('Disabled'), 'row shows Disabled');
await p.locator(`tr[data-row]:has-text("${user}") [data-row-select]`).check();
await t.submit('form[data-table] button:has-text("Enable")');
t.ok((await t.flash()).includes('Enabled 1 user'), 'enable');
await p.selectOption('#pwuser', { index: 0 }); await p.fill('#password', 'Perm#Pass12345');
await t.submit('form:not([data-table]) button:has-text("Set password")');
t.ok((await t.flash()).includes('Permanent password set'), 'set permanent password: ' + await t.flash());
await t.confirmAction(user, 'Reset password');
const rf = await t.flash();
t.ok(rf.includes('Password reset requested') || rf.includes('Request failed') || (await text()).includes('Cannot reset'), 'reset password handled gracefully: ' + rf);

// ---- groups
await t.go(`${new URL(poolUrl).pathname}?tab=groups`);
await p.fill('#gname', 'admins'); await p.fill('#gdesc', 'Administrators');
await t.submit('button:has-text("Create group")');
t.ok((await t.flash()).includes('Group admins created'), 'group created: ' + await t.flash() + (await text()).slice(0, 300));
await p.click('a:has-text("admins")'); await p.waitForLoadState('load');
t.ok(p.url().includes('group=admins'), 'group members view');
await p.selectOption('#addm', { index: 0 });
await t.submit('button:has-text("Add user")');
t.ok((await t.flash()).includes('User added to group'), 'member added: ' + await t.flash());
t.ok((await p.locator(`form[data-table=members] tr[data-row]:has-text("${user}")`).count()) === 1, 'member listed');
await p.locator('form[data-table=members] tr[data-row] [data-row-select]').first().check();
await p.click('form[data-table=members] button:has-text("Remove users")');
await p.waitForSelector('#confirm-dialog[open]');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await t.flash()).includes('Removed 1 user'), 'member removed: ' + await t.flash());
await p.locator('form[data-table=groups] tr[data-row]:has-text("admins") [data-row-select]').check();
await p.click('form[data-table=groups] button:has-text("Delete")');
await p.waitForSelector('#confirm-dialog[open]');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await t.flash()).includes('Deleted 1 group'), 'group deleted');

// ---- app clients
await t.go(`${new URL(poolUrl).pathname}?tab=clients`);
await p.fill('#cname', 'web-client'); await p.check('input[name=secret]');
await t.submit('button:has-text("Create app client")');
const cf = await t.flash();
t.ok(cf.includes('App client web-client created') && /Client ID: \w+/.test(cf), 'client created: ' + cf);
const row = p.locator('tr[data-row]:has-text("web-client")');
t.ok((await row.count()) === 1 && (await row.innerText()).includes('Show secret'), 'client listed with secret');
await t.confirmAction('web-client', 'Delete');
t.ok((await t.flash()).includes('Deleted 1 app client'), 'client deleted');

// ---- properties + delete user + pool
await t.go(`${new URL(poolUrl).pathname}?tab=properties`);
const pt = await text();
t.ok(pt.includes(poolId) && pt.includes('Minimum length 10') && pt.includes('special characters'), 'properties show password policy');
await t.go(`${new URL(poolUrl).pathname}?tab=users`);
await t.confirmAction(user, 'Delete');
t.ok((await t.flash()).includes('Deleted 1 user'), 'user deleted');
await t.go('/cognito-idp'); await t.confirmAction(pool, 'Delete', 'delete');
t.ok((await t.flash()).includes('Deleted 1 user pool') && (await p.locator(`tr[data-row]:has-text("${pool}")`).count()) === 0, 'pool deleted');
await t.go('/cognito-idp/us-east-1_doesnotexist');
t.ok((await p.innerText('body')).includes('does not exist'), 'unknown pool 404 page');
await t.done();

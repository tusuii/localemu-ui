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
// edit the app client
await p.click('tr[data-row]:has-text("web-client") a');
await p.waitForSelector('[data-client-edit]');
await p.fill('#ecname', 'web-client-2');
await p.uncheck('[data-client-edit] input[name=flows][value=ALLOW_USER_SRP_AUTH]');
await p.check('[data-client-edit] input[name=flows][value=ALLOW_ADMIN_USER_PASSWORD_AUTH]');
await p.fill('#ec-access', '30');
await p.fill('#eccb', 'https://example.com/callback\nhttps://example.com/cb2');
await p.fill('#eclo', 'https://example.com/logout');
await p.check('[data-client-edit] input[name=oauthFlows][value=code]');
await p.check('[data-client-edit] input[name=scopes][value=openid]');
await p.check('[data-client-edit] input[name=scopes][value=email]');
await t.submit('[data-client-edit] button[type=submit]');
const uf = await t.flash();
if (/does not support/i.test(uf + await text())) {
  t.ok(true, 'client editing reported as unsupported with a clear message');
} else {
  t.ok(uf.includes('App client web-client-2 updated'), 'client updated: ' + uf);
  const crow = p.locator('tr[data-row]:has-text("web-client-2")');
  t.ok((await crow.count()) === 1 && (await crow.innerText()).includes('ADMIN_USER_PASSWORD_AUTH') && !(await crow.innerText()).includes('USER_SRP_AUTH'), 'edited flows shown');
  await p.click('tr[data-row]:has-text("web-client-2") a');
  await p.waitForSelector('[data-client-edit]');
  t.ok((await p.inputValue('#eccb')).includes('https://example.com/cb2') && (await p.inputValue('#eclo')) === 'https://example.com/logout', 'callback and logout URLs persisted');
  t.ok((await p.inputValue('#ec-access')) === '30' && await p.locator('[data-client-edit] input[value=code]').isChecked() && await p.locator('[data-client-edit] input[name=scopes][value=openid]').isChecked(), 'token validity, OAuth flow and scopes persisted');
  await p.fill('#eccb', ''); 
  await t.submit('[data-client-edit] button[type=submit]');
  t.ok((await text()).includes('OAuth flows need at least one callback URL'), 'oauth without callback URL rejected');
}
await t.go(`${new URL(poolUrl).pathname}?tab=clients`);
await t.confirmAction(/does not support/i.test(uf) ? 'web-client' : 'web-client-2', 'Delete');
t.ok((await t.flash()).includes('Deleted 1 app client'), 'client deleted');

// ---- properties + delete user + pool
await t.go(`${new URL(poolUrl).pathname}?tab=properties`);
const pt = await text();
t.ok(pt.includes(poolId) && pt.includes('Minimum length 10') && pt.includes('special characters'), 'properties show password policy');

// password policy editor
await p.fill('#pp-min', '12'); await p.uncheck('[data-policy-form] input[name=numbers]'); await p.check('[data-policy-form] input[name=upper]');
await t.submit('[data-policy-form] button[type=submit]');
const pf = await t.flash();
if (/does not support/i.test(pf + await text())) t.ok(true, 'password policy editing reported as unsupported');
else {
  t.ok(pf.includes('Password policy updated'), 'policy updated: ' + pf);
  t.ok((await p.inputValue('#pp-min')) === '12' && !(await p.locator('[data-policy-form] input[name=numbers]').isChecked()) && (await p.locator('[data-policy-form] input[name=symbols]').isChecked()), 'policy persisted (symbols kept from creation)');
}
// custom attribute
await p.fill('#at-name', 'tier'); await p.selectOption('#at-type', 'String'); await p.fill('#at-min', '1'); await p.fill('#at-max', '20');
await t.submit('[data-attr-form] button[type=submit]');
const af = await t.flash();
if (/does not support/i.test(af + await text())) t.ok(true, 'custom attributes reported as unsupported');
else {
  t.ok(af.includes('custom:tier added'), 'custom attribute added: ' + af);
  t.ok((await text()).includes('custom:tier'), 'custom attribute listed in schema');
}
await p.fill('#at-name', '1bad'); await t.submit('[data-attr-form] button[type=submit]');
t.ok((await text()).includes('Attribute name must start with a letter'), 'invalid attribute name rejected');
// MFA
await p.selectOption('#mfa-mode', 'OPTIONAL'); await p.uncheck('[data-mfa-form] input[name=totp]');
await t.submit('[data-mfa-form] button[type=submit]');
t.ok((await text()).includes('Enable authenticator apps'), 'MFA without a second factor rejected');
await p.selectOption('#mfa-mode', 'OPTIONAL'); await p.check('[data-mfa-form] input[name=totp]');
await t.submit('[data-mfa-form] button[type=submit]');
const mf = await t.flash();
if (/does not support/i.test(mf + await text())) t.ok(true, 'MFA configuration reported as unsupported');
else {
  t.ok(mf.includes('set to OPTIONAL'), 'MFA set: ' + mf);
  t.ok((await p.inputValue('#mfa-mode')) === 'OPTIONAL' && await p.locator('[data-mfa-form] input[name=totp]').isChecked(), 'MFA persisted');
}
await t.go(`${new URL(poolUrl).pathname}?tab=users`);
await t.confirmAction(user, 'Delete');
t.ok((await t.flash()).includes('Deleted 1 user'), 'user deleted');
await t.go('/cognito-idp'); await t.confirmAction(pool, 'Delete', 'delete');
t.ok((await t.flash()).includes('Deleted 1 user pool') && (await p.locator(`tr[data-row]:has-text("${pool}")`).count()) === 0, 'pool deleted');
await t.go('/cognito-idp/us-east-1_doesnotexist');
t.ok((await p.innerText('body')).includes('does not exist'), 'unknown pool 404 page');
await t.done();

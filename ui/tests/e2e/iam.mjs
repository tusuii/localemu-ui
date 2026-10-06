import { start } from './lib.mjs';
const t = await start(); const { p } = t;
// policy
await t.go('/iam/policies/create');
await p.fill('#name', 'ui-read-s3');
await t.submit('button:has-text("Create policy")');
t.ok(p.url().includes('/iam/policies/detail?arn='), 'policy created: ' + await t.flash());
const polUrl = p.url();
// new version
const doc = JSON.parse(await p.inputValue('textarea[name=document]')); doc.Statement[0].Action = ['s3:GetObject', 's3:ListBucket'];
await p.fill('textarea[name=document]', JSON.stringify(doc)); await t.submit('button:has-text("Save as new version")');
t.ok((await t.flash()).includes('New policy version'), 'policy new version');
// role
await t.go('/iam/roles/create');
await p.fill('#name', 'ui-role');
t.ok((await p.inputValue('#trust')).includes('lambda.amazonaws.com'), 'trust preset default lambda');
await p.selectOption('[data-trust-preset]', 'ec2.amazonaws.com');
t.ok((await p.inputValue('#trust')).includes('ec2.amazonaws.com'), 'trust preset switches doc');
await t.submit('button:has-text("Create role")');
t.ok(p.url().endsWith('/iam/roles/ui-role'), 'role created');
const arnOfPolicy = decodeURIComponent(new URL(polUrl).searchParams.get('arn'));
await p.fill('input[name=arn][list]', 'ui-read-s3');   // attach by NAME
await t.submit('button:has-text("Attach")');
t.ok((await t.flash()).includes('Attached ui-read-s3'), 'attach by policy name: ' + await t.flash());
t.ok((await p.innerText('main')).includes(arnOfPolicy), 'attached policy listed');
// inline policy
await p.click('summary:has-text("Add inline policy")');
await p.fill('#ip-name', 'inline-1'); await t.submit('button:has-text("Create policy")');
t.ok((await t.flash()).includes('Saved inline policy inline-1'), 'inline policy: ' + await t.flash());
await t.go('/iam/roles/ui-role?tab=trust');
t.ok((await p.inputValue('textarea[name=trust]')).includes('ec2.amazonaws.com'), 'trust policy decoded to JSON');
// user + group + keys
await t.go('/iam/users/create'); await p.fill('#name', 'ui-user'); await t.submit('button:has-text("Create user")');
await t.go('/iam/groups'); await p.fill('#gname', 'ui-group'); await t.submit('button:has-text("Create group")');
t.ok(p.url().endsWith('/iam/groups/ui-group'), 'group created');
await p.selectOption('select[name=user]', 'ui-user'); await t.submit('button:has-text("Add user")');
t.ok((await p.innerText('main')).includes('ui-user'), 'user added to group');
await t.go('/iam/users/ui-user?tab=credentials');
await t.submit('button:has-text("Create access key")');
t.ok((await p.innerText('main')).includes('Save your new access key now') && /Access key ID:\s*[A-Z0-9]{20}/.test(await p.innerText('main')), 'access key shown once');
await t.go('/iam/users/ui-user?tab=credentials');
t.ok((await p.locator('tbody tr').count()) === 1, 'access key listed');
await p.click('button:has-text("Deactivate")'); await p.waitForLoadState('load');
t.ok((await t.flash()).includes('deactivated'), 'key deactivated');
await t.go('/iam/users/ui-user?tab=groups'); t.ok((await p.innerText('main')).includes('ui-group'), 'user group membership listed');
await t.go('/iam');
t.ok((await p.innerText('main')).includes('Users'), 'iam dashboard');
// cleanup via UI (cascade deletes)
await t.go('/iam/users'); await t.confirmAction('ui-user', 'Delete', 'delete');
t.ok((await p.locator('tr[data-row]:has-text("ui-user")').count()) === 0, 'user cascade-deleted');
await t.go('/iam/groups'); await t.confirmAction('ui-group', 'Delete', null);
t.ok((await p.locator('tr[data-row]:has-text("ui-group")').count()) === 0, 'group deleted');
await t.go('/iam/roles'); await t.confirmAction('ui-role', 'Delete', 'delete');
t.ok((await p.locator('tr[data-row]:has-text("ui-role")').count()) === 0, 'role cascade-deleted');
await p.goto(polUrl); await p.click('button:has-text("Delete")'); await p.fill('[data-cd-input]', 'delete');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok(p.url().endsWith('/iam/policies'), 'policy deleted');
await t.done();

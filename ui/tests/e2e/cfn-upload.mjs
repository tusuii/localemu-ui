import { start } from './lib.mjs';
const t = await start(); const { p } = t;
const S = 'upl' + Date.now().toString(36);
const tpl = (extra = '') => JSON.stringify({
  Parameters: { Env: { Type: 'String', Default: 'dev' } },
  Resources: { Q1: { Type: 'AWS::SQS::Queue' }, ...(extra ? { [extra]: { Type: 'AWS::SQS::Queue' } } : {}) },
});
try {
  // create from an uploaded file
  await t.go('/cloudformation/create');
  await p.fill('#name', S);
  await p.setInputFiles('#templateFile', { name: 't.json', mimeType: 'application/json', buffer: Buffer.from(tpl()) });
  await p.waitForFunction(() => document.querySelector('#template').value.includes('Q1'));
  t.ok(true, 'uploaded file is previewed in the textarea');
  // validate (no stack created)
  await p.click('button:has-text("Validate template")'); await p.waitForLoadState('load');
  t.ok((await p.innerText('main')).includes('Template is valid') && (await p.innerText('main')).includes('Env'), 'validate shows parameters');
  await p.fill('#template', 'Resources: [');
  await p.click('button:has-text("Validate template")'); await p.waitForLoadState('load');
  t.ok((await p.locator('.flash-error').count()) >= 1, 'invalid template reports an error');
  // create using the file only (textarea cleared)
  await p.fill('#template', '');
  await p.setInputFiles('#templateFile', { name: 't.json', mimeType: 'application/json', buffer: Buffer.from(tpl()) });
  await p.fill('#template', '');
  await t.submit('button:has-text("Create stack")');
  t.ok(p.url().endsWith('/cloudformation/' + S), 'stack created from upload: ' + await t.flash());
  await p.waitForTimeout(3000);
  await t.go(`/cloudformation/${S}?tab=resources`);
  t.ok((await p.innerText('main')).includes('Q1'), 'resource from uploaded template exists');

  // change set: preview adding Q2
  await t.go(`/cloudformation/${S}?tab=changesets`);
  await p.fill('#csName', 'add-q2');
  await p.setInputFiles('#templateFile', { name: 't2.json', mimeType: 'application/json', buffer: Buffer.from(tpl('Q2')) });
  await t.submit('button:has-text("Create change set")');
  await p.waitForTimeout(1500); await t.go(`/cloudformation/${S}?tab=changesets&cs=add-q2`);
  t.ok((await p.innerText('main')).includes('Changes in add-q2') && (await p.innerText('main')).includes('Q2'), 'change set shows Q2 addition');
  await p.click('button:has-text("Execute")'); await p.waitForLoadState('load');
  t.ok(p.url().includes('tab=events'), 'change set executed: ' + await t.flash());
  await p.waitForTimeout(3000);
  await t.go(`/cloudformation/${S}?tab=resources`);
  t.ok((await p.innerText('main')).includes('Q2'), 'executed change set created Q2');

  // update via upload (drop Q2 again)
  await t.go(`/cloudformation/${S}?tab=template`);
  await p.setInputFiles('#templateFile', { name: 't3.json', mimeType: 'application/json', buffer: Buffer.from(tpl()) });
  await p.fill('#template', '');
  await t.submit('button:has-text("Update stack")');
  t.ok((await t.flash()).includes('Stack update started'), 'update from uploaded file: ' + await t.flash());
  await p.waitForTimeout(3000);

  // template URL must be http(s)
  await t.go('/cloudformation/create');
  await p.fill('#name', S + 'x'); await p.fill('#templateUrl', 'ftp://x/y'); await p.fill('#template', '');
  await t.submit('button:has-text("Create stack")');
  t.ok((await p.locator('.flash-error').innerText()).includes('http'), 'bad template URL rejected');
} finally {
  await t.go('/cloudformation');
  if (await p.locator(`tr[data-row]:has-text("${S}")`).count()) await t.confirmAction(S, 'Delete', 'delete').catch(() => {});
  await t.done();
}

import { start } from './lib.mjs';
const t = await start(); const { p } = t;
const s = Date.now().toString(36);
const cl = `e2e-cl-${s}`, fam = `e2e-fam-${s}`, fam2 = `e2e-json-${s}`, svc = `e2e-svc-${s}`;

// ---- cluster
await t.go('/ecs/create'); await p.fill('#name', cl);
await t.submit('button:has-text("Create cluster")');
t.ok(p.url().endsWith(`/ecs/${cl}`) && (await t.flash()).includes('created successfully'), 'create cluster: ' + await t.flash());

// ---- task definitions: form + JSON
await t.go('/ecs/task-definitions/register');
await p.fill('#family', fam); await p.fill('#image', 'nginx:latest'); await p.fill('#port', '80'); await p.fill('#cmemory', '128');
await t.submit('button:has-text("Register")');
t.ok(p.url().includes(`/ecs/task-definitions/${fam}`) && (await t.flash()).includes('registered'), 'register from form: ' + await t.flash());
let main = await p.innerText('main');
t.ok(main.includes('nginx:latest') && main.includes('80/tcp'), 'task definition detail shows container');
await t.go('/ecs/task-definitions/register');
await p.check('input[name=mode][value=json]');
await p.fill('#json', JSON.stringify({ family: fam2, containerDefinitions: [{ name: 'c', image: 'busybox', memory: 64, essential: true }] }));
await t.submit('button:has-text("Register")');
t.ok((await t.flash()).includes('registered'), 'register from JSON: ' + await t.flash());
await t.go('/ecs/task-definitions');
t.ok((await p.locator(`tr[data-row]:has-text("${fam}")`).count()) === 1, 'family listed');

// ---- service on the cluster
await t.go(`/ecs/${cl}`);
await p.fill('#serviceName', svc); await p.selectOption('#taskDefinition', { label: `${fam}:1` }); await p.fill('#desired', '2');
await t.submit('button:has-text("Create service")');
t.ok((await t.flash()).includes('created'), 'create service: ' + await t.flash());
t.ok((await p.locator(`form[data-table=services] tr[data-row]:has-text("${svc}")`).count()) === 1, 'service listed');
await p.selectOption('#service', svc); await p.fill('#u-desired', '3');
await t.submit('button:has-text("Update service")');
t.ok((await t.flash()).includes('updated'), 'update service: ' + await t.flash());
t.ok((await p.locator(`form[data-table=services] tr[data-row]:has-text("${svc}")`).innerText()).includes('3'), 'desired count updated');
// service detail: deployments, events, tags
await t.go(`/ecs/${cl}`);
await p.click(`form[data-table=services] tr[data-row]:has-text("${svc}") a:has-text("${svc}")`);
await p.waitForLoadState('load');
t.ok(p.url().endsWith(`/ecs/${cl}/services/${svc}`), 'service name links to detail');
let sm = await p.innerText('main');
t.ok(sm.includes(svc) && sm.includes('Deployments') && sm.includes('PRIMARY'), 'service detail lists the primary deployment');
await t.go(`/ecs/${cl}/services/${svc}?tab=events`);
t.ok((await p.locator('form[data-table=events]').count()) === 1, 'service events tab renders');
await t.go(`/ecs/${cl}/services/${svc}?tab=tags`);
await p.fill('#tags-key', 'svc-tag'); await p.fill('#tags-value', 'v1'); await t.submit('button:has-text("Add tag")');
t.ok((await t.flash()).includes('Tag added') && (await p.locator('form[data-table=tags] tr[data-row]:has-text("svc-tag")').count()) === 1, 'add tag svc-tag: ' + await t.flash());
await t.confirmAction('svc-tag', 'Remove', null);
t.ok((await t.flash()).includes('Removed 1 tag') && (await p.locator('form[data-table=tags] tr[data-row]:has-text("svc-tag")').count()) === 0, 'remove tag svc-tag: ' + await t.flash());
await t.go(`/ecs/${cl}`);
await t.confirmAction(svc, 'Delete', 'delete');
t.ok((await p.locator(`form[data-table=services] tr[data-row]:has-text("${svc}")`).count()) === 0, 'service deleted');

// ---- run + stop a Fargate task
await t.go(`/ecs/task-definitions/register`);
const far = `e2e-far-${s}`;
await p.fill('#family', far); await p.selectOption('#compat', 'FARGATE'); await p.fill('#image', 'nginx');
await t.submit('button:has-text("Register")');
t.ok((await t.flash()).includes('registered'), 'register fargate td: ' + await t.flash());
await t.go(`/ecs/${cl}?tab=tasks`);
await p.selectOption('#r-td', { label: `${far}:1` }); await p.selectOption('#r-launch', 'FARGATE');
await t.submit('button:has-text("Run task")');
t.ok((await t.flash()).includes('Started 1'), 'run task: ' + await t.flash());
t.ok((await p.locator('form[data-table=tasks] tr[data-row]').count()) === 1, 'task listed');
await p.locator('form[data-table=tasks] tr[data-row] [data-row-select]').first().check();
await p.click('form[data-table=tasks] button:has-text("Stop")');
await p.waitForSelector('#confirm-dialog[open]');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await t.flash()).includes('Stopped 1'), 'stop task: ' + await t.flash());
await t.go(`/ecs/${cl}?tab=infrastructure`);
t.ok((await p.innerText('main')).includes('No container instances'), 'infrastructure tab empty state');

await t.go(`/ecs/${cl}?tab=tags`);
await p.fill('#tags-key', 'cl-tag'); await p.fill('#tags-value', 'v1'); await t.submit('button:has-text("Add tag")');
t.ok((await t.flash()).includes('Tag added') && (await p.locator('form[data-table=tags] tr[data-row]:has-text("cl-tag")').count()) === 1, 'add tag cl-tag: ' + await t.flash());
await t.confirmAction('cl-tag', 'Remove', null);
t.ok((await t.flash()).includes('Removed 1 tag') && (await p.locator('form[data-table=tags] tr[data-row]:has-text("cl-tag")').count()) === 0, 'remove tag cl-tag: ' + await t.flash());
await t.go(`/ecs/task-definitions/${fam}:1`);
await p.fill('#tags-key', 'td-tag'); await p.fill('#tags-value', 'v1'); await t.submit('button:has-text("Add tag")');
t.ok((await t.flash()).includes('Tag added') && (await p.locator('form[data-table=tags] tr[data-row]:has-text("td-tag")').count()) === 1, 'add tag td-tag: ' + await t.flash());
await t.confirmAction('td-tag', 'Remove', null);
t.ok((await t.flash()).includes('Removed 1 tag') && (await p.locator('form[data-table=tags] tr[data-row]:has-text("td-tag")').count()) === 0, 'remove tag td-tag: ' + await t.flash());

// ---- cleanup
for (const f of [fam, fam2, far]) {
  await t.go('/ecs/task-definitions');
  await t.confirmAction(`${f}`, 'Deregister', null);
}
t.ok((await p.locator(`tr[data-row]:has-text("${fam}")`).count()) === 0, 'task definition deregistered');
await t.go('/ecs');
t.ok((await p.locator(`tr[data-row]:has-text("${cl}")`).count()) === 1, 'cluster listed');
await t.confirmAction(cl, 'Delete', 'delete');
t.ok((await p.locator(`tr[data-row]:has-text("${cl}")`).count()) === 0, 'cluster deleted: ' + await t.flash());
await t.done();

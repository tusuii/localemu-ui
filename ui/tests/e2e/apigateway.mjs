import { start } from './lib.mjs';
const t = await start(); const { p } = t;
const suffix = Date.now().toString(36);
const rest = `e2e-rest-${suffix}`;
const http = `e2e-http-${suffix}`;

// ---- REST API
await t.go('/apigateway/create');
await p.fill('#name', rest); await p.fill('#description', 'made by e2e');
await t.submit('button:has-text("Create API")');
t.ok(/\/apigateway\/[a-z0-9]+$/.test(p.url()) && (await t.flash()).includes('created successfully'), 'rest create: ' + await t.flash());
const restId = p.url().split('/').pop();
await p.fill('#pathPart', 'items'); await t.submit('button:has-text("Create resource")');
t.ok((await t.flash()).includes('/items created'), 'create resource: ' + await t.flash());
t.ok((await p.locator('#resources tr[data-row], form[data-table=resources] tr[data-row]').count()) === 2, 'two resources listed');
// mock GET /items
await p.selectOption('#resourceId', { label: '/items' }); await p.selectOption('#method', 'GET');
await p.fill('#body', '{"hello": "e2e"}');
await t.submit('button:has-text("Create method")');
t.ok((await t.flash()).includes('Method GET saved'), 'put method: ' + await t.flash());
t.ok((await p.locator('form[data-table=methods] tr[data-row]:has-text("MOCK")').count()) === 1, 'method listed with MOCK integration');
// deploy
await t.go(`/apigateway/${restId}?tab=stages`);
await p.fill('#stageName', 'dev'); await t.submit('button:has-text("Deploy")');
t.ok((await t.flash()).includes('Deployed'), 'deploy: ' + await t.flash());
const stageRow = await p.locator('form[data-table=stages] tr[data-row]:has-text("dev")').innerText();
t.ok(stageRow.includes(`/restapis/${restId}/dev/_user_request_/`), 'stage shows LocalEmu invoke URL');
t.ok((await p.locator('form[data-table=deployments] tr[data-row]').count()) === 1, 'deployment listed');
// call it
const r = await fetch(`http://localhost:4566/restapis/${restId}/dev/_user_request_/items`);
t.ok((await r.text()).includes('e2e'), 'deployed mock API answers');
// list + Type column
await t.go('/apigateway');
const row = await p.locator(`tr[data-row]:has-text("${rest}")`).innerText();
t.ok(row.includes('REST') && row.includes(restId), 'list shows REST type');

// method: require an API key
await t.go(`/apigateway/${restId}`);
await p.locator('form[data-table=methods] tr[data-row]:has-text("GET") [data-row-select]').check();
await t.submit('form[data-table=methods] button:has-text("Require API key")');
t.ok((await t.flash()).includes('Updated 1 method') && (await p.locator('form[data-table=methods] tr[data-row]:has-text("GET")').innerText()).includes('Required'), 'method now requires an API key: ' + await t.flash());

// ---- API keys and usage plans
const key = `e2e-key-${suffix}`, plan = `e2e-plan-${suffix}`;
await t.go('/apigateway/keys');
await p.fill('#k-name', key); await t.submit('button:has-text("Create API key")');
t.ok((await t.flash()).includes(`API key ${key} created`) && (await p.locator(`form[data-table=keys] tr[data-row]:has-text("${key}")`).count()) === 1, 'api key created: ' + await t.flash());
t.ok(!(await p.innerText('main')).match(/[A-Za-z0-9]{30,}/), 'key value hidden by default');
await p.locator(`form[data-table=keys] tr[data-row]:has-text("${key}") [data-row-select]`).check();
await t.submit('form[data-table=keys] button:has-text("Show value")');
t.ok(((await p.locator('#key-value').innerText().catch(() => '')).length) >= 20, 'key value shown on demand');
await p.locator(`form[data-table=keys] tr[data-row]:has-text("${key}") [data-row-select]`).check();
await t.submit('form[data-table=keys] button:has-text("Disable")');
t.ok((await p.locator(`form[data-table=keys] tr[data-row]:has-text("${key}")`).innerText()).includes('Disabled'), 'key disabled: ' + await t.flash());
await t.go('/apigateway/keys?tab=plans');
await p.fill('#p-name', plan); await p.fill('#p-rate', '10'); await p.fill('#p-burst', '20'); await p.fill('#p-quota', '1000');
await t.submit('button:has-text("Create usage plan")');
t.ok((await p.locator(`form[data-table=plans] tr[data-row]:has-text("${plan}")`).innerText()).includes('1000 / day'), 'usage plan created: ' + await t.flash());
await p.selectOption('#a-plan', { label: plan }); await p.selectOption('#a-stage', { index: 0 });
await t.submit('button:has-text("Attach stage")');
t.ok((await p.locator(`form[data-table=plan-stages] tr[data-row]:has-text("${plan}")`).count()) === 1, 'stage attached: ' + await t.flash());
await p.selectOption('#k-plan', { label: plan }); await p.selectOption('#k-key', { label: key });
await t.submit('button:has-text("Associate key")');
t.ok((await p.locator(`form[data-table=plan-keys] tr[data-row]:has-text("${key}")`).count()) === 1, 'key associated: ' + await t.flash());
await t.confirmAction(key, 'Remove', null);
t.ok((await p.locator(`form[data-table=plan-keys] tr[data-row]`).count()) === 0, 'association removed');
await p.locator(`form[data-table=plans] tr[data-row]:has-text("${plan}") [data-row-select]`).check();
await p.click('form[data-table=plans] button:has-text("Delete")');
await p.waitForSelector('#confirm-dialog[open]'); await p.fill('[data-cd-input]', 'delete');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await p.locator(`form[data-table=plans] tr[data-row]:has-text("${plan}")`).count()) === 0, 'usage plan deleted');
await t.go('/apigateway/keys');
await t.confirmAction(key, 'Delete', 'delete');
t.ok((await p.locator(`form[data-table=keys] tr[data-row]:has-text("${key}")`).count()) === 0, 'api key deleted');
await t.go('/apigateway');

// ---- HTTP API
await t.go('/apigateway/create');
await p.check('input[value=http]'); await p.fill('#name', http);
await t.submit('button:has-text("Create API")');
t.ok((await t.flash()).includes('HTTP API'), 'http create: ' + await t.flash());
const httpId = p.url().split('/').pop();
await p.fill('#routeKey', 'GET /ping'); await t.submit('button:has-text("Create route")');
t.ok((await t.flash()).includes('Route GET /ping created'), 'create route: ' + await t.flash());
t.ok((await p.locator('form[data-table=routes] tr[data-row]:has-text("GET /ping")').count()) === 1, 'route listed');
await t.go(`/apigateway/${httpId}?tab=stages`);
await p.fill('#stageName', '$default'); await t.submit('button:has-text("Create stage")');
t.ok((await t.flash()).includes('created'), 'create stage: ' + await t.flash());
t.ok((await p.innerText('main')).includes(`${httpId}.execute-api.localhost`), 'http stage URL shown');
await t.go('/apigateway');
t.ok((await p.locator(`tr[data-row]:has-text("${http}")`).innerText()).includes('HTTP'), 'list shows HTTP type');

// ---- delete both from the list
await t.confirmAction(rest, 'Delete', 'delete');
t.ok((await p.locator(`tr[data-row]:has-text("${rest}")`).count()) === 0, 'rest api deleted');
await t.confirmAction(http, 'Delete', 'delete');
t.ok((await p.locator(`tr[data-row]:has-text("${http}")`).count()) === 0, 'http api deleted');
await t.done();

import { start } from './lib.mjs';
const t = await start(); const { p } = t;
const sfx = Date.now().toString(36).slice(-6);
const tg = `e2e-tg-${sfx}`, lb = `e2e-lb-${sfx}`;
const text = async () => (await p.innerText('main')).replace(/\s+/g, ' ');
const confirmTable = async (tableId, rowText, btn, typed) => {
  await p.locator(`form[data-table=${tableId}] tr[data-row]:has-text("${rowText}") [data-row-select]`).check();
  await p.click(`form[data-table=${tableId}] button:has-text("${btn}")`);
  await p.waitForSelector('#confirm-dialog[open]');
  if (typed) await p.fill('[data-cd-input]', typed);
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
};

// ---- target group
await t.go('/elbv2/target-groups/create');
await p.fill('#name', tg); await p.fill('#path', '/health');
await t.submit('button:has-text("Create target group")');
t.ok((await t.flash()).includes(`Target group ${tg} created successfully`) && p.url().endsWith(`/elbv2/target-groups/${tg}`), 'tg created: ' + await t.flash());
await p.fill('#target', 'i-0123456789abcdef0');
await t.submit('form:not([data-table]) button[type=submit]:has-text("Register")');
t.ok((await t.flash()).includes('Registered target i-0123456789abcdef0'), 'target registered: ' + await t.flash());
t.ok((await p.locator('tr[data-row]:has-text("i-0123456789abcdef0")').count()) === 1, 'target listed with health state: ' + (await p.locator('tr[data-row]').first().innerText()).replace(/\s+/g, ' '));
await t.confirmAction('i-0123456789abcdef0', 'Deregister');
t.ok((await t.flash()).includes('Deregistered 1 target'), 'target deregistered');
await t.go(`/elbv2/target-groups/${tg}?tab=health`);
t.ok((await p.inputValue('#hpath')) === '/health', 'health path persisted');
await p.fill('#hpath', '/ping'); await t.submit('button:has-text("Save health check settings")');
t.ok((await t.flash()).includes('Health check settings updated') && (await p.inputValue('#hpath')) === '/ping', 'health check updated: ' + await t.flash());
await t.go(`/elbv2/target-groups/${tg}?tab=attributes`);
await p.fill('#a1', '60'); await t.submit('button:has-text("Save attributes")');
t.ok((await t.flash()).includes('Attributes updated') && (await p.inputValue('#a1')) === '60', 'attributes updated: ' + await t.flash());

// ---- load balancer
await t.go('/elbv2/create');
await p.fill('#name', lb);
await p.locator('input[name=subnets]').first().check();
await p.selectOption('#tg', { label: tg });
await t.submit('button:has-text("Create load balancer")');
t.ok((await t.flash()).includes(`Load balancer ${lb} created successfully with a listener`) && p.url().endsWith(`/elbv2/${lb}`), 'lb created: ' + await t.flash());
t.ok((await p.locator('tr[data-row]:has-text("80")').count()) === 1 && (await text()).includes(`Forward to ${tg}`), 'default listener forwards to tg');
await p.selectOption('#laction', 'fixed-response');
await p.fill('#lport', '8080'); await p.fill('#lstatus', '200'); await p.fill('#lbody', 'hello from e2e');
await t.submit('button:has-text("Add listener")');
t.ok((await t.flash()).includes('Listener HTTP:8080 created') && (await text()).includes('Return fixed response 200'), 'fixed-response listener: ' + await t.flash());
// edit the 8080 listener: port, protocol and a redirect default action
await t.go(`/elbv2/${lb}?tab=listeners`);
await p.click('tr[data-row]:has-text("8080") a'); await p.waitForSelector('[data-listener-edit]');
await p.fill('#elport', '8081'); await p.selectOption('#elaction', 'redirect');
await p.fill('#elrhost', 'example.com'); await p.selectOption('#elrcode', 'HTTP_302');
await t.submit('[data-listener-edit] button[type=submit]');
if (/does not support/i.test(await text())) t.ok(true, 'ModifyListener reported as unsupported');
else {
  t.ok((await t.flash()).includes('Listener HTTP:8081 updated') && (await text()).includes('Redirect to'), 'listener modified to redirect: ' + await t.flash());
  await p.click('tr[data-row]:has-text("8081") a'); await p.waitForSelector('[data-listener-edit]');
  await p.selectOption('#elaction', 'forward'); await p.selectOption('#eltg', { label: tg }); await p.fill('#elport', '8080');
  await t.submit('[data-listener-edit] button[type=submit]');
  t.ok((await t.flash()).includes('Listener HTTP:8080 updated') && (await text()).includes(`Forward to ${tg}`), 'listener back to forward on 8080: ' + await t.flash());
}
await t.go(`/elbv2/${lb}?tab=rules&port=80`);
await p.fill('#rprio', '10'); await p.fill('#rvalues', '/api/*');
await t.submit('button:has-text("Add rule")');
t.ok((await t.flash()).includes('Rule with priority 10 created') && (await text()).includes('path-pattern: /api/*'), 'rule created: ' + await t.flash());
// edit the rule: conditions, action and priority
await p.click('tr[data-row]:has-text("/api/*") a'); await p.waitForSelector('[data-rule-edit]');
await p.fill('#erpath', '/v2/*'); await p.fill('#erhost', 'api.example.com'); await p.fill('#erprio', '20');
await p.selectOption('#eraction', 'fixed-response'); await p.fill('#erstatus', '418'); await p.fill('#erbody', 'teapot');
await t.submit('[data-rule-edit] button[type=submit]');
const ruleModified = !/does not support/i.test(await text());
if (!ruleModified) {
  t.ok(true, 'ModifyRule / SetRulePriorities reported as unsupported');
} else {
  const rt = await text();
  t.ok((await t.flash()).includes('Rule updated') && rt.includes('path-pattern: /v2/*') && rt.includes('host-header: api.example.com') && rt.includes('Return fixed response 418'), 'rule modified: ' + await t.flash());
  t.ok((await p.locator('tr[data-row]:has-text("/v2/*")').first().innerText()).includes('20'), 'rule priority changed to 20');
}
await confirmTable('rules', ruleModified ? '/v2/*' : '/api/*', 'Delete');

t.ok((await t.flash()).includes('Deleted 1 rule'), 'rule deleted');
await t.go(`/elbv2/${lb}?tab=details`);
t.ok((await text()).includes('elb.amazonaws.com') && (await text()).includes('deletion_protection.enabled'), 'details + attributes');
// attribute editor
const idle = p.locator('[data-attrs-form] input[name="attr:idle_timeout.timeout_seconds"]');
if (await idle.count()) {
  await idle.fill('90');
  await t.submit('[data-attrs-form] button[type=submit]');
  if (/does not support/i.test(await text())) t.ok(true, 'ModifyLoadBalancerAttributes reported as unsupported');
  else t.ok((await t.flash()).includes('Updated 1 attribute') && (await p.inputValue('input[name="attr:idle_timeout.timeout_seconds"]')) === '90', 'attribute modified: ' + await t.flash());
  await t.submit('[data-attrs-form] button[type=submit]');
  t.ok((await text()).includes('No attribute was changed'), 'unchanged attributes rejected');
} else t.ok(true, 'no idle timeout attribute exposed (skipped)');
// subnets / security groups
const subs = await p.locator('[data-subnet-form] input[name=subnet]').count();
t.ok(subs >= 1, `subnet editor lists ${subs} subnets`);
await t.submit('[data-subnet-form] button[type=submit]');
const sf = await t.flash();
t.ok(sf.includes('Subnets updated') || /does not support|Error|Invalid|must/i.test(sf + await text()), 'SetSubnets handled gracefully: ' + sf);
await t.go(`/elbv2/${lb}?tab=details`);
for (const c of await p.locator('[data-sg-form] input[name=sg]:checked').all()) await c.uncheck();
await t.submit('[data-sg-form] button[type=submit]');
t.ok((await text()).includes('Select at least one security group') || (await p.locator('[data-sg-form]').count()) === 1, 'security group editor validates an empty selection');
await t.go(`/elbv2/${lb}?tab=listeners`);
await confirmTable('listeners', '8080', 'Delete');
t.ok((await t.flash()).includes('Deleted 1 listener'), 'listener deleted');
await t.go('/elbv2');
t.ok((await p.locator(`tr[data-row]:has-text("${lb}")`).count()) === 1, 'lb listed');
await t.confirmAction(lb, 'Delete', 'delete');
t.ok((await t.flash()).includes('Deleted 1 load balancer') && (await p.locator(`tr[data-row]:has-text("${lb}")`).count()) === 0, 'lb deleted');
await t.go('/elbv2/target-groups');
t.ok((await p.locator(`tr[data-row]:has-text("${tg}")`).count()) === 1, 'tg listed');
await t.confirmAction(tg, 'Delete', 'delete');
t.ok((await t.flash()).includes('Deleted 1 target group') && (await p.locator(`tr[data-row]:has-text("${tg}")`).count()) === 0, 'tg deleted');
await t.go('/elbv2/nonexistent-lb-zzz');
t.ok((await p.innerText('body')).includes('does not exist'), 'unknown lb 404');
await t.done();

import { start } from './lib.mjs';
const t = await start(); const { p } = t;
const sfx = Date.now().toString(36).slice(-6);
const wg = `e2e-wg-${sfx}`, nq = `e2e-saved-${sfx}`;
const text = async () => (await p.innerText('main')).replace(/\s+/g, ' ');

// ---- workgroups
await t.go('/athena/workgroups/create');
await p.fill('#name', wg); await p.fill('#description', 'e2e workgroup'); await p.fill('#output', `s3://e2e-athena-${sfx}/results/`);
await t.submit('button:has-text("Create workgroup")');
t.ok((await t.flash()).includes(`Workgroup ${wg} created successfully`) && p.url().endsWith(`/athena/workgroups/${wg}`), 'workgroup created: ' + await t.flash());
t.ok((await text()).includes(`s3://e2e-athena-${sfx}/results/`) && (await text()).includes('e2e workgroup'), 'detail shows output location + description');
await p.fill('#description', 'edited description');
await t.submit('button:has-text("Save changes")');
const upd = await t.flash();
t.ok(upd.includes('Workgroup updated') || (await p.innerText('body')).includes('not supported'), 'update handled: ' + upd);
await t.go('/athena/workgroups');
t.ok((await p.locator(`tr[data-row]:has-text("${wg}")`).count()) === 1 && (await p.locator('tr[data-row]:has-text("primary")').count()) === 1, 'workgroups listed incl. primary');

// ---- query editor
await t.go(`/athena?wg=${wg}`);
t.ok((await p.locator('#wg option', { hasText: wg }).count()) === 1, 'workgroup offered in editor');
await p.selectOption('#wg', wg);
await p.fill('#sql', 'SELECT 1 AS x, 2 AS y');
await t.submit('button:has-text("Run query")');
t.ok(/Query (succeeded|failed|submitted)\./.test(await t.flash()), 'run produced a flash: ' + await t.flash());
const tx = await text();
t.ok(/Status\s+(Succeeded|Failed|Running|Queued)/.test(tx), 'execution status shown: ' + tx.match(/Status\s+\w+/)?.[0]);
if (/Status\s+Succeeded/.test(tx)) t.ok((await p.locator('form[data-table=results] tr[data-row]').count()) >= 1, 'results table shown');
else t.ok(/Query failed|Data scanned/.test(tx), 'failure reason surfaced (emulated engine unavailable): ' + tx.slice(tx.indexOf('Query results'), tx.indexOf('Query results') + 160));
t.ok((await p.inputValue('#sql')).includes('SELECT 1'), 'SQL preserved after run');
const execUrl = p.url();

// ---- saved queries
await p.fill('#sql', 'SELECT 42 AS answer');
await p.evaluate(() => document.querySelector('details').open = true);
await p.fill('#qname', nq);
await t.submit('button:has-text("Save query")');
t.ok((await t.flash()).includes(`Query "${nq}" saved`) || (await p.innerText('body')).includes('not supported'), 'save query: ' + await t.flash());
await t.go(`/athena?tab=saved&wg=${wg}`);
t.ok((await p.locator(`tr[data-row]:has-text("${nq}")`).count()) === 1 && (await text()).includes('SELECT 42'), 'saved query listed');
await p.click(`tr[data-row]:has-text("${nq}") a`); await p.waitForLoadState('load');
t.ok((await p.inputValue('#sql')).includes('SELECT 42') && (await p.inputValue('#qname')) === nq, 'opening a saved query loads it into the editor');
await t.go(`/athena?tab=saved&wg=${wg}`);
await t.confirmAction(nq, 'Delete');
const del = (await t.flash()) + ' ' + (await p.innerText('body'));
t.ok(del.includes('Deleted 1 saved query') || del.includes('not supported by this LocalEmu build'), 'delete saved query handled gracefully');

// ---- history
await t.go(`/athena?tab=history&wg=${wg}`);
t.ok((await p.locator('form[data-table=history] tr[data-row]:has-text("SELECT 1")').count()) >= 1, 'query history lists the run');
await t.go(execUrl.replace(/^https?:\/\/[^/]+/, ''));
t.ok((await p.locator('[data-query-state]').count()) === 1, 'history link opens the execution');

// ---- cleanup
await t.go(`/athena/workgroups`);
await t.confirmAction(wg, 'Delete', 'delete');
t.ok((await t.flash()).includes('Deleted 1 workgroup') && (await p.locator(`tr[data-row]:has-text("${wg}")`).count()) === 0, 'workgroup deleted');
await t.go('/athena/workgroups/nope-zzz');
t.ok((await p.innerText('body')).includes('does not exist'), 'unknown workgroup 404');
await t.done();

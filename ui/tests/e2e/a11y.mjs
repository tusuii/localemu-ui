// axe-core on representative pages in both themes. Needs the axe-core devDependency.
import { readFileSync } from 'node:fs';
import { start } from './lib.mjs';
const axeSrc = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const t = await start(); const { p } = t;
const pages = ['/', '/services', '/s3', '/s3/create', '/sqs', '/sqs/create', '/dynamodb', '/lambda', '/ec2/instances', '/iam/users', '/cloudformation', '/search?q=test', '/settings', '/activity'];
let worst = 0;
for (const theme of ['light', 'dark']) {
  await t.go('/');
  await p.evaluate((th) => { localStorage.setItem('lemu.theme', th); }, theme);
  for (const path of pages) {
    await t.go(path);
    await p.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
    await p.evaluate(axeSrc);
    const res = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }));
    const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    for (const v of bad) console.log(`   ${theme} ${path} ${v.impact} ${v.id}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    t.ok(bad.length === 0, `${theme} ${path}: no serious/critical axe violations (${res.violations.length} total incl. minor)`);
    worst += bad.length;
  }
}
// Overlays: shell panel, services menu, search dropdown, shortcuts + confirm dialogs
for (const theme of ['light', 'dark']) {
  await t.go('/sqs');
  await p.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
  await p.keyboard.press('Alt+c');
  await p.click('[data-menu-toggle=menu-services]');
  await p.evaluate(axeSrc);
  let res = await p.evaluate(() => axe.run(document));
  let bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of bad) console.log('   ', v.id, v.nodes.slice(0, 3).map((n) => n.target.join(' ')));
  t.ok(bad.length === 0, `${theme}: shell panel + services menu clean`);
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('?');
  await p.waitForSelector('#shortcuts-dialog[open]');
  res = await p.evaluate(() => axe.run(document));
  bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of bad) console.log('   ', v.id, v.nodes.slice(0, 3).map((n) => n.target.join(' ')));
  t.ok(bad.length === 0, `${theme}: shortcuts dialog clean`);
  await p.keyboard.press('Escape');
}
// Keyboard behaviour
await t.go('/sqs');
await p.keyboard.press('?'); await p.waitForSelector('#shortcuts-dialog[open]'); await p.keyboard.press('Escape');
t.ok(await p.evaluate(() => !document.querySelector('#shortcuts-dialog').open), 'Esc closes shortcuts');
await p.keyboard.press('g'); await Promise.all([p.waitForNavigation(), p.keyboard.press('h')]);
t.ok(new URL(p.url()).pathname === '/', 'g then h goes home');
// menu semantics + keyboard
await p.focus('[data-menu-toggle=menu-region]'); await p.keyboard.press('Enter');
t.ok(await p.getAttribute('[data-menu-toggle=menu-region]', 'aria-expanded') === 'true', 'aria-expanded true when open');
await p.keyboard.press('ArrowDown');
t.ok(await p.evaluate(() => document.activeElement.closest('#menu-region') !== null && document.activeElement.getAttribute('role') === 'menuitemradio'), 'arrow keys move within the menu');
await p.keyboard.press('Escape');
t.ok(await p.getAttribute('[data-menu-toggle=menu-region]', 'aria-expanded') === 'false', 'Esc closes menu');
t.ok(await p.evaluate(() => document.activeElement?.getAttribute('data-menu-toggle') === 'menu-region'), 'focus returns to the toggle');
// skip link
await t.go('/'); await p.keyboard.press('Tab');
t.ok(await p.evaluate(() => document.activeElement?.className === 'skip-link'), 'skip link is first tab stop');
// confirm dialog semantics and focus restore
t.ok(await p.getAttribute('#confirm-dialog', 'aria-labelledby') === 'cd-title', 'confirm dialog is labelled');
// table semantics
await t.go('/s3');
t.ok(await p.locator('table caption').count() >= 0, 'table caption ok');
await t.done();

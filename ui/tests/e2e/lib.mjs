import { chromium } from 'playwright-core';

/** Base URL of a running console (dev or production server). */
export const BASE = process.env.BASE ?? 'http://localhost:4321';

/**
 * Tiny browser harness. Chromium comes from CHROMIUM_PATH if set, otherwise
 * from Playwright's own install (`npx playwright-core install chromium`).
 */
export async function start(viewport = { width: 1440, height: 900 }) {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const t = {
    b, p, errs,
    ok(c, m) { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; },
    async flash() { return (await p.locator('[data-flash]').first().innerText().catch(() => '')).replace(/\s+/g, ' '); },
    async go(path) { await p.goto(BASE + path, { waitUntil: 'load' }); },
    async submit(sel) { await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click(sel)]); },
    /** Select a table row by text, click a toolbar button, answer the confirm dialog. */
    async confirmAction(rowText, buttonText, typed) {
      await p.locator(`tr[data-row]:has-text("${rowText}") [data-row-select]`).check();
      await p.click(`form[data-table] button:has-text("${buttonText}")`);
      await p.waitForSelector('#confirm-dialog[open]');
      if (typed) await p.fill('[data-cd-input]', typed);
      await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
    },
    async done() {
      if (errs.length) { console.log('PAGE ERRORS', errs); process.exitCode = 1; }
      await b.close();
    },
  };
  return t;
}

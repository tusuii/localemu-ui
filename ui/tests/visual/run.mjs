// Visual regression: screenshots a fixed set of console pages and compares them
// with the committed baselines in tests/visual/baseline/.
//
//   npm run test:visual                 # compare, write diffs to tests/visual/diff/
//   npm run test:visual -- --update     # regenerate the baselines
//   npm run test:visual -- s3 dark      # only shots whose name contains every word
//
// Needs a running console (BASE, default http://localhost:4321) and LocalEmu
// (LOCALEMU_ENDPOINT, default http://localhost:4566). Chromium comes from
// CHROMIUM_PATH or Playwright's own install. THRESHOLD (0..1, default 0.1) is
// pixelmatch's per-pixel colour tolerance and MAX_DIFF_PIXELS (default 50) the
// number of differing pixels tolerated per screenshot.
import { chromium } from 'playwright-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ACCOUNT, REGION, seed } from './seed.mjs';
import { SHOTS, VIEWPORTS } from './shots.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4321';
const dir = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.join(dir, 'baseline');
const diffDir = path.join(dir, 'diff');
const args = process.argv.slice(2);
const update = args.includes('--update');
const filters = args.filter((a) => !a.startsWith('--'));
const THRESHOLD = Number(process.env.THRESHOLD ?? 0.1);
const MAX_DIFF_PIXELS = Number(process.env.MAX_DIFF_PIXELS ?? 50);

const FREEZE_CSS = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }
  html { scrollbar-width: none; }
  ::-webkit-scrollbar { display: none; }
  [data-vr-mask] { visibility: hidden !important; }
`;

/** Runs in the page: replace values that change from run to run with fixed tokens. */
function normalize() {
  const rules = [
    [/\b[A-Z][a-z]+ \d{1,2}, \d{4}, \d{2}:\d{2}:\d{2} \(UTC[^)]*\)/g, 'January 1, 2000, 00:00:00 (UTC)'],
    [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '2000-01-01 00:00:00Z'],
    [/\b(just now|in the future|\d+ (second|minute|hour|day)s? ago)\b/g, 'a while ago'],
    [/\b\d+d \d+h\b|\b\d+h \d+m\b|\b\d+m \d+s\b/g, '0m 0s'],
    [/\b(i|vpc|sg|subnet|vol|eni|ami|igw|rtb|snap|eipalloc|eipassoc|acl|dopt|key)-[0-9a-f]{6,17}\b/g, (m) => m.replace(/-.*/, '-00000000')],
    [/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, (m) => (/^(0|127)\./.test(m) ? m : '10.0.0.0')],
    [/\bAROA[A-Z0-9]{12,}\b|\bAIDA[A-Z0-9]{12,}\b|\bAKIA[A-Z0-9]{12,}\b/g, 'AROAXXXXXXXXXXXXXXXX'],
  ];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    let v = n.nodeValue;
    for (const [re, to] of rules) v = v.replace(re, to);
    if (v !== n.nodeValue) n.nodeValue = v;
  }
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio])')) {
    for (const [re, to] of rules) if (re.test(el.value)) el.value = el.value.replace(re, to);
  }
}

async function capture(page, shot, viewportName) {
  const vp = VIEWPORTS[viewportName];
  await page.setViewportSize(vp);
  await page.goto(BASE + shot.path, { waitUntil: 'load' });
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle').catch(() => {});
  if (shot.before) await shot.before(page);
  for (const sel of shot.mask ?? []) await page.evaluate((s) => document.querySelectorAll(s).forEach((e) => e.setAttribute('data-vr-mask', '')), sel);
  await page.evaluate(normalize);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  return page.screenshot({ type: 'png', fullPage: false, animations: 'disabled', caret: 'initial' });
}

function compare(name, actual, expected) {
  const a = PNG.sync.read(actual);
  const b = PNG.sync.read(expected);
  if (a.width !== b.width || a.height !== b.height) return { ok: false, why: `size ${a.width}x${a.height} != baseline ${b.width}x${b.height}`, a };
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: THRESHOLD });
  return { ok: n <= MAX_DIFF_PIXELS, why: `${n} pixels differ (allowed ${MAX_DIFF_PIXELS})`, diff, n };
}

const todo = SHOTS.flatMap((s) => s.variants.map((v) => ({ shot: s, ...v, name: `${s.name}-${v.id}` })))
  .filter((t) => filters.every((f) => t.name.includes(f)));
if (!todo.length) { console.error('No screenshots match', filters); process.exit(2); }

console.log(`Seeding account ${ACCOUNT} ...`);
await seed();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
mkdirSync(baseDir, { recursive: true });
if (!update) { rmSync(diffDir, { recursive: true, force: true }); mkdirSync(diffDir, { recursive: true }); }

let failed = 0;
const pageErrors = [];
for (const t of todo) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[t.viewport], deviceScaleFactor: 1, colorScheme: t.theme, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
  await ctx.addCookies([
    { name: 'lemu_account', value: ACCOUNT, url: BASE },
    { name: 'lemu_region', value: REGION, url: BASE },
  ]);
  await ctx.addInitScript((theme) => { try { localStorage.setItem('lemu.theme', theme); localStorage.setItem('lemu.recent', '[]'); } catch {} }, t.theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${t.name}: ${e.message}`));
  let png;
  try { png = await capture(page, t.shot, t.viewport); } catch (e) { console.log(`FAIL ${t.name}: ${e.message.split('\n')[0]}`); failed++; await ctx.close(); continue; }
  await ctx.close();

  const file = path.join(baseDir, `${t.name}.png`);
  if (update) { writeFileSync(file, png); console.log(`WROTE ${t.name} (${(png.length / 1024).toFixed(0)} KB)`); continue; }
  if (!existsSync(file)) {
    writeFileSync(path.join(diffDir, `${t.name}.actual.png`), png);
    console.log(`FAIL ${t.name}: no baseline (run with --update)`); failed++; continue;
  }
  const r = compare(t.name, png, readFileSync(file));
  if (r.ok) { console.log(`PASS ${t.name} (${r.n} px)`); continue; }
  failed++;
  writeFileSync(path.join(diffDir, `${t.name}.actual.png`), png);
  if (r.diff) writeFileSync(path.join(diffDir, `${t.name}.diff.png`), PNG.sync.write(r.diff));
  console.log(`FAIL ${t.name}: ${r.why}`);
}
await browser.close();

if (update) {
  const keep = new Set(SHOTS.flatMap((s) => s.variants.map((v) => `${s.name}-${v.id}.png`)));
  if (!filters.length) for (const f of readdirSync(baseDir)) if (!keep.has(f)) { rmSync(path.join(baseDir, f)); console.log(`REMOVED stale ${f}`); }
  process.exit(0);
}
if (pageErrors.length) console.log('PAGE ERRORS (not failing):', pageErrors);
console.log(failed ? `\n${failed} of ${todo.length} screenshots differ. Diffs: ${diffDir}` : `\nAll ${todo.length} screenshots match.`);
process.exit(failed ? 1 : 0);

// WCAG AA contrast check of the design tokens in src/styles/global.css (both themes).
//   node scripts/contrast.mjs        (exit code 1 when a pair fails)
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const block = (sel) => {
  const m = css.match(new RegExp(sel.replace(/[[\]"]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  return Object.fromEntries([...(m?.[1] ?? '').matchAll(/--c-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((x) => [x[1], x[2]]));
};
const light = block(':root');
const dark = { ...light, ...block(':root[data-theme="dark"]') };
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// [foreground, background, minimum ratio, label]
const white = '#ffffff';
const pairs = (t) => [
  ['fg', 'canvas', 4.5], ['fg', 'surface', 4.5], ['fg-muted', 'surface', 4.5], ['fg-muted', 'canvas', 4.5], ['fg-muted', 'surface-2', 4.5],
  ['link', 'surface', 4.5], ['link', 'canvas', 4.5], ['link', 'selected', 4.5], ['link', 'hover', 4.5], ['link-hover', 'surface', 4.5],
  ['success', 'surface', 4.5], ['success', 'success-bg', 4.5], ['danger', 'surface', 4.5], ['danger', 'danger-bg', 4.5],
  ['warning', 'surface', 4.5], ['warning', 'warning-bg', 4.5], ['info', 'info-bg', 4.5],
  ['fg-muted', 'hover', 4.5], ['fg', 'selected', 4.5],
  ['nav-fg', 'nav', 4.5], ['code-fg', 'code-bg', 4.5],
  ['fg-faint', 'surface', 3.0, 'placeholder/decorative (3:1)'], ['input-line', 'surface', 3.0, 'input border (3:1)'],
  ['link', 'surface', 3.0, 'focus ring (3:1)'],
  ['fg-muted', 'line', 4.5, 'badge-soft'],
  ['primary-fg', 'primary', 4.5, 'primary button text'],
  [white, '#5f6b7a', 4.5, 'badge-grey'], [white, '#0972d3', 4.5, 'badge-blue'], [white, '#037f0c', 4.5, 'badge-green'], [white, '#d91515', 4.5, 'badge-red'], [white, '#b85a0b', 4.5, 'badge-orange'],
  ['danger-fg', 'danger', 4.5, 'danger-solid button text'],
].map(([f, b, min, label]) => [f.startsWith('#') ? f : t[f], b.startsWith('#') ? b : t[b], min, label ?? `${f} on ${b}`, f, b]);
let bad = 0;
for (const [name, t] of [['light', light], ['dark', dark]]) {
  for (const [f, b, min, label] of pairs(t)) {
    if (!f || !b) continue;
    const r = ratio(f, b);
    const ok = r >= min;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(5)} ${r.toFixed(2).padStart(5)} (>= ${min}) ${label}  ${f} / ${b}`);
  }
}
console.log(bad ? `\n${bad} failing pairs` : '\nAll pairs pass WCAG AA');
process.exit(bad ? 1 : 0);

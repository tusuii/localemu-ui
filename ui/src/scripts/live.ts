/**
 * Opt-in "Auto-refresh" for list pages. A small control (Off / 5s / 15s / 30s)
 * is added to the first DataTable's toolbar; while it is on, the page is
 * re-fetched in the background and only table rows, counts and `[data-live]`
 * regions are swapped, so selection, filter text, sort, page and scroll survive.
 * Opt out per table with `data-no-live` on the <form data-table>.
 */
import { $, $$, store } from './util';

const CHOICES: Array<[string, string]> = [['0', 'Off'], ['5', '5s'], ['15', '15s'], ['30', '30s']];

export function initLive() {
  const forms = $$<HTMLFormElement>('form[data-table]').filter((f) => f.dataset.noLive === undefined);
  const regions = $$('[data-live]');
  if (!forms.length && !regions.length) return;
  const host = forms[0] ? $('.card-header > div:last-child', forms[0]) : null;
  if (!host) return;

  const key = 'lemu.live:' + location.pathname;
  const ctl = document.createElement('label');
  ctl.className = 'live-ctl';
  ctl.innerHTML = '<span>Auto-refresh</span><select data-live-select aria-label="Auto-refresh interval"></select><span class="text-faint" data-live-stamp aria-live="off"></span>';
  const sel = $<HTMLSelectElement>('select', ctl)!;
  const stamp = $('[data-live-stamp]', ctl)!;
  for (const [v, l] of CHOICES) sel.add(new Option(l, v));
  const saved = store.get(key);
  sel.value = CHOICES.some(([v]) => v === saved) ? saved! : '0';
  host.prepend(ctl);

  let timer: number | undefined;
  let busy = false;
  const paused = () => document.hidden || !!document.querySelector('dialog[open]');

  async function tick() {
    if (busy || paused()) return;
    busy = true; ctl.dataset.busy = 'true';
    try {
      const r = await fetch(location.href, { headers: { 'x-lemu-live': '1' }, cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok || r.redirected) throw new Error(String(r.status));
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const fresh = $$<HTMLFormElement>('form[data-table]', doc);
      for (const f of forms) {
        const src = fresh.find((x) => x.dataset.table === f.dataset.table && fresh.indexOf(x) === $$('form[data-table]').indexOf(f)) ?? fresh.find((x) => x.dataset.table === f.dataset.table);
        if (src) (f as any).__swap?.(src);
      }
      for (const el of $$('[data-live]')) {
        const src = $$('[data-live]', doc).find((x) => x.dataset.live === el.dataset.live);
        if (src && src.innerHTML !== el.innerHTML) el.innerHTML = src.innerHTML;
      }
      stamp.textContent = 'Updated ' + new Date().toLocaleTimeString();
    } catch {
      stamp.textContent = 'Update failed';
    } finally { busy = false; ctl.dataset.busy = 'false'; }
  }

  const arm = () => {
    clearInterval(timer);
    const sec = Number(sel.value);
    if (sec > 0) timer = window.setInterval(tick, sec * 1000);
  };
  sel.addEventListener('change', () => { store.set(key, sel.value); arm(); if (Number(sel.value) > 0) void tick(); else stamp.textContent = ''; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Number(sel.value) > 0) void tick(); });
  arm();
}

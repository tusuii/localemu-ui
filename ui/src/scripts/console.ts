/**
 * Client-side behaviour for the LocalEmu Console.
 *
 * Everything here is progressive enhancement: pages are fully server-rendered
 * and every action is a plain form POST, so the console still works (minus
 * filtering, sorting and the confirm dialog) if this script fails to load.
 */

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/* ------------------------------------------------------------------ menus */

const menuToggles = (menu: Element) => $$(`[aria-controls="${menu.id}"]`);
function setExpanded(menu: HTMLElement, open: boolean) { menuToggles(menu).forEach((t) => t.setAttribute('aria-expanded', String(open))); }

function closeMenus(except?: Element | null) {
  $$('.menu[data-open="true"]').forEach((m) => { if (m !== except) { m.dataset.open = 'false'; setExpanded(m, false); } });
}

const menuItems = (menu: HTMLElement) => $$<HTMLElement>('a[href],button:not(:disabled),input:not([type=hidden])', menu).filter((el) => !el.closest('[hidden]') && el.getAttribute('aria-disabled') !== 'true' && el.offsetParent !== null);

function openMenu(menu: HTMLElement) {
  closeMenus(menu);
  menu.dataset.open = 'true';
  setExpanded(menu, true);
  if (menu.getAttribute('role') === 'menu') $$<HTMLElement>('a[href],button', menu).forEach((el) => { if (!el.getAttribute('role') && el.matches('.menu-item')) el.setAttribute('role', el.getAttribute('role') ?? 'menuitem'); });
  if (menu.id === 'menu-services') $<HTMLInputElement>('[data-services-filter]', menu)?.focus();
  else menuItems(menu)[0]?.focus();
  if (menu.id === 'menu-account') loadAccounts();
}

document.addEventListener('click', (e) => {
  const t = e.target as Element;
  const toggle = t.closest<HTMLElement>('[data-menu-toggle]');
  if (toggle) {
    const menu = document.getElementById(toggle.dataset.menuToggle!);
    if (menu) {
      e.preventDefault();
      menu.dataset.open === 'true' ? (menu.dataset.open = 'false', setExpanded(menu, false)) : openMenu(menu);
    }
    return;
  }
  if (!t.closest('.menu') && !t.closest('[data-global-search]')) closeMenus();
});

const isTyping = () => /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement?.tagName ?? '')) || !!(document.activeElement as HTMLElement | null)?.isContentEditable;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const open = $<HTMLElement>('.menu[data-open="true"]:not([data-search-results])');
    const returnTo = open ? menuToggles(open)[0] : null;
    const inMenu = open && open.contains(document.activeElement);
    closeMenus();
    if (inMenu && returnTo) returnTo.focus();
  }
  // Arrow-key navigation inside open menus.
  const menu = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.menu[data-open="true"]:not([data-search-results])');
  if (menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') && !(document.activeElement as HTMLElement).matches('textarea')) {
    const items = menuItems(menu);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0);
    if (items.length && !((document.activeElement as HTMLElement).matches('input') && (e.key === 'Home' || e.key === 'End'))) { e.preventDefault(); items[next]?.focus(); }
  }
  if (e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); $<HTMLInputElement>('[data-global-search]')?.focus(); }
  else if (e.key === '/' && !isTyping() && !e.metaKey && !e.ctrlKey) {
    const f = $<HTMLInputElement>('[data-table-filter]');
    if (f) { e.preventDefault(); f.focus(); }
  }
});

/* ---------------------------------------------------- services + search */

function filterServices(input: HTMLInputElement) {
  const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
  $$('[data-svc-item]').forEach((li) => {
    const kw = li.dataset.kw ?? '';
    li.hidden = !terms.every((t) => kw.includes(t));
  });
  $$('[data-svc-group]').forEach((g) => { g.hidden = !$$('[data-svc-item]', g).some((li) => !li.hidden); });
}
$<HTMLInputElement>('[data-services-filter]')?.addEventListener('input', (e) => filterServices(e.target as HTMLInputElement));

const search = $<HTMLInputElement>('[data-global-search]');
const results = $('[data-search-results]');
if (search && results) {
  let seq = 0;
  let timer: number | undefined;
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const openResults = (open: boolean) => { results.dataset.open = String(open); search.setAttribute('aria-expanded', String(open)); };
  const heading = (t: string) => `<div class="search-group" role="presentation">${esc(t)}</div>`;
  const row = (href: string, inner: string) => `<a class="menu-item" role="option" href="${esc(href)}">${inner}</a>`;
  type Res = { groups: Array<{ id: string; label: string; total: number; hits: Array<{ name: string; sub?: string; href: string }> }>; errors: Array<{ label: string; message: string }>; slow: string[]; count: number };

  const serviceHits = (terms: string[]) => $$('#menu-services [data-svc-item]').filter((li) => terms.every((t) => (li.dataset.kw ?? '').includes(t))).slice(0, 6);
  const svcHtml = (hits: HTMLElement[]) => hits.map((li) => {
    const a = li.querySelector('a')!;
    return row(a.getAttribute('href')!, a.querySelector('.svc-tile')!.outerHTML + `<span class="min-w-0"><span class="font-bold">${esc(a.textContent!.trim())}</span><span class="block truncate text-[12px] text-muted">${esc(a.title)}</span></span>`);
  }).join('');
  const resHtml = (r: Res, q: string) => {
    let h = '';
    for (const g of r.groups) {
      h += heading(`${g.label} (${g.total})`);
      for (const x of g.hits.slice(0, 4)) h += row(x.href, `<span class="min-w-0"><span class="block truncate font-bold">${esc(x.name)}</span>${x.sub ? `<span class="block truncate text-[12px] text-muted">${esc(x.sub)}</span>` : ''}</span>`);
    }
    if (r.slow.length) h += `<div class="px-4 py-1 text-[12px] text-muted">Still loading: ${esc(r.slow.slice(0, 4).join(', '))}${r.slow.length > 4 ? '…' : ''}</div>`;
    if (r.errors.length) h += `<div class="px-4 py-1 text-[12px] text-muted">${r.errors.length} service${r.errors.length > 1 ? 's' : ''} could not be searched.</div>`;
    h += row(`/search?q=${encodeURIComponent(q)}`, `<span class="font-bold text-link">See all results for “${esc(q)}”</span>`);
    return h;
  };

  const render = () => {
    const q = search.value.trim();
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    clearTimeout(timer);
    if (!terms.length) { results.innerHTML = ''; openResults(false); return; }
    const svcs = serviceHits(terms);
    const base = svcs.length ? heading('Services') + svcHtml(svcs) : '';
    if (q.length < 2) {
      results.innerHTML = base || '<div class="px-4 py-3 text-muted">No services match.</div>';
      openResults(true); return;
    }
    results.innerHTML = base + '<div class="px-4 py-2 text-[12px] text-muted" data-search-loading>Searching resources…</div>';
    openResults(true);
    const mine = ++seq;
    timer = window.setTimeout(async () => {
      try {
        const r = (await (await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=4`, { cache: 'no-store' })).json()) as Res;
        if (mine !== seq) return;
        results.innerHTML = base + resHtml(r, q);
        if (!svcs.length && !r.groups.length) results.insertAdjacentHTML('afterbegin', '<div class="px-4 py-2 text-muted">No services or resources match.</div>');
        const lr = $('[data-live-region]'); if (lr) lr.textContent = r.count ? `${r.count} matching resources` : 'No matching resources';
      } catch {
        if (mine === seq) results.innerHTML = base + '<div class="px-4 py-2 text-[12px] text-muted">Resource search is unavailable.</div>' + row(`/search?q=${encodeURIComponent(q)}`, 'See all results');
      }
    }, 220);
  };
  search.addEventListener('input', render);
  search.addEventListener('focus', () => { if (search.value.trim()) render(); });
  search.addEventListener('keydown', (e) => {
    const items = $$<HTMLAnchorElement>('a.menu-item', results);
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = search.value.trim();
      if (!q) return;
      const svc = serviceHits(q.toLowerCase().split(/\s+/));
      const name = svc[0]?.querySelector('a')?.textContent?.trim().toLowerCase() ?? '';
      location.href = svc.length && (q.length < 2 || name.startsWith(q.toLowerCase())) ? svc[0].querySelector('a')!.getAttribute('href')! : `/search?q=${encodeURIComponent(q)}`;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); items[0]?.focus(); }
    if (e.key === 'Escape') { openResults(false); }
  });
  results.addEventListener('keydown', (e) => {
    const items = $$<HTMLAnchorElement>('a.menu-item', results);
    const i = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(i + 1, items.length - 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); i <= 0 ? search.focus() : items[i - 1]?.focus(); }
    if (e.key === 'Escape') { openResults(false); search.focus(); }
  });
  document.addEventListener('click', (e) => { if (!(e.target as Element).closest('[data-global-search],[data-search-results]')) openResults(false); });
}

/* ------------------------------------------------------- misc controls */

$('[data-toggle-sidenav]')?.addEventListener('click', () => {
  const s = $('[data-sidenav]');
  if (s) s.dataset.open = s.dataset.open === 'true' ? 'false' : 'true';
});

$('[data-theme-toggle]')?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('lemu.theme', next);
});

document.addEventListener('click', (e) => {
  const t = e.target as Element;
  const dismiss = t.closest('[data-dismiss]');
  if (dismiss) dismiss.closest('[data-flash]')?.remove();

  const copy = t.closest<HTMLElement>('[data-copy]');
  if (copy) {
    e.preventDefault();
    const text = copy.dataset.copy ?? '';
    const done = () => { copy.classList.add('!text-success'); setTimeout(() => copy.classList.remove('!text-success'), 1200); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, done);
    else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove(); done();
    }
  }
});

// Tab key inserts spaces in code editors; JSON fields validate natively.
document.addEventListener('keydown', (e) => {
  const ta = e.target as HTMLTextAreaElement;
  if (e.key === 'Tab' && ta.matches?.('textarea[data-code]') && !e.shiftKey) {
    e.preventDefault();
    const { selectionStart: s, selectionEnd: en } = ta;
    ta.setRangeText('  ', s, en, 'end');
  }
});
function validateJson(ta: HTMLTextAreaElement) {
  const v = ta.value.trim();
  if (!v) { ta.setCustomValidity(''); return; }
  try { JSON.parse(v); ta.setCustomValidity(''); } catch (err) { ta.setCustomValidity('Invalid JSON: ' + (err as Error).message); }
}
document.addEventListener('input', (e) => { const t = e.target as HTMLTextAreaElement; if (t.matches?.('textarea[data-json]')) validateJson(t); });
document.addEventListener('blur', (e) => { const t = e.target as HTMLTextAreaElement; if (t.matches?.('textarea[data-json]')) { validateJson(t); t.reportValidity(); } }, true);
$$<HTMLTextAreaElement>('textarea[data-json]').forEach(validateJson);

// Conditional fields: data-show-when="field:value1|value2"
function applyShowWhen(scope: ParentNode) {
  $$('[data-show-when]', scope).forEach((el) => {
    const [name, vals] = el.dataset.showWhen!.split(':');
    const form = el.closest('form');
    if (!form) return;
    const ctl = form.elements.namedItem(name);
    let cur = '';
    if (ctl instanceof RadioNodeList) cur = ctl.value;
    else if (ctl instanceof HTMLInputElement && ctl.type === 'checkbox') cur = ctl.checked ? 'true' : 'false';
    else if (ctl instanceof HTMLInputElement || ctl instanceof HTMLSelectElement || ctl instanceof HTMLTextAreaElement) cur = ctl.value;
    const show = vals.split('|').includes(cur);
    el.hidden = !show;
    $$<HTMLInputElement>('input,select,textarea', el).forEach((i) => { i.disabled = !show; });
  });
}
applyShowWhen(document);
document.addEventListener('change', (e) => { const f = (e.target as HTMLElement).closest('form'); if (f) applyShowWhen(f); });

// Prevent double submits (and give feedback) - opt out with data-no-busy on the form.
document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  if (form.dataset.noBusy !== undefined || form.method === 'dialog') return;
  setTimeout(() => {
    $$<HTMLButtonElement>('button[type=submit],button:not([type])', form).forEach((b) => { b.dataset.wasDisabled = String(b.disabled); b.disabled = true; });
  }, 0);
});
window.addEventListener('pageshow', () => {
  $$<HTMLButtonElement>('button[data-was-disabled]').forEach((b) => { b.disabled = b.dataset.wasDisabled === 'true'; delete b.dataset.wasDisabled; });
});

/* --------------------------------------------------------------- tables */

function initTable(form: HTMLFormElement) {
  const tbody = $<HTMLTableSectionElement>('tbody', form);
  if (!tbody) { bindSelection(form, [], () => []); return; }
  const rows = $$<HTMLTableRowElement>('tr[data-row]', tbody);
  const pageSize = Number(form.dataset.pageSize || 20);
  const hasSel = !!$('[data-row-select]', form);
  const ths = $$<HTMLTableCellElement>('thead th', form);
  const colOffset = $('thead th.sel', form) ? 1 : 0;
  const filterInput = $<HTMLInputElement>('[data-table-filter]', form);
  const pager = $('[data-pager]', form);
  const info = $('[data-pager-info]', form);
  const noMatch = $('[data-no-match]', form);
  let page = 1;
  let sortCol = -1;
  let sortDir = 1;
  let matched = rows;

  rows.forEach((r) => { r.dataset.search = (r.textContent ?? '').toLowerCase().replace(/\s+/g, ' '); });

  const cellValue = (r: HTMLTableRowElement, i: number) => {
    const td = r.cells[i + colOffset];
    return td?.dataset.v ?? (td?.textContent ?? '').trim();
  };
  const cmp = (a: string, b: string) => {
    const na = Number(a), nb = Number(b);
    if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  };

  function render() {
    const terms = (filterInput?.value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    matched = rows.filter((r) => terms.every((t) => r.dataset.search!.includes(t)));
    if (sortCol >= 0) {
      matched = [...matched].sort((a, b) => sortDir * cmp(cellValue(a, sortCol), cellValue(b, sortCol)));
      matched.forEach((r) => tbody!.appendChild(r));
    }
    const pages = Math.max(1, Math.ceil(matched.length / pageSize));
    page = Math.min(Math.max(1, page), pages);
    const start = (page - 1) * pageSize;
    const visible = new Set(matched.slice(start, start + pageSize));
    rows.forEach((r) => { r.hidden = !visible.has(r); });
    if (noMatch) noMatch.classList.toggle('hidden', matched.length > 0);
    $('.tbl-wrap', form)?.classList.toggle('hidden', matched.length === 0);
    if (info) info.textContent = matched.length ? `${start + 1}–${Math.min(start + pageSize, matched.length)} of ${matched.length}` : '';
    if (pager) {
      pager.innerHTML = '';
      if (pages > 1) {
        const btn = (label: string, to: number, opts: { disabled?: boolean; current?: boolean } = {}) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.className = 'btn btn-ghost btn-sm !min-h-[28px] !px-2.5' + (opts.current ? ' !bg-selected !text-link' : '');
          b.disabled = !!opts.disabled;
          if (opts.current) b.setAttribute('aria-current', 'page');
          b.addEventListener('click', () => { page = to; render(); });
          pager.appendChild(b);
        };
        btn('‹', page - 1, { disabled: page === 1 });
        const nums = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
        let prev = 0;
        for (const n of [...nums].sort((a, b) => a - b)) {
          if (n - prev > 1) { const s = document.createElement('span'); s.textContent = '…'; s.className = 'px-1'; pager.appendChild(s); }
          btn(String(n), n, { current: n === page });
          prev = n;
        }
        btn('›', page + 1, { disabled: page === pages });
      }
    }
    ths.forEach((th, i) => {
      if (sortCol >= 0 && i - colOffset === sortCol) th.setAttribute('aria-sort', sortDir === 1 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
    sync();
  }

  filterInput?.addEventListener('input', () => { page = 1; render(); });
  filterInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  ths.forEach((th, i) => {
    if (!th.classList.contains('sortable')) return;
    th.addEventListener('click', () => {
      const c = i - colOffset;
      if (sortCol === c) sortDir = -sortDir; else { sortCol = c; sortDir = 1; }
      render();
    });
  });

  const sync = bindSelection(form, rows, () => $$<HTMLTableRowElement>('tr[data-row]:not([hidden])', tbody));
  render();
  return hasSel;
}

/** Wire row selection to the toolbar: enable/disable actions and fill link templates. */
function bindSelection(form: HTMLFormElement, rows: HTMLTableRowElement[], visibleRows: () => HTMLTableRowElement[]) {
  const checks = () => rows.map((r) => $<HTMLInputElement>('[data-row-select]', r)).filter(Boolean) as HTMLInputElement[];
  const selectAll = $<HTMLInputElement>('[data-select-all]', form);

  function sync() {
    const sel = rows.filter((r) => $<HTMLInputElement>('[data-row-select]', r)?.checked);
    rows.forEach((r) => { r.dataset.selected = String(sel.includes(r)); });
    $$('[data-min],[data-max]', form).forEach((b) => {
      const min = Number(b.dataset.min ?? 0);
      const max = b.dataset.max ? Number(b.dataset.max) : Infinity;
      const off = !(sel.length >= min && sel.length <= max);
      if (b instanceof HTMLButtonElement) b.disabled = off;
      else { b.setAttribute('aria-disabled', String(off)); b.tabIndex = off ? -1 : 0; }
    });
    $$<HTMLAnchorElement>('[data-href-template]', form).forEach((a) => {
      if (sel.length === 1) a.href = a.dataset.hrefTemplate!.replace('{id}', encodeURIComponent(sel[0].dataset.id!)).replace('{name}', encodeURIComponent(sel[0].dataset.name!));
      else a.removeAttribute('href');
    });
    if (selectAll) {
      const vis = visibleRows();
      const n = vis.filter((r) => $<HTMLInputElement>('[data-row-select]', r)?.checked).length;
      selectAll.checked = vis.length > 0 && n === vis.length;
      selectAll.indeterminate = n > 0 && n < vis.length;
    }
  }

  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t === selectAll) {
      const vis = new Set(visibleRows());
      checks().forEach((c) => { c.checked = selectAll.checked && vis.has(c.closest('tr') as HTMLTableRowElement); });
    }
    if (t.matches?.('[data-row-select],[data-select-all]')) sync();
  });
  // Clicking anywhere on a row selects it, like the AWS console.
  form.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLTableRowElement>('tr[data-row]');
    if (!row || t.closest('a,button,input,label,select,textarea,summary')) return;
    const c = $<HTMLInputElement>('[data-row-select]', row);
    if (!c) return;
    c.checked = c.type === 'radio' ? true : !c.checked;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  sync();
  return sync;
}

$$<HTMLFormElement>('form[data-table]').forEach(initTable);

/* -------------------------------------------------------- confirm dialog */

const dlg = $<HTMLDialogElement>('#confirm-dialog');
if (dlg) {
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-confirm]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.confirmed === '1') { delete btn.dataset.confirmed; return; }
    e.preventDefault();
    e.stopPropagation();

    const form = btn.form;
    const names = btn.dataset.confirmName
      ? [btn.dataset.confirmName]
      : form ? $$('tr[data-selected="true"]', form).map((r) => r.dataset.name || r.dataset.id || '') : [];
    $('[data-cd-title]', dlg)!.textContent = btn.dataset.confirmTitle ?? (names.length > 1 ? `Delete ${names.length} items?` : 'Are you sure?');
    $('[data-cd-body]', dlg)!.textContent = (btn.dataset.confirm ?? '').replace('{count}', String(names.length));
    const list = $('[data-cd-list]', dlg)!;
    list.innerHTML = '';
    if (btn.dataset.confirmList !== 'false') names.slice(0, 20).forEach((n) => { const li = document.createElement('li'); li.textContent = n; list.appendChild(li); });
    if (names.length > 20) { const li = document.createElement('li'); li.textContent = `…and ${names.length - 20} more`; list.appendChild(li); }

    const word = btn.dataset.confirmType ?? '';
    const typeBox = $('[data-cd-type]', dlg)!;
    const input = $<HTMLInputElement>('[data-cd-input]', dlg)!;
    const ok = $<HTMLButtonElement>('[data-cd-ok]', dlg)!;
    typeBox.classList.toggle('hidden', !word);
    $('[data-cd-word]', dlg)!.textContent = word;
    input.value = '';
    ok.textContent = btn.dataset.confirmOk ?? 'Delete';
    ok.className = 'btn ' + (btn.dataset.confirmStyle === 'primary' ? 'btn-primary' : 'btn-danger-solid');
    ok.disabled = !!word;
    input.oninput = () => { ok.disabled = input.value.trim() !== word; };

    dlg.returnValue = '';
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'ok' && form) { btn.dataset.confirmed = '1'; form.requestSubmit(btn); }
    }, { once: true });
    dlg.showModal();
    (word ? input : ok).focus();
  }, true);
}

/* ------------------------------------------------- live bits & history */

// Remember the services the user visits for the "Recently visited" widget.
(function trackVisit() {
  const d = document.body.dataset;
  if (!d.serviceId) return;
  let recent: Array<{ id: string }> = [];
  try { recent = JSON.parse(store.get('lemu.recent') ?? '[]'); } catch { /* ignore */ }
  recent = [{ id: d.serviceId }, ...recent.filter((r) => r.id !== d.serviceId)].slice(0, 12);
  store.set('lemu.recent', JSON.stringify(recent));
})();

(function renderRecent() {
  const wrap = $('[data-recent-list]');
  if (!wrap) return;
  let recent: Array<{ id: string }> = [];
  try { recent = JSON.parse(store.get('lemu.recent') ?? '[]'); } catch { /* ignore */ }
  const items = $$('[data-recent-item]', wrap);
  let shown = 0;
  for (const r of recent) {
    const el = items.find((i) => i.dataset.id === r.id);
    if (el) { el.hidden = false; wrap.appendChild(el); shown++; }
  }
  $('[data-recent-empty]')?.classList.toggle('hidden', shown > 0);
})();

// Connection indicator in the top bar.
const conn = $('[data-conn]');
if (conn) {
  const poll = async () => {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      const j = await r.json();
      conn.dataset.online = String(!!j.online);
      $('[data-conn-dot]', conn)!.className = 'h-2 w-2 rounded-full ' + (j.online ? 'bg-[#2ea597]' : 'bg-[#ff7a7a]');
      $('[data-conn-text]', conn)!.textContent = j.online ? `v${j.version}` : 'offline';
    } catch { /* keep last state */ }
  };
  setInterval(poll, 15000);
}

// Known accounts, fetched when the account menu opens.
let accountsLoaded = false;
async function loadAccounts() {
  if (accountsLoaded) return;
  accountsLoaded = true;
  const box = $('[data-accounts-list]');
  if (!box) return;
  try {
    const { accounts } = await (await fetch('/api/accounts')).json() as { accounts: string[] };
    if (!accounts.length) return;
    box.classList.remove('hidden');
    box.innerHTML = '<div class="text-[12px] font-bold uppercase tracking-wide text-muted mb-1">Known accounts</div>';
    for (const a of accounts) {
      const b = document.createElement('button');
      b.type = 'submit'; b.name = 'account'; b.value = a;
      b.className = 'menu-item font-mono !px-2 rounded';
      b.textContent = a;
      box.appendChild(b);
    }
  } catch { /* optional */ }
}

// Auto refresh toggle: <label data-autorefresh data-interval="5000"><input type=checkbox></label>
$$('[data-autorefresh]').forEach((el) => {
  const box = $<HTMLInputElement>('input', el)!;
  const key = 'lemu.autorefresh:' + location.pathname;
  box.checked = store.get(key) === '1';
  let timer: number | undefined;
  const arm = () => {
    clearInterval(timer);
    if (!box.checked) return;
    timer = window.setInterval(() => {
      if (document.hidden || dlg?.open || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) return;
      location.reload();
    }, Number(el.dataset.interval || 5000));
  };
  box.addEventListener('change', () => { store.set(key, box.checked ? '1' : '0'); arm(); });
  arm();
});

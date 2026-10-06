/** CloudShell-style docked panel: `aws ...` commands run server-side via /api/shell. */
import { $, store, isTyping } from './util';

const panel = $<HTMLElement>('#shell-panel');
if (panel) {
  const out = $('[data-shell-out]', panel)!;
  const input = $<HTMLInputElement>('[data-shell-input]', panel)!;
  const form = $<HTMLFormElement>('[data-shell-form]', panel)!;
  const toggles = document.querySelectorAll<HTMLElement>('[data-shell-toggle]');
  const root = document.documentElement;
  const meta = (n: string) => document.querySelector<HTMLMetaElement>(`meta[name="${n}"]`)?.content ?? '';

  let open = store.get('lemu.shell.open') === '1';
  let collapsed = store.get('lemu.shell.collapsed') === '1';
  let height = Math.min(Math.max(Number(store.get('lemu.shell.height')) || 320, 140), 900);
  let history: string[] = [];
  try { history = JSON.parse(store.get('lemu.shell.history') ?? '[]'); } catch { /* ignore */ }
  let hpos = history.length;
  let busy = false;

  const layout = () => {
    panel.hidden = !open;
    panel.dataset.collapsed = String(collapsed);
    panel.style.setProperty('--shell-panel-h', Math.min(height, window.innerHeight - 120) + 'px');
    root.style.setProperty('--shell-h', open ? (collapsed ? '40px' : Math.min(height, window.innerHeight - 120) + 'px') : '0px');
    toggles.forEach((t) => t.setAttribute('aria-expanded', String(open)));
    $('[data-shell-collapse]', panel)?.setAttribute('aria-expanded', String(!collapsed));
  };
  const setOpen = (v: boolean, focus = true) => {
    open = v; if (v) collapsed = false;
    store.set('lemu.shell.open', v ? '1' : '0'); store.set('lemu.shell.collapsed', collapsed ? '1' : '0');
    layout();
    if (v && focus) input.focus();
    if (v && !out.childElementCount) print(`LocalEmu CloudShell. Commands run as account ${meta('lemu-account')} in ${meta('lemu-region')} against ${meta('lemu-endpoint')}.\nType "aws help" to get started. Tab completes, Up/Down recalls history.`, 'dim');
  };

  function print(text: string, cls = '') {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  }

  async function post(body: unknown): Promise<any> {
    const r = await fetch('/api/shell', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lemu-console': '1' }, body: JSON.stringify(body) });
    return r.json();
  }

  async function run(line: string) {
    print(`$ ${line}`, 'cmd');
    if (line === 'clear' || line === 'cls') { out.textContent = ''; return; }
    busy = true; input.disabled = true;
    try {
      const r = await post({ command: line });
      if (r.stdout) print(r.stdout);
      if (r.stderr) print(r.stderr, 'err');
    } catch (e) {
      print('Request failed: ' + (e as Error).message, 'err');
    } finally { busy = false; input.disabled = false; input.focus(); }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const line = input.value.trim();
    input.value = '';
    if (!line || busy) return;
    if (history[history.length - 1] !== line) history.push(line);
    history = history.slice(-200); hpos = history.length;
    store.set('lemu.shell.history', JSON.stringify(history));
    void run(line);
  });

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); if (hpos > 0) input.value = history[--hpos] ?? ''; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hpos = Math.min(hpos + 1, history.length); input.value = history[hpos] ?? ''; }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); out.textContent = ''; }
    else if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const v = input.value.slice(0, input.selectionStart ?? input.value.length);
      try {
        const r = await post({ complete: v });
        const c: string[] = r.candidates ?? [];
        if (!c.length) return;
        let common = c[0];
        for (const x of c) while (!x.startsWith(common)) common = common.slice(0, -1);
        const base = v.slice(0, v.length - (r.token ?? '').length);
        input.value = base + (c.length === 1 ? c[0] + ' ' : common) + input.value.slice(v.length);
        if (c.length > 1) print(c.join('   '), 'dim');
      } catch { /* ignore */ }
    }
  });

  toggles.forEach((t) => t.addEventListener('click', () => setOpen(!open)));
  $('[data-shell-close]', panel)!.addEventListener('click', () => { setOpen(false); toggles[0]?.focus(); });
  $('[data-shell-clear]', panel)!.addEventListener('click', () => { out.textContent = ''; input.focus(); });
  $('[data-shell-collapse]', panel)!.addEventListener('click', () => { collapsed = !collapsed; store.set('lemu.shell.collapsed', collapsed ? '1' : '0'); layout(); if (!collapsed) input.focus(); });
  panel.addEventListener('click', (e) => { if (!(e.target as Element).closest('button,input,a') && !window.getSelection()?.toString()) input.focus(); });

  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setOpen(!open); }
  });

  // Resize by dragging the top edge (or arrow keys on the handle).
  const grip = $('[data-shell-resize]', panel)!;
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { height = Math.min(Math.max(window.innerHeight - ev.clientY, 140), window.innerHeight - 120); layout(); };
    const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); store.set('lemu.shell.height', String(Math.round(height))); };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    height = Math.min(Math.max(height + (e.key === 'ArrowUp' ? 30 : -30), 140), window.innerHeight - 120);
    store.set('lemu.shell.height', String(height)); layout();
  });
  window.addEventListener('resize', layout);

  void isTyping;
  layout();
  if (open) setOpen(true, false);
}

/**
 * "Show CLI" for forms/buttons carrying a template:
 *   data-cli="aws sqs create-queue --queue-name {queueName}"
 *   {field}            value of the form control named/ided `field` (or <field> while empty)
 *   {field|--flag}     `--flag value`, only when the field is non-empty / checked
 *                      (a flag ending in `=`, like `--attributes DelaySeconds=`, is glued to the value)
 * The LocalEmu endpoint (from <meta name="lemu-endpoint">) and region are appended.
 */
import { $, $$, copyText } from './util';
import { expandTemplate } from '../lib/clitemplate';
import { cliToSdk } from '../lib/clisdk';


function fieldValue(form: HTMLFormElement | null, name: string): string {
  const root: ParentNode = form ?? document;
  let el: Element | RadioNodeList | null | undefined = form?.elements.namedItem(name);
  if (!el) el = root.querySelector(`#${CSS.escape(name)}, [name="${CSS.escape(name)}"]`);
  if (!el) return '';
  if (el instanceof RadioNodeList) return el.value;
  if (el instanceof HTMLInputElement && (el.type === 'checkbox')) return el.checked ? (el.value && el.value !== 'on' ? el.value : 'true') : '';
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return el.disabled ? '' : el.value.trim();
  return '';
}

const meta = (n: string, d: string) => document.querySelector<HTMLMetaElement>(`meta[name="${n}"]`)?.content ?? d;

export function fillTemplate(tpl: string, form: HTMLFormElement | null): string {
  const body = expandTemplate(tpl, (name) => fieldValue(form, name));
  return `${body} --endpoint-url ${meta('lemu-endpoint', 'http://localhost:4566')} --region ${meta('lemu-region', 'us-east-1')}`;
}

export function initCli() {
  const carriers = $$('[data-cli]').filter((el) => el.tagName === 'FORM' || el.tagName === 'BUTTON');
  carriers.forEach((el, n) => {
    const form = el instanceof HTMLFormElement ? el : (el as HTMLButtonElement).form;
    const tpl = el.dataset.cli!;
    const wrap = document.createElement('span');
    wrap.className = 'cli-pop';
    const id = `cli-box-${n}`;
    wrap.innerHTML = `<button type="button" class="btn btn-normal" aria-expanded="false" aria-controls="${id}"><span class="icon" style="width:16px;height:16px" aria-hidden="true"></span> Show CLI</button>
      <div class="cli-box" id="${id}" role="region" aria-label="AWS CLI equivalent" hidden>
        <div class="mb-2 flex gap-1" role="tablist" aria-label="Format">
          <button type="button" class="btn btn-normal btn-sm" role="tab" aria-selected="true" data-cli-tab="cli">AWS CLI</button>
          <button type="button" class="btn btn-normal btn-sm" role="tab" aria-selected="false" data-cli-tab="sdk">SDK for JavaScript</button>
        </div>
        <pre class="code-block" data-cli-text tabindex="0"></pre>
        <div class="mt-2 flex items-center justify-between gap-2"><span class="text-[12px] text-muted">Includes the LocalEmu endpoint. Placeholders in &lt;angle brackets&gt; are still empty.</span><button type="button" class="btn btn-normal btn-sm" data-cli-copy>Copy as CLI</button></div>
      </div>`;
    const btn = $<HTMLButtonElement>(':scope > button', wrap)!;
    const box = $(`#${id}`, wrap)!;
    const pre = $('[data-cli-text]', wrap)!;
    let mode: 'cli' | 'sdk' = 'cli';
    const copyBtn = $<HTMLButtonElement>('[data-cli-copy]', wrap)!;
    const upd = () => {
      const cli = fillTemplate(tpl, form);
      pre.textContent = mode === 'cli' ? cli : cliToSdk(cli, { account: meta('lemu-account', '') || undefined });
      copyBtn.textContent = mode === 'cli' ? 'Copy as CLI' : 'Copy SDK code';
      pre.dataset.mode = mode;
    };
    $$<HTMLButtonElement>('[data-cli-tab]', wrap).forEach((tb) => tb.addEventListener('click', () => {
      mode = tb.dataset.cliTab as 'cli' | 'sdk';
      $$('[data-cli-tab]', wrap).forEach((x) => x.setAttribute('aria-selected', String(x === tb)));
      upd();
    }));
    btn.addEventListener('click', () => { upd(); const o = box.hidden; box.hidden = !o; btn.setAttribute('aria-expanded', String(o)); });
    $('[data-cli-copy]', wrap)!.addEventListener('click', async (e) => {
      const b = e.currentTarget as HTMLElement;
      upd(); await copyText(pre.textContent ?? '');
      b.textContent = 'Copied'; setTimeout(upd, 1200);
    });
    form?.addEventListener('input', () => { if (!box.hidden) upd(); });
    form?.addEventListener('change', () => { if (!box.hidden) upd(); });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); e.stopPropagation(); } });
    // Place next to the primary submit button when there is one, else at the end of the form / after the button.
    const submit = form ? $$<HTMLElement>('button[type=submit].btn-primary, button.btn-primary:not([type])', form).pop() : null;
    if (el instanceof HTMLFormElement) {
      if (submit?.parentElement) submit.parentElement.insertBefore(wrap, submit); else el.appendChild(wrap);
    } else el.parentElement?.insertBefore(wrap, el);
    // Static icon (avoid shipping the icon set to the client).
    $('.icon', wrap)!.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>';
  });
}

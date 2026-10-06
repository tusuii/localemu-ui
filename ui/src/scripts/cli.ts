/**
 * "Show CLI" for forms/buttons carrying a template:
 *   data-cli="aws sqs create-queue --queue-name {queueName}"
 *   {field}            value of the form control named/ided `field` (or <field> while empty)
 *   {field|--flag}     `--flag value`, only when the field is non-empty / checked
 *                      (a flag ending in `=`, like `--attributes DelaySeconds=`, is glued to the value)
 * The LocalEmu endpoint (from <meta name="lemu-endpoint">) and region are appended.
 */
import { $, $$, copyText } from './util';

const quote = (v: string) => (/^[\w@%+=:,./-]+$/.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`);

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

export function fillTemplate(tpl: string, form: HTMLFormElement | null): string {
  const body = tpl.replace(/\{([\w.-]+)(?:\|([^}]*))?\}/g, (_m, name: string, flag?: string) => {
    const v = fieldValue(form, name);
    if (flag !== undefined) return v ? (flag.endsWith('=') ? flag + quote(v) : `${flag} ${quote(v)}`.trim()) : '';
    return v ? quote(v) : `<${name}>`;
  }).replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  const endpoint = document.querySelector<HTMLMetaElement>('meta[name="lemu-endpoint"]')?.content ?? 'http://localhost:4566';
  const region = document.querySelector<HTMLMetaElement>('meta[name="lemu-region"]')?.content ?? 'us-east-1';
  return `${body} --endpoint-url ${endpoint} --region ${region}`;
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
        <pre class="code-block" data-cli-text tabindex="0"></pre>
        <div class="mt-2 flex items-center justify-between gap-2"><span class="text-[12px] text-muted">Includes <code>--endpoint-url</code> for LocalEmu. Placeholders in &lt;angle brackets&gt; are still empty.</span><button type="button" class="btn btn-normal btn-sm" data-cli-copy>Copy as CLI</button></div>
      </div>`;
    const btn = $<HTMLButtonElement>('button', wrap)!;
    const box = $(`#${id}`, wrap)!;
    const pre = $('[data-cli-text]', wrap)!;
    const upd = () => { pre.textContent = fillTemplate(tpl, form); };
    btn.addEventListener('click', () => { upd(); const o = box.hidden; box.hidden = !o; btn.setAttribute('aria-expanded', String(o)); });
    $('[data-cli-copy]', wrap)!.addEventListener('click', async (e) => {
      const b = e.currentTarget as HTMLElement;
      upd(); await copyText(pre.textContent ?? '');
      const t = b.textContent; b.textContent = 'Copied'; setTimeout(() => { b.textContent = t; }, 1200);
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

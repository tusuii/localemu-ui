import { iconSvg } from './icons';

/** Marks a string as already-escaped HTML. Everything else gets escaped. */
export class Safe {
  constructor(public readonly v: string) {}
  toString() { return this.v; }
}
export const raw = (s: string) => new Safe(s);

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Render any value for HTML: Safe passes through, arrays join, others are escaped. */
export function text(v: unknown): string {
  if (v instanceof Safe) return v.v;
  if (Array.isArray(v)) return v.map(text).join('');
  return esc(v);
}

/** Tagged template that escapes interpolations (unless they're Safe). */
export function html(strings: TemplateStringsArray, ...vals: unknown[]): Safe {
  let out = strings[0];
  vals.forEach((v, i) => { out += text(v) + strings[i + 1]; });
  return new Safe(out);
}

export const icon = (name: string, cls = '') =>
  new Safe(`<span class="icon ${cls}" style="width:1em;height:1em" aria-hidden="true">${iconSvg(name)}</span>`);

export type StatusKind = 'success' | 'error' | 'warning' | 'info' | 'progress' | 'stopped' | 'pending';
const STATUS_ICON: Record<StatusKind, string> = {
  success: 'circle-check', error: 'circle-x', warning: 'triangle-alert', info: 'info',
  progress: 'loader-circle', stopped: 'circle-pause', pending: 'clock-3',
};

export function status(kind: StatusKind, label: unknown): Safe {
  return new Safe(`<span class="status status-${kind}"><span class="icon" style="width:16px;height:16px">${iconSvg(STATUS_ICON[kind])}</span><span>${text(label)}</span></span>`);
}

const OK = /^(active|available|running|enabled|ready|inservice|in-use|success|succeeded|completed|healthy|create_complete|update_complete|import_complete|issued|exists|attached|associated|live|online|ok|open|in_sync|insufficient_data_ok|connected|created|true)$/i;
const BAD = /(fail|error|rollback|delete_failed|deleted|terminated|impaired|alarm|aborted|timed_out|timedout|denied|invalid|revoked|expired|unhealthy|disabled|pendingdeletion|pending_deletion)/i;
const WIP = /(pending|creating|updating|starting|stopping|shutting|in_progress|in-progress|deleting|provisioning|initializing|modifying|importing|running_)/i;

/** Map an AWS state string to a status indicator. `overrides` wins (lowercased keys). */
export function stateStatus(state: unknown, overrides: Record<string, StatusKind> = {}): Safe {
  const s = String(state ?? '');
  if (!s) return new Safe('-');
  const key = s.toLowerCase();
  let kind: StatusKind;
  if (overrides[key]) kind = overrides[key];
  else if (key === 'stopped' || key === 'stop' || key === 'inactive' || key === 'paused') kind = 'stopped';
  else if (BAD.test(s) && !/^disabled$/i.test(s)) kind = 'error';
  else if (/^disabled$/i.test(s)) kind = 'stopped';
  else if (WIP.test(s)) kind = 'progress';
  else if (OK.test(s)) kind = 'success';
  else kind = 'info';
  return status(kind, s);
}

export type BadgeColor = 'grey' | 'blue' | 'green' | 'red' | 'orange' | 'soft';
export const badge = (label: unknown, color: BadgeColor = 'soft') => new Safe(`<span class="badge badge-${color}">${text(label)}</span>`);

export const mono = (v: unknown) => new Safe(`<code class="text-[13px]">${text(v)}</code>`);

export function link(href: string, label: unknown, extra = '') {
  return new Safe(`<a href="${esc(href)}" ${extra}>${text(label)}</a>`);
}

export function copyable(v: string, label?: unknown) {
  return new Safe(
    `<span class="inline-flex items-center gap-1.5"><span class="break-all">${text(label ?? v)}</span>` +
      `<button type="button" class="text-muted hover:text-fg" data-copy="${esc(v)}" title="Copy" aria-label="Copy"><span class="icon" style="width:14px;height:14px">${iconSvg('copy')}</span></button></span>`,
  );
}

/** Syntax-highlighted JSON for <pre> blocks. */
export function highlightJson(value: unknown): Safe {
  let src: string;
  if (typeof value === 'string') {
    try { src = JSON.stringify(JSON.parse(value), null, 2); } catch { return new Safe(esc(value)); }
  } else {
    src = JSON.stringify(value, (_k, x) => (typeof x === 'bigint' ? x.toString() : x instanceof Uint8Array ? `<${x.length} bytes>` : x), 2) ?? '';
  }
  const out = esc(src).replace(
    /(&quot;(?:\\.|[^&\\]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (m, str, colon, bool) => {
      if (str) return colon ? `<span class="json-key">${str}</span>${colon}` : `<span class="json-str">${str}</span>`;
      if (bool) return `<span class="json-bool">${m}</span>`;
      if (m === 'null') return `<span class="json-null">${m}</span>`;
      return `<span class="json-num">${m}</span>`;
    },
  );
  return new Safe(out);
}

export function tagList(tags: { Key?: string; Value?: string }[] | Record<string, string> | undefined): Safe {
  const list = Array.isArray(tags) ? tags.map((t) => [t.Key ?? '', t.Value ?? '']) : Object.entries(tags ?? {});
  if (!list.length) return new Safe('<span class="text-muted">-</span>');
  return new Safe(list.map(([k, v]) => `<span class="badge badge-soft mr-1">${esc(k)}${v ? ': ' + esc(v) : ''}</span>`).join(''));
}

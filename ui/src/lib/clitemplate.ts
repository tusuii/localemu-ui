/**
 * Pure part of the "Show CLI" templates (the DOM lookup lives in src/scripts/cli.ts).
 *
 *   {field}                     the value (shell-quoted), or <field> while empty
 *   {field|--flag}              `--flag value` only when non-empty (a flag ending in `=` is glued to the value)
 *   {field|--flag|!default}     same, but omitted when the value equals `default` (e.g. the default event bus)
 *   {field|--flag|?other=value}  same, but only when another field has that value (e.g. `{pattern|--event-pattern|?kind=pattern}`)
 *   {?field=value|text}         `text` only when the field equals `value` (e.g. `{?type=fifo|.fifo}`)
 * Repeated `--attributes K=V` flags are merged into one `--attributes K=V,K2=V2` (the CLI keeps only the last).
 */
export const quote = (v: string) => (/^[\w@%+=:,./-]+$/.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`);

export function expandTemplate(tpl: string, get: (name: string) => string): string {
  const out = tpl
    .replace(/\{\?([\w.-]+)=([^|}]*)\|([^}]*)\}/g, (_m, name: string, want: string, text: string) => (get(name) === want ? text : ''))
    .replace(/\{([\w.-]+)(?:\|([^}]*))?\}/g, (_m, name: string, spec?: string) => {
      const v = get(name);
      if (spec === undefined) return v ? quote(v) : `<${name}>`;
      const [flag, skip] = spec.split('|');
      if (!v || (skip?.startsWith('!') && v === skip.slice(1))) return '';
      if (skip?.startsWith('?')) { const [f, want] = skip.slice(1).split('='); if (get(f) !== want) return ''; }
      return flag.endsWith('=') ? flag + quote(v) : `${flag} ${quote(v)}`.trim();
    })
    .replace(/(\.fifo)('?)\.fifo\b/g, '$1$2');
  return mergeRepeated(out.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim());
}

/** `--attributes A=1 --attributes B=2` -> `--attributes A=1,B=2` (only for simple Key=Value pairs). */
export function mergeRepeated(cmd: string): string {
  let prev = '';
  while (prev !== cmd) {
    prev = cmd;
    cmd = cmd.replace(/(--[\w-]+) (\w+=\S*) \1 (\w+=\S*)/, '$1 $2,$3');
  }
  return cmd;
}

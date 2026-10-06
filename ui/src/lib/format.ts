export function bytes(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '-';
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

export function num(n: number | string | undefined | null): string {
  if (n === undefined || n === null || n === '') return '-';
  const v = Number(n);
  return Number.isNaN(v) ? String(n) : v.toLocaleString('en-US');
}

const toDate = (d: Date | string | number | undefined | null) =>
  d === undefined || d === null || d === '' ? null : new Date(d);

/** "October 6, 2026, 01:38:08 (UTC+00:00)" - the AWS console timestamp style. */
export function dateTime(d: Date | string | number | undefined | null): string {
  const x = toDate(d);
  if (!x || Number.isNaN(x.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  const mon = x.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${mon} ${x.getUTCDate()}, ${x.getUTCFullYear()}, ${p(x.getUTCHours())}:${p(x.getUTCMinutes())}:${p(x.getUTCSeconds())} (UTC)`;
}

export function shortDateTime(d: Date | string | number | undefined | null): string {
  const x = toDate(d);
  if (!x || Number.isNaN(x.getTime())) return '-';
  return x.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

export function ago(d: Date | string | number | undefined | null): string {
  const x = toDate(d);
  if (!x || Number.isNaN(x.getTime())) return '-';
  const s = Math.round((Date.now() - x.getTime()) / 1000);
  if (s < 0) return 'in the future';
  if (s < 5) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const dd = Math.floor(h / 24);
  return `${dd} day${dd > 1 ? 's' : ''} ago`;
}

export function duration(sec: number | undefined | null): string {
  if (sec === undefined || sec === null) return '-';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  if (h < 48) return `${h}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function pretty(v: unknown): string {
  if (v === undefined) return '';
  if (typeof v === 'string') {
    try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; }
  }
  return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x instanceof Uint8Array ? `<${x.length} bytes>` : x), 2);
}

/** Last path/ARN segment: arn:aws:iam::123:role/path/Name -> Name. */
export function arnName(arn: string | undefined): string {
  if (!arn) return '-';
  const tail = arn.split(':').slice(5).join(':');
  return tail.split('/').pop() || tail || arn;
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

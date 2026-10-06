export const queueName = (url: string) => url.split('/').pop() ?? url;
export const isFifo = (name: string) => name.endsWith('.fifo');
export const epoch = (s?: string) => (s ? new Date(Number(s) * 1000) : undefined);
export const secs = (s?: string | number) => (s === undefined || s === '' ? '-' : `${Number(s).toLocaleString('en-US')} ${Number(s) === 1 ? 'second' : 'seconds'}`);
export function retention(s?: string) {
  if (!s) return '-';
  const n = Number(s);
  if (n % 86400 === 0) return `${n / 86400} ${n === 86400 ? 'day' : 'days'}`;
  if (n % 3600 === 0) return `${n / 3600} hours`;
  return `${n} seconds`;
}

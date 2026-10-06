import { AthenaClient, GetQueryExecutionCommand, type QueryExecution } from '@aws-sdk/client-athena';
import { UserError, errMessage } from './errors';

export const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

/** Poll a query until it finishes or `ms` elapses. Returns the last known execution. */
export async function waitForQuery(athena: AthenaClient, id: string, ms = 8000): Promise<QueryExecution | undefined> {
  const end = Date.now() + ms;
  let last: QueryExecution | undefined;
  for (;;) {
    last = (await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: id }))).QueryExecution;
    if (TERMINAL.has(last?.Status?.State ?? '') || Date.now() >= end) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** LocalEmu does not implement every Athena operation; turn that into a readable message. */
export async function supported<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const m = errMessage(e);
    if (/not been implemented|NotImplemented/i.test(m)) throw new UserError(`${what} is not supported by this LocalEmu build (${m.replace(/^InternalFailure:\s*/, '')}).`);
    throw e;
  }
}

export const clip = (s: string | undefined, n = 80) => { const x = (s ?? '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
export const queryState = (s?: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '-');

import type { APIRoute } from 'astro';
import { DescribeTableCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { aws } from '../../../lib/aws';
import { getCtx } from '../../../lib/context';
import { UserError, errMessage } from '../../../lib/errors';
import { buildRead, csvCell, jsonReplacer, keyAttrs, type Item } from '../../../lib/ddb';

export const prerender = false;

/**
 * GET /dynamodb/<table>/export?format=json|csv[&typed=1]  + the same query params as the items page
 * (mode, index, pk, skop, sk, sk2, order, fa, fop, fv, ft).
 *
 * Pages through the whole result server-side and streams it, so memory stays flat for big tables.
 * CSV needs the full set of attribute names up front, so it reads the table twice (names, then rows).
 */
export const GET: APIRoute = async ({ params, url, cookies }) => {
  const table = params.table!;
  const sp = url.searchParams;
  const format = sp.get('format') === 'csv' ? 'csv' : 'json';
  const typed = sp.get('typed') === '1';
  const ddb = aws.dynamodb(getCtx(cookies));

  let read: ReturnType<typeof buildRead>;
  let keys: string[];
  try {
    const t = (await ddb.send(new DescribeTableCommand({ TableName: table }))).Table!;
    read = buildRead(table, t, sp);
    keys = keyAttrs(t);
  } catch (e) {
    const status = /ResourceNotFound/i.test(errMessage(e)) ? 404 : e instanceof UserError ? 400 : 502;
    return new Response(errMessage(e), { status });
  }

  async function* pages(): AsyncGenerator<Item[]> {
    let start: Item | undefined;
    do {
      const cmd = { ...read.input, ExclusiveStartKey: start, Limit: 500 };
      const r = read.mode === 'scan' ? await ddb.send(new ScanCommand(cmd)) : await ddb.send(new QueryCommand(cmd as never));
      yield (r.Items ?? []) as Item[];
      start = r.LastEvaluatedKey as Item | undefined;
    } while (start);
  }

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try {
        if (format === 'json') {
          ctrl.enqueue(enc.encode('['));
          let first = true;
          for await (const page of pages()) {
            const out = page.map((it) => JSON.stringify(typed ? it : unmarshall(it), (k, v) => (typed && v instanceof Uint8Array ? Buffer.from(v).toString('base64') : jsonReplacer(k, v)), 2));
            if (out.length) { ctrl.enqueue(enc.encode((first ? '\n' : ',\n') + out.join(',\n'))); first = false; }
          }
          ctrl.enqueue(enc.encode('\n]\n'));
        } else {
          const names = new Set<string>();
          for await (const page of pages()) for (const it of page) for (const k of Object.keys(it)) names.add(k);
          const header = [...keys, ...[...names].filter((k) => !keys.includes(k)).sort()];
          ctrl.enqueue(enc.encode(header.map(csvCell).join(',') + '\r\n'));
          for await (const page of pages()) {
            ctrl.enqueue(enc.encode(page.map((it) => { const p = unmarshall(it) as Record<string, unknown>; return header.map((h) => csvCell(p[h])).join(','); }).join('\r\n') + (page.length ? '\r\n' : '')));
          }
        }
        ctrl.close();
      } catch (e) {
        ctrl.error(e);
      }
    },
  });

  const safe = table.replace(/[^\w.-]/g, '_');
  return new Response(body, {
    headers: {
      'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safe}.${format}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

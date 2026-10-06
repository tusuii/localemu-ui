import type { APIRoute } from 'astro';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Zip, ZipPassThrough } from 'fflate';
import { aws } from '../../../lib/aws';
import { getCtx } from '../../../lib/context';
import { errMessage } from '../../../lib/errors';
import { baseName, listKeys, parentPrefix } from '../../../lib/s3';

export const prerender = false;

const MAX_OBJECTS = 5000;

/**
 * Download selected objects and folders (recursively) as one zip. Entries keep
 * their path relative to the folder that was browsed. Accepts ?id=... (GET) or
 * a form post with `id` fields (from the table toolbar).
 */
async function handle(bucket: string, ids: string[], ctxCookies: Parameters<typeof getCtx>[0]): Promise<Response> {
  if (!ids.length) return new Response('Select at least one object or folder.', { status: 400 });
  const s3 = aws.s3(getCtx(ctxCookies));
  const entries: { key: string; name: string }[] = [];
  try {
    for (const id of ids) {
      if (id.endsWith('/')) {
        const base = parentPrefix(id);
        for await (const o of listKeys(s3, bucket, id)) {
          if (o.Key.endsWith('/')) continue;
          entries.push({ key: o.Key, name: o.Key.slice(base.length) });
          if (entries.length > MAX_OBJECTS) return new Response(`Too many objects (limit ${MAX_OBJECTS}).`, { status: 413 });
        }
      } else entries.push({ key: id, name: baseName(id) });
    }
  } catch (e) {
    return new Response(errMessage(e), { status: 500 });
  }
  if (!entries.length) return new Response('Nothing to download: the selected folders are empty.', { status: 404 });

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return; }
        if (!cancelled) controller.enqueue(chunk);
        if (final && !cancelled) controller.close();
      });
      try {
        for (const e of entries) {
          if (cancelled) return;
          const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: e.key }));
          const file = new ZipPassThrough(e.name);
          zip.add(file);
          const reader = (r.Body as { transformToWebStream(): ReadableStream<Uint8Array> }).transformToWebStream().getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            file.push(value);
          }
          file.push(new Uint8Array(0), true);
        }
        zip.end();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() { cancelled = true; },
  });
  const name = ids.length === 1 && ids[0].endsWith('/') ? baseName(ids[0]) : bucket;
  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.zip`,
      'cache-control': 'no-store',
    },
  });
}

export const GET: APIRoute = ({ params, url, cookies }) => handle(params.bucket!, url.searchParams.getAll('id'), cookies);

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const form = await request.formData().catch(() => null);
  return handle(params.bucket!, form ? form.getAll('id').map(String).filter(Boolean) : [], cookies);
};

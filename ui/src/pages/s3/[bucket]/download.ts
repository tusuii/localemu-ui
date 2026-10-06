import type { APIRoute } from 'astro';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { aws } from '../../../lib/aws';
import { getCtx } from '../../../lib/context';
import { errMessage, errName } from '../../../lib/errors';
import { isImage, isTextual } from '../../../lib/s3';

export const prerender = false;

/**
 * Stream an object to the browser. Object bodies are untrusted, so they are
 * always served from a CSP sandbox (no scripts, opaque origin) and anything
 * that isn't a plain image or text is forced to download.
 */
export const GET: APIRoute = async ({ params, url, cookies }) => {
  const bucket = params.bucket!;
  const key = url.searchParams.get('key');
  if (!key) return new Response('Missing ?key=', { status: 400 });
  try {
    const r = await aws.s3(getCtx(cookies)).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const type = r.ContentType ?? 'application/octet-stream';
    const wantInline = url.searchParams.get('inline') === '1';
    const textual = isTextual(type, key);
    const inline = wantInline && (isImage(type) && !/svg/i.test(type) || textual);
    const name = key.split('/').pop() || 'download';
    const headers = new Headers({
      'content-type': inline && textual ? 'text/plain; charset=utf-8' : type,
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      'cache-control': 'no-store',
    });
    if (r.ContentLength !== undefined) headers.set('content-length', String(r.ContentLength));
    const body = (r.Body as { transformToWebStream(): ReadableStream }).transformToWebStream();
    return new Response(body, { headers });
  } catch (e) {
    const status = /NoSuchKey|NotFound/.test(errName(e)) ? 404 : 500;
    return new Response(errMessage(e), { status });
  }
};

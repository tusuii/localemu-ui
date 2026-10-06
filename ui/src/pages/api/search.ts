import type { APIRoute } from 'astro';
import { getCtx } from '../../lib/context';
import { searchResources } from '../../lib/search';

export const prerender = false;

/** GET /api/search?q=foo&limit=8 -> resources matching foo across services, grouped. */
export const GET: APIRoute = async ({ url, cookies }) => {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 8));
  const body = q.length >= 2 ? await searchResources(getCtx(cookies), q, limit) : { q, groups: [], errors: [], slow: [], count: 0 };
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
};

import type { APIRoute } from 'astro';
import { getHealth } from '../../lib/localemu';
import { errMessage } from '../../lib/errors';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const h = await getHealth();
    return Response.json({ online: true, version: h.version, uptime: h.uptime }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ online: false, error: errMessage(e) }, { headers: { 'cache-control': 'no-store' } });
  }
};

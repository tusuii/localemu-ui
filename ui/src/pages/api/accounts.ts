import type { APIRoute } from 'astro';
import { ENDPOINT } from '../../lib/config';

export const prerender = false;

/** Known accounts, from LocalEmu's multi-account registry (best effort). */
export const GET: APIRoute = async () => {
  try {
    const res = await fetch(`${ENDPOINT}/_localemu/api/accounts`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { Accounts?: { Id?: string }[] };
    const ids = (j.Accounts ?? []).map((a) => a.Id).filter(Boolean);
    return Response.json({ accounts: ids });
  } catch {
    return Response.json({ accounts: [] });
  }
};

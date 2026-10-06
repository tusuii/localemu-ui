import type { APIRoute } from 'astro';
import { getCtx } from '../../lib/context';
import { runCommand, complete } from '../../lib/shell';
import { sameOriginProblem } from '../../lib/sameorigin';

export const prerender = false;

const headers = { 'cache-control': 'no-store' };

/**
 * POST { command } -> { stdout, stderr, code }   (run one `aws ...` command)
 * POST { complete } -> { candidates, token }     (tab completion)
 *
 * SDK calls against the configured LocalEmu endpoint only (see src/lib/shell.ts).
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const problem = sameOriginProblem(request);
  if (problem) return Response.json({ stdout: '', stderr: problem, code: 403 }, { status: 403, headers });
  let body: { command?: unknown; complete?: unknown; region?: unknown };
  try { body = await request.json(); } catch { return Response.json({ stdout: '', stderr: 'Invalid JSON body.', code: 400 }, { status: 400, headers }); }
  const ctx = getCtx(cookies);
  if (typeof body.complete === 'string') {
    try { return Response.json(await complete(body.complete.slice(0, 2000), ctx), { headers }); } catch { return Response.json({ candidates: [], token: '' }, { headers }); }
  }
  if (typeof body.command !== 'string') return Response.json({ stdout: '', stderr: 'Missing "command".', code: 400 }, { status: 400, headers });
  return Response.json(await runCommand(body.command, ctx), { headers });
};

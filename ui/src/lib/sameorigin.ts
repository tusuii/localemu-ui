/**
 * CSRF guard for JSON endpoints. Astro's `checkOrigin` only covers form content
 * types, so JSON APIs that can change state check the request themselves:
 * a same-origin `Origin` (or `Sec-Fetch-Site`), a JSON content type and a
 * custom header (which a cross-site page cannot send without a CORS preflight).
 */
export function sameOriginProblem(request: Request): string | null {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (origin && origin !== url.origin) {
    // Behind a proxy the Host header may differ from request.url; accept an Origin that matches Host.
    const host = request.headers.get('host');
    let ok = false;
    try { ok = !!host && new URL(origin).host === host; } catch { /* invalid */ }
    if (!ok) return 'Cross-origin requests are not allowed.';
  }
  if (site && !['same-origin', 'none', 'same-site'].includes(site)) return 'Cross-site requests are not allowed.';
  if (!origin && !site && !request.headers.get('x-lemu-console')) return 'Missing same-origin proof.';
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return 'Content-Type must be application/json.';
  if (request.headers.get('x-lemu-console') !== '1') return 'Missing X-LEMU-Console header.';
  return null;
}

import type { APIRoute } from 'astro';
import { COOKIE_ACCOUNT, COOKIE_REGION, knownRegion } from '../../lib/context';
import { safeRedirect } from '../../lib/action';
import { setFlash } from '../../lib/flash';

export const prerender = false;

/** Switch the active region / account. Redirects back to where the user was. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const opts = { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' as const };
  const region = String(form.get('region') ?? '');
  const account = String(form.get('account') ?? '').trim();
  if (region && knownRegion(region)) cookies.set(COOKIE_REGION, region, opts);
  if (account) {
    if (/^\d{12}$/.test(account)) cookies.set(COOKIE_ACCOUNT, account, opts);
    else setFlash(cookies, { type: 'error', text: 'Account IDs are 12 digits.' });
  }
  return redirect(safeRedirect(String(form.get('redirect') ?? '')) ?? '/', 303);
};

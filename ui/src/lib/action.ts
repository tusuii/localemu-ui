import type { AstroGlobal } from 'astro';
import { setFlash } from './flash';
import { errMessage, UserError } from './errors';
import { getCtx, type Ctx } from './context';

export interface ActionResult {
  /** Success message shown in the flashbar after the redirect. */
  message?: string;
  detail?: string;
  /** Flash style: 'success' (default) or 'warning' (partial failure). */
  type?: 'success' | 'warning';
  /** Where to go next (defaults to the current URL). */
  redirect?: string;
  /** Keep the user on the page and re-render (used for results like Invoke output). */
  stay?: boolean;
  /** Payload for the re-rendered page when `stay` is set (e.g. received messages). */
  data?: unknown;
}

export type Handler = (form: FormData, ctx: Ctx) => Promise<ActionResult | string | void>;

export interface PostOutcome {
  /** Set when the page should return immediately (redirect after success). */
  response?: Response;
  /** Set when a handler failed; the page re-renders with the message + submitted values. */
  error?: string;
  /** What the user submitted, for re-populating form fields. */
  values: Record<string, string>;
  /** Free-form data returned by a handler that used `stay`. */
  result?: ActionResult;
  intent?: string;
  posted: boolean;
}

export const formValues = (form: FormData): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && !(k in out)) out[k] = v;
  return out;
};

/**
 * Post/Redirect/Get helper. Dispatches on the submitted `intent` field.
 *
 *   const post = await handlePost(Astro, { create: async (f) => { ... return 'Created' } });
 *   if (post.response) return post.response;
 */
export async function handlePost(Astro: AstroGlobal, handlers: Record<string, Handler>): Promise<PostOutcome> {
  const empty: PostOutcome = { values: {}, posted: false };
  if (Astro.request.method !== 'POST') return empty;

  let form: FormData;
  try {
    form = await Astro.request.formData();
  } catch {
    return { values: {}, posted: true, error: 'Could not read the submitted form.' };
  }
  const values = formValues(form);
  const intent = String(form.get('intent') ?? '');
  const handler = handlers[intent];
  if (!handler) return { values, posted: true, intent, error: `Unknown action "${intent}".` };

  try {
    const raw = await handler(form, getCtx(Astro.cookies));
    const res: ActionResult = typeof raw === 'string' ? { message: raw } : (raw ?? {});
    if (res.stay) return { values, posted: true, intent, result: res };
    if (res.message) setFlash(Astro.cookies, { type: res.type ?? 'success', text: res.message, detail: res.detail });
    return { values, posted: true, intent, response: Astro.redirect(safeRedirect(res.redirect) ?? Astro.url.pathname + Astro.url.search, 303) };
  } catch (e) {
    return { values, posted: true, intent, error: e instanceof UserError ? e.message : errMessage(e) };
  }
}

export function safeRedirect(to: string | null | undefined): string | null {
  if (!to) return null;
  return to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\') ? to : null;
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
export const strs = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);

export function required(f: FormData, k: string, label = k): string {
  const v = str(f, k);
  if (!v) throw new UserError(`${label} is required.`);
  return v;
}

export function intOf(f: FormData, k: string, label = k): number | undefined {
  const v = str(f, k);
  if (v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new UserError(`${label} must be a whole number.`);
  return n;
}

export function jsonOf<T = unknown>(f: FormData, k: string, label = k): T {
  const v = str(f, k);
  try {
    return JSON.parse(v) as T;
  } catch (e) {
    throw new UserError(`${label} is not valid JSON: ${(e as Error).message}`);
  }
}

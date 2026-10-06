/**
 * Server-side paging for lists whose backend hands out continuation tokens
 * (S3, DynamoDB, Lambda, SQS ...).
 *
 * State lives in the URL so pages stay linkable and Back works:
 *   ?pt=<token of the page being shown>   (absent = first page)
 *   ?ph=<tokens of the pages before it>   (a stack, so "Previous" works)
 * Tokens are opaque to the page; they are JSON, base64url-encoded.
 */
export interface PageState {
  /** Token to request the current page with (undefined = first page). */
  token: unknown;
  /** Zero-based page index (= history length). */
  index: number;
  history: unknown[];
}

const enc = (v: unknown) => Buffer.from(JSON.stringify(v ?? null)).toString('base64url');
const dec = <T = unknown>(s: string | null | undefined): T | undefined => {
  if (!s) return undefined;
  try {
    const v = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    return (v ?? undefined) as T | undefined;
  } catch {
    return undefined;
  }
};

export function pageState(url: URL): PageState {
  const token = dec(url.searchParams.get('pt'));
  const history = dec<unknown[]>(url.searchParams.get('ph')) ?? [];
  return { token, history: Array.isArray(history) ? history.slice(-200) : [], index: Array.isArray(history) ? Math.min(history.length, 200) : 0 };
}

function link(url: URL, token: unknown, history: unknown[]): string {
  const u = new URL(url);
  if (token === undefined || token === null) u.searchParams.delete('pt');
  else u.searchParams.set('pt', enc(token));
  if (!history.length) u.searchParams.delete('ph');
  else u.searchParams.set('ph', enc(history));
  return u.pathname + u.search;
}

export interface PageLinks {
  index: number;
  /** Link to the previous page, or null on the first page. */
  prev: string | null;
  /** Link to the next page, or null when the backend has no more. */
  next: string | null;
  /** Link to the first page, or null on the first page. */
  first: string | null;
}

/** Build prev/next links. `nextToken` is whatever the backend returned for "more"; falsy = last page. */
export function pageLinks(url: URL, state: PageState, nextToken: unknown): PageLinks {
  const hasPrev = state.index > 0;
  const prevHist = state.history.slice(0, -1);
  const prevTok = hasPrev ? state.history[state.history.length - 1] : undefined;
  return {
    index: state.index,
    prev: hasPrev ? link(url, prevTok, prevHist) : null,
    next: nextToken ? link(url, nextToken, [...state.history, state.token ?? null]) : null,
    first: hasPrev ? link(url, undefined, []) : null,
  };
}

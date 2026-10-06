import type { AstroCookies } from 'astro';
import { DEFAULT_ACCOUNT, DEFAULT_REGION, REGIONS } from './config';

/** The "who and where" of a request: LocalEmu namespaces state per account + region. */
export interface Ctx {
  region: string;
  account: string;
}

export const COOKIE_REGION = 'lemu_region';
export const COOKIE_ACCOUNT = 'lemu_account';

export function getCtx(cookies: AstroCookies): Ctx {
  const region = cookies.get(COOKIE_REGION)?.value;
  const account = cookies.get(COOKIE_ACCOUNT)?.value;
  return {
    region: region && /^[a-z]{2}(-[a-z]+)+-\d$/.test(region) ? region : DEFAULT_REGION,
    account: account && /^\d{12}$/.test(account) ? account : DEFAULT_ACCOUNT,
  };
}

export const knownRegion = (r: string) => REGIONS.some((x) => x.id === r);

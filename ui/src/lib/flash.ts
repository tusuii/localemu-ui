import type { AstroCookies } from 'astro';

export type FlashType = 'success' | 'error' | 'warning' | 'info';
export interface Flash { type: FlashType; text: string; detail?: string }

const NAME = 'lemu_flash';

export function setFlash(cookies: AstroCookies, flash: Flash) {
  cookies.set(NAME, JSON.stringify(flash).slice(0, 3000), { path: '/', maxAge: 120, httpOnly: true, sameSite: 'lax' });
}

export function takeFlash(cookies: AstroCookies): Flash | null {
  const c = cookies.get(NAME);
  if (!c) return null;
  cookies.delete(NAME, { path: '/' });
  try { return c.json() as Flash; } catch { return null; }
}

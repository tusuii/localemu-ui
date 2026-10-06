import { ENDPOINT } from './config';
import { errMessage } from './errors';

/** Thin client for LocalEmu's own control endpoints (health + dashboard API). */

async function getJson<T>(path: string, ms = 4000): Promise<T> {
  const res = await fetch(ENDPOINT + path, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `${res.status} ${res.statusText}`;
    try { const j = JSON.parse(body); msg = j.message || j.error || msg; } catch { /* keep status text */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export interface Health {
  edition?: string;
  version: string;
  uptime?: number;
  services: Record<string, string>;
}

export const getHealth = () => getJson<Health>('/_localemu/health');

export interface RegistrySpec {
  name: string;
  tier: 'live' | 'metadata' | 'not_emulated';
  label: string;
  group: string;
  docs_slug: string | null;
  banner: string | null;
  empty_state: string | null;
  copy_cmd_template: string | null;
  columns: string[];
}

export async function getRegistry(): Promise<RegistrySpec[]> {
  const r = await getJson<{ services: RegistrySpec[] }>('/_localemu/api/registry');
  return r.services;
}

export interface Overview {
  version: string;
  uptime_seconds: number;
  port: number;
  features: Record<string, boolean>;
  services: Record<string, { status: string; resources: number }>;
}
export const getOverview = () => getJson<Overview>('/_localemu/api/overview', 6000);

export interface ActivityEvent {
  request_id?: string;
  service?: string;
  operation?: string;
  [k: string]: unknown;
}
export async function getActivity(limit = 50): Promise<{ events: ActivityEvent[]; total: number }> {
  return getJson(`/_localemu/api/activity?limit=${limit}`);
}

/** True for the console's own read-only polling, which would otherwise drown real traffic. */
export const isConsoleNoise = (e: ActivityEvent) => String(e.user_agent ?? '').includes('localemu-console') && !!e.read_only;

export async function getCloudTrail(params: Record<string, string | number> = {}) {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  return getJson<Record<string, unknown>>(`/_localemu/api/cloudtrail${q ? '?' + q : ''}`, 8000);
}

export const getCloudTrailEvent = (id: string) => getJson<Record<string, unknown>>(`/_localemu/api/cloudtrail/${encodeURIComponent(id)}`);

export async function dashboardResources(service: string): Promise<unknown> {
  return getJson(`/_localemu/api/resources/${encodeURIComponent(service)}`, 8000);
}

/** True when the gateway answers at all. */
export async function ping(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getJson('/_localemu/health', 2500);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

import { buildCatalog, CONSOLES, type CatalogEntry } from './services';
import { getHealth, getRegistry, type Health, type RegistrySpec } from './localemu';
import { errMessage } from './errors';

interface Snapshot {
  at: number;
  online: boolean;
  error?: string;
  health?: Health;
  registry?: RegistrySpec[];
  catalog: CatalogEntry[];
}

let snap: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

async function refresh(): Promise<Snapshot> {
  const [h, r] = await Promise.allSettled([getHealth(), getRegistry()]);
  const health = h.status === 'fulfilled' ? h.value : undefined;
  const registry = r.status === 'fulfilled' ? r.value : undefined;
  return {
    at: Date.now(),
    online: !!health,
    error: h.status === 'rejected' ? errMessage(h.reason) : undefined,
    health,
    registry,
    catalog: buildCatalog(health?.services, registry),
  };
}

/** Cached for a few seconds so layout rendering never costs an extra round trip per click. */
export async function getSnapshot(maxAgeMs = 8000): Promise<Snapshot> {
  if (snap && Date.now() - snap.at < (snap.online ? maxAgeMs : 2000)) return snap;
  inflight ??= refresh().then((s) => { snap = s; return s; }).finally(() => { inflight = null; });
  return inflight;
}

export const consoleCatalog = () => buildCatalog(undefined, undefined).filter((e) => e.hasConsole);
export { CONSOLES };

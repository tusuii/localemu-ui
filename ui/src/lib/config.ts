/** Server-side runtime configuration (read from the environment). */

const env = (k: string, d: string) => process.env[k] ?? (import.meta.env as Record<string, string | undefined>)[k] ?? d;

/** Where LocalEmu's gateway listens, as seen from the console server. */
export const ENDPOINT = env('LOCALEMU_ENDPOINT', 'http://localhost:4566').replace(/\/+$/, '');

/**
 * The same gateway as the *browser* sees it. Used for links that the user's
 * browser follows directly (pre-signed URLs, API Gateway invoke URLs).
 */
export const PUBLIC_ENDPOINT = env('LOCALEMU_PUBLIC_ENDPOINT', ENDPOINT).replace(/\/+$/, '');

export const DEFAULT_REGION = env('LOCALEMU_DEFAULT_REGION', 'us-east-1');
export const DEFAULT_ACCOUNT = env('LOCALEMU_DEFAULT_ACCOUNT', '000000000000');

export const REGIONS: { id: string; name: string }[] = [
  { id: 'us-east-1', name: 'US East (N. Virginia)' },
  { id: 'us-east-2', name: 'US East (Ohio)' },
  { id: 'us-west-1', name: 'US West (N. California)' },
  { id: 'us-west-2', name: 'US West (Oregon)' },
  { id: 'ca-central-1', name: 'Canada (Central)' },
  { id: 'eu-west-1', name: 'Europe (Ireland)' },
  { id: 'eu-west-2', name: 'Europe (London)' },
  { id: 'eu-west-3', name: 'Europe (Paris)' },
  { id: 'eu-central-1', name: 'Europe (Frankfurt)' },
  { id: 'eu-north-1', name: 'Europe (Stockholm)' },
  { id: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
  { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
  { id: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
  { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
  { id: 'ap-northeast-2', name: 'Asia Pacific (Seoul)' },
  { id: 'sa-east-1', name: 'South America (São Paulo)' },
];

export const regionName = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? id;

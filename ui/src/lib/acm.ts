export const certId = (arn: string) => arn.split('/').pop() ?? arn;
export const KEY_ALGORITHMS = [
  ['RSA_2048', 'RSA 2048'], ['RSA_3072', 'RSA 3072'], ['RSA_4096', 'RSA 4096'],
  ['EC_prime256v1', 'ECDSA P-256'], ['EC_secp384r1', 'ECDSA P-384'], ['EC_secp521r1', 'ECDSA P-521'],
] as const;
/** Split a textarea of domain names (one per line or comma separated). */
export const splitDomains = (s: string) => [...new Set(s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))];

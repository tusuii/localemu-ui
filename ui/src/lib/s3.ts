import {
  DeleteObjectsCommand, ListObjectsV2Command, ListObjectVersionsCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

/** Delete every key (and version) under a prefix. Returns the number removed. */
export async function deletePrefix(s3: S3Client, bucket: string, prefix = ''): Promise<number> {
  let removed = 0;
  // Versioned buckets need version ids; fall back to a plain listing if unsupported.
  try {
    let keyMarker: string | undefined;
    let versionMarker: string | undefined;
    for (;;) {
      const r = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix, KeyMarker: keyMarker, VersionIdMarker: versionMarker }));
      const items = [...(r.Versions ?? []), ...(r.DeleteMarkers ?? [])].map((v) => ({ Key: v.Key!, VersionId: v.VersionId === 'null' ? undefined : v.VersionId }));
      if (items.length) {
        await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: items, Quiet: true } }));
        removed += items.length;
      }
      if (!r.IsTruncated) break;
      keyMarker = r.NextKeyMarker;
      versionMarker = r.NextVersionIdMarker;
    }
    if (removed) return removed;
  } catch { /* fall through to a plain listing */ }

  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    const keys = (r.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
      removed += keys.length;
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return removed;
}

const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|x-sh|sql|toml)|image\/svg\+xml)/i;
export const isTextual = (contentType?: string, key = '') =>
  (!!contentType && TEXT_TYPES.test(contentType)) || /\.(txt|md|json|ya?ml|xml|csv|tsv|log|ini|toml|sh|py|js|ts|html|css|sql|env|conf)$/i.test(key);
export const isImage = (contentType?: string) => !!contentType && /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|x-icon)/i.test(contentType);

export const validBucketName = (n: string) => /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(n) && !/\.\./.test(n) && !/^\d+\.\d+\.\d+\.\d+$/.test(n);

export const baseName = (key: string) => key.replace(/\/$/, '').split('/').pop() ?? key;
export const parentPrefix = (prefix: string) => (prefix.replace(/\/$/, '').split('/').slice(0, -1).join('/') + '/').replace(/^\/$/, '');

/** Make a browser-supplied relative path safe to use as an object key suffix. */
export function cleanRelPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..');
  return parts.join('/');
}

/** Iterate every object key under a prefix (no delimiter), page by page. */
export async function* listKeys(s3: S3Client, bucket: string, prefix: string): AsyncGenerator<{ Key: string; Size: number }> {
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) yield { Key: o.Key!, Size: o.Size ?? 0 };
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
}

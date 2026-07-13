// S3 media uploads (team photos etc.).
// Credentials come from the environment / instance role (App Runner instance
// role in production). Configure via:
//   MEDIA_BUCKET           - S3 bucket for uploads (required to enable uploads)
//   MEDIA_REGION           - bucket region (defaults to AWS_REGION or ap-south-1)
//   MEDIA_PUBLIC_BASE_URL  - optional public base URL (e.g. a CloudFront/CDN
//                            domain). Defaults to the bucket's S3 URL.
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.MEDIA_BUCKET || '';
const REGION = process.env.MEDIA_REGION || process.env.AWS_REGION || 'ap-south-1';
const PUBLIC_BASE = (process.env.MEDIA_PUBLIC_BASE_URL || `https://${BUCKET}.s3.${REGION}.amazonaws.com`).replace(/\/$/, '');

export const uploadsEnabled = Boolean(BUCKET);

let client = null;
function getClient() {
  if (!client) client = new S3Client({ region: REGION });
  return client;
}

// Upload a buffer to S3 under `key` and return its public URL.
export async function uploadObject(key, buffer, contentType) {
  if (!uploadsEnabled) throw Object.assign(new Error('Uploads are not configured (set MEDIA_BUCKET).'), { userFacing: true });
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=86400',
    })
  );
  return `${PUBLIC_BASE}/${key}`;
}

// Best-effort delete of a previously uploaded object, given its public URL.
export async function deleteByUrl(url) {
  if (!uploadsEnabled || !url) return;
  if (!url.startsWith(PUBLIC_BASE + '/')) return; // only delete our own objects
  const key = url.slice(PUBLIC_BASE.length + 1);
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    /* ignore */
  }
}

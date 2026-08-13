import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { getEnv } from '@/lib/env';

const globalForS3 = globalThis as unknown as { pakinoS3?: S3Client };

function createS3(): S3Client {
  const env = getEnv();
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    forcePathStyle: true,
  });
}

export const s3 = globalForS3.pakinoS3 ?? createS3();
if (process.env.NODE_ENV !== 'production') globalForS3.pakinoS3 = s3;

const BUCKET = () => getEnv().S3_BUCKET;

export function uploadKey(kind: 'uploads' | 'outputs', id: string, ext: string) {
  return `${kind}/${id}.${ext}`;
}

export async function createPresignedUpload(key: string, contentType: string, expiresIn = 300) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

export async function createPresignedDownload(key: string, filename: string, expiresIn = 3600) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    }),
    { expiresIn },
  );
}

export async function streamToS3(body: Readable, key: string, contentType: string) {
  const upload = new Upload({
    client: s3,
    params: { Bucket: BUCKET(), Key: key, Body: body, ContentType: contentType },
  });
  await upload.done();
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
}

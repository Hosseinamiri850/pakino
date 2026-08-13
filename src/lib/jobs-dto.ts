import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { createPresignedDownload } from '@/lib/storage/s3';

export async function mapJob(job: typeof schema.jobs.$inferSelect) {
  let outputUrl: string | null = null;
  if (job.status === 'COMPLETED' && job.outputFileId) {
    const [f] = await db.select().from(schema.files).where(eq(schema.files.id, job.outputFileId)).limit(1);
    if (f) {
      const ext = f.storageKey.split('.').pop() ?? 'bin';
      outputUrl = await createPresignedDownload(f.storageKey, `pakino-${job.id}.${ext}`);
    }
  }
  let inputUrl: string | null = null;
  if (job.inputFileId) {
    const [f] = await db.select().from(schema.files).where(eq(schema.files.id, job.inputFileId)).limit(1);
    if (f) inputUrl = await createPresignedDownload(f.storageKey, f.originalFilename);
  }
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    provider: job.provider,
    watermarkType: job.watermarkType,
    confidence: job.confidence,
    location: job.location,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    creditsUsed: job.creditsUsed,
    durationSeconds: job.durationSeconds,
    originalFilename: null as string | null,
    inputSize: job.inputSize,
    outputSize: job.outputSize,
    outputUrl,
    inputUrl,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

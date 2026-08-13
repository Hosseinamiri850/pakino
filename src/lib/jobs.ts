import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import type { MediaKind } from '@/lib/types';
import { enqueueJob, type JobMessage } from '@/lib/queue';
import { getEnv } from '@/lib/env';

export interface CreateJobInput {
  userId: string | null;
  inputFileId: string;
  type: MediaKind;
  inputSize: number;
  originalFilename: string;
}

export async function createJob(input: CreateJobInput): Promise<string> {
  const [job] = await db
    .insert(schema.jobs)
    .values({
      userId: input.userId,
      inputFileId: input.inputFileId,
      type: input.type,
      status: 'UPLOADING',
      progress: 0,
      inputSize: input.inputSize,
    })
    .returning();

  return job!.id;
}

export async function enqueueExistingJob(jobId: string): Promise<void> {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1);
  if (!job) return;
  const [file] = await db.select().from(schema.files).where(eq(schema.files.id, job.inputFileId!)).limit(1);
  if (!file) return;

  const env = getEnv();
  const msg: JobMessage = {
    job_id: job.id,
    user_id: job.userId,
    type: job.type,
    input_key: file.storageKey,
    input_filename: file.originalFilename,
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes,
    expires_at: file.expiresAt?.getTime() ?? Date.now() + 24 * 3600 * 1000,
    processing_backend: env.PROCESSING_BACKEND,
  };
  await enqueueJob(msg);
}

import { redis } from './redis';
import { getEnv } from '@/lib/env';

export interface JobMessage {
  job_id: string;
  user_id: string | null;
  type: 'image' | 'video';
  input_key: string;
  input_filename: string;
  mime_type: string;
  size_bytes: number;
  expires_at: number;
  processing_backend: string;
}

export async function enqueueJob(msg: JobMessage): Promise<void> {
  const data = JSON.stringify(msg);
  await redis.rpush(getEnv().QUEUE_NAME, data);
}

export async function cancelJob(jobId: string): Promise<void> {
  await redis.sadd(`pakino:cancelled:${jobId}`, '1');
  await redis.expire(`pakino:cancelled:${jobId}`, 3600);
}

export async function isCancelled(jobId: string): Promise<boolean> {
  const v = await redis.exists(`pakino:cancelled:${jobId}`);
  return v === 1;
}

export type JobStatus =
  | 'UPLOADING'
  | 'ANALYZING'
  | 'DETECTING'
  | 'PROCESSING'
  | 'ENCODING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type MediaKind = 'image' | 'video';

export interface WatermarkInfo {
  provider: string | null;
  type: string | null;
  confidence: number | null;
  location: string | null;
  processing_backend: string | null;
}

export interface JobDto {
  id: string;
  type: MediaKind;
  status: JobStatus;
  progress: number;
  stage: string | null;
  provider: string | null;
  watermarkType: string | null;
  confidence: number | null;
  location: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  creditsUsed: number | null;
  durationSeconds: number | null;
  originalFilename: string | null;
  inputSize: number | null;
  outputSize: number | null;
  outputUrl: string | null;
  inputUrl: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message = code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

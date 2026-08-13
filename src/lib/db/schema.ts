import { pgTable, text, timestamp, integer, real, uuid, pgEnum } from 'drizzle-orm/pg-core';

export const jobStatusEnum = pgEnum('job_status', [
  'UPLOADING',
  'ANALYZING',
  'DETECTING',
  'PROCESSING',
  'ENCODING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export const mediaKindEnum = pgEnum('media_kind', ['image', 'video']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  locale: text('locale').default('fa').notNull(),
  credits: integer('credits').default(0).notNull(),
  plan: text('plan').default('free').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  storageKey: text('storage_key').notNull(),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  checksum: text('checksum'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  inputFileId: uuid('input_file_id').references(() => files.id),
  outputFileId: uuid('output_file_id').references(() => files.id),
  type: mediaKindEnum('type').notNull(),
  provider: text('provider'),
  watermarkType: text('watermark_type'),
  confidence: real('confidence'),
  location: text('location'),
  status: jobStatusEnum('status').default('UPLOADING').notNull(),
  progress: integer('progress').default(0).notNull(),
  stage: text('stage'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  processingBackend: text('processing_backend'),
  creditsUsed: integer('credits_used'),
  durationSeconds: real('duration_seconds'),
  inputSize: integer('input_size'),
  outputSize: integer('output_size'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  jobId: uuid('job_id').references(() => jobs.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  plan: text('plan').notNull(),
  credits: integer('credits').notNull(),
  status: text('status').default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  provider: text('provider').notNull(),
  providerAuthority: text('provider_authority'),
  providerRefId: text('provider_ref_id'),
  amountToman: integer('amount_toman').notNull(),
  plan: text('plan').notNull(),
  credits: integer('credits').notNull(),
  status: text('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
});

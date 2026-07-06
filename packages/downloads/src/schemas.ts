import { z } from 'zod';
import {
  DOWNLOAD_ACTORS,
  DOWNLOAD_COMMAND_ACTIONS,
  DOWNLOAD_RISKS,
  DOWNLOAD_STATUSES,
  DOWNLOAD_TRUST_VERDICTS,
  type DownloadCommandInput,
  type DownloadCreateInput,
  type DownloadRecord,
} from './index';

export const DownloadActorSchema = z.enum(DOWNLOAD_ACTORS);
export const DownloadStatusSchema = z.enum(DOWNLOAD_STATUSES);
export const DownloadTrustVerdictSchema = z.enum(DOWNLOAD_TRUST_VERDICTS);
export const DownloadRiskSchema = z.enum(DOWNLOAD_RISKS);
export const DownloadCommandActionSchema = z.enum(DOWNLOAD_COMMAND_ACTIONS);

export const DownloadProvenanceSchema = z.object({
  actor: DownloadActorSchema,
  sourceUrl: z.string().max(4096).optional(),
  sourceOrigin: z.string().max(2048).optional(),
  correlationId: z.string().max(128).optional(),
  taskId: z.string().max(128).optional(),
});

export const DownloadRecordSchema = z.object({
  id: z.string().min(1).max(128),
  url: z.string().min(1).max(4096),
  filename: z.string().min(1).max(512),
  mimeType: z.string().max(256).optional(),
  status: DownloadStatusSchema,
  risk: DownloadRiskSchema,
  trustVerdict: DownloadTrustVerdictSchema,
  receivedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative().nullable(),
  canResume: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative().optional(),
  error: z.string().max(2048).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  provenance: DownloadProvenanceSchema,
}) satisfies z.ZodType<DownloadRecord>;

export const DownloadCreateInputSchema = z.object({
  url: z.string().min(1).max(4096),
  filename: z.string().min(1).max(512).optional(),
  actor: DownloadActorSchema.optional(),
  sourceUrl: z.string().max(4096).optional(),
  correlationId: z.string().max(128).optional(),
  taskId: z.string().max(128).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
}) satisfies z.ZodType<DownloadCreateInput>;

export const DownloadCommandInputSchema = z.object({
  id: z.string().min(1).max(128),
  action: DownloadCommandActionSchema,
}) satisfies z.ZodType<DownloadCommandInput>;

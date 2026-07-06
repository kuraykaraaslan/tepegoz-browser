import { z } from 'zod';
import {
  UPLOAD_ACTORS,
  UPLOAD_COMMAND_ACTIONS,
  UPLOAD_RISKS,
  UPLOAD_STATUSES,
  type UploadCommandInput,
  type UploadCreateInput,
  type UploadFileRecord,
  type UploadRecord,
} from './index';

export const UploadStatusSchema = z.enum(UPLOAD_STATUSES);
export const UploadActorSchema = z.enum(UPLOAD_ACTORS);
export const UploadRiskSchema = z.enum(UPLOAD_RISKS);
export const UploadCommandActionSchema = z.enum(UPLOAD_COMMAND_ACTIONS);

export const UploadFileRecordSchema = z.object({
  filename: z.string().min(1).max(512),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string().max(256).optional(),
  risk: UploadRiskSchema,
}) satisfies z.ZodType<UploadFileRecord>;

export const UploadProvenanceSchema = z.object({
  actor: UploadActorSchema,
  sourceUrl: z.string().max(4096).optional(),
  sourceOrigin: z.string().max(2048).optional(),
  correlationId: z.string().max(128).optional(),
  taskId: z.string().max(128).optional(),
});

export const UploadRecordSchema = z.object({
  id: z.string().min(1).max(128),
  tabId: z.string().min(1).max(128).optional(),
  targetOrigin: z.string().max(2048).optional(),
  targetUrl: z.string().max(4096).optional(),
  ref: z.number().int().positive().max(10_000).optional(),
  purpose: z.string().max(512).optional(),
  status: UploadStatusSchema,
  risk: UploadRiskSchema,
  files: z.array(UploadFileRecordSchema).min(1).max(20),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative().optional(),
  error: z.string().max(2048).optional(),
  provenance: UploadProvenanceSchema,
}) satisfies z.ZodType<UploadRecord>;

export const UploadCreateInputSchema = z.object({
  tabId: z.string().min(1).max(128).optional(),
  ref: z.number().int().positive().max(10_000),
  paths: z.array(z.string().min(1).max(4096)).min(1).max(20),
  purpose: z.string().max(512).optional(),
  actor: UploadActorSchema.optional(),
  sourceUrl: z.string().max(4096).optional(),
  correlationId: z.string().max(128).optional(),
  taskId: z.string().max(128).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
}) satisfies z.ZodType<UploadCreateInput>;

export const UploadCommandInputSchema = z.object({
  id: z.string().min(1).max(128),
  action: UploadCommandActionSchema,
}) satisfies z.ZodType<UploadCommandInput>;

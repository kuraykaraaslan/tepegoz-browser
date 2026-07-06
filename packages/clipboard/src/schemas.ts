import { z } from 'zod';
import {
  CLIPBOARD_ACTORS,
  CLIPBOARD_CONTENT_KINDS,
  CLIPBOARD_OPERATIONS,
  type ClipboardOperationInput,
  type ClipboardReadTextInput,
  type ClipboardWriteTextInput,
} from './index';

export const ClipboardActorSchema = z.enum(CLIPBOARD_ACTORS);
export const ClipboardOperationSchema = z.enum(CLIPBOARD_OPERATIONS);
export const ClipboardContentKindSchema = z.enum(CLIPBOARD_CONTENT_KINDS);

export const ClipboardOperationInputSchema = z.object({
  operation: ClipboardOperationSchema,
  actor: ClipboardActorSchema.optional(),
  origin: z.string().max(2048).optional(),
}) satisfies z.ZodType<ClipboardOperationInput>;

export const ClipboardWriteTextInputSchema = z.object({
  text: z.string().max(1_000_000),
  actor: ClipboardActorSchema.optional(),
  origin: z.string().max(2048).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
}) satisfies z.ZodType<ClipboardWriteTextInput>;

export const ClipboardReadTextInputSchema = z.object({
  actor: ClipboardActorSchema.optional(),
  origin: z.string().max(2048).optional(),
}) satisfies z.ZodType<ClipboardReadTextInput>;

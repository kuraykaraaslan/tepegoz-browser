import { z } from 'zod';
import { EventTypeEnum } from './enums';

/**
 * Append-only Event Journal record — the single source of truth (plan L1).
 * State/observability/audit/replay/checkpoint all derive from these. base64 is NEVER embedded here;
 * large blobs live in the content-addressed store and are referenced by hash (`blobRef`).
 */
export const EventSchema = z.object({
  /** Monotonic log sequence number, assigned by the journal writer (SQLite autoincrement). */
  lsn: z.number().int().nonnegative(),
  id: z.string().uuid(),
  type: EventTypeEnum,
  /** Epoch milliseconds, stamped by the writer. */
  ts: z.number().int().nonnegative(),
  /** Who/what produced the event, e.g. 'user', 'system', 'agent:worker-3'. */
  actor: z.string().min(1),
  /** Correlates all events of a single task/run. */
  correlationId: z.string().min(1),
  /** Schema-validated, redacted payload (secret/PII stripped before write). */
  payload: z.unknown(),
  /** Reference to a blob in the content-addressed store, if any (sha256). */
  blobRef: z
    .string()
    .regex(/^cas:\/\/[a-f0-9]{64}$/)
    .optional(),
  /** True once secret/PII redaction has been applied. */
  redacted: z.boolean(),
  /** Originating device — the append-only journal's sync key (day-0 sync-meta for Phase 3). */
  deviceId: z.string().min(1),
});
export type EventRecord = z.infer<typeof EventSchema>;

/**
 * Input to append a new event. `lsn` (autoincrement) and `deviceId` (the local device) are assigned
 * by the journal, so callers do not provide them.
 */
export const EventInputSchema = EventSchema.omit({ lsn: true, deviceId: true });
export type EventInput = z.infer<typeof EventInputSchema>;

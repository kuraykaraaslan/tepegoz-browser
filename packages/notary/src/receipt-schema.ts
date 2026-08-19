import { z } from 'zod';
import type { ReplayReceipt } from './replay-receipt';

/**
 * Validates a receipt read from disk — the CLI's own trust boundary. A `.json` file handed to
 * `tepegoz-verify` is untrusted input exactly like any other file a user points a tool at; this is what
 * turns "the file did not even parse as a receipt" into a clean `INVALID` verdict instead of a thrown
 * exception with a stack trace, which is a poor way to tell a non-technical auditor "wrong file".
 */
const Hex64 = z.string().regex(/^[0-9a-f]{64}$/, 'expected a 64-character lowercase hex hash');

const ChainedEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  ts: z.number().int().nonnegative(),
  actor: z.string().min(1),
  correlationId: z.string().min(1),
  payload: z.unknown(),
  blobRef: z.string().optional(),
  redacted: z.boolean(),
  prevHash: Hex64,
  selfHash: Hex64,
});

const CheckpointSchema = z.object({
  chainRoot: Hex64,
  signedAt: z.number().int().nonnegative(),
  signature: z.string().min(1),
  publicKeyPem: z.string().min(1),
});

export const ReplayReceiptSchema = z.object({
  version: z.literal(1),
  correlationId: z.string().min(1),
  deviceId: z.string().min(1),
  events: z.array(ChainedEventSchema).min(1),
  checkpoint: CheckpointSchema,
});

/**
 * Parse untrusted JSON into a {@link ReplayReceipt}, or `null` on a shape mismatch.
 *
 * A thin wrapper over `safeParse`, kept because zod infers an `unknown`-typed field (`payload`) as an
 * OPTIONAL key rather than a required one whose value may be `unknown` — a documented zod quirk, not a
 * property of receipts. Rebuilding each event as an explicit object literal (every key written out,
 * never spread) restores the key to required, so callers get the exact `ReplayReceipt` shape the rest of
 * this package works with instead of everyone needing to know about the quirk.
 */
export function parseReceipt(raw: unknown): ReplayReceipt | null {
  const parsed = ReplayReceiptSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    version: r.version,
    correlationId: r.correlationId,
    deviceId: r.deviceId,
    checkpoint: r.checkpoint,
    events: r.events.map((e) => ({
      id: e.id,
      type: e.type,
      ts: e.ts,
      actor: e.actor,
      correlationId: e.correlationId,
      payload: e.payload,
      ...(e.blobRef !== undefined ? { blobRef: e.blobRef } : {}),
      redacted: e.redacted,
      prevHash: e.prevHash,
      selfHash: e.selfHash,
    })),
  };
}

import { z } from 'zod';

/**
 * The Transaction Mandate (Phase 9, "the killer agentic use cases are exactly where excessive-agency
 * disasters happen"). A mandate is a signed, deterministic, bounded authorization to spend — the agent
 * can transact ONLY inside an active one, and everything a mandate can grant is expressible in this
 * schema: an amount ceiling, a currency, which domains it covers, when it expires, and whether it may be
 * consumed once or repeatedly. There is no field for "and anything else the model decides is
 * reasonable" — an authorization with an escape hatch is not a bound.
 */
export const MandateUsageSchema = z.enum(['single_use', 'recurring']);
export type MandateUsage = z.infer<typeof MandateUsageSchema>;

export const MandateSchema = z.object({
  id: z.string().uuid(),
  /** Per-TRANSACTION ceiling, not a cumulative budget across a recurring mandate's whole lifetime — a
   *  recurring mandate bounds each individual spend, not the total the agent could spend by living long
   *  enough. A cumulative budget is a real, separate feature this schema deliberately does not claim to
   *  provide yet (see the phase ADR). */
  maxAmount: z.number().positive(),
  /** ISO 4217, e.g. "TRY", "USD". A mandate never silently covers a different currency than it named. */
  currency: z.string().length(3).toUpperCase(),
  /** Registrable domains (eTLD+1) this mandate authorizes spending on. Never empty — a mandate with no
   *  domain scope would be a blank cheque. */
  allowedDomains: z.array(z.string().min(1).max(255)).min(1),
  expiresAt: z.number().int().positive(),
  usage: MandateUsageSchema,
  /**
   * An amount at or above which even an IN-mandate transaction still forces biometric HITL — a lower
   * ceiling INSIDE the mandate's own ceiling, for a user who wants routine small spends unattended but
   * still wants a hand on the wheel for the larger ones. Absent means every consumption is confirmed by
   * the existing `financial` danger-class rule regardless (ADR-0006 already forces HITL + biometric on
   * `financial`) — this field can only ever make confirmation MORE frequent than that baseline, never
   * less; the mandate cannot use this field to skip the kernel's own financial-tier HITL.
   */
  hitlThreshold: z.number().nonnegative().optional(),
});
export type Mandate = z.infer<typeof MandateSchema>;

/** One attempt to spend against a mandate. `idempotencyKey` is what makes a retried/resumed attempt
 *  replay-safe — see `consumeMandate` in `@tepegoz/security-policy/mandate-kernel.ts`. */
export const MandateConsumptionRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.string().length(3),
  /** The URL the spend targets — matched against `allowedDomains` on its registrable domain. */
  targetUrl: z.string().min(1).max(4096),
});
export type MandateConsumptionRequest = z.infer<typeof MandateConsumptionRequestSchema>;

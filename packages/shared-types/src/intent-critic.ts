import { z } from 'zod';

/**
 * The advisory intent-alignment critic's verdict (S6 PR4).
 *
 * A second opinion on *"is this action still what the user asked for?"*, taken after the deterministic
 * kernel has already decided the call is permitted. It exists because the kernel is argument- and
 * policy-shaped, not intent-shaped: a page that persuades the model to email a file can produce a call
 * that is individually legal and collectively wrong.
 *
 * **Advisory by owner decision** — it logs, it never blocks. That is not a weaker form of the same
 * thing: a blocking critic is a model deciding whether another model may act, which puts an
 * unverifiable judgement on the critical path. Divergence detection is reported as a *rate*, never as a
 * gate.
 */
export const CriticVerdictSchema = z.object({
  /** Does this action serve the request the user actually made? */
  aligned: z.boolean(),
  /** Why — one short sentence. Capped because it lands in the journal and the model wrote it. */
  reason: z.string().max(300),
});
export type CriticVerdict = z.infer<typeof CriticVerdictSchema>;

/**
 * What the critic is allowed to see about a call.
 *
 * Deliberately narrow: enough to judge intent, never enough to leak a secret. Argument VALUES are not
 * part of this shape at all — see the redaction in the capability plane — so the critic cannot become a
 * second channel for the credential the broker exists to keep out of model context.
 */
export const CriticRequestSchema = z.object({
  /** The user's original request for this run. */
  goal: z.string().max(2000),
  toolName: z.string().max(100),
  /** The derived risk tier for this call. */
  tier: z.string().max(40),
  /** Where the action lands, when it has a target. */
  targetUrl: z.string().max(2048).optional(),
  /** A redacted description of the arguments — key names and shapes, never secret values. */
  argSummary: z.string().max(500),
});
export type CriticRequest = z.infer<typeof CriticRequestSchema>;

import { z } from 'zod';

/**
 * A streamed, UNSETTLED fragment of model output (ADR-0025), validated at the boundary it crosses.
 *
 * The sender is the main process, which is trusted — but the `text` it carries is raw model output,
 * which is not. It is display-only by contract: never journaled, never persisted to conversation
 * history, never parsed for a decision. This schema is what makes "display-only" enforceable rather
 * than merely documented: a bounded string, no structure to mis-read, and a shape the renderer can
 * `safeParse` before it touches state.
 *
 * The cap is deliberately generous but finite. A provider that streams without end must not be able
 * to grow the renderer's memory one fragment at a time.
 */
export const MAX_DELTA_TEXT = 4000;

export const AgentDeltaSchema = z.object({
  runId: z.string().min(1).max(64),
  groupId: z.string().min(1).max(64),
  text: z.string().max(MAX_DELTA_TEXT),
  /**
   * Time from run start to this fragment, in ms. Present on the FIRST delta of a run only — it is the
   * time-to-first-feedback measurement (S8), and putting it on every fragment would pay for the metric
   * on every token to learn something that only happens once.
   */
  firstFeedbackMs: z.number().int().nonnegative().optional(),
});
export type AgentDeltaPayload = z.infer<typeof AgentDeltaSchema>;

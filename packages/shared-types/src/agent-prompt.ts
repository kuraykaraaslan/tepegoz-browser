/**
 * Size bounds for an `agent:run` prompt and the attachments the panel inlines into it.
 *
 * These live here, not beside either user, because they have TWO users that must agree: the Agent
 * panel, which assembles the prompt (`serializeAttachments`), and the IPC boundary, which validates
 * it (`AgentRunInputSchema`). When they disagreed, the panel produced prompts the boundary refused —
 * the panel sliced each attachment to 8000 characters and the boundary capped the whole assembled
 * string at 4000, so a single selection longer than a short paragraph made the run unconditionally
 * unsendable. Both numbers looked defensible in isolation; only together were they a bug.
 *
 * So the boundary's bound is DERIVED from the panel's, below, rather than chosen. A future change to
 * the attachment budget moves the boundary with it, and the two cannot drift apart again.
 */

/** What the user actually typed. */
export const MAX_USER_PROMPT_CHARS = 4000;

/** Attachments one run may carry (the panel's picker and the IPC schema share this). */
export const MAX_ATTACHMENTS = 10;

/** Content the panel inlines per attachment; anything past this is truncated before it is sent. */
export const MAX_ATTACHMENT_CHARS = 8000;

/** An attachment's display label (a filename, or "Selection from <page>"). */
export const MAX_ATTACHMENT_LABEL_CHARS = 512;

/**
 * Markdown framing the panel wraps each inlined attachment in — the `[File: <label>]` header, the
 * code fences, and the blank lines between parts. Rounded up: this is a bound, not a measurement.
 */
const ATTACHMENT_FRAMING_CHARS = MAX_ATTACHMENT_LABEL_CHARS + 32;

/**
 * The assembled prompt the boundary accepts: the user's text plus every attachment the panel is
 * willing to inline. Generous, but finite — it is a guard against an unbounded string crossing IPC
 * and being billed to a model, not a target anyone is expected to reach.
 */
export const MAX_AGENT_PROMPT_CHARS =
  MAX_USER_PROMPT_CHARS + MAX_ATTACHMENTS * (MAX_ATTACHMENT_CHARS + ATTACHMENT_FRAMING_CHARS);

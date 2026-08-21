import { z } from 'zod';

/**
 * Typed evidence for a completion claim (S4).
 *
 * The completion validator used to see only the page. A `"Saved!"` toast painted over a `5xx` therefore
 * **passed**: the validator read success text and settled. That is north-star condition 3 —
 * *fabricated success* — and the evidence to defeat it was already being captured by the network
 * recorder and thrown away before the settle step.
 *
 * This bundle is what the settle step reasons over. Two rules make it worth having:
 *
 * 1. **The downgrade is deterministic.** A claim is downgraded to *attempted, unverified* by code, from
 *    these records — never by asking a model whether it feels verified.
 * 2. **Absence of evidence is `unverified`, never `verified`.** A recorder gap must not read as success.
 *    The bias is deliberate and is what protects the fabricated-success gate.
 */

/** How a single piece of evidence bears on the claim. */
export const EVIDENCE_VERDICTS = ['supports', 'contradicts', 'inconclusive'] as const;
export type EvidenceVerdict = (typeof EVIDENCE_VERDICTS)[number];
export const EvidenceVerdictSchema = z.enum(EVIDENCE_VERDICTS);

/**
 * One observation the claim can be checked against. `id` is stable within a run so a validator's
 * reasoning can cite it and a reader can find the record it cited.
 */
export const EvidenceItemSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(['network', 'page_validation', 'url_match']),
  verdict: EvidenceVerdictSchema,
  /** Short, human-readable statement of the record — page-derived text is sanitized before it lands here. */
  detail: z.string().max(500),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const CompletionEvidenceSchema = z.object({
  items: z.array(EvidenceItemSchema).max(50),
  /**
   * True when this run performed a state-changing action whose outcome the claim depends on.
   *
   * A pure read task ("what is the price?") has nothing to verify against the network and must not be
   * punished for it; a save, submit or transfer must. Without this distinction, requiring evidence would
   * downgrade every honest read to *unverified* and the metric would measure the wrong thing.
   */
  mutating: z.boolean(),
});
export type CompletionEvidence = z.infer<typeof CompletionEvidenceSchema>;

/** What the settle step concluded about a claim, before any wording is generated. */
export const COMPLETION_OUTCOMES = ['verified', 'attempted_unverified', 'contradicted'] as const;
export type CompletionOutcome = (typeof COMPLETION_OUTCOMES)[number];
export const CompletionOutcomeSchema = z.enum(COMPLETION_OUTCOMES);

/**
 * Classify a completion claim against its evidence. Pure and total — this is the deterministic half of
 * the validator, and it never calls a model.
 *
 * - Any **contradicting** record ⇒ `contradicted`. One failed request outranks any number of green
 *   signals, because a page cannot un-fail a request by saying it succeeded.
 * - A mutating claim with no supporting record ⇒ `attempted_unverified`. This is the honest answer for
 *   "I clicked Save and nothing told me it worked".
 * - Otherwise ⇒ `verified`.
 */
export function classifyCompletion(evidence: CompletionEvidence): CompletionOutcome {
  if (evidence.items.some((item) => item.verdict === 'contradicts')) return 'contradicted';
  if (!evidence.mutating) return 'verified';
  return evidence.items.some((item) => item.verdict === 'supports')
    ? 'verified'
    : 'attempted_unverified';
}

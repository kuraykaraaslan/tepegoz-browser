import {
  CompletionEvidenceSchema,
  classifyCompletion,
  type CompletionEvidence,
  type CompletionOutcome,
  type EvidenceItem,
} from '@tepegoz/shared-types';
import type { StepOutcome } from './executor';

/**
 * Assemble the typed evidence a completion claim is judged against (S4 PR1) — pure, so the rule that
 * decides `verified` vs `attempted_unverified` is unit-testable without a browser or a model.
 *
 * The observations this reads are already in the loop: `browser_update_page` reports a `networkWarning`
 * when a request it caused came back an error, and `browser_validate_page` reports whether the page it
 * was asked about actually says what it should. Until now both were *prose* the model might or might not
 * heed. Here they become records the settle step counts.
 */

/** Cap on assembled records: the settle step reasons over evidence, not over a log. */
const MAX_ITEMS = 50;
/** Cap per record so one page-derived string cannot dominate the bundle. */
const MAX_DETAIL = 500;

/** Tools whose success or failure the claim actually depends on. */
const MUTATING_TOOLS = new Set(['browser_update_page', 'browser_update_location', 'browser_update_history']);

/** A `browser_update_page` result, in the shape the evidence assembler needs. */
interface InteractionShape {
  networkWarning?: unknown;
  changed?: unknown;
  ok?: unknown;
  satisfied?: unknown;
  occludedBy?: unknown;
  fillRefused?: unknown;
}

function shapeOf(result: unknown): InteractionShape {
  return result !== null && typeof result === 'object' ? result : {};
}

function clip(text: string): string {
  return text.slice(0, MAX_DETAIL);
}

/**
 * True when this step tried to change something. A pure read task has nothing to verify against the
 * network and must not be downgraded for it; a save, submit or navigation must be.
 */
function isMutating(outcome: StepOutcome): boolean {
  return MUTATING_TOOLS.has(outcome.tool);
}

/**
 * One step → the records it produced.
 *
 * A `networkWarning` is the strongest signal available and always **contradicts**: a request the server
 * rejected cannot be talked into success by the page that sent it. A mutating step that changed the page
 * with no failed request **supports** — weakly, but honestly. A mutating step that changed nothing, or
 * was refused (occluded click, widget-refused fill), is **inconclusive**: it is not evidence of failure,
 * it is the absence of evidence, and the two must not be confused.
 */
function itemsForStep(outcome: StepOutcome, index: number): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const shape = shapeOf(outcome.result);
  const id = `${outcome.tool}#${String(index)}`;

  if (typeof shape.networkWarning === 'string' && shape.networkWarning.length > 0) {
    items.push({
      id: `${id}:net`,
      kind: 'network',
      verdict: 'contradicts',
      detail: clip(shape.networkWarning),
    });
    return items;
  }
  if (!outcome.ok) {
    items.push({ id: `${id}:err`, kind: 'page_validation', verdict: 'inconclusive', detail: clip(outcome.error?.message ?? 'step failed') });
    return items;
  }
  if (outcome.tool === 'browser_validate_page' || outcome.tool === 'browser_validate_condition') {
    const passed = shape.ok === true || shape.satisfied === true;
    items.push({
      id: `${id}:check`,
      kind: 'page_validation',
      verdict: passed ? 'supports' : 'inconclusive',
      detail: passed ? 'page check passed' : 'page check did not hold',
    });
    return items;
  }
  if (isMutating(outcome)) {
    const refused = shape.occludedBy !== undefined || shape.fillRefused !== undefined;
    const moved = shape.changed === true;
    items.push({
      id: `${id}:act`,
      kind: 'page_validation',
      verdict: refused || !moved ? 'inconclusive' : 'supports',
      detail: refused ? 'the action was refused' : moved ? 'the page changed after the action' : 'the page did not change',
    });
  }
  return items;
}

/**
 * Build the bundle for a run, newest steps last. Only the tail is considered: evidence for *this* claim
 * is what happened recently, and a long run's early steps say nothing about whether the last save landed.
 */
export function assembleEvidence(
  outcomes: readonly StepOutcome[],
  opts: { tail?: number; urlMatch?: { expected: string; actual: string } } = {},
): CompletionEvidence {
  const tail = Math.max(1, opts.tail ?? 8);
  const recent = outcomes.slice(-tail);
  const items: EvidenceItem[] = [];
  for (const [i, outcome] of recent.entries()) {
    for (const item of itemsForStep(outcome, i)) {
      if (items.length < MAX_ITEMS) items.push(item);
    }
  }
  const match = opts.urlMatch;
  if (match !== undefined && items.length < MAX_ITEMS) {
    const same = match.expected === match.actual;
    items.push({
      id: 'url:match',
      kind: 'url_match',
      verdict: same ? 'supports' : 'contradicts',
      detail: same ? `still on ${clip(match.actual)}` : `page is now ${clip(match.actual)}, not ${clip(match.expected)}`,
    });
  }
  return { items, mutating: recent.some(isMutating) };
}

/**
 * Classify a claim, validating the bundle at the boundary first.
 *
 * A bundle that fails `safeParse` is treated as **no evidence at all**, not as a reason to throw: the
 * settle step must still reach a verdict, and the honest verdict without usable evidence is
 * `attempted_unverified` for a mutating claim. Failing open to `verified` here would reintroduce exactly
 * the fabricated success this phase exists to remove.
 */
export function classifyClaim(evidence: CompletionEvidence): CompletionOutcome {
  const parsed = CompletionEvidenceSchema.safeParse(evidence);
  if (!parsed.success) return evidence.mutating === false ? 'verified' : 'attempted_unverified';
  return classifyCompletion(parsed.data);
}

/** The line handed to the validator model, so its WORDING can reflect evidence it did not decide. */
export function describeEvidence(evidence: CompletionEvidence): string {
  if (evidence.items.length === 0) {
    return evidence.mutating
      ? 'Evidence: NONE recorded for the state-changing actions in this run.'
      : 'Evidence: none needed (no state-changing action was taken).';
  }
  const lines = evidence.items.map((item) => `- [${item.id}] ${item.verdict}: ${item.detail}`);
  return `Evidence records:\n${lines.join('\n')}`;
}

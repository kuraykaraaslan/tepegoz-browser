import type { VisionEscalation } from '@tepegoz/shared-types';
import type { StepOutcome } from './executor';

/**
 * Deterministic vision escalation triggers (S10 PR2) — pure, and evaluated **before** any model call.
 *
 * The Never-list forbids screenshots-every-step, so the design constraint is not "when might vision
 * help" but "when is the DOM path provably unable to answer". Each trigger below names a state where a
 * *correct* DOM read still leaves the agent with nothing to act on — not a state where the model merely
 * finds the page hard.
 *
 * Nothing here captures an image; this module only decides. That separation is what lets the escalation
 * RATE be measured on a scripted tier, with no cost and no cloud key.
 */

/** Canvas covering this share of the viewport means the DOM is unlikely to describe what is on screen. */
export const CANVAS_DOMINANCE = 0.4;
/** Repeats of the same ineffective action before the DOM view is treated as not matching the page. */
export const REPEAT_FAILURE_THRESHOLD = 2;
/** How far back to look. Escalation is about the step at hand, not about a long-finished detour. */
const DEFAULT_TAIL = 4;
/** A page read shorter than this is treated as blank — an empty page is not a *blind* page. */
const MIN_PAGE_TEXT = 40;

interface ElementsShape {
  elements?: unknown;
  canvasFraction?: unknown;
  content?: unknown;
}
interface InteractionShape {
  occludedBy?: unknown;
  changed?: unknown;
}

function shape<T>(result: unknown): T {
  return (result !== null && typeof result === 'object' ? result : {}) as T;
}

/** Elements the agent could actually choose between: present, and distinguishable by a name. */
function usableElements(result: unknown): { total: number; named: number } {
  const list = shape<ElementsShape>(result).elements;
  if (!Array.isArray(list)) return { total: 0, named: 0 };
  const named = list.filter((el) => {
    const name = shape<{ name?: unknown }>(el).name;
    return typeof name === 'string' && name.trim().length > 0;
  }).length;
  return { total: list.length, named };
}

function canvasFractionOf(result: unknown): number {
  const raw = shape<ElementsShape>(result).canvasFraction;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

/** Did any read in the tail show this page actually has content? An empty page is not a blind one. */
function pageHasContent(recent: readonly StepOutcome[]): boolean {
  return recent.some((o) => {
    if (!o.ok) return false;
    const content = shape<{ content?: unknown }>(o.result).content;
    return typeof content === 'string' && content.length >= MIN_PAGE_TEXT;
  });
}

/** A stable identity for "the same target", so repeated ineffective actions can be counted. */
function targetOf(outcome: StepOutcome): string {
  const args = shape<{ ref?: unknown; action?: unknown }>(outcome.args);
  // Only scalars identify a target; anything else contributes nothing rather than "[object Object]",
  // which would make two different targets look identical.
  const scalar = (v: unknown): string =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  return `${outcome.tool}:${scalar(args.action)}:${scalar(args.ref)}`;
}

/**
 * Decide whether this step is blind. Returns the FIRST reason that holds, in descending order of how
 * conclusively it proves the DOM cannot answer — a canvas-dominant page is blind by construction,
 * whereas repeated failures are only strong evidence.
 */
export function evaluateVisionTrigger(
  outcomes: readonly StepOutcome[],
  opts: { tail?: number } = {},
): VisionEscalation | null {
  const recent = outcomes.slice(-Math.max(1, opts.tail ?? DEFAULT_TAIL));
  if (recent.length === 0) return null;

  const lastElements = [...recent].reverse().find((o) => o.ok && Array.isArray(shape<ElementsShape>(o.result).elements));

  if (lastElements !== undefined) {
    const fraction = canvasFractionOf(lastElements.result);
    if (fraction >= CANVAS_DOMINANCE) {
      return {
        reason: 'canvas_dominant',
        detail: `canvas covers ${String(Math.round(fraction * 100))}% of the viewport`,
      };
    }
    const { total, named } = usableElements(lastElements.result);
    // Zero elements, or elements that exist but carry no name to choose between, are the same problem
    // from the agent's side: there is nothing to act on. Image-only controls are the second case.
    if ((total === 0 || named === 0) && pageHasContent(recent)) {
      return {
        reason: 'blind_page',
        detail:
          total === 0
            ? 'the page has content but the element scan found nothing actionable'
            : `${String(total)} actionable elements, none of them named`,
      };
    }
  }

  const occlusions = recent.filter(
    (o) => o.ok && shape<InteractionShape>(o.result).occludedBy !== undefined,
  );
  if (occlusions.length >= REPEAT_FAILURE_THRESHOLD) {
    return {
      reason: 'persistent_occlusion',
      detail: `${String(occlusions.length)} clicks refused as covered after the click-time re-check`,
    };
  }

  const counts = new Map<string, number>();
  for (const outcome of recent) {
    const ineffective = !outcome.ok || shape<InteractionShape>(outcome.result).changed === false;
    if (!ineffective) continue;
    const key = targetOf(outcome);
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    if (next >= REPEAT_FAILURE_THRESHOLD) {
      return {
        reason: 'repeated_action_failure',
        detail: `the same target was acted on ${String(next)} times with no effect`,
      };
    }
  }

  return null;
}

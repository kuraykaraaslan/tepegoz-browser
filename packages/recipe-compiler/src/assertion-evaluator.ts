import type { RecipeAssertion } from '@tepegoz/shared-types';

/**
 * The success oracle (Phase 6, "self-correcting golden assertions") — evaluating a recipe's post-
 * conditions with **no model call**, against exactly the observations a deterministic re-run already
 * has: a URL, a page-text snapshot, the effect types the run has journaled so far, and whatever numeric
 * values a step extracted.
 *
 * This exists to fix the failure the phase names directly: an agent that stops one step early and
 * confidently reports success anyway ("penultimate-step abandonment"). A recipe carries the assertion
 * the ORIGINAL successful run actually satisfied — captured at distill time from what really happened,
 * not authored as a wish — so a re-run either reproduces that same observable state or it did not
 * finish the job, and this function is the one place that gets to say which.
 */

export interface RunSnapshot {
  url: string;
  /** Visible text on the page after the step, already sanitized upstream — this module trusts its
   *  caller for content safety and only judges truth of the assertion. */
  pageText: string;
  /** Event types journaled so far in this run (e.g. `'TaskSucceeded'`, a domain event like
   *  `'UploadCompleted'`) — what `effect_journaled` checks against. */
  journaledEffects: readonly string[];
  /** Numeric values a step's own extraction produced, keyed by the step id that produced them. */
  extractedNumerics: Readonly<Record<string, number>>;
}

export type AssertionVerdict = { passed: true } | { passed: false; reason: string };

/**
 * Evaluate one assertion. Every branch is a plain comparison — nothing here can be "mostly right"; an
 * assertion either holds against the snapshot or it does not, which is what makes it usable as a hard
 * gate on a side-effecting step.
 */
export function evaluateAssertion(
  assertion: RecipeAssertion,
  snapshot: RunSnapshot,
): AssertionVerdict {
  switch (assertion.kind) {
    case 'url_pattern': {
      const matches = urlMatchesPattern(snapshot.url, assertion.pattern);
      return matches
        ? { passed: true }
        : {
            passed: false,
            reason: `url "${snapshot.url}" does not match pattern "${assertion.pattern}"`,
          };
    }
    case 'text_present': {
      const found = snapshot.pageText.includes(assertion.text);
      return found
        ? { passed: true }
        : { passed: false, reason: `text "${assertion.text}" not found on page` };
    }
    case 'effect_journaled': {
      const found = snapshot.journaledEffects.includes(assertion.eventType);
      return found
        ? { passed: true }
        : { passed: false, reason: `event "${assertion.eventType}" was never journaled this run` };
    }
    case 'numeric_extracted': {
      // The assertion names a selector, not a step id, because it is captured at distill time against
      // whatever the golden run extracted from that element — the caller resolves selector → step id via
      // the same re-binding path a live re-run already needs (S2 identity refs), and hands us the value
      // it found under that step's own id. This function only ever judges the comparison itself.
      return evaluateNumericAgainstAll(assertion, snapshot.extractedNumerics);
    }
    default: {
      // Exhaustiveness: RecipeAssertion is a closed discriminated union, so an unhandled kind here is a
      // schema change this evaluator was not updated for — refusing (not silently passing) is the only
      // safe default for a hard gate.
      const _exhaustive: never = assertion;
      return { passed: false, reason: `unknown assertion kind: ${JSON.stringify(_exhaustive)}` };
    }
  }
}

function evaluateNumericAgainstAll(
  assertion: Extract<RecipeAssertion, { kind: 'numeric_extracted' }>,
  extracted: Readonly<Record<string, number>>,
): AssertionVerdict {
  const values = Object.values(extracted);
  if (values.length === 0) {
    return { passed: false, reason: 'no numeric value was extracted this run' };
  }
  const compare = COMPARATORS[assertion.comparator];
  const ok = values.some((v) => compare(v, assertion.value));
  return ok
    ? { passed: true }
    : {
        passed: false,
        reason: `no extracted value ${assertion.comparator} ${String(assertion.value)} (got: ${values.join(', ')})`,
      };
}

const COMPARATORS: Record<
  Extract<RecipeAssertion, { kind: 'numeric_extracted' }>['comparator'],
  (a: number, b: number) => boolean
> = {
  eq: (a, b) => a === b,
  gt: (a, b) => a > b,
  lt: (a, b) => a < b,
  gte: (a, b) => a >= b,
  lte: (a, b) => a <= b,
};

/**
 * `*` as a single-segment wildcard over a URL, so a recorded pattern like
 * `https://example.com/orders/*\/confirm` matches any order id without the recipe author (or the
 * distiller) needing real regex. Anything else is compared literally — a pattern is not a security
 * boundary, so there is no reason to give it more power than the one wildcard authors actually reach for.
 */
function urlMatchesPattern(url: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '.*' : `\\${c}`));
  return new RegExp(`^${escaped}$`).test(url);
}

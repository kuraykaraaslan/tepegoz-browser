import type { StepOutcome } from './executor';

/**
 * Run-level no-progress detection (Phase C1 / `s14`). The structural page signature is computed per action
 * by the browser host (`browser-host.electron.ts` `readPage`) but consumed only to answer *"did THIS
 * interaction change the page?"* — there has never been a cross-step *"the world has not moved for N acting
 * steps → change strategy"* signal, so a run that keeps taking DIFFERENT but ineffective actions (which the
 * identical-args loop detector can't catch) either burns the whole step budget or fails closed.
 *
 * This tracker classifies each outcome as `progress` (the observed world changed, or an action reported it
 * did something), `stall` (a state-changing action that moved nothing), or `neutral` (a read of an
 * unchanged page, or a baseline read). The reactor counts consecutive `stall`s and, past a threshold, fires
 * a single bounded replan pass instead of grinding on. Pure + deterministic → unit-testable without a model.
 */

export type ProgressSignal = 'progress' | 'stall' | 'neutral';

/** Longest slice of read content folded into the signature — bounds cost; the head is plenty to tell two
 *  distinct pages apart. */
const CONTENT_SIGNATURE_CAP = 4000;

function strField(result: unknown, key: string): string | null {
  if (result === null || typeof result !== 'object') return null;
  const v = (result as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function boolField(result: unknown, key: string): boolean {
  if (result === null || typeof result !== 'object') return false;
  return (result as Record<string, unknown>)[key] === true;
}

/** djb2 over a digit-masked, whitespace-collapsed slice — stable against clocks/counters/re-tokenized URLs
 *  (the same reason the host's `sig` masks digits and drops `?query`), so an incidental repaint is not
 *  mistaken for progress. */
function maskedHash(s: string): string {
  const norm = s.replace(/\s+/g, ' ').replace(/\d+/g, '#').slice(0, CONTENT_SIGNATURE_CAP);
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The perceived-page signature of a READ result: url · title · masked visible-text hash. Null when the
 *  result carries no page evidence (so it cannot establish or move the world signature). */
function readSignatureOf(result: unknown): string | null {
  const url = strField(result, 'url');
  const title = strField(result, 'title');
  const content = strField(result, 'content');
  if (url === null && title === null && content === null) return null;
  return `${url ?? ''}|${title ?? ''}|${content !== null ? maskedHash(content) : ''}`;
}

/** True when a state-changing action's own result says it accomplished something — a page/structure change,
 *  a successful fill, a found-and-scrolled target, or a selected option. These are exactly the cases where
 *  `pageChanged` legitimately reads false (a fill moves neither text nor `sig`) yet real progress happened,
 *  so they must NOT count as a stall. */
function actionReportedEffect(result: unknown): boolean {
  return (
    boolField(result, 'changed') ||
    boolField(result, 'filled') ||
    boolField(result, 'found') ||
    strField(result, 'selected') !== null
  );
}

export interface ProgressTracker {
  /**
   * The perceived world as of the last outcome: page signature plus last url, or null before
   * anything has been perceived. Read by the adaptive validation cadence (S7) to answer "has
   * anything happened worth re-judging?" without a model call.
   */
  worldSignature(): string | null;
  /** Classify one finalized outcome. `isRead` marks an idempotent perception/verification tool (reads
   *  never stall — re-reading is the encouraged pattern and is separately bounded by the read-streak guard). */
  observe(outcome: StepOutcome, isRead: boolean): ProgressSignal;
}

/** Create a per-run progress tracker (mirrors {@link createReadStreakGuard}'s closure-over-state shape). */
export function createProgressTracker(): ProgressTracker {
  let pageSig: string | null = null; // last perceived-page signature (from reads)
  let lastUrl: string | null = null; // last url seen on ANY outcome (catches navigations)
  return {
    worldSignature() {
      // The url is folded in as well as the read signature: a state-changing action can navigate
      // without a read following it, and that has certainly moved the world.
      return pageSig === null && lastUrl === null ? null : `${pageSig ?? ''}|${lastUrl ?? ''}`;
    },
    observe(outcome, isRead) {
      // A failed action moved nothing; a failed read is just a read (neutral).
      if (!outcome.ok) return isRead ? 'neutral' : 'stall';
      const result = outcome.result;

      // A navigation to a NEW url is unambiguous progress, whether it surfaced on a nav action or the read
      // that follows it.
      const url = strField(result, 'url');
      let navigated = false;
      if (url !== null) {
        if (lastUrl !== null && url !== lastUrl) navigated = true;
        lastUrl = url;
      }

      if (isRead) {
        const sig = readSignatureOf(result);
        if (sig !== null) {
          if (pageSig === null) {
            pageSig = sig; // establish the baseline — not itself progress
            return navigated ? 'progress' : 'neutral';
          }
          if (sig !== pageSig) {
            pageSig = sig;
            return 'progress';
          }
        }
        return navigated ? 'progress' : 'neutral';
      }

      // A state-changing action progresses the run iff it navigated or its result reports an effect.
      return navigated || actionReportedEffect(result) ? 'progress' : 'stall';
    },
  };
}

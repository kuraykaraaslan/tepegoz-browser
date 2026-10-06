import type { StepOutcome } from './executor';

/** Wall-clock budget for the AI-7 navigation-grounding hook per step. Bounds the hot loop against a slow
 *  or hostile same-origin sitemap fetch (the in-flight fetch keeps running + is cached; the loop just does
 *  not wait past this) so a user cancel never blocks on discovery. */
const NAV_GROUNDING_BUDGET_MS = 8000;

/** The host of the page a step landed on, or null when the outcome says nothing about a page. Used to
 *  recall cross-run notes once per site rather than once per step. */
export function urlFromOutcome(outcome: StepOutcome): string | null {
  const result = outcome.result;
  if (result === null || typeof result !== 'object') return null;
  const url = (result as { url?: unknown }).url;
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Read a live abort signal without control-flow narrowing (the signal mutates between reads, so an earlier
 *  `=== true` guard must not narrow a later check to `false`). */
export function signalAborted(signal: { readonly aborted: boolean } | undefined): boolean {
  return signal?.aborted === true;
}

/** Run the grounding hook with a wall-clock budget; resolves null on timeout or any hook error, so a steer
 *  is strictly best-effort and can never stall or crash the loop. */
export async function boundedGrounding(
  hook: (outcome: StepOutcome, goal: string) => Promise<string | null>,
  outcome: StepOutcome,
  goal: string,
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), NAV_GROUNDING_BUDGET_MS);
  });
  try {
    return await Promise.race([hook(outcome, goal).catch(() => null), budget]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * M1: identical-CONSECUTIVE-read streak guard — the read exemption's honest counterweight (a live
 * trial burned 22 identical `browser_get_elements` calls unpunished). Re-reading after each ACTION is
 * the encouraged pattern and never trips this; only the same read repeated back-to-back does. At the
 * threshold: one 'nudge'; a further identical consecutive read: 'stop'. Any different call resets.
 */
export function createReadStreakGuard(
  threshold: number,
): (isRead: boolean, signature: string) => 'ok' | 'nudge' | 'stop' {
  const cap = Math.max(2, threshold);
  let streakSignature = '';
  let count = 0;
  let nudged = false;
  return (isRead, signature) => {
    if (!isRead) {
      streakSignature = '';
      count = 0;
      nudged = false;
      return 'ok';
    }
    if (signature === streakSignature) {
      count += 1;
    } else {
      streakSignature = signature;
      count = 1;
      nudged = false;
    }
    if (count < cap) return 'ok';
    if (!nudged) {
      nudged = true;
      return 'nudge';
    }
    return 'stop';
  };
}

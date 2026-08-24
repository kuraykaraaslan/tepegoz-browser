/**
 * The decision half of the `beforeunload` broker, kept free of Electron so it can be tested directly.
 *
 * The rule that matters here is **you cannot be trapped on a page**. `beforeunload` is a page-controlled
 * hook, and a page that re-prompts on every attempt turns "unsaved changes" into a captive tab — the
 * abuse Chromium's own limits exist for. So once the user has answered "leave", further prompts from the
 * same page are suppressed for a short window: long enough to cover the navigation the user actually
 * asked for (and any redirect chain it pulls), short enough that a genuine later edit still gets its
 * warning.
 *
 * The window is refreshed rather than one-shot: a single navigation can raise the event more than once
 * (a redirect, a `location.replace` in a same-document handler), and a page that keeps firing during the
 * grace period only extends its own silence — it never earns a second prompt out of it.
 */

/** How long after a "leave" answer the same page is not asked again. A navigation and the redirects it
 *  drags along settle well inside this; a user typing into a form again does not. */
export const LEAVE_GRACE_MS = 5_000;

/** What the broker should do with one `will-prevent-unload`. */
export type UnloadDecision =
  /** Let the unload through without asking — the user already said so, or an agent owns this tab. */
  | 'allow'
  /** Ask the user. */
  | 'prompt';

export interface UnloadState {
  /** Set while an agent run drives this tab: the agent suppresses its own prompts and is told about
   *  them through the tool result, so a human modal here would interrupt a run nobody is watching. */
  readonly agentDriven: boolean;
  /** Host clock of the last "leave" answer for this page, or `null` if there has not been one. */
  readonly leftAt: number | null;
}

export function decideUnload(state: UnloadState, now: number): UnloadDecision {
  if (state.agentDriven) return 'allow';
  if (state.leftAt === null) return 'prompt';
  const elapsed = now - state.leftAt;
  // The lower bound is not pedantry: `Date.now()` steps backwards over an NTP correction, and a bare
  // `elapsed < LEAVE_GRACE_MS` reads a negative elapsed as "inside the window" — silencing a warning
  // the user should have seen, for as long as the clock stays behind.
  return elapsed >= 0 && elapsed < LEAVE_GRACE_MS ? 'allow' : 'prompt';
}

import { sanitizeContent } from '@tepegoz/tool-executor';
import { describeNetworkFailures, selectActionFailures } from './network-verify';
import type { BrowserHost } from './host';

/**
 * Page-change detection and the post-action signals (network failures, intercepted dialogs) the
 * `browser_*` handlers fold into their results. Split out of `browser-tools.ts`.
 */

export interface PageFingerprint {
  url: string;
  title: string;
  text: string;
  /** Structural signature of the VISIBLE actionable elements (host-computed). Catches state changes an
   *  in-place SPA toggle makes that leave url/title/innerText untouched — a drawer/menu/dropdown/accordion
   *  sliding into view, a tab panel swapping, a modal opening — where the revealed nodes already lived in
   *  the DOM (so `innerText` never moved) but were off-canvas/hidden until the interaction. */
  sig: string;
}

/** Did the interaction move the page? True on any url/title/visible-text change OR a change to the
 *  visible actionable-element set. The structural arm is what stops a menu-toggle click from reading as a
 *  no-op (the false `changed:false` that used to drive the agent into a re-click loop). */
export function pageChanged(before: PageFingerprint, after: PageFingerprint): boolean {
  return (
    before.url !== after.url ||
    before.title !== after.title ||
    before.text !== after.text ||
    before.sig !== after.sig
  );
}

/** A change the structural signature caught but url/title/visible-text did not — i.e. the actionable set
 *  moved (a menu/panel opened) with no new visible prose. The model must re-read elements to see it. */
export function structuralOnlyChange(before: PageFingerprint, after: PageFingerprint): boolean {
  return (
    before.sig !== after.sig &&
    before.url === after.url &&
    before.title === after.title &&
    before.text === after.text
  );
}

/** Longest field value quoted back to the model, and the sanitizing pass every page-controlled string
 *  makes before it enters a prompt (a page script can rewrite an input's value on `input`). */
const MAX_QUOTED_VALUE = 120;
export function safeValue(raw: string): string {
  const { text } = sanitizeContent(raw);
  return text
    .replace(/["'\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUOTED_VALUE);
}

/**
 * AI-8B: the warning for requests that failed inside this action's window, or `undefined` when none did.
 *
 * Never throws and never claims success — a host that cannot observe the network, or an error while
 * asking it, degrades to `undefined` (= "nothing to report"), which is exactly how absence must read.
 */
export async function networkWarning(
  host: BrowserHost,
  tabId: string | undefined,
  sinceMs: number,
  pageUrl: string,
): Promise<string | undefined> {
  try {
    const observations = await host.networkSince(sinceMs, tabId);
    return describeNetworkFailures(selectActionFailures(observations, pageUrl), pageUrl);
  } catch {
    return undefined;
  }
}

/**
 * S3 PR4: the note for a JS dialog auto-declined, or a `beforeunload` prompt suppressed, inside this
 * action's window — or `undefined` when neither happened. Never throws, and a host that does not
 * implement `interceptionsSince` (or errors asking it) degrades to `undefined` exactly like
 * {@link networkWarning} — absence must never be read as "nothing happened".
 *
 * A `beforeunload` prompt was ALWAYS suppressed rather than left up (S3 PR4's whole point — a native OS
 * dialog no DOM action can dismiss would otherwise strand the run), so its note explains the navigation
 * did NOT happen, not merely that a prompt appeared.
 */
export async function interceptionNote(
  host: BrowserHost,
  tabId: string | undefined,
  sinceMs: number,
): Promise<string | undefined> {
  try {
    const events = (await host.interceptionsSince?.(sinceMs, tabId)) ?? [];
    if (events.length === 0) return undefined;
    return events
      .map((e) =>
        e.kind === 'dialog'
          ? `A page dialog appeared during this action ("${safeValue(e.message)}") and was automatically ` +
            'declined — Tepegöz never accepts a page dialog on its own. If you need this, decide ' +
            'deliberately and repeat the action.'
          : "This action was blocked by the page's own unsaved-changes warning (beforeunload) — the " +
            'navigation/reload did NOT happen. Save or discard your changes first, then try again.',
      )
      .join(' ');
  } catch {
    return undefined;
  }
}

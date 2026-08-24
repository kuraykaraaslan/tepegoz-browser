import { BrowserWindow, dialog, type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import { mainStrings } from '../lib/i18n-main';
import { decideUnload, type UnloadState } from './unload-policy';

/**
 * `beforeunload` — the page's "you have unsaved changes" prompt, which this app was not showing.
 *
 * **Measured, because the absence of a handler is invisible to every gate we have**
 * ([`e2e/beforeunload.spec.ts`](../../../../../e2e/beforeunload.spec.ts)): with no
 * `will-prevent-unload` listener Electron does NOT fall back to Chromium's "Leave site?" dialog the way
 * a browser does — it cancels the navigation outright. The spike read `listenersBefore: 0`, `fired: 1`,
 * and `ERR_ABORTED` with the URL unchanged. So a page with a dirty form did not warn the user; it
 * silently refused to go anywhere, forever, with no dialog and no error. A tab that will not navigate
 * and will not say why is indistinguishable from a frozen browser.
 *
 * `phases/ai-agent-super/phase-s3-reliability-actions.md` asserted the opposite — that a human tab the
 * agent never touched "keeps Chromium's normal 'leave site?' prompt untouched". That claim is retracted
 * by the measurement above; there was no prompt to keep.
 *
 * **The dialog is native and synchronous, and it has to be.** `event.preventDefault()` must be called
 * before the listener returns — that is the whole protocol — so there is no room for the renderer modal
 * the auth and certificate brokers use. `dialog.showMessageBoxSync` is what Electron's own documentation
 * reaches for here.
 *
 * **The page's own message is not shown.** Chromium stopped rendering custom `beforeunload` text in 2016
 * because pages used it for scareware, and Electron hands us no message anyway. The user gets our words.
 *
 * **"Stay" is the default and the cancel.** Every other dismissal path a message box has — Escape, the
 * window close button — therefore keeps the page. Leaving is the destructive answer here (it is the one
 * that discards the user's typing), and a destructive answer must never be what a stray Enter picks.
 */

/** Contents whose prompt is suppressed because an agent run is driving them (see `unload-policy.ts`). */
const agentDriven = new WeakSet<WebContents>();
/** Host clock of the last "leave" answer per page — the anti-trap grace window. */
const leftAt = new WeakMap<WebContents, number>();
/** Contents already carrying our listener, so re-wiring a moved tab cannot stack a second one. */
const installed = new WeakSet<WebContents>();

/**
 * Suppress the user-facing unload prompt on `wc` for the rest of its life.
 *
 * Called by the agent's dialog interceptor when it takes a tab over. The direction is deliberate: the
 * agent depends on the browser, never the other way round, so the predicate lives here rather than the
 * browser reaching into `main/agent/`.
 *
 * This inherits the tradeoff `phase-s3` already recorded — a human who later takes over an agent-touched
 * tab in the same session keeps the suppression — and does not widen it. Narrowing it needs a signal for
 * "a run is in flight right now", which the driver does not expose today.
 */
export function suppressUnloadPrompt(wc: WebContents): void {
  agentDriven.add(wc);
}

/** The state `decideUnload` reads for `wc`. Exported for the broker's own tests. */
export function unloadStateOf(wc: WebContents): UnloadState {
  return { agentDriven: agentDriven.has(wc), leftAt: leftAt.get(wc) ?? null };
}

/**
 * Ask the user whether to leave. `true` = leave (the caller must `preventDefault()`), `false` = stay.
 *
 * Never throws: a message box that cannot be shown must not become an exception thrown out of an event
 * handler, and the safe answer when we cannot ask is to keep the page — the user's typing survives a
 * navigation that did not happen, and does not survive one that did.
 */
function askToLeave(wc: WebContents): boolean {
  const t = mainStrings().browser;
  try {
    const owner = BrowserWindow.fromWebContents(wc);
    const options: Electron.MessageBoxSyncOptions = {
      type: 'question',
      buttons: [t.unloadLeave, t.unloadStay],
      // Index 1 is "stay" for both: the safe answer is what Enter picks AND what Escape picks.
      defaultId: 1,
      cancelId: 1,
      title: t.unloadTitle,
      message: t.unloadTitle,
      detail: t.unloadDetail,
      noLink: true,
    };
    const choice =
      owner === null
        ? dialog.showMessageBoxSync(options)
        : dialog.showMessageBoxSync(owner, options);
    return choice === 0;
  } catch (err: unknown) {
    Logger.warn('Unload prompt could not be shown; keeping the page', { err: String(err) });
    return false;
  }
}

/**
 * Install the `beforeunload` prompt on a browsed tab's contents. Idempotent, and deliberately NOT part
 * of `unwireView`'s teardown set: whether a page has unsaved changes is a property of the page, not of
 * which window is currently hosting it, so the listener outlives a move between windows.
 */
export function installUnloadPrompt(wc: WebContents): void {
  if (installed.has(wc)) return;
  installed.add(wc);

  wc.on('will-prevent-unload', (event) => {
    // `preventDefault()` here means "ignore the page and let the unload happen" — Electron's sense, the
    // inverse of the DOM's. So RETURNING is the answer that keeps the page, and every allow below has
    // to call it. Doing nothing is not neutral; it is a veto.
    //
    // The agent's interceptor calls `preventDefault()` too, on its own listener. Reading the shared
    // state rather than `event.defaultPrevented` keeps this correct whichever order they registered in,
    // and a second `preventDefault()` on the same event costs nothing.
    if (decideUnload(unloadStateOf(wc), Date.now()) === 'allow') {
      event.preventDefault();
      return;
    }

    if (askToLeave(wc)) {
      leftAt.set(wc, Date.now());
      event.preventDefault();
    }
  });
}

/** Contents the user has already agreed to close, so the retried close does not ask twice. */
const closeConfirmed = new WeakSet<WebContents>();
/** Contents with a close question outstanding, so a second Ctrl+W does not stack a second prompt. */
const closeAsking = new WeakSet<WebContents>();

/**
 * Ask the page before closing a tab. Returns `true` when this took ownership of the close — the caller
 * must return and do nothing, and will be called back through `retry` if the tab may go.
 *
 * This exists because `webContents.close()` **does not fire `beforeunload` at all** unless it is passed
 * `waitForBeforeUnload` (Electron's own typings: "if true, fire the `beforeunload` event before closing
 * the page"). The default is off, so Ctrl+W discarded unsaved work without the page's warning ever
 * running — the exact mirror of the navigation defect above, and the more expensive half: a navigation
 * that silently refuses is recoverable, a tab that silently closes is not.
 *
 * Both outcomes converge on the same callback, which is why there is one mechanism rather than two:
 * a page with nothing to say is destroyed immediately, a page whose user chose "leave" is destroyed
 * after the prompt, and `destroyed` fires in both cases. A user who chose "stay" produces neither, and
 * the tab simply remains — which is the whole point.
 */
export function askBeforeClose(wc: WebContents, retry: () => void): boolean {
  if (wc.isDestroyed() || closeConfirmed.has(wc)) return false;
  if (closeAsking.has(wc)) return true;
  closeAsking.add(wc);

  const onDestroyed = (): void => {
    closeConfirmed.add(wc);
    retry();
  };
  wc.once('destroyed', onDestroyed);
  // Registered AFTER `installUnloadPrompt`'s listener, so by the time this runs the answer is already
  // recorded on the event. `defaultPrevented` is how "the user chose to leave" reaches back here
  // without the prompt needing to know that a close, rather than a navigation, asked the question.
  wc.once('will-prevent-unload', (event) => {
    if (event.defaultPrevented) return; // leaving — `destroyed` is next, and retries the close
    closeAsking.delete(wc);
    wc.off('destroyed', onDestroyed); // staying — disarm, or the NEXT close would retry twice
  });

  wc.close({ waitForBeforeUnload: true });
  return true;
}

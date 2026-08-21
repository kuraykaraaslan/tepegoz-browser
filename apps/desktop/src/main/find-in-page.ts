import type { BrowserWindow, WebContents } from 'electron';
import { IpcChannels, type FindInPageQuery } from '@tepegoz/desktop-ipc';

/**
 * Find-in-page (Ctrl+F) for the active tab — Phase 2c. The bar itself lives in the trusted chrome
 * (`@tepegoz/find-bar`); this module owns the Chromium side: it runs `findInPage` on the tab's own
 * WebContents and forwards `found-in-page` counts back to the chrome window.
 *
 * Two things make this more than a one-liner:
 *  - `found-in-page` carries no query, and a fast typist outruns Chromium. Each result is echoed with
 *    the query it was requested for, so the renderer can drop a result for a query already typed past.
 *  - A browsed view is a `WebContentsView` child, so `BrowserWindow.fromWebContents` does NOT resolve
 *    its chrome window. The chrome window is captured per subscription instead, from the IPC sender.
 */

/** Per-view state: the query in flight + the teardown for its listeners. */
interface FindSession {
  query: string;
  detach: () => void;
}

const sessions = new WeakMap<WebContents, FindSession>();

/**
 * Subscribe once per view. The listeners live as long as the view does — re-finding on the same tab
 * reuses them, and a destroyed view drops them.
 */
function ensureSession(win: BrowserWindow, wc: WebContents): FindSession {
  const existing = sessions.get(wc);
  if (existing !== undefined) return existing;

  const onFound = (_event: unknown, result: Electron.Result): void => {
    const session = sessions.get(wc);
    if (session === undefined || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.findResult, {
      query: session.query,
      activeMatchOrdinal: result.activeMatchOrdinal,
      matches: result.matches,
    });
  };

  // Navigating away invalidates the match set; leaving the highlight up would be a lie about the new
  // page. Chromium clears its own matches, so this only resyncs OUR counters.
  const onNavigate = (): void => {
    const session = sessions.get(wc);
    if (session === undefined || session.query === '') return;
    session.query = '';
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.findResult, {
        query: '',
        activeMatchOrdinal: 0,
        matches: 0,
      });
    }
  };

  const onDestroyed = (): void => {
    sessions.delete(wc);
  };

  wc.on('found-in-page', onFound);
  wc.on('did-start-navigation', onNavigate);
  wc.once('destroyed', onDestroyed);

  const session: FindSession = {
    query: '',
    detach: () => {
      wc.off('found-in-page', onFound);
      wc.off('did-start-navigation', onNavigate);
      wc.off('destroyed', onDestroyed);
      sessions.delete(wc);
    },
  };
  sessions.set(wc, session);
  return session;
}

/**
 * Run or step a find on `wc`. `findNext: false` restarts the search from the top (what typing does);
 * `true` steps within the current one (what Enter / the arrows do).
 */
export function runFindInPage(win: BrowserWindow, wc: WebContents, input: FindInPageQuery): void {
  if (wc.isDestroyed()) return;
  const session = ensureSession(win, wc);
  session.query = input.query;
  wc.findInPage(input.query, {
    forward: input.forward,
    findNext: input.findNext,
    matchCase: input.matchCase,
  });
}

/** Stop finding and clear the page's highlight + selection (bar closed, or query emptied). */
export function stopFindInPage(wc: WebContents | null): void {
  if (wc === null || wc.isDestroyed()) return;
  const session = sessions.get(wc);
  if (session !== undefined) session.query = '';
  wc.stopFindInPage('clearSelection');
}

/** Drop a view's listeners outright (used when a tab is torn down deliberately). */
export function releaseFindSession(wc: WebContents): void {
  sessions.get(wc)?.detach();
}

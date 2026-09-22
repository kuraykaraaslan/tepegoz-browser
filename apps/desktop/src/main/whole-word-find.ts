import type { BrowserWindow, WebContents } from 'electron';
import { z } from 'zod';
import { AppError, Logger } from '@tepegoz/libs';
import { IpcChannels, type FindInPageQuery } from '@tepegoz/desktop-ipc';
import { buildWholeWordPattern } from './whole-word-pattern';
import { wholeWordFindScript } from './whole-word-find-script';

/**
 * "Match whole word" (phase-2c) — the additive DOM matcher for the active tab, run ALONGSIDE
 * `find-in-page.ts` rather than inside it. Electron dropped the `wordStart` option
 * `webContents.findInPage` would have needed (see the phase doc), so a real whole-word toggle needs its
 * own path: an isolated-world script (`whole-word-find-script.ts`) does the matching and highlighting,
 * and this module is its main-process half — session bookkeeping, navigation reset, and echoing results
 * back through the SAME `find:result` channel and shape the native path uses, so the chrome/renderer
 * side (`app-find.ts`, `@tepegoz/find-bar`) needs no separate code path for the two modes.
 *
 * `find-in-page.ts` itself is untouched by this file — this is the "additive, not a rewrite" half of
 * the phase-2c task; `ipc-find.ts` is the only place that decides which of the two to call.
 */

/** Isolated-world id for the whole-word matcher. Distinct from `extraction-sandbox.electron.ts`'s 999 —
 *  worlds are already scoped per-`WebContents`, so there is no real collision risk, but a distinct
 *  constant means two unrelated features are never fighting over the same `window[NS]` if either one's
 *  id is ever reused by mistake. */
const WHOLE_WORD_WORLD_ID = 812;

/** Validates the isolated-world script's return value at the boundary (it is, after all, a value
 *  crossing back from page-adjacent JS) rather than trusting its shape. */
const WholeWordScriptResultSchema = z.object({
  matches: z.number().int().min(0),
  activeMatchOrdinal: z.number().int().min(0),
});

const EMPTY_RESULT = { activeMatchOrdinal: 0, matches: 0 };

interface WholeWordSession {
  query: string;
  /** Bumped on every request; only the response matching the CURRENT value is applied, so a slow
   *  `search` cannot overwrite a faster later one (the isolated-world equivalent of the native path's
   *  "echo the query" staleness guard — needed here because two in-flight script evaluations could in
   *  principle resolve out of request order). */
  seq: number;
  detach: () => void;
}

const sessions = new WeakMap<WebContents, WholeWordSession>();

function ensureSession(win: BrowserWindow, wc: WebContents): WholeWordSession {
  const existing = sessions.get(wc);
  if (existing !== undefined) return existing;

  // Navigating away invalidates the match set the same way it does for the native path — the OLD
  // document's marks are gone regardless (a navigation gets a fresh isolated-world context), so this
  // only resyncs the chrome window's counters, not the page.
  const onNavigate = (): void => {
    const session = sessions.get(wc);
    if (session === undefined || session.query === '') return;
    session.query = '';
    session.seq += 1;
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.findResult, { query: '', ...EMPTY_RESULT });
    }
  };

  const onDestroyed = (): void => {
    sessions.delete(wc);
  };

  wc.on('did-start-navigation', onNavigate);
  wc.once('destroyed', onDestroyed);

  const session: WholeWordSession = {
    query: '',
    seq: 0,
    detach: () => {
      wc.off('did-start-navigation', onNavigate);
      wc.off('destroyed', onDestroyed);
      sessions.delete(wc);
    },
  };
  sessions.set(wc, session);
  return session;
}

/**
 * Run or step a whole-word search on `wc`. Mirrors `runFindInPage`'s `findNext` meaning: true issues a
 * fresh `search` (what typing does), false issues a `step` within whatever was last found (Enter/arrows).
 */
export async function runWholeWordFind(
  win: BrowserWindow,
  wc: WebContents,
  input: FindInPageQuery,
): Promise<void> {
  if (wc.isDestroyed()) return;
  const session = ensureSession(win, wc);
  session.query = input.query;
  session.seq += 1;
  const mySeq = session.seq;

  const send = (payload: { activeMatchOrdinal: number; matches: number }): void => {
    if (session.seq !== mySeq || wc.isDestroyed() || win.isDestroyed()) return; // superseded
    win.webContents.send(IpcChannels.findResult, { query: input.query, ...payload });
  };

  let script: string;
  if (input.findNext) {
    try {
      const pattern = buildWholeWordPattern(input.query, input.matchCase);
      script = wholeWordFindScript('search', { source: pattern.source, flags: pattern.flags });
    } catch (err) {
      // Empty/over-length query: the IPC boundary should already have rejected both, so this is a
      // last-ditch guard, not the primary validation — behave like "no matches" rather than throwing
      // into a fire-and-forget IPC handler.
      Logger.warn('Whole-word find rejected the query', {
        reason: err instanceof AppError ? err.message : String(err),
      });
      send(EMPTY_RESULT);
      return;
    }
  } else {
    script = wholeWordFindScript('step', { forward: input.forward });
  }

  try {
    const raw: unknown = await wc.executeJavaScriptInIsolatedWorld(WHOLE_WORD_WORLD_ID, [
      { code: script },
    ]);
    const parsed = WholeWordScriptResultSchema.safeParse(raw);
    send(parsed.success ? parsed.data : EMPTY_RESULT);
  } catch (err) {
    Logger.warn('Whole-word find script failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    send(EMPTY_RESULT);
  }
}

/** Clear the DOM highlight and drop the in-flight query (bar closed, mode toggled off, or query
 *  emptied). Best-effort and fire-and-forget, like `stopFindInPage` — nothing downstream awaits it. */
export function stopWholeWordFind(wc: WebContents | null): void {
  if (wc === null || wc.isDestroyed()) return;
  const session = sessions.get(wc);
  if (session !== undefined) {
    session.query = '';
    session.seq += 1; // supersede any in-flight search/step so its late answer is dropped
  }
  wc.executeJavaScriptInIsolatedWorld(WHOLE_WORD_WORLD_ID, [
    { code: wholeWordFindScript('clear') },
  ]).catch((err: unknown) => {
    Logger.warn('Whole-word find clear failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

/** Drop a view's listeners outright (used when a tab is torn down deliberately) — kept symmetric with
 *  `find-in-page.ts#releaseFindSession`, which is itself currently only exercised the same way: the
 *  `destroyed` listener above already covers ordinary teardown. */
export function releaseWholeWordSession(wc: WebContents): void {
  sessions.get(wc)?.detach();
}

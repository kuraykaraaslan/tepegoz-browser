import { useCallback, useEffect, useRef, useState } from 'react';
import type { FindInPageResult } from '@tepegoz/desktop-ipc';

/** What `AppChrome` needs to render and drive `@tepegoz/find-bar`. */
export interface FindInPageController {
  open: boolean;
  /** Bumped on every Ctrl+F so the bar remounts and re-selects its input (Chrome's behaviour). */
  focusKey: number;
  query: string;
  matchCase: boolean;
  /** Runs the additive DOM matcher (`main/whole-word-find.ts`) instead of `webContents.findInPage` —
   *  Electron dropped the native `wordStart` option this would otherwise have forwarded to. */
  wholeWord: boolean;
  activeMatch: number;
  totalMatches: number;
  setQuery: (query: string) => void;
  next: () => void;
  previous: () => void;
  toggleMatchCase: () => void;
  toggleWholeWord: () => void;
  close: () => void;
}

/**
 * Find-in-page state for the chrome (Phase 2c). The search itself runs in main against the active
 * tab's WebContents; this hook only owns what the bar shows.
 *
 * Chromium's `found-in-page` is asynchronous and a fast typist outruns it, so every result is echoed
 * with the query it was requested for and anything that does not match the query on screen is
 * dropped — otherwise the counter flickers through counts for text the user has already typed past.
 *
 * `activeTabId` re-syncs the counters on a TAB SWITCH: main's find session lives per-`WebContents`, so
 * switching to a different tab while the bar is open used to leave the counter reading the PREVIOUS
 * tab's numbers until the next keystroke — a stale count with nothing to invalidate it, since no
 * `found-in-page` event fires just from bringing a different view to the foreground.
 */
export function useFindInPage(activeTabId: string | null): FindInPageController {
  const [open, setOpen] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const [query, setQueryState] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [activeMatch, setActiveMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);

  // Read inside subscriptions/callbacks that must not re-subscribe on every keystroke.
  const queryRef = useRef(query);
  queryRef.current = query;
  const matchCaseRef = useRef(matchCase);
  matchCaseRef.current = matchCase;
  const wholeWordRef = useRef(wholeWord);
  wholeWordRef.current = wholeWord;

  useEffect(() => {
    const offOpen = window.tepegoz.onFindOpen(() => {
      setOpen(true);
      setFocusKey((k) => k + 1);
    });
    const offResult = window.tepegoz.onFindResult((result: FindInPageResult) => {
      if (result.query !== queryRef.current) return; // a result for a superseded query
      setActiveMatch(result.activeMatchOrdinal);
      setTotalMatches(result.matches);
    });
    return () => {
      offOpen();
      offResult();
    };
  }, []);

  /**
   * Start a fresh search (typing, or flipping match-case/whole-word) — resets to the first match.
   *
   * `findNext: true` OPENS a session; it does not mean "step to the next match". Chromium answers a
   * `findNext: false` request that has no open session with nothing at all — no `found-in-page`, no
   * error — which is exactly how this shipped broken. Main reuses the same `findNext` meaning for the
   * whole-word engine's own `search` vs. `step` commands, so this one restart covers both.
   */
  const restart = useCallback((next: string, nextMatchCase: boolean, nextWholeWord: boolean) => {
    if (next === '') {
      window.tepegoz.stopFindInPage();
      setActiveMatch(0);
      setTotalMatches(0);
      return;
    }
    window.tepegoz.findInPage({
      query: next,
      forward: true,
      findNext: true,
      matchCase: nextMatchCase,
      wholeWord: nextWholeWord,
    });
  }, []);

  const setQuery = useCallback(
    (next: string) => {
      setQueryState(next);
      restart(next, matchCaseRef.current, wholeWordRef.current);
    },
    [restart],
  );

  const openRef = useRef(open);
  openRef.current = open;
  // Skips the mount-time firing (nothing to resync before the bar has ever opened) and any render
  // where the id is unchanged; only a REAL switch away from the tab the current search targets re-syncs.
  const isFirstTabRef = useRef(true);
  useEffect(() => {
    if (isFirstTabRef.current) {
      isFirstTabRef.current = false;
      return;
    }
    if (openRef.current && queryRef.current !== '') {
      restart(queryRef.current, matchCaseRef.current, wholeWordRef.current);
    }
    // Re-runs the OPEN query against the newly active tab, not a mere state read — intentionally
    // depends on `activeTabId` alone (`restart`/refs are stable across renders, so omitting them
    // changes nothing about when this fires).
  }, [activeTabId]);

  /** Step within the OPEN session — `findNext: false` is the follow-up request, not the opener. */
  const step = useCallback((forward: boolean) => {
    const current = queryRef.current;
    if (current === '') return;
    window.tepegoz.findInPage({
      query: current,
      forward,
      findNext: false,
      matchCase: matchCaseRef.current,
      wholeWord: wholeWordRef.current,
    });
  }, []);

  const toggleMatchCase = useCallback(() => {
    const next = !matchCaseRef.current;
    setMatchCase(next);
    restart(queryRef.current, next, wholeWordRef.current);
  }, [restart]);

  const toggleWholeWord = useCallback(() => {
    const next = !wholeWordRef.current;
    setWholeWord(next);
    restart(queryRef.current, matchCaseRef.current, next);
  }, [restart]);

  const close = useCallback(() => {
    setOpen(false);
    window.tepegoz.stopFindInPage();
    setActiveMatch(0);
    setTotalMatches(0);
  }, []);

  return {
    open,
    focusKey,
    query,
    matchCase,
    wholeWord,
    activeMatch,
    totalMatches,
    setQuery,
    next: useCallback(() => {
      step(true);
    }, [step]),
    previous: useCallback(() => {
      step(false);
    }, [step]),
    toggleMatchCase,
    toggleWholeWord,
    close,
  };
}

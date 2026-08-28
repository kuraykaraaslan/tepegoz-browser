import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A field that writes when the typing STOPS, not on every keystroke.
 *
 * Settings apply instantly here — there is no Save button — and `setPref` goes straight to
 * `prefs:set`, which validates, writes the store to disk and then re-runs whatever reconcilers that
 * key owns (the file-access policy, the adblock engine, the login item…). Bound directly to an
 * `onChange`, typing a homepage URL was ~30 of those round trips, each one a disk write, and dragging
 * the colour picker fired one per animation frame.
 *
 * Three rules make the deferral safe rather than merely cheaper:
 *  - an external change is adopted only while the field is NOT mid-edit, so another window's write
 *    cannot yank the caret out from under someone who is typing;
 *  - `flush` runs on unmount, so switching settings sections commits the pending edit instead of
 *    silently dropping it — the failure mode a plain debounce would introduce;
 *  - `flush` is also exported for `onBlur`/Enter, so leaving the field saves immediately and the user
 *    never has to trust a timer they cannot see.
 */
export function useCommitOnPause<T>(
  external: T,
  commit: (value: T) => void,
  delayMs = 500,
): { draft: T; set: (next: T) => void; flush: () => void } {
  const [draft, setDraft] = useState<T>(external);
  const dirty = useRef(false);
  const latest = useRef<T>(external);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref so `set`/`flush` stay stable across renders even when the caller passes an inline
  // arrow — otherwise every render would rebuild the debounce and the timer would never fire.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (!dirty.current) setDraft(external);
  }, [external]);

  const flush = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    commitRef.current(latest.current);
  }, []);

  useEffect(() => flush, [flush]);

  const set = useCallback(
    (next: T): void => {
      latest.current = next;
      dirty.current = true;
      setDraft(next);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  return { draft, set, flush };
}

import { useEffect, useState } from 'react';

/**
 * Ctrl+L / Alt+D — the keyboard path to the address bar.
 *
 * There was none. `SHORTCUTS` had fifteen entries and not one of them focused the omnibox, so the
 * address bar was mouse-only: a WCAG 2.1.1 failure on the single most-used control in a browser
 * (omnibox track § A7). The key is caught in MAIN, because it almost always arrives while a page has
 * focus and the chrome never sees it there; main sends `omnibox:focus` and this hook turns that into
 * the counter the omnibox watches.
 *
 * A counter, not a boolean: pressing the shortcut twice has to focus twice, and a flag that is already
 * `true` does nothing the second time. Same idiom as the find bar's `focusKey`, so the two behave
 * alike. Starts at 0, which the omnibox ignores, so nothing steals focus on mount.
 */
export function useOmniboxFocusShortcut(): number {
  const [token, setToken] = useState(0);
  useEffect(() => window.tepegoz.onOmniboxFocus(() => setToken((n) => n + 1)), []);
  return token;
}

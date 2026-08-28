import { useEffect } from 'react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { applyMotionPreference, applyTheme } from './theme';

/**
 * Keep THIS document's theme in sync with the preference — for the whole life of the document, not
 * only at first paint.
 *
 * Every `tepegoz://` page is its own top-level `WebContentsView`, so it applies the theme itself.
 * Both surfaces used to do that inside their initial `[]`-effect, which meant the theme was read once
 * and never again: picking Dark on `tepegoz://settings#appearance` wrote `theme: 'dark'` to the store
 * and left the page it was picked on in the old theme until a reload. Measured in the running app —
 * `prefs.theme` became `dark` while `document.documentElement.className` stayed `''`.
 *
 * Depending on the two VALUES rather than on the prefs object also makes the re-apply cheap: an
 * unrelated preference write re-renders but does not re-run this.
 */
export function useAppliedTheme(
  prefs: Pick<Preferences, 'theme' | 'themeColor' | 'reduceMotion'> | null,
): void {
  const theme = prefs?.theme;
  const themeColor = prefs?.themeColor;
  const reduceMotion = prefs?.reduceMotion;
  useEffect(() => {
    if (theme === undefined || themeColor === undefined) return;
    applyTheme(theme, themeColor);
  }, [theme, themeColor]);
  // Same reasoning, same lifetime: a presentation preference this document has to keep applying, not
  // read once. Separate effect so a theme change does not re-touch the motion attribute or vice versa.
  useEffect(() => {
    if (reduceMotion === undefined) return;
    applyMotionPreference(reduceMotion);
  }, [reduceMotion]);
}

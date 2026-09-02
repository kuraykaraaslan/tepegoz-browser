import { resolveLocale, type Locale } from '@tepegoz/i18n';
import type { LocalePref, NewTabBackground, TabsState } from '@tepegoz/desktop-ipc';
import type { OmniboxQuickSettingTarget } from '@tepegoz/omnibox';

/** Pure helpers + constants split out of `App.tsx` (ADR-0010 250-line cap). */

export function effectiveLocale(pref: LocalePref): Locale {
  if (pref === 'en' || pref === 'tr') return pref;
  return resolveLocale(navigator.language);
}

export const EMPTY_TABS: TabsState = {
  tabs: [],
  groups: [],
  activeId: null,
  canGoBack: false,
  canGoForward: false,
  isPrivate: false,
  activeZoomFactor: 1,
  activeSecurityLevel: 'unknown',
};

/** Fallback new-tab background while preferences are still loading (mirrors DEFAULT_PREFERENCES). */
export const DEFAULT_NEWTAB_BACKGROUND: NewTabBackground = {
  kind: 'default',
  color: '#1e293b',
  svgId: '',
  imageRef: '',
  imageFit: 'cover',
  imagePositionX: 50,
  imagePositionY: 50,
  imageZoom: 1,
  opacity: 1,
};

export const QUICK_SETTING_SECTION: Record<OmniboxQuickSettingTarget, string> = {
  appearance: 'appearance',
  language: 'language',
  privacy: 'privacy',
};

export function internalPageBase(url: string): string {
  return url.split('#', 1)[0] ?? url;
}

export function internalPageHash(url: string): string {
  const hashIndex = url.indexOf('#');
  return hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
}

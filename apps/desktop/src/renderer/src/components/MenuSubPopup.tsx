import { useEffect, useState } from 'react';
import { pick, resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider } from '@tepegoz/i18n/react';
import { Menu, type MenuItem } from '@tepegoz/browser-menu';
import {
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  isExtensionEnabled,
} from '@tepegoz/desktop-ipc';
import { historyDict } from '@tepegoz/history-ui/i18n';
import { extensionsDict } from '@tepegoz/extensions-ui/i18n';
import { menuDict } from '../../../i18n';
import { extensionLabel, extensionPageUrl } from '../../../shared/extensions';
import { EXTENSIONS } from '../extensions/registry';
import { applyTheme } from '../lib/theme';

/**
 * Standalone render target for a submenu flyout window (loaded with `?surface=menu-sub&kind=<k>`). It's
 * a SEPARATE native window opened to the left of the main-menu popup (a native window can't overflow its
 * bounds, so a beside-the-menu flyout has to be its own window). Self-contained: it fetches its own data
 * (last-5 history / enabled extensions) and wires its own bridge actions. Selecting an item navigates the
 * main window (TabManager singleton) then closes the whole menu via `closePopup` (which cascades here).
 */
const RECENT_HISTORY_COUNT = 5;

export function MenuSubPopup({ kind }: { kind: string }) {
  const [locale, setLocale] = useState<Locale>('en');
  const [items, setItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Run the action, then dismiss the whole menu (closing the primary cascades to this flyout).
    const act = (fn: () => void): void => {
      fn();
      window.tepegoz.closePopup();
    };
    void (async () => {
      let prefs;
      try {
        prefs = await window.tepegoz.getPreferences();
      } catch {
        return; // bridge unavailable
      }
      if (cancelled) return;
      applyTheme(prefs.theme, prefs.themeColor);
      const loc: Locale =
        prefs.locale === 'en' || prefs.locale === 'tr' ? prefs.locale : resolveLocale(navigator.language);
      setLocale(loc);

      if (kind === 'history') {
        let list: Awaited<ReturnType<typeof window.tepegoz.getHistory>> = [];
        try {
          list = await window.tepegoz.getHistory();
        } catch {
          /* ignore — just show "Show full history" */
        }
        if (cancelled) return;
        const m = pick(menuDict, loc);
        setItems([
          ...list.slice(0, RECENT_HISTORY_COUNT).map(
            (e): MenuItem => ({
              id: `h:${e.url}`,
              label: e.title.length > 0 ? e.title : e.url,
              onSelect: () => act(() => window.tepegoz.navigateTab(e.url)),
            }),
          ),
          { id: 'history-all', label: m.showFullHistory, onSelect: () => act(() => window.tepegoz.navigateTab(INTERNAL_HISTORY_URL)) },
        ]);
      } else if (kind === 'extensions') {
        const x = pick(extensionsDict, loc);
        const enabled = EXTENSIONS.filter((ext) => isExtensionEnabled(prefs.extensions, ext.id));
        setItems([
          ...enabled.map(
            (ext): MenuItem => ({
              id: `ext:${ext.id}`,
              label: extensionLabel(ext.manifest, loc).name,
              icon: ext.icon,
              onSelect: () => act(() => window.tepegoz.navigateTab(extensionPageUrl(ext.id))),
            }),
          ),
          { id: 'ext-manage', label: x.manage, onSelect: () => act(() => window.tepegoz.navigateTab(INTERNAL_EXTENSIONS_URL)) },
        ]);
      }
    })();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [kind]);

  const ariaLabel =
    kind === 'history' ? pick(historyDict, locale).title : pick(extensionsDict, locale).title;

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div className="min-h-0 flex-1 overflow-auto">
          <Menu items={items} ariaLabel={ariaLabel} />
        </div>
      </div>
    </I18nProvider>
  );
}

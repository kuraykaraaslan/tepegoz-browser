import { useEffect, useRef, useState } from 'react';
import { pick, resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider } from '@tepegoz/i18n/react';
import { Menu, type MenuItem } from '@tepegoz/browser-menu';
import { Icon } from '@tepegoz/ui';
import {
  INTERNAL_BOOKMARKS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  isExtensionEnabled,
} from '@tepegoz/desktop-ipc';
import { historyDict } from '@tepegoz/history-ui/i18n';
import { extensionsDict } from '@tepegoz/extensions-ui/i18n';
import { menuDict } from '../../../i18n';
import { extensionLabel, extensionPageUrl } from '../../../shared/extension-urls';
import { iconNodeFor } from '../extensions/icon-registry';
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
  const contentRef = useRef<HTMLDivElement>(null);

  // Shrink/grow the native flyout window to the item list's natural height (the open-time height is
  // only an estimate; the real row count is known once the async data loads), removing dead rows.
  // Mirrors MainMenuPopup — the main process resizes whichever popup sent the request (here, the sub).
  useEffect(() => {
    const el = contentRef.current;
    if (el === null) return;
    const report = (): void => window.tepegoz.resizePopup(Math.ceil(el.getBoundingClientRect().height));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      } else if (kind === 'bookmarks') {
        const m = pick(menuDict, loc);
        let bms: Awaited<ReturnType<typeof window.tepegoz.listBookmarks>> = [];
        try {
          bms = await window.tepegoz.listBookmarks();
        } catch {
          /* ignore — still show the show/hide bookmarks-bar toggle */
        }
        if (cancelled) return;
        // Default-on: the bar shows unless the preference is explicitly false (so a prefs object that
        // predates the field still reads as "shown", matching DEFAULT_PREFERENCES).
        const barShown = prefs.showBookmarksBar !== false;
        setItems([
          // Chrome-style show/hide bookmarks-bar toggle (checkmark reflects the current preference).
          {
            id: 'bm-bar-toggle',
            label: m.showBookmarksBar,
            ...(barShown ? { trailing: <Icon name="check" /> } : {}),
            onSelect: () =>
              act(() => {
                void window.tepegoz.updatePreferences({ showBookmarksBar: !barShown });
              }),
          },
          {
            id: 'bm-manager',
            label: m.bookmarkManager,
            onSelect: () => act(() => window.tepegoz.navigateTab(INTERNAL_BOOKMARKS_URL)),
          },
          { kind: 'separator' },
          ...(bms.length === 0
            ? [{ id: 'bm-empty', label: m.noBookmarks, disabled: true } as MenuItem]
            : bms.map(
                (bm): MenuItem => ({
                  id: `bm:${bm.url}`,
                  label: bm.title.length > 0 ? bm.title : bm.url,
                  icon: <Icon name="bookmark" />,
                  onSelect: () => act(() => window.tepegoz.navigateTab(bm.url)),
                }),
              )),
        ]);
      } else if (kind === 'extensions') {
        const x = pick(extensionsDict, loc);
        let manifests: Awaited<ReturnType<typeof window.tepegoz.listExtensionManifests>> = [];
        try {
          manifests = await window.tepegoz.listExtensionManifests();
        } catch {
          /* ignore — just show "Manage extensions" */
        }
        if (cancelled) return;
        const enabled = manifests.filter((m) => isExtensionEnabled(prefs.extensions, m.id));
        setItems([
          ...enabled.map(
            (m): MenuItem => ({
              id: `ext:${m.id}`,
              label: extensionLabel(m, loc).name,
              icon: iconNodeFor(m.icon),
              onSelect: () => act(() => window.tepegoz.navigateTab(extensionPageUrl(m.id))),
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
    kind === 'history'
      ? pick(historyDict, locale).title
      : kind === 'bookmarks'
        ? pick(menuDict, locale).bookmarks
        : pick(extensionsDict, locale).title;

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div className="min-h-0 flex-1 overflow-auto">
          <div ref={contentRef} className="flow-root">
            <Menu items={items} ariaLabel={ariaLabel} />
          </div>
        </div>
      </div>
    </I18nProvider>
  );
}

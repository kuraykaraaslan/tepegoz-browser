import { useEffect, useRef, useState } from 'react';
import { coreDict, resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider, useT } from '@tepegoz/i18n/react';
import { Menu, type MenuFlyout } from '@tepegoz/browser-menu';
import {
  INTERNAL_DOWNLOADS_URL,
  INTERNAL_SETTINGS_URL,
  INTERNAL_TASKS_URL,
  INTERNAL_UPLOADS_URL,
  isExtensionEnabled,
  type ExtensionState,
} from '@tepegoz/desktop-ipc';
import { historyDict } from '@tepegoz/history-ui/i18n';
import { extensionsDict } from '@tepegoz/extensions-ui/i18n';
import { browserDict, menuDict } from '../../../i18n';
import { applyTheme } from '../lib/theme';
import { buildMainMenuModel } from './main-menu-model';

/**
 * Standalone render target for the native main-menu popup window (loaded with `?surface=main-menu`).
 * Mirrors `PopupApp` structure: fetch prefs → apply theme + locale, Escape closes, wrap in the
 * I18nProvider. It renders the compact Chrome-style menu over the live page (the window floats above the
 * WebContentsView, so nothing is hidden). History and Extensions are `flyout` parents: hovering them
 * opens a SEPARATE window to the left (see MenuSubPopup). Actions run against the main window (TabManager
 * singleton).
 */
/** Row height (px) used to size the submenu flyout window from its item count (main clamps + scrolls). */
const SUB_ROW_H = 36;

export function MainMenuPopup() {
  const [locale, setLocale] = useState<Locale>('en');
  const [extensionStates, setExtensionStates] = useState<ExtensionState[]>([]);
  // Built-in extension ids from the catalog (over IPC) — the enabled count sizes the flyout submenu.
  const [extensionIds, setExtensionIds] = useState<string[]>([]);
  // Bookmark count (over IPC) — sizes the Bookmarks flyout submenu window.
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Shrink the native popup window to the menu's natural content height, removing the empty strip left
  // by the open-time height estimate (MainMenuButton). Re-measures on content changes (e.g. locale
  // load swaps in translated labels of a different height). Content height is independent of the window
  // height, so reporting it never feeds back into a resize loop. The measured box is `flow-root` (a
  // block-formatting context) so any child top/bottom margins are contained in its bounding rect rather
  // than collapsing out and being under-measured (which would leave a surplus that scrolls).
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
    void window.tepegoz.getPreferences().then(
      (p) => {
        applyTheme(p.theme, p.themeColor);
        setLocale(p.locale === 'en' || p.locale === 'tr' ? p.locale : resolveLocale(navigator.language));
        setExtensionStates(p.extensions);
      },
      () => {
        /* bridge unavailable — fall back to defaults */
      },
    );
    void window.tepegoz.listExtensionManifests().then(
      (manifests) => setExtensionIds(manifests.map((m) => m.id)),
      () => {
        /* bridge unavailable — the submenu still shows the "manage" row */
      },
    );
    void window.tepegoz.listBookmarks().then(
      (list) => setBookmarkCount(list.length),
      () => {
        /* bridge unavailable — the submenu still shows the bookmarks-bar toggle */
      },
    );
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const enabledCount = extensionIds.filter((id) => isExtensionEnabled(extensionStates, id)).length;

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div className="min-h-0 flex-1 overflow-auto">
          <div ref={contentRef} className="flow-root">
            <MainMenuBody extensionCount={enabledCount} bookmarkCount={bookmarkCount} />
          </div>
        </div>
      </div>
    </I18nProvider>
  );
}

/** Builds the item model under the I18nProvider (so `useT` resolves) and renders the menu. */
function MainMenuBody({
  extensionCount,
  bookmarkCount,
}: {
  extensionCount: number;
  bookmarkCount: number;
}) {
  const b = useT(browserDict);
  const core = useT(coreDict);
  const h = useT(historyDict);
  const x = useT(extensionsDict);
  const m = useT(menuDict);

  // Every action runs the bridge call, then self-dismisses the popup (Chrome-style).
  const act = (fn: () => void): void => {
    fn();
    window.tepegoz.closePopup();
  };

  const items = buildMainMenuModel(
    {
      newTab: b.newTab,
      reopenTab: b.reopenTab,
      reload: b.reload,
      exit: b.exit,
      settings: core.common.settings,
      history: h.title,
      extensions: x.title,
      menu: m,
    },
    {
      newTab: () => act(() => window.tepegoz.createTab()),
      reopenTab: () => act(() => window.tepegoz.reopenClosedTab()),
      reload: () => act(() => window.tepegoz.tabReload()),
      openDownloads: () => act(() => window.tepegoz.navigateTab(INTERNAL_DOWNLOADS_URL)),
      openUploads: () => act(() => window.tepegoz.navigateTab(INTERNAL_UPLOADS_URL)),
      openTasks: () => act(() => window.tepegoz.navigateTab(INTERNAL_TASKS_URL)),
      openSettings: () => act(() => window.tepegoz.navigateTab(INTERNAL_SETTINGS_URL)),
      exit: () => act(() => window.tepegoz.quitApp()),
    },
  );

  // History/Extensions submenu parents → open a separate native window to the left, aligned to the row.
  const flyout: MenuFlyout = {
    onOpen: (id, rect) => {
      const kind = id === 'history' ? 'history' : id === 'bookmarks' ? 'bookmarks' : 'extensions';
      // history: last-5 + "show all"; bookmarks: toggle + separator + list (capped, main scrolls);
      // extensions: enabled + "manage".
      const rows =
        kind === 'history'
          ? 6
          : kind === 'bookmarks'
            ? Math.min(bookmarkCount, 10) + 3
            : extensionCount + 1;
      window.tepegoz.openSubmenu(
        kind,
        { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        { height: rows * SUB_ROW_H + 8 },
      );
    },
    onClose: () => window.tepegoz.closeSubmenu(),
  };

  return <Menu items={items} ariaLabel={b.menu} autoFocus flyout={flyout} />;
}

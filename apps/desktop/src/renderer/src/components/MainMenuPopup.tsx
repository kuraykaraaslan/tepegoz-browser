import { useEffect, useState } from 'react';
import { coreDict, resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider, useT } from '@tepegoz/i18n/react';
import { Menu } from '@tepegoz/browser-menu';
import {
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_SETTINGS_URL,
  isExtensionEnabled,
  type ExtensionState,
  type ThemePref,
} from '@tepegoz/desktop-ipc';
import { historyDict } from '@tepegoz/history-ui/i18n';
import { extensionsDict } from '@tepegoz/extensions-ui/i18n';
import { browserDict, menuDict } from '../../../i18n';
import { extensionPageUrl } from '../../../shared/extensions';
import { EXTENSIONS, type ExtensionDef } from '../extensions/registry';
import { buildMainMenuModel } from './main-menu-model';

/**
 * Standalone render target for the native main-menu popup window (loaded with `?surface=main-menu`).
 * Mirrors `PopupApp` structure: fetch prefs → apply theme + locale, Escape closes, wrap in the
 * I18nProvider. It renders the Chrome-style menu over the live page (the window floats above the
 * WebContentsView, so nothing is hidden). Actions run against the main window (TabManager singleton).
 */
function applyTheme(theme: ThemePref): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

export function MainMenuPopup() {
  const [locale, setLocale] = useState<Locale>('en');
  const [extensionStates, setExtensionStates] = useState<ExtensionState[]>([]);

  useEffect(() => {
    void window.tepegoz.getPreferences().then(
      (p) => {
        applyTheme(p.theme);
        setLocale(p.locale === 'en' || p.locale === 'tr' ? p.locale : resolveLocale(navigator.language));
        setExtensionStates(p.extensions);
      },
      () => {
        /* bridge unavailable — fall back to defaults */
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

  const enabled = EXTENSIONS.filter((e) => isExtensionEnabled(extensionStates, e.id));

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div className="min-h-0 flex-1 overflow-auto">
          <MainMenuBody extensions={enabled} locale={locale} />
        </div>
      </div>
    </I18nProvider>
  );
}

/** Builds the item model under the I18nProvider (so `useT` resolves) and renders the menu. */
function MainMenuBody({ extensions, locale }: { extensions: readonly ExtensionDef[]; locale: Locale }) {
  const b = useT(browserDict);
  const core = useT(coreDict);
  const h = useT(historyDict);
  const x = useT(extensionsDict);
  const m = useT(menuDict);

  // Every real action runs the bridge call, then self-dismisses the popup (Chrome-style).
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
      extensionsManage: x.manage,
      menuLabel: b.menu,
      menu: m,
    },
    {
      newTab: () => act(() => window.tepegoz.createTab()),
      reopenTab: () => act(() => window.tepegoz.reopenClosedTab()),
      reload: () => act(() => window.tepegoz.tabReload()),
      openHistory: () => act(() => window.tepegoz.navigateTab(INTERNAL_HISTORY_URL)),
      openExtension: (id) => act(() => window.tepegoz.navigateTab(extensionPageUrl(id))),
      manageExtensions: () => act(() => window.tepegoz.navigateTab(INTERNAL_EXTENSIONS_URL)),
      openSettings: () => act(() => window.tepegoz.navigateTab(INTERNAL_SETTINGS_URL)),
      exit: () => act(() => window.tepegoz.quitApp()),
    },
    extensions,
    locale,
  );

  return <Menu items={items} ariaLabel={b.menu} autoFocus />;
}

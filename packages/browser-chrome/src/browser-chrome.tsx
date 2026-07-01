import { type ReactNode } from 'react';
import { BrandMark } from '@tepegoz/ui';
import { TabStrip, type TabDescriptor } from '@tepegoz/tab-strip';
import { WindowControls } from '@tepegoz/window-controls';
import { NavToolbar } from '@tepegoz/nav-toolbar';
import type { OmniboxSuggestion } from '@tepegoz/omnibox';

/**
 * The exact string slices this chrome renders. The host composes it from the shared core dict
 * (`common`/`window`) plus its own `browser` dict — this package stays a presentational leaf and owns
 * no strings itself (same seam as `@tepegoz/tab-strip`/`@tepegoz/window-controls`).
 */
export interface BrowserChromeStrings {
  common: { appName: string };
  window: { minimize: string; maximize: string; restore: string; close: string };
  browser: {
    tabs: string;
    untitled: string;
    closeTab: string;
    newTab: string;
    back: string;
    forward: string;
    reload: string;
    menu: string;
    omniboxPlaceholder: string;
  };
}

export interface BrowserChromeProps {
  t: BrowserChromeStrings;
  // Tab strip
  tabs: readonly TabDescriptor[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTabContextMenu: (id: string) => void;
  onNewTab: () => void;
  // Window caption controls
  isMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  // Navigation bar
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onMenu: () => void;
  onNavigate: (input: string) => void;
  /** Async omnibox suggestion source (history/tab/search); omit to disable the dropdown. */
  onSuggest?: ((query: string) => Promise<OmniboxSuggestion[]>) | undefined;
  /** Switch to an already-open tab (for `activateTab` omnibox suggestions). */
  onActivateTab?: ((tabId: string) => void) | undefined;
  /** Host-provided controls between the omnibox and the menu button (e.g. the extension tray + puzzle). */
  toolbarActions?: ReactNode;
}

/**
 * `@tepegoz/browser-chrome` — the frameless browser chrome frame: the draggable title row (brand +
 * tab strip + caption controls) and the navigation bar (`@tepegoz/nav-toolbar` = back/forward/reload +
 * omnibox + actions slot + menu). Composes the extracted chrome packages; every bridge action is
 * injected, so it has no dependency on the Electron bridge. Extracted from `apps/desktop` per
 * docs/package-map.md.
 */
export function BrowserChrome({
  t,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onTabContextMenu,
  onNewTab,
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose,
  currentUrl,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
  onMenu,
  onNavigate,
  onSuggest,
  onActivateTab,
  toolbarActions,
}: BrowserChromeProps) {
  return (
    <>
      {/* Custom window title row for the frameless window: brand, tab strip, a draggable spacer, and
          the caption controls. `-webkit-app-region: drag` on the bar restores OS caption behaviors;
          interactive children opt out with `.app-no-drag`. */}
      <header className="app-drag flex h-9 shrink-0 select-none items-stretch gap-2 border-b border-border bg-surface-raised pl-3">
        <div className="flex items-center gap-1.5">
          <BrandMark className="h-5 w-5" />
          <h1 className="text-xs font-semibold text-text-primary">{t.common.appName}</h1>
        </div>
        <div className="flex min-w-0 flex-1 items-end pt-1.5">
          <TabStrip
            tabs={tabs}
            activeId={activeTabId}
            labels={{
              tablist: t.browser.tabs,
              untitled: t.browser.untitled,
              closeTab: t.browser.closeTab,
              newTab: t.browser.newTab,
            }}
            onSelect={onSelectTab}
            onClose={onCloseTab}
            onContextMenu={onTabContextMenu}
            onNew={onNewTab}
          />
        </div>
        <WindowControls
          isMaximized={isMaximized}
          labels={{
            minimize: t.window.minimize,
            maximize: t.window.maximize,
            restore: t.window.restore,
            close: t.window.close,
          }}
          onMinimize={onMinimize}
          onToggleMaximize={onToggleMaximize}
          onClose={onClose}
        />
      </header>
      <NavToolbar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        labels={{
          back: t.browser.back,
          forward: t.browser.forward,
          reload: t.browser.reload,
          menu: t.browser.menu,
        }}
        onBack={onBack}
        onForward={onForward}
        onReload={onReload}
        onMenu={onMenu}
        currentUrl={currentUrl}
        omniboxPlaceholder={t.browser.omniboxPlaceholder}
        onNavigate={onNavigate}
        onSuggest={onSuggest}
        onActivateTab={onActivateTab}
        actions={toolbarActions}
      />
    </>
  );
}

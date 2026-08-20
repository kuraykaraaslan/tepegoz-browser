import { type ReactNode } from 'react';
import { BrandMark } from '@tepegoz/ui';
import {
  TabStrip,
  type TabDescriptor,
  type TabGroupDescriptor,
  type TabStripGeometryReport,
  type TabTearBegin,
  type TabTearPoint,
} from '@tepegoz/tab-strip';
import { WindowControls } from '@tepegoz/window-controls';
import { NavToolbar } from '@tepegoz/nav-toolbar';
import type { OmniboxQuickSettingTarget, OmniboxSuggestion } from '@tepegoz/omnibox';

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
    home: string;
    omniboxPlaceholder: string;
    bookmarkAdd: string;
    bookmarkRemove: string;
    unnamedGroup: string;
    toggleGroup: string;
    /** Phase 5 route badge names; `{name}` is replaced with the connection label. */
    routeTunneled: string;
    routeTunneledInherited: string;
    routeBlocked: string;
  };
}

export interface BrowserChromeProps {
  t: BrowserChromeStrings;
  // Tab strip
  tabs: readonly TabDescriptor[];
  /** Tab groups (ADR-0020); omit when the host has no grouping. */
  tabGroups?: readonly TabGroupDescriptor[] | undefined;
  /** A group whose inline rename editor should open (from the native group menu's "Rename"). */
  renamingGroupId?: string | null | undefined;
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTabContextMenu: (id: string) => void;
  /** Open the native group context menu (right-click a group header). */
  onTabGroupContextMenu?: ((groupId: string) => void) | undefined;
  onNewTab: () => void;
  /** Drag-reorder a tab to `toIndex` (grouping inferred by the host from neighbors). */
  onMoveTab?: ((id: string, toIndex: number) => void) | undefined;
  /** Drag-reorder a whole group's run to `toIndex` among the non-member tabs. */
  onMoveTabGroup?: ((groupId: string, toIndex: number) => void) | undefined;
  /** Add a tab to a group (drop a tab on the group header). */
  onAssignTabToGroup?: ((tabId: string, groupId: string) => void) | undefined;
  /** Collapse/expand a group. */
  onToggleGroupCollapsed?: ((groupId: string, collapsed: boolean) => void) | undefined;
  /** Rename a group (inline). */
  onRenameTabGroup?: ((groupId: string, name: string) => void) | undefined;
  /** Called once the external rename trigger (`renamingGroupId`) has been consumed. */
  onRenameTabGroupHandled?: (() => void) | undefined;
  // Tab tear-off (drag a tab/group out of the strip → new/another window).
  onTearBegin?: ((payload: TabTearBegin) => void) | undefined;
  onTearMove?: ((point: TabTearPoint) => void) | undefined;
  onTearEnd?: ((point: TabTearPoint) => void) | undefined;
  onTearCancel?: (() => void) | undefined;
  onReportTabStripGeometry?: ((geometry: TabStripGeometryReport) => void) | undefined;
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
  onHome: () => void;
  /** The main (hamburger) menu control (button + its dropdown), supplied by the host. */
  menu: ReactNode;
  onNavigate: (input: string) => void;
  /** Async omnibox suggestion source (history/tab/search); omit to disable the dropdown. */
  onSuggest?: ((query: string) => Promise<OmniboxSuggestion[]>) | undefined;
  /** Switch to an already-open tab (for `activateTab` omnibox suggestions). */
  onActivateTab?: ((tabId: string) => void) | undefined;
  /** Open a high-frequency settings panel from an omnibox suggestion. */
  onOpenQuickSetting?: ((target: OmniboxQuickSettingTarget) => void) | undefined;
  /** Reports the omnibox dropdown height to hosts that need to manage native web-view layering. */
  onOmniboxDropdownHeightChange?: ((height: number) => void) | undefined;
  // Bookmark star (right of the omnibox).
  /** Whether the active page is bookmarked (filled vs. outline star). */
  isBookmarked?: boolean | undefined;
  /** True only for bookmarkable pages (http(s)); the star is disabled otherwise. */
  canBookmark?: boolean | undefined;
  /** Toggle the active page's bookmark. Omit to hide the star. */
  onToggleBookmark?: (() => void) | undefined;
  /** Host-provided controls between the omnibox and the menu button (e.g. the extension tray + puzzle). */
  toolbarActions?: ReactNode;
  /** Host-provided controls in the title row, immediately LEFT of the window caption controls (e.g. the
   *  notification-center bell). Interactive, so it opts out of the window drag region. */
  captionLeading?: ReactNode;
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
  tabGroups,
  renamingGroupId,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onTabContextMenu,
  onTabGroupContextMenu,
  onNewTab,
  onMoveTab,
  onMoveTabGroup,
  onAssignTabToGroup,
  onToggleGroupCollapsed,
  onRenameTabGroup,
  onRenameTabGroupHandled,
  onTearBegin,
  onTearMove,
  onTearEnd,
  onTearCancel,
  onReportTabStripGeometry,
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
  onHome,
  menu,
  onNavigate,
  onSuggest,
  onActivateTab,
  onOpenQuickSetting,
  onOmniboxDropdownHeightChange,
  isBookmarked,
  canBookmark,
  onToggleBookmark,
  toolbarActions,
  captionLeading,
}: BrowserChromeProps) {
  return (
    <>
      {/* Custom window title row for the frameless window: brand, tab strip, a draggable spacer, and
          the caption controls. `-webkit-app-region: drag` on the bar restores OS caption behaviors;
          interactive children opt out with `.app-no-drag`. */}
      <header className="chrome-surface app-drag flex h-9 shrink-0 select-none items-stretch gap-2 border-b border-border bg-surface-raised pl-3">
        <div className="flex items-center" role="img" aria-label={t.common.appName}>
          <BrandMark className="h-5 w-5" />
        </div>
        <div className="flex min-w-0 flex-1 items-end pt-1.5">
          <TabStrip
            tabs={tabs}
            groups={tabGroups}
            renamingGroupId={renamingGroupId}
            activeId={activeTabId}
            labels={{
              tablist: t.browser.tabs,
              untitled: t.browser.untitled,
              closeTab: t.browser.closeTab,
              newTab: t.browser.newTab,
              unnamedGroup: t.browser.unnamedGroup,
              toggleGroup: t.browser.toggleGroup,
              routeTunneled: t.browser.routeTunneled,
              routeTunneledInherited: t.browser.routeTunneledInherited,
              routeBlocked: t.browser.routeBlocked,
            }}
            onSelect={onSelectTab}
            onClose={onCloseTab}
            onContextMenu={onTabContextMenu}
            onGroupContextMenu={onTabGroupContextMenu}
            onNew={onNewTab}
            onMove={onMoveTab}
            onMoveGroup={onMoveTabGroup}
            onAssignToGroup={onAssignTabToGroup}
            onToggleGroupCollapsed={onToggleGroupCollapsed}
            onRenameGroup={onRenameTabGroup}
            onRenameHandled={onRenameTabGroupHandled}
            onTearBegin={onTearBegin}
            onTearMove={onTearMove}
            onTearEnd={onTearEnd}
            onTearCancel={onTearCancel}
            onReportGeometry={onReportTabStripGeometry}
          />
        </div>
        {captionLeading !== undefined && (
          <div className="app-no-drag flex items-center">{captionLeading}</div>
        )}
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
          home: t.browser.home,
          bookmarkAdd: t.browser.bookmarkAdd,
          bookmarkRemove: t.browser.bookmarkRemove,
        }}
        onBack={onBack}
        onForward={onForward}
        onReload={onReload}
        onHome={onHome}
        menu={menu}
        currentUrl={currentUrl}
        omniboxPlaceholder={t.browser.omniboxPlaceholder}
        onNavigate={onNavigate}
        onSuggest={onSuggest}
        onActivateTab={onActivateTab}
        onOpenQuickSetting={onOpenQuickSetting}
        onOmniboxDropdownHeightChange={onOmniboxDropdownHeightChange}
        isBookmarked={isBookmarked}
        canBookmark={canBookmark}
        onToggleBookmark={onToggleBookmark}
        actions={toolbarActions}
      />
    </>
  );
}

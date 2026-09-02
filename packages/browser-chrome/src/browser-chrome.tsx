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
import { captionLayout, WindowControls } from '@tepegoz/window-controls';
import { NavToolbar, type OmniboxSecurityLevel } from '@tepegoz/nav-toolbar';
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
    /** Leading site-info control (Chrome's lock / "Not secure" affordance). */
    siteInfo: {
      button: string;
      secure: string;
      notSecure: string;
      dangerous: string;
      internal: string;
      file: string;
    };
    /** Omnibox zoom indicator (Chrome-style; shown only off 100%). */
    zoom: string;
    zoomIn: string;
    zoomOut: string;
    zoomReset: string;
    unnamedGroup: string;
    toggleGroup: string;
    /** Phase 5 route badge names; `{name}` is replaced with the connection label. */
    routeTunneled: string;
    routeTunneledInherited: string;
    routeBlocked: string;
    routeLegVpn: string;
    routeLegTor: string;
    routeStatusUp: string;
    routeStatusConnecting: string;
    routeStatusDown: string;
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
  /** Right-click on the back button — the host pops that tab's back-history dropdown. */
  onBackContextMenu?: (() => void) | undefined;
  /** Right-click on the forward button — the host pops that tab's forward-history dropdown. */
  onForwardContextMenu?: (() => void) | undefined;
  /** The main (hamburger) menu control (button + its dropdown), supplied by the host. */
  menu: ReactNode;
  onNavigate: (input: string) => void;
  /** The active page's security level — drives the leading site-info glyph. Omit/`'unknown'` hides it. */
  securityLevel?: OmniboxSecurityLevel | undefined;
  /** Open the Site Info bubble; receives the button's viewport rect for popup anchoring. */
  onOpenSiteInfo?: ((anchor: { x: number; y: number; width: number; height: number }) => void)
    | undefined;
  /** Async omnibox suggestion source (history/tab/search); omit to disable the dropdown. */
  /** Bumped by the host to focus the address bar (Ctrl+L / Alt+D). */
  omniboxFocusToken?: number | undefined;
  onSuggest?: ((query: string) => Promise<OmniboxSuggestion[]>) | undefined;
  /** Switch to an already-open tab (for `activateTab` omnibox suggestions). */
  onActivateTab?: ((tabId: string) => void) | undefined;
  /** Open a high-frequency settings panel from an omnibox suggestion. */
  onOpenQuickSetting?: ((target: OmniboxQuickSettingTarget) => void) | undefined;
  /** Forwarded to the omnibox — `@agent` is the one address-bar path that crosses into AI. */
  onAgentTask?: ((task: string) => void) | undefined;
  onRunSkill?: ((id: string) => void) | undefined;
  onOpenDownload?: ((id: string) => void) | undefined;
  /** Reports the omnibox dropdown height to hosts that need to manage native web-view layering. */
  onOmniboxDropdownHeightChange?: ((height: number) => void) | undefined;
  /** The active tab's zoom as a whole-number percent (e.g. `125`). Omit/`100` hides the indicator. */
  zoomPercent?: number | undefined;
  /** Step (`in`/`out`) or `reset` the active tab's zoom (the omnibox indicator's −, +, Reset). */
  onZoom?: ((direction: 'in' | 'out' | 'reset') => void) | undefined;
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
  /**
   * `process.platform`, injected — the package must not read it, and a user-agent sniff would be a
   * guess. It decides only where the window caption comes from (see `captionLayout`).
   */
  platform: string;
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
  onBackContextMenu,
  onForwardContextMenu,
  menu,
  onNavigate,
  securityLevel,
  onOpenSiteInfo,
  omniboxFocusToken,
  onSuggest,
  onActivateTab,
  onOpenQuickSetting,
  onAgentTask,
  onRunSkill,
  onOpenDownload,
  onOmniboxDropdownHeightChange,
  zoomPercent,
  onZoom,
  isBookmarked,
  canBookmark,
  onToggleBookmark,
  toolbarActions,
  captionLeading,
  platform,
}: BrowserChromeProps) {
  const caption = captionLayout(platform);
  return (
    <>
      {/* Custom window title row for the frameless window: brand, tab strip, a draggable spacer, and
          the caption controls. `-webkit-app-region: drag` on the bar restores OS caption behaviors;
          interactive children opt out with `.app-no-drag`. */}
      <header className="chrome-surface app-drag flex h-9 shrink-0 select-none items-stretch gap-2 border-b border-border bg-surface-raised pl-3">
        {/* macOS draws its traffic lights over this row; reserve their width so the brand and the first
            tab do not render underneath them. Zero everywhere else. */}
        {caption.leadingInset > 0 && (
          <div style={{ width: caption.leadingInset }} aria-hidden className="shrink-0" />
        )}
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
              routeLegVpn: t.browser.routeLegVpn,
              routeLegTor: t.browser.routeLegTor,
              routeLegUp: t.browser.routeStatusUp,
              routeLegConnecting: t.browser.routeStatusConnecting,
              routeLegDown: t.browser.routeStatusDown,
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
        {caption.showControls && (
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
        )}
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
        onBackContextMenu={onBackContextMenu}
        onForwardContextMenu={onForwardContextMenu}
        menu={menu}
        currentUrl={currentUrl}
        omniboxPlaceholder={t.browser.omniboxPlaceholder}
        onNavigate={onNavigate}
        securityLevel={securityLevel}
        securityLabels={t.browser.siteInfo}
        onOpenSiteInfo={onOpenSiteInfo}
        omniboxFocusToken={omniboxFocusToken}
        onSuggest={onSuggest}
        onActivateTab={onActivateTab}
        onOpenQuickSetting={onOpenQuickSetting}
        onAgentTask={onAgentTask}
        onRunSkill={onRunSkill}
        onOpenDownload={onOpenDownload}
        onOmniboxDropdownHeightChange={onOmniboxDropdownHeightChange}
        zoomPercent={zoomPercent}
        zoomLabels={{
          indicator: t.browser.zoom,
          zoomIn: t.browser.zoomIn,
          zoomOut: t.browser.zoomOut,
          reset: t.browser.zoomReset,
        }}
        onZoom={onZoom}
        isBookmarked={isBookmarked}
        canBookmark={canBookmark}
        onToggleBookmark={onToggleBookmark}
        actions={toolbarActions}
      />
    </>
  );
}

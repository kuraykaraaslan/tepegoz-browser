import { type Dispatch, type SetStateAction } from 'react';
import { coreDict, pick, type Locale } from '@tepegoz/i18n';
import { BrowserChrome } from '@tepegoz/browser-chrome';
import { FindBar } from '@tepegoz/find-bar';
import { useFindInPage } from './app-find';
import { BookmarksBar } from '@tepegoz/bookmarks-bar';
import { BOOKMARK_ROOT_BAR } from '@tepegoz/bookmarks';
import type { ExtensionId, Preferences, TabsState } from '@tepegoz/desktop-ipc';
import { PrivateBadge } from './components/PrivateBadge';
import type { OmniboxQuickSettingTarget } from '@tepegoz/omnibox';
import { browserDict, userMenuDict } from '../../i18n';
import { ExtensionTray } from './components/ExtensionTray';
import { MainMenuButton } from './components/MainMenuButton';
import { TransferActivityButton } from './components/TransferActivityButton';
import { UserMenuButton } from './components/UserMenuButton';
import { NotificationBellButton } from './components/NotificationBellButton';
import { HiddenTabsButton } from './components/HiddenTabsButton';
import type { ExtensionDef } from './extensions/registry';
import type { BookmarksBarResult } from './app-bookmarks';
import type { ExtensionSurfacesResult } from './app-extension-surfaces';
import type { OmniboxHistoryResult } from './app-omnibox-history';
import { useNetworkState, withGroupRouteBadges, withNetworkBadges } from './app-network-state';

export interface AppChromeProps {
  locale: Locale;
  prefs: Preferences | null;
  tabs: TabsState;
  currentUrl: string;
  renamingGroupId: string | null;
  setRenamingGroupId: Dispatch<SetStateAction<string | null>>;
  isMaximized: boolean;
  enabledExtensions: ExtensionDef[];
  /** Persist a new toolbar order after a pinned icon is dragged. */
  onReorderPinned: (ids: ExtensionId[]) => void;
  extSurfaces: ExtensionSurfacesResult;
  omniboxHistory: OmniboxHistoryResult;
  bookmarks: BookmarksBarResult;
  onOpenQuickSetting: (target: OmniboxQuickSettingTarget) => void;
  onOmniboxDropdownHeightChange: (height: number) => void;
}

/**
 * The window chrome: the tab strip / toolbar / omnibox (`BrowserChrome`) plus the toggleable bookmarks
 * bar. Split out of `App.tsx` (ADR-0010 250-line cap). Renders above its own `I18nProvider`, so it
 * resolves the strings it renders itself with `pick(dict, locale)` (child surfaces self-localize).
 */
export function AppChrome({
  locale,
  prefs,
  tabs,
  currentUrl,
  renamingGroupId,
  setRenamingGroupId,
  isMaximized,
  enabledExtensions,
  onReorderPinned,
  extSurfaces,
  omniboxHistory,
  bookmarks,
  onOpenQuickSetting,
  onOmniboxDropdownHeightChange,
}: AppChromeProps) {
  const find = useFindInPage(tabs.activeId);
  const coreT = pick(coreDict, locale);
  const browserT = pick(browserDict, locale);
  const userMenuT = pick(userMenuDict, locale);

  // Hidden tabs are removed from the strip but kept alive/rendering (see hideTab). Filter them out HERE,
  // at the chrome host — the model keeps them in `tabs.tabs` so the agent still sees them, and the caption
  // HiddenTabsButton lists them. A group whose every member is hidden also drops its header.
  // Phase 5 routing, pushed from main. Merged onto the tabs here so the strip stays presentational and
  // the badge cannot be computed (or mis-computed) in the untrusted renderer.
  const network = useNetworkState();
  const visibleTabs = withNetworkBadges(
    tabs.tabs.filter((t) => t.hidden !== true),
    network,
  );
  const hiddenCount = tabs.tabs.length - visibleTabs.length;
  const visibleGroupIds = new Set(
    visibleTabs.map((t) => t.groupId).filter((g): g is string => g !== null),
  );
  const visibleGroups = withGroupRouteBadges(
    tabs.groups.filter((g) => visibleGroupIds.has(g.id)),
    network,
  );

  return (
    <>
      {tabs.isPrivate && (
        <div className="pointer-events-auto absolute right-2 top-1 z-40">
          <PrivateBadge t={browserT} />
        </div>
      )}
      <BrowserChrome
        platform={window.tepegoz.platform}
        t={{ common: coreT.common, window: coreT.window, browser: browserT }}
        tabs={visibleTabs}
        tabGroups={visibleGroups}
        renamingGroupId={renamingGroupId}
        activeTabId={tabs.activeId}
        onSelectTab={(id) => {
          extSurfaces.closeSurface(); // close any extension surface when switching tabs
          window.tepegoz.activateTab(id);
        }}
        onCloseTab={(id) => window.tepegoz.closeTab(id)}
        onTabContextMenu={(id) => window.tepegoz.showTabContextMenu(id)}
        onTabGroupContextMenu={(groupId) => window.tepegoz.showTabGroupContextMenu(groupId)}
        onRenameTabGroupHandled={() => setRenamingGroupId(null)}
        onNewTab={() => {
          extSurfaces.closeSurface();
          window.tepegoz.createTab();
        }}
        onMoveTab={(id, toIndex) => {
          // The strip's drop index is over the VISIBLE tabs; translate it to the full store order (which
          // still holds the hidden tabs) so interspersed hidden tabs don't skew placement. Identity when
          // nothing is hidden, so today's drag behavior is unchanged.
          const fullWithoutId = tabs.tabs.filter((t) => t.id !== id);
          const anchor = fullWithoutId.filter((t) => t.hidden !== true)[toIndex];
          const storeIndex = anchor
            ? fullWithoutId.findIndex((t) => t.id === anchor.id)
            : fullWithoutId.length;
          window.tepegoz.moveTab(id, storeIndex);
        }}
        onMoveTabGroup={(groupId, toIndex) => {
          // Same visible→store index translation, but over the group's NON-member tabs (moveGroup's basis).
          const nonMembers = tabs.tabs.filter((t) => t.groupId !== groupId);
          const anchor = nonMembers.filter((t) => t.hidden !== true)[toIndex];
          const storeIndex = anchor
            ? nonMembers.findIndex((t) => t.id === anchor.id)
            : nonMembers.length;
          window.tepegoz.moveTabGroup(groupId, storeIndex);
        }}
        onAssignTabToGroup={(tabId, groupId) => window.tepegoz.assignTabToGroup(tabId, groupId)}
        onToggleGroupCollapsed={(groupId, collapsed) =>
          window.tepegoz.updateTabGroup(groupId, { collapsed })
        }
        onRenameTabGroup={(groupId, name) => window.tepegoz.updateTabGroup(groupId, { name })}
        onTearBegin={(payload) => window.tepegoz.beginTabDrag(payload)}
        onTearMove={({ screenX, screenY }) =>
          window.tepegoz.moveTabDrag({ screenX, screenY, torn: true })
        }
        onTearEnd={({ screenX, screenY }) =>
          window.tepegoz.endTabDrag({ screenX, screenY, torn: true })
        }
        onTearCancel={() => window.tepegoz.cancelTabDrag()}
        onReportTabStripGeometry={(geometry) => window.tepegoz.reportTabStrip(geometry)}
        isMaximized={isMaximized}
        onMinimize={() => window.tepegoz.minimizeWindow()}
        onToggleMaximize={() => window.tepegoz.toggleMaximizeWindow()}
        onClose={() => window.tepegoz.closeWindow()}
        currentUrl={currentUrl}
        canGoBack={tabs.canGoBack}
        canGoForward={tabs.canGoForward}
        onBack={() => window.tepegoz.tabGoBack()}
        onForward={() => window.tepegoz.tabGoForward()}
        onBackContextMenu={() => window.tepegoz.showNavHistoryMenu('back')}
        onForwardContextMenu={() => window.tepegoz.showNavHistoryMenu('forward')}
        onReload={() => window.tepegoz.tabReload()}
        onHome={() => window.tepegoz.tabHome()}
        captionLeading={
          <>
            <HiddenTabsButton count={hiddenCount} label={browserT.hiddenTabs} />
            <NotificationBellButton />
          </>
        }
        menu={<MainMenuButton label={browserT.menu} />}
        onNavigate={(input) => window.tepegoz.navigateTab(input)}
        onSuggest={omniboxHistory.onOmniboxSuggest}
        onActivateTab={omniboxHistory.onActivateTabFromOmnibox}
        onOpenQuickSetting={onOpenQuickSetting}
        onAgentTask={omniboxHistory.onAgentTaskFromOmnibox}
        onRunSkill={omniboxHistory.onRunSkillFromOmnibox}
        onOpenDownload={omniboxHistory.onOpenDownloadFromOmnibox}
        onOmniboxDropdownHeightChange={onOmniboxDropdownHeightChange}
        isBookmarked={bookmarks.activeBookmarked}
        canBookmark={bookmarks.canBookmark}
        onToggleBookmark={() => void bookmarks.onToggleBookmark()}
        toolbarActions={
          <>
            <TransferActivityButton />
            <ExtensionTray
              locale={locale}
              extensions={enabledExtensions}
              extensionStates={prefs?.extensions ?? []}
              pinnedIds={prefs?.pinnedExtensions ?? []}
              onReorderPinned={onReorderPinned}
              activeExtensionId={
                extSurfaces.activeSurface?.id ??
                extSurfaces.sidebarExtId ??
                extSurfaces.popupOpenId ??
                null
              }
              onExtensionAction={extSurfaces.runExtensionAction}
            />
            <UserMenuButton label={userMenuT.menuLabel} name={userMenuT.name} />
          </>
        }
      />
      {/* Chrome-style bookmarks bar (toggled from the Bookmarks menu). Rendered above the content row,
          so contentRef's ResizeObserver reports the new top and main reflows the web view down.
          Default-on: shown once prefs load unless explicitly turned off. */}
      {prefs !== null && prefs.showBookmarksBar !== false && (
        <BookmarksBar
          nodes={bookmarks.barNodes}
          barRootId={BOOKMARK_ROOT_BAR}
          onOpen={(url) => window.tepegoz.navigateTab(url)}
          onOpenFolder={(folderId, anchor) => {
            // Seed a tight height (main self-resizes to the real content once it loads) so a small
            // folder doesn't open as a tall window.
            const rows = Math.max(1, bookmarks.findBarNode(folderId)?.children.length ?? 1);
            window.tepegoz.openPopup('bookmark-folder', anchor, {
              id: folderId,
              height: rows * 32 + 12,
            });
          }}
          onMove={bookmarks.onBookmarkMove}
          onContextMenu={(id, type) => window.tepegoz.showBookmarkContextMenu(id, type)}
          labels={{ bar: browserT.bookmarksBar, empty: browserT.noBookmarksBar }}
        />
      )}
      {/* Find-in-page (Ctrl+F). Rendered in the chrome's flow rather than floated over the page: the
          active tab is a native WebContentsView that composites ABOVE the renderer's DOM, so an
          overlay would sit behind it. Being in the flow also means contentRef's ResizeObserver
          reports the new top and main reflows the web view down, exactly like the bookmarks bar. */}
      {find.open && (
        <div className="flex justify-end pr-3">
          <FindBar
            key={find.focusKey}
            query={find.query}
            activeMatch={find.activeMatch}
            totalMatches={find.totalMatches}
            matchCase={find.matchCase}
            onQueryChange={find.setQuery}
            onNext={find.next}
            onPrevious={find.previous}
            onToggleMatchCase={find.toggleMatchCase}
            onClose={find.close}
          />
        </div>
      )}
    </>
  );
}

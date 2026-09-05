// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { ContentBounds, TabGroupInfo, TabInfo, TabsState } from '@tepegoz/desktop-ipc';
import { BrowserChrome, type BrowserChromeProps } from '@tepegoz/browser-chrome';
import { BookmarksBar, type BookmarksBarProps } from '@tepegoz/bookmarks-bar';
import { FindBar } from '@tepegoz/find-bar';
import type { ExtensionDef } from './extensions/registry';
import type { BookmarksBarResult } from './app-bookmarks';
import type { ExtensionSurfacesResult } from './app-extension-surfaces';
import type { OmniboxHistoryResult } from './app-omnibox-history';
import { AppChrome, type AppChromeProps } from './App-chrome';

/**
 * The window chrome host — split out of `App.tsx` (ADR-0010). It is almost entirely glue: every
 * `BrowserChrome`/`BookmarksBar` callback prop is a one-line arrow closing over `window.tepegoz` (or an
 * `extSurfaces`/`bookmarks` method), and its own JSX derives a handful of values (visible tabs/groups
 * with hidden tabs filtered out, the network-routing badges, the toolbar's `activeExtensionId` 3-way
 * fallback). `BrowserChrome`/`BookmarksBar`/`FindBar` are each fully covered in their own packages, so
 * they're mocked here to a prop-capturing `null` — nothing nested inside a mocked component's props
 * (its `toolbarActions`/`captionLeading`/`menu` JSX, or `ExtensionTray` et al within them) ever mounts,
 * so only THIS file's own inline closures need to actually be called for its coverage.
 */

vi.mock('@tepegoz/browser-chrome', () => ({ BrowserChrome: vi.fn(() => null) }));
vi.mock('@tepegoz/bookmarks-bar', () => ({ BookmarksBar: vi.fn(() => null) }));
vi.mock('@tepegoz/find-bar', () => ({ FindBar: vi.fn(() => null) }));

const bridge = {
  platform: 'win32',
  activateTab: vi.fn(),
  closeTab: vi.fn(),
  showTabContextMenu: vi.fn(),
  showTabGroupContextMenu: vi.fn(),
  createTab: vi.fn(),
  moveTab: vi.fn(),
  moveTabGroup: vi.fn(),
  assignTabToGroup: vi.fn(),
  updateTabGroup: vi.fn(),
  beginTabDrag: vi.fn(),
  moveTabDrag: vi.fn(),
  endTabDrag: vi.fn(),
  cancelTabDrag: vi.fn(),
  reportTabStrip: vi.fn(),
  minimizeWindow: vi.fn(),
  toggleMaximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
  openPopup: vi.fn(),
  tabGoBack: vi.fn(),
  tabGoForward: vi.fn(),
  showNavHistoryMenu: vi.fn(),
  tabReload: vi.fn(),
  tabHome: vi.fn(),
  navigateTab: vi.fn(),
  setPageZoom: vi.fn(),
  showBookmarkContextMenu: vi.fn(),
  onFindOpen: vi.fn<(cb: () => void) => () => void>(() => () => undefined),
  onFindResult: vi.fn<(cb: (r: unknown) => void) => () => void>(() => () => undefined),
  onOmniboxFocus: vi.fn<(cb: () => void) => () => void>(() => () => undefined),
  getNetworkState: vi.fn(() => Promise.resolve(undefined) as unknown as Promise<never>),
  onNetworkState: vi.fn<(cb: (s: unknown) => void) => () => void>(() => () => undefined),
};

function tabInfo(over: Partial<TabInfo> = {}): TabInfo {
  return {
    id: 't1',
    title: 'Tab',
    url: 'https://example.com',
    isLoading: false,
    faviconUrl: null,
    pinned: false,
    groupId: null,
    ...over,
  };
}

function groupInfo(over: Partial<TabGroupInfo> = {}): TabGroupInfo {
  return { id: 'g1', name: 'Group', color: 'grey', collapsed: false, settings: {}, ...over };
}

function tabsState(over: Partial<TabsState> = {}): TabsState {
  return {
    tabs: [tabInfo()],
    groups: [],
    activeId: 't1',
    canGoBack: false,
    canGoForward: false,
    isPrivate: false,
    activeZoomFactor: 1,
    activeSecurityLevel: 'unknown',
    ...over,
  } as unknown as TabsState;
}

function extSurfacesFixture(over: Partial<ExtensionSurfacesResult> = {}): ExtensionSurfacesResult {
  return {
    activeSurface: null,
    sidebarExtId: null,
    popupOpenId: null,
    sidebarWidth: 360,
    resizingSidebar: false,
    resizeSnapshot: null,
    closeSurface: vi.fn(),
    closeSidebar: vi.fn(),
    runExtensionAction: vi.fn(),
    onSidebarResizeStart: vi.fn(),
    renderActiveSurface: () => null,
    renderSidebar: () => null,
    ...over,
  };
}

function bookmarksFixture(over: Partial<BookmarksBarResult> = {}): BookmarksBarResult {
  return {
    activeBookmarked: false,
    barNodes: [],
    canBookmark: true,
    bookmarksRef: { current: [] },
    openAllUrls: null,
    setOpenAllUrls: vi.fn(),
    onToggleBookmark: vi.fn(() => Promise.resolve()),
    onBookmarkMove: vi.fn(),
    findBarNode: vi.fn(() => null),
    ...over,
  };
}

function omniboxHistoryFixture(): OmniboxHistoryResult {
  return {
    onOmniboxSuggest: vi.fn(() => Promise.resolve([])),
    onActivateTabFromOmnibox: vi.fn(),
    onAgentTaskFromOmnibox: vi.fn(),
    onRunSkillFromOmnibox: vi.fn(),
    onOpenDownloadFromOmnibox: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.onFindOpen.mockImplementation(() => () => undefined);
  bridge.onFindResult.mockImplementation(() => () => undefined);
  bridge.onOmniboxFocus.mockImplementation(() => () => undefined);
  bridge.getNetworkState.mockImplementation(() => Promise.resolve(undefined) as unknown as Promise<never>);
  bridge.onNetworkState.mockImplementation(() => () => undefined);
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

function renderChrome(over: Partial<AppChromeProps> = {}) {
  const props: AppChromeProps = {
    locale: 'en',
    prefs: { ...DEFAULT_PREFERENCES },
    tabs: tabsState(),
    currentUrl: 'https://example.com',
    renamingGroupId: null,
    setRenamingGroupId: vi.fn(),
    isMaximized: false,
    enabledExtensions: [] as ExtensionDef[],
    onReorderPinned: vi.fn(),
    extSurfaces: extSurfacesFixture(),
    omniboxHistory: omniboxHistoryFixture(),
    bookmarks: bookmarksFixture(),
    onOpenQuickSetting: vi.fn(),
    onOmniboxDropdownHeightChange: vi.fn(),
    ...over,
  };
  const utils = render(<AppChrome {...props} />);
  return { ...utils, props };
}

type NonOptional<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

function lastChromeProps(): NonOptional<BrowserChromeProps> {
  const calls = vi.mocked(BrowserChrome).mock.calls;
  return calls[calls.length - 1]![0] as NonOptional<BrowserChromeProps>;
}

function lastBookmarksBarProps(): BookmarksBarProps | undefined {
  const calls = vi.mocked(BookmarksBar).mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe('AppChrome', () => {
  it('renders the chrome and hides tabs marked hidden from the strip and its groups', () => {
    renderChrome({
      tabs: tabsState({
        tabs: [
          tabInfo({ id: 'a', groupId: 'g1' }),
          tabInfo({ id: 'b', groupId: 'g1', hidden: true }),
          tabInfo({ id: 'c', groupId: null }),
        ],
        groups: [groupInfo({ id: 'g1' }), groupInfo({ id: 'g2' })],
      }),
    });
    const p = lastChromeProps();
    expect(p.tabs.map((t) => t.id)).toEqual(['a', 'c']);
    expect(p.tabGroups.map((g) => g.id)).toEqual(['g1']); // g2 has no visible member left
  });

  it('shows the private badge only for a private window', () => {
    const { container, rerender, props } = renderChrome({ tabs: tabsState({ isPrivate: false }) });
    expect(container.querySelector('.pointer-events-auto')).toBeNull();
    rerender(<AppChrome {...props} tabs={tabsState({ isPrivate: true })} />);
    expect(container.querySelector('.pointer-events-auto')).toBeTruthy();
  });

  it('selecting a tab closes any extension surface and activates it', () => {
    const { props } = renderChrome();
    act(() => lastChromeProps().onSelectTab('t2'));
    expect(props.extSurfaces.closeSurface).toHaveBeenCalledTimes(1);
    expect(bridge.activateTab).toHaveBeenCalledWith('t2');
  });

  it('forwards the plain per-tab/group chrome actions to the bridge', () => {
    renderChrome();
    const p = lastChromeProps();
    act(() => p.onCloseTab('t1'));
    expect(bridge.closeTab).toHaveBeenCalledWith('t1');
    act(() => p.onTabContextMenu('t1'));
    expect(bridge.showTabContextMenu).toHaveBeenCalledWith('t1');
    act(() => p.onTabGroupContextMenu('g1'));
    expect(bridge.showTabGroupContextMenu).toHaveBeenCalledWith('g1');
    act(() => p.onAssignTabToGroup('t1', 'g1'));
    expect(bridge.assignTabToGroup).toHaveBeenCalledWith('t1', 'g1');
    act(() => p.onToggleGroupCollapsed('g1', true));
    expect(bridge.updateTabGroup).toHaveBeenCalledWith('g1', { collapsed: true });
    act(() => p.onRenameTabGroup('g1', 'New name'));
    expect(bridge.updateTabGroup).toHaveBeenCalledWith('g1', { name: 'New name' });
    act(() => p.onTearBegin({ screenX: 1, screenY: 2 } as never));
    expect(bridge.beginTabDrag).toHaveBeenCalled();
    act(() => p.onTearMove({ screenX: 3, screenY: 4 }));
    expect(bridge.moveTabDrag).toHaveBeenCalledWith({ screenX: 3, screenY: 4, torn: true });
    act(() => p.onTearEnd({ screenX: 5, screenY: 6 }));
    expect(bridge.endTabDrag).toHaveBeenCalledWith({ screenX: 5, screenY: 6, torn: true });
    act(() => p.onTearCancel());
    expect(bridge.cancelTabDrag).toHaveBeenCalled();
    act(() => p.onReportTabStripGeometry({ top: 0 } as never));
    expect(bridge.reportTabStrip).toHaveBeenCalledWith({ top: 0 });
  });

  it('finishing a tab-group rename clears the renaming state', () => {
    const setRenamingGroupId = vi.fn();
    renderChrome({ setRenamingGroupId });
    act(() => lastChromeProps().onRenameTabGroupHandled());
    expect(setRenamingGroupId).toHaveBeenCalledWith(null);
  });

  it('opening a new tab closes any extension surface first', () => {
    const { props } = renderChrome();
    act(() => lastChromeProps().onNewTab());
    expect(props.extSurfaces.closeSurface).toHaveBeenCalledTimes(1);
    expect(bridge.createTab).toHaveBeenCalledTimes(1);
  });

  it('translates a visible-strip drop index to the full store order for a move, and appends when the anchor is gone', () => {
    renderChrome({
      tabs: tabsState({
        tabs: [tabInfo({ id: 'a' }), tabInfo({ id: 'b', hidden: true }), tabInfo({ id: 'c' })],
      }),
    });
    const p = lastChromeProps();
    // dropping "a" onto visible index 1 (after "c", since "a" is excluded from its own visible list) →
    // no anchor left (a was the only later visible tab) → append at the end of the full store order.
    act(() => p.onMoveTab('a', 1));
    expect(bridge.moveTab).toHaveBeenCalledWith('a', 2); // fullWithoutId = [b(hidden), c] → length 2

    act(() => p.onMoveTab('c', 0));
    expect(bridge.moveTab).toHaveBeenCalledWith('c', 0); // anchor "a" is visible index 0 → store index 0
  });

  it('translates a group move the same way, appending when no non-member anchor remains', () => {
    renderChrome({
      tabs: tabsState({
        tabs: [tabInfo({ id: 'a', groupId: 'g1' }), tabInfo({ id: 'b', groupId: null })],
        groups: [groupInfo({ id: 'g1' })],
      }),
    });
    const p = lastChromeProps();
    act(() => p.onMoveTabGroup('g1', 0));
    expect(bridge.moveTabGroup).toHaveBeenCalledWith('g1', 0); // "b" is the one non-member, at index 0

    act(() => p.onMoveTabGroup('g1', 1));
    expect(bridge.moveTabGroup).toHaveBeenLastCalledWith('g1', 1); // past the only non-member → append
  });

  it('window caption controls reach the bridge', () => {
    renderChrome();
    const p = lastChromeProps();
    act(() => p.onMinimize());
    expect(bridge.minimizeWindow).toHaveBeenCalledTimes(1);
    act(() => p.onToggleMaximize());
    expect(bridge.toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    act(() => p.onClose());
    expect(bridge.closeWindow).toHaveBeenCalledTimes(1);
  });

  it('opening the site-info bubble closes any extension surface and opens the popup', () => {
    const { props } = renderChrome();
    const anchor: ContentBounds = { x: 1, y: 2, width: 3, height: 4 };
    act(() => lastChromeProps().onOpenSiteInfo(anchor));
    expect(props.extSurfaces.closeSurface).toHaveBeenCalledTimes(1);
    expect(bridge.openPopup).toHaveBeenCalledWith('site-info', anchor, { align: 'start' });
  });

  it('navigation controls reach the bridge', () => {
    renderChrome();
    const p = lastChromeProps();
    act(() => p.onBack());
    expect(bridge.tabGoBack).toHaveBeenCalledTimes(1);
    act(() => p.onForward());
    expect(bridge.tabGoForward).toHaveBeenCalledTimes(1);
    act(() => p.onBackContextMenu());
    expect(bridge.showNavHistoryMenu).toHaveBeenCalledWith('back');
    act(() => p.onForwardContextMenu());
    expect(bridge.showNavHistoryMenu).toHaveBeenCalledWith('forward');
    act(() => p.onReload());
    expect(bridge.tabReload).toHaveBeenCalledTimes(1);
    act(() => p.onHome());
    expect(bridge.tabHome).toHaveBeenCalledTimes(1);
    act(() => p.onNavigate('example.com'));
    expect(bridge.navigateTab).toHaveBeenCalledWith('example.com');
    act(() => p.onZoom('in'));
    expect(bridge.setPageZoom).toHaveBeenCalledWith('in');
  });

  it('rounds the active zoom factor to a whole percent', () => {
    renderChrome({ tabs: tabsState({ activeZoomFactor: 1.10001 }) });
    expect(lastChromeProps().zoomPercent).toBe(110);
  });

  it('toggling the bookmark star calls through to the bookmarks controller', () => {
    const bookmarks = bookmarksFixture();
    renderChrome({ bookmarks });
    act(() => lastChromeProps().onToggleBookmark());
    expect(bookmarks.onToggleBookmark).toHaveBeenCalledTimes(1);
  });

  it('the active-extension-id fallback prefers an open surface over the sidebar dock and the popup', () => {
    renderChrome({
      extSurfaces: extSurfacesFixture({
        activeSurface: { id: 'surface-ext', kind: 'modal' },
        sidebarExtId: 'dock-ext',
        popupOpenId: 'popup-ext',
      }),
    });
    const tray = (lastChromeProps().toolbarActions as { props: { children: unknown[] } }).props.children[1] as {
      props: { activeExtensionId: string | null };
    };
    expect(tray.props.activeExtensionId).toBe('surface-ext');
  });

  it('the active-extension-id fallback is null when nothing is active', () => {
    renderChrome({ extSurfaces: extSurfacesFixture({ activeSurface: null, sidebarExtId: null, popupOpenId: null }) });
    // toolbarActions is a constructed element tree; walk to the ExtensionTray to read its resolved prop.
    const tray = (lastChromeProps().toolbarActions as { props: { children: unknown[] } }).props.children[1] as {
      props: { activeExtensionId: string | null };
    };
    expect(tray.props.activeExtensionId).toBeNull();
  });

  it('falls back through sidebar then popup when there is no active surface', () => {
    renderChrome({ extSurfaces: extSurfacesFixture({ sidebarExtId: 'dock-ext' }) });
    const trayA = (lastChromeProps().toolbarActions as { props: { children: unknown[] } }).props.children[1] as {
      props: { activeExtensionId: string | null };
    };
    expect(trayA.props.activeExtensionId).toBe('dock-ext');

    renderChrome({ extSurfaces: extSurfacesFixture({ popupOpenId: 'popup-ext' }) });
    const trayB = (lastChromeProps().toolbarActions as { props: { children: unknown[] } }).props.children[1] as {
      props: { activeExtensionId: string | null };
    };
    expect(trayB.props.activeExtensionId).toBe('popup-ext');
  });

  it('defaults enabled-extension state/pinned lists to empty when prefs have not loaded', () => {
    renderChrome({ prefs: null });
    const tray = (lastChromeProps().toolbarActions as { props: { children: unknown[] } }).props.children[1] as {
      props: { extensionStates: unknown[]; pinnedIds: unknown[] };
    };
    expect(tray.props.extensionStates).toEqual([]);
    expect(tray.props.pinnedIds).toEqual([]);
  });

  it('hides the bookmarks bar while prefs have not loaded', () => {
    renderChrome({ prefs: null });
    expect(lastBookmarksBarProps()).toBeUndefined();
  });

  it('shows the bookmarks bar by default once prefs load', () => {
    const bookmarks = bookmarksFixture({ barNodes: [{ id: 'n1' } as never] });
    renderChrome({ prefs: { ...DEFAULT_PREFERENCES, showBookmarksBar: true }, bookmarks });
    expect(lastBookmarksBarProps()?.nodes).toBe(bookmarks.barNodes);
  });

  it('hides the bookmarks bar when explicitly turned off', () => {
    renderChrome({ prefs: { ...DEFAULT_PREFERENCES, showBookmarksBar: false } });
    expect(lastBookmarksBarProps()).toBeUndefined();
  });

  it('the bookmarks bar forwards open/move/context-menu to the bridge and the bookmarks controller', () => {
    const bookmarks = bookmarksFixture();
    renderChrome({ bookmarks });
    const p = lastBookmarksBarProps()!;
    p.onOpen('https://a.example');
    expect(bridge.navigateTab).toHaveBeenCalledWith('https://a.example');
    p.onMove('n1', 'root', 0);
    expect(bookmarks.onBookmarkMove).toHaveBeenCalledWith('n1', 'root', 0);
    p.onContextMenu('n1', 'bookmark');
    expect(bridge.showBookmarkContextMenu).toHaveBeenCalledWith('n1', 'bookmark');
  });

  it('opening a bookmark folder sizes the popup from its child count, and falls back to one row when the node is unknown', () => {
    const bookmarks = bookmarksFixture({
      findBarNode: vi.fn(() => ({ children: [{}, {}, {}] }) as never),
    });
    renderChrome({ bookmarks });
    const anchor: ContentBounds = { x: 0, y: 0, width: 0, height: 0 };
    lastBookmarksBarProps()!.onOpenFolder('f1', anchor);
    expect(bridge.openPopup).toHaveBeenCalledWith('bookmark-folder', anchor, { id: 'f1', height: 3 * 32 + 12 });

    const emptyBookmarks = bookmarksFixture({ findBarNode: vi.fn(() => null) });
    renderChrome({ bookmarks: emptyBookmarks });
    lastBookmarksBarProps()!.onOpenFolder('f2', anchor);
    expect(bridge.openPopup).toHaveBeenLastCalledWith('bookmark-folder', anchor, { id: 'f2', height: 1 * 32 + 12 });
  });

  it('opens the find bar once main reports Ctrl+F, and renders nothing while it is closed', () => {
    let openFind: (() => void) | undefined;
    bridge.onFindOpen.mockImplementation((cb) => {
      openFind = cb;
      return () => undefined;
    });
    const { container } = renderChrome();
    expect(vi.mocked(FindBar)).not.toHaveBeenCalled();
    act(() => openFind?.());
    expect(vi.mocked(FindBar)).toHaveBeenCalled();
    expect(container.querySelector('.justify-end')).toBeTruthy();
  });
});

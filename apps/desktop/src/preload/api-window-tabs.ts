import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type ContentBounds,
  type FindInPageQuery,
  type FindInPageResult,
  type PageMenuAction,
  type PageMenuContext,
  type PageMenuContributionActionInput,
  type TabDragBegin,
  type TabDragPoint,
  type TabGroupColor,
  type TabGroupSettingKey,
  type TabGroupSettingValue,
  type TabsState,
  type TabStripGeometry,
  type TepegozApi,
} from '@tepegoz/desktop-ipc';
import type { NavHistoryDirection } from '@tepegoz/navigation';
import { invoke } from './ipc-invoke';

/** Window chrome + tabs/tab-groups + popup/submenu/page-menu bridge methods. Split out of
 *  `index.ts` (ADR-0010 250-line cap). */
export const windowTabsApi: Pick<
  TepegozApi,
  | 'minimizeWindow'
  | 'toggleMaximizeWindow'
  | 'closeWindow'
  | 'isWindowMaximized'
  | 'onWindowMaximizedChange'
  | 'createTab'
  | 'createTabInBackground'
  | 'closeTab'
  | 'activateTab'
  | 'showTabContextMenu'
  | 'navigateTab'
  | 'tabGoBack'
  | 'tabGoForward'
  | 'tabReload'
  | 'tabHome'
  | 'reopenClosedTab'
  | 'moveTab'
  | 'setTabPinned'
  | 'setTabHidden'
  | 'showHiddenTabsMenu'
  | 'showNavHistoryMenu'
  | 'createTabGroup'
  | 'moveTabGroup'
  | 'updateTabGroup'
  | 'assignTabToGroup'
  | 'removeTabFromGroup'
  | 'ungroupTabGroup'
  | 'showTabGroupContextMenu'
  | 'onTabGroupStartRename'
  | 'setContentBounds'
  | 'setContentVisible'
  | 'captureActiveTab'
  | 'getTabsState'
  | 'onTabsState'
  | 'beginTabDrag'
  | 'moveTabDrag'
  | 'endTabDrag'
  | 'cancelTabDrag'
  | 'reportTabStrip'
  | 'findInPage'
  | 'stopFindInPage'
  | 'onFindResult'
  | 'onFindOpen'
  | 'newWindow'
  | 'ensureActiveGroup'
  | 'onActiveGroupChange'
  | 'openPopup'
  | 'resizePopup'
  | 'closePopup'
  | 'onPopupClosed'
  | 'quitApp'
  | 'openSubmenu'
  | 'closeSubmenu'
  | 'getPageMenuContext'
  | 'pageMenuAction'
  | 'pageMenuContributionAction'
> = {
  minimizeWindow: () => {
    ipcRenderer.send(IpcChannels.windowMinimize);
  },
  toggleMaximizeWindow: () => {
    ipcRenderer.send(IpcChannels.windowMaximizeToggle);
  },
  closeWindow: () => {
    ipcRenderer.send(IpcChannels.windowClose);
  },
  isWindowMaximized: () => invoke<boolean>(IpcChannels.windowIsMaximized),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: unknown, maximized: boolean): void => {
      callback(maximized);
    };
    ipcRenderer.on(IpcChannels.windowMaximizedChanged, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.windowMaximizedChanged, listener);
    };
  },
  createTab: (url?: string) => {
    ipcRenderer.send(IpcChannels.tabsCreate, url);
  },
  createTabInBackground: (url: string) => {
    ipcRenderer.send(IpcChannels.tabsCreateBackground, url);
  },
  closeTab: (id: string) => {
    ipcRenderer.send(IpcChannels.tabsClose, id);
  },
  activateTab: (id: string) => {
    ipcRenderer.send(IpcChannels.tabsActivate, id);
  },
  showTabContextMenu: (id: string) => {
    ipcRenderer.send(IpcChannels.tabsContextMenu, id);
  },
  navigateTab: (input: string) => {
    ipcRenderer.send(IpcChannels.tabsNavigate, input);
  },
  tabGoBack: () => {
    ipcRenderer.send(IpcChannels.tabsGoBack);
  },
  tabGoForward: () => {
    ipcRenderer.send(IpcChannels.tabsGoForward);
  },
  tabReload: () => {
    ipcRenderer.send(IpcChannels.tabsReload);
  },
  tabHome: () => {
    ipcRenderer.send(IpcChannels.tabsHome);
  },
  reopenClosedTab: () => {
    ipcRenderer.send(IpcChannels.tabsReopenClosed);
  },
  moveTab: (id: string, toIndex: number, intoGroupId?: string | null) => {
    ipcRenderer.send(IpcChannels.tabsMove, { id, toIndex, intoGroupId });
  },
  setTabPinned: (id: string, pinned: boolean) => {
    ipcRenderer.send(IpcChannels.tabsPin, { id, pinned });
  },
  setTabHidden: (id: string, hidden: boolean) => {
    ipcRenderer.send(IpcChannels.tabsSetHidden, { id, hidden });
  },
  showHiddenTabsMenu: () => {
    ipcRenderer.send(IpcChannels.tabsHiddenMenu);
  },
  showNavHistoryMenu: (direction: NavHistoryDirection) => {
    ipcRenderer.send(IpcChannels.tabsHistoryMenu, direction);
  },
  createTabGroup: (memberIds?: string[]) => {
    ipcRenderer.send(IpcChannels.tabsGroupCreate, { memberIds });
  },
  moveTabGroup: (groupId: string, toIndex: number) => {
    ipcRenderer.send(IpcChannels.tabsGroupMove, { groupId, toIndex });
  },
  updateTabGroup: (
    groupId: string,
    patch: {
      name?: string;
      color?: TabGroupColor;
      collapsed?: boolean;
      settings?: Record<TabGroupSettingKey, TabGroupSettingValue>;
    },
  ) => {
    ipcRenderer.send(IpcChannels.tabsGroupUpdate, { groupId, ...patch });
  },
  assignTabToGroup: (tabId: string, groupId: string) => {
    ipcRenderer.send(IpcChannels.tabsGroupAssign, { tabId, groupId });
  },
  removeTabFromGroup: (tabId: string) => {
    ipcRenderer.send(IpcChannels.tabsGroupRemove, tabId);
  },
  ungroupTabGroup: (groupId: string) => {
    ipcRenderer.send(IpcChannels.tabsUngroup, groupId);
  },
  showTabGroupContextMenu: (groupId: string) => {
    ipcRenderer.send(IpcChannels.tabsGroupContextMenu, groupId);
  },
  onTabGroupStartRename: (callback: (groupId: string) => void) => {
    const listener = (_event: unknown, groupId: string): void => {
      callback(groupId);
    };
    ipcRenderer.on(IpcChannels.tabsGroupStartRename, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.tabsGroupStartRename, listener);
    };
  },
  setContentBounds: (bounds: ContentBounds) => {
    ipcRenderer.send(IpcChannels.tabsSetBounds, bounds);
  },
  setContentVisible: (visible: boolean) => {
    ipcRenderer.send(IpcChannels.tabsSetContentVisible, visible);
  },
  captureActiveTab: () => invoke<string | null>(IpcChannels.tabsCapture),
  getTabsState: () => invoke<TabsState>(IpcChannels.tabsGetState),
  onTabsState: (callback: (state: TabsState) => void) => {
    const listener = (_event: unknown, state: TabsState): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.tabsState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.tabsState, listener);
    };
  },
  findInPage: (query: FindInPageQuery) => {
    ipcRenderer.send(IpcChannels.findStart, query);
  },
  stopFindInPage: () => {
    ipcRenderer.send(IpcChannels.findStop);
  },
  onFindResult: (callback: (result: FindInPageResult) => void) => {
    const listener = (_event: unknown, result: FindInPageResult): void => {
      callback(result);
    };
    ipcRenderer.on(IpcChannels.findResult, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.findResult, listener);
    };
  },
  onFindOpen: (callback: () => void) => {
    const listener = (): void => {
      callback();
    };
    ipcRenderer.on(IpcChannels.findOpen, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.findOpen, listener);
    };
  },
  beginTabDrag: (payload: TabDragBegin) => {
    ipcRenderer.send(IpcChannels.tabsDragBegin, payload);
  },
  moveTabDrag: (point: TabDragPoint) => {
    ipcRenderer.send(IpcChannels.tabsDragMove, point);
  },
  endTabDrag: (point: TabDragPoint) => {
    ipcRenderer.send(IpcChannels.tabsDragEnd, point);
  },
  cancelTabDrag: () => {
    ipcRenderer.send(IpcChannels.tabsDragCancel);
  },
  reportTabStrip: (geometry: TabStripGeometry) => {
    ipcRenderer.send(IpcChannels.tabsReportStrip, geometry);
  },
  newWindow: () => {
    ipcRenderer.send(IpcChannels.windowNew);
  },
  ensureActiveGroup: () =>
    invoke<{ groupId: string }>(IpcChannels.agentEnsureGroup).then((r) => r.groupId),
  onActiveGroupChange: (callback: (groupId: string | null) => void) => {
    // Derive active group from tab state changes — no separate push needed.
    let lastGroupId: string | null | undefined = undefined;
    const listener = (_event: unknown, state: TabsState): void => {
      const active = state.tabs.find((t) => t.id === state.activeId);
      const gid = active?.groupId ?? null;
      if (gid !== lastGroupId) {
        lastGroupId = gid;
        callback(gid);
      }
    };
    ipcRenderer.on(IpcChannels.tabsState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.tabsState, listener);
    };
  },
  openPopup: (surface: string, anchor: ContentBounds, opts?: { id?: string; height?: number }) => {
    ipcRenderer.send(IpcChannels.popupOpen, {
      surface,
      id: opts?.id,
      anchor,
      height: opts?.height,
    });
  },
  resizePopup: (height: number) => {
    ipcRenderer.send(IpcChannels.popupResize, { height });
  },
  closePopup: () => {
    ipcRenderer.send(IpcChannels.popupClose);
  },
  onPopupClosed: (callback: (surface: string) => void) => {
    const listener = (_event: unknown, surface: string): void => {
      callback(surface);
    };
    ipcRenderer.on(IpcChannels.popupClosed, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.popupClosed, listener);
    };
  },
  quitApp: () => {
    ipcRenderer.send(IpcChannels.appQuit);
  },
  openSubmenu: (kind: string, anchor: ContentBounds, opts?: { height?: number }) => {
    ipcRenderer.send(IpcChannels.submenuOpen, { kind, anchor, height: opts?.height });
  },
  closeSubmenu: () => {
    ipcRenderer.send(IpcChannels.submenuClose);
  },
  getPageMenuContext: () => invoke<PageMenuContext>(IpcChannels.pageMenuGetContext),
  pageMenuAction: (action: PageMenuAction) => {
    ipcRenderer.send(IpcChannels.pageMenuAction, action);
  },
  pageMenuContributionAction: (input: PageMenuContributionActionInput) => {
    ipcRenderer.send(IpcChannels.pageMenuContributionAction, input);
  },
};

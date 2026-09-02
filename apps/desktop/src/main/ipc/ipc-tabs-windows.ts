import { app, BrowserWindow, ipcMain, type IpcMainEvent } from 'electron';
import { Logger } from '@tepegoz/libs';
import { IpcChannels, type ClosedTab, type TabsState } from '@tepegoz/desktop-ipc';
import {
  BookmarkContextMenuSchema,
  ContentBoundsSchema,
  ContentVisibleSchema,
  CreateBackgroundTabSchema,
  CreateTabInputSchema,
  ExtensionIdSchema,
  NavHistoryDirectionSchema,
  NavigateInputSchema,
  PageMenuActionSchema,
  PageMenuContributionActionSchema,
  PopupOpenSchema,
  PopupResizeSchema,
  ReopenClosedSchema,
  SubmenuOpenSchema,
  TabGroupAssignSchema,
  TabGroupCreateSchema,
  TabGroupIdSchema,
  TabGroupMoveSchema,
  TabGroupUpdateSchema,
  TabHiddenSchema,
  TabIdSchema,
  TabMoveSchema,
  TabPinSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { isTrustedAppUrl } from '../lib/trusted-origin';
import { markChromeReady } from '../chrome-ready';
import TabManager from '../tabs';
import { recentlyClosedTabs } from '../tabs-shared';
import { undoSessionRestore } from '../recovery/session-restore-undo';
import PopupWindowManager from '../popup-window';
import { manifestById } from '../../shared/extensions';
import { showTabContextMenu } from '../menus/tab-context-menu';
import { showHiddenTabsMenu } from '../menus/hidden-tabs-menu';
import { showNavHistoryMenu } from '../menus/nav-history-menu';
import { markQuitting } from '../quit-state';
import { showBookmarkContextMenu } from '../menus/bookmark-context-menu';
import { showExtensionContextMenu } from '../menus/extension-context-menu';
import { chromeWindowFor } from '../lib/chrome-window';
import { showGroupContextMenu } from '../menus/tab-group-context-menu';
import {
  getPageMenuContext,
  runPageMenuAction,
  runPageMenuContributionAction,
} from '../menus/page-context-menu';
import {
  handle,
  handleAsync,
  onAction,
  onSignal,
  onWindowAction,
  onWindowControl,
  onWindowSignal,
} from './ipc-helpers';

/**
 * Window chrome + tabs/tab-groups + native context menus + popup/submenu/page-menu IPC domain
 * (split out of `ipc.ts`, ADR-0010 250-line cap).
 */

/** Native main-menu popup width (px); its height is computed by the renderer and clamped in main. */
const MAIN_MENU_WIDTH = 300;
/** Native user (profile) menu popup width (px). */
const USER_MENU_WIDTH = 320;
/** Native notification-center popup width (px). */
const NOTIFICATIONS_WIDTH = 360;
/** Native bookmark folder-dropdown popup width (px). */
const BOOKMARK_FOLDER_WIDTH = 280;
/** Native bookmark rename / add-folder dialog popup width (px). */
const BOOKMARK_DIALOG_WIDTH = 320;
/** Native Extensions panel popup width (px) — the puzzle button's Chrome-style pin/run list. */
const EXTENSIONS_PANEL_WIDTH = 320;
/** Native Site Info bubble width (px) — Chrome's Page Info panel. */
const SITE_INFO_WIDTH = 360;

/** Register the window/tabs/tab-groups + native context menus + popup/submenu/page-menu handlers. */
export function registerTabsWindowsIpc(): void {
  onWindowControl(IpcChannels.windowMinimize, (win) => {
    win.minimize();
  });
  onWindowControl(IpcChannels.windowMaximizeToggle, (win) => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  onWindowControl(IpcChannels.windowClose, (win) => {
    win.close();
  });

  handle(IpcChannels.windowIsMaximized, (event): boolean => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });

  // Tab actions route to the SENDER's window (multi-window) — `forSenderWindow` walks a menu popup's
  // parent chain to the owning browser window, and falls back to the focused window.
  onWindowAction(IpcChannels.tabsCreate, CreateTabInputSchema, (win, url) => {
    TabManager.forSenderWindow(win)?.createTab(url);
  });
  onWindowAction(IpcChannels.tabsCreateBackground, CreateBackgroundTabSchema, (win, url) => {
    TabManager.forSenderWindow(win)?.createTab(url, { background: true });
  });
  onWindowAction(IpcChannels.tabsClose, TabIdSchema, (win, id) => {
    TabManager.forSenderWindow(win)?.closeTab(id);
  });
  onWindowAction(IpcChannels.tabsActivate, TabIdSchema, (win, id) => {
    TabManager.forSenderWindow(win)?.activate(id);
  });
  // Advanced tab UX (ADR-0020): drag-reorder, groups, pinning.
  onWindowAction(IpcChannels.tabsMove, TabMoveSchema, (win, { id, toIndex, intoGroupId }) => {
    TabManager.forSenderWindow(win)?.moveTab(id, toIndex, intoGroupId);
  });
  onWindowAction(IpcChannels.tabsPin, TabPinSchema, (win, { id, pinned }) => {
    TabManager.forSenderWindow(win)?.setPinned(id, pinned);
  });
  onWindowAction(IpcChannels.tabsSetHidden, TabHiddenSchema, (win, { id, hidden }) => {
    const wt = TabManager.forSenderWindow(win);
    if (hidden) wt?.hideTab(id);
    else wt?.unhideTab(id);
  });
  onWindowAction(IpcChannels.tabsGroupCreate, TabGroupCreateSchema, (win, { memberIds }) => {
    TabManager.forSenderWindow(win)?.createGroup(memberIds);
  });
  onWindowAction(IpcChannels.tabsGroupMove, TabGroupMoveSchema, (win, { groupId, toIndex }) => {
    TabManager.forSenderWindow(win)?.moveGroup(groupId, toIndex);
  });
  onWindowAction(
    IpcChannels.tabsGroupUpdate,
    TabGroupUpdateSchema,
    (win, { groupId, name, color, collapsed, settings }) => {
      const wt = TabManager.forSenderWindow(win);
      if (wt === undefined) return;
      if (name !== undefined) wt.renameGroup(groupId, name);
      if (color !== undefined) wt.recolorGroup(groupId, color);
      if (collapsed !== undefined) wt.setGroupCollapsed(groupId, collapsed);
      if (settings !== undefined) wt.updateGroupSettings(groupId, settings);
    },
  );
  onWindowAction(IpcChannels.tabsGroupAssign, TabGroupAssignSchema, (win, { tabId, groupId }) => {
    TabManager.forSenderWindow(win)?.assignToGroup(tabId, groupId);
  });
  onWindowAction(IpcChannels.tabsGroupRemove, TabIdSchema, (win, tabId) => {
    TabManager.forSenderWindow(win)?.removeFromGroup(tabId);
  });
  onWindowAction(IpcChannels.tabsUngroup, TabIdSchema, (win, groupId) => {
    TabManager.forSenderWindow(win)?.ungroup(groupId);
  });
  // Native tab context menu: needs the sender's window to anchor the popup, so it can't use the
  // window-less onAction helper.
  ipcMain.on(IpcChannels.tabsContextMenu, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = TabIdSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored tabs:context-menu: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showTabContextMenu(win, parsed.data);
  });
  // Native "Hidden tabs" menu (no payload) — needs the sender's window to anchor the popup.
  ipcMain.on(IpcChannels.tabsHiddenMenu, (event: IpcMainEvent) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showHiddenTabsMenu(win);
  });
  // Native back/forward history dropdown — anchored to the sender's window, like every other menu.
  ipcMain.on(IpcChannels.tabsHistoryMenu, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = NavHistoryDirectionSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored tabs:history-menu: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showNavHistoryMenu(win, parsed.data);
  });
  // Native bookmark context menu — also needs the sender's window to anchor the popup.
  ipcMain.on(IpcChannels.bookmarksContextMenu, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = BookmarkContextMenuSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored bookmarks:context-menu: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showBookmarkContextMenu(win, parsed.data.id, parsed.data.type, parsed.data.variant);
  });
  // The Extensions panel popup asking for an extension's click action. The panel is its own window, so
  // it cannot resolve surfaces itself — main closes it and relays the request to the owning chrome
  // window, where the existing `runExtensionAction` routing takes over.
  onWindowAction(IpcChannels.extensionOpenRequest, ExtensionIdSchema, (win, id) => {
    if (manifestById(id) === undefined) {
      Logger.warn('Ignored extension:open-request for an unknown extension', { id });
      return;
    }
    PopupWindowManager.close();
    const chrome = chromeWindowFor(win);
    if (!chrome.isDestroyed()) chrome.webContents.send(IpcChannels.extensionOpen, id);
  });
  // Native extension-icon context menu — also needs the sender's window to anchor + to push the choice.
  ipcMain.on(IpcChannels.extensionContextMenu, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = ExtensionIdSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored extension:context-menu: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showExtensionContextMenu(win, parsed.data);
  });
  // Native group-header context menu — also needs the sender's window to anchor + to push the rename.
  ipcMain.on(IpcChannels.tabsGroupContextMenu, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = TabGroupIdSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored tabs:group-context-menu: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showGroupContextMenu(win, parsed.data);
  });
  // Popup windows — a native child window anchored under a toolbar control (needs the sender window).
  // Reusable primitive: the main menu, extension popups, and future surfaces route through here.
  ipcMain.on(IpcChannels.popupOpen, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = PopupOpenSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored popup:open: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const { surface, id, anchor, height, align } = parsed.data;
    if (surface === 'main-menu') {
      PopupWindowManager.open({
        parent: win,
        key: 'main-menu',
        query: { surface: 'main-menu' },
        anchor,
        width: MAIN_MENU_WIDTH,
        // exactOptionalPropertyTypes: only pass height when the renderer actually measured one.
        ...(height !== undefined ? { height } : {}),
      });
    } else if (surface === 'user-menu') {
      PopupWindowManager.open({
        parent: win,
        key: 'user-menu',
        query: { surface: 'user-menu' },
        anchor,
        width: USER_MENU_WIDTH,
        ...(height !== undefined ? { height } : {}),
      });
    } else if (surface === 'notifications') {
      PopupWindowManager.open({
        parent: win,
        key: 'notifications',
        query: { surface: 'notifications' },
        anchor,
        width: NOTIFICATIONS_WIDTH,
        ...(height !== undefined ? { height } : {}),
      });
    } else if (surface === 'extensions-panel') {
      // The puzzle button's panel: every enabled extension, with pin toggles (Chrome's extensions menu).
      PopupWindowManager.open({
        parent: win,
        key: 'extensions-panel',
        query: { surface: 'extensions-panel' },
        anchor,
        width: EXTENSIONS_PANEL_WIDTH,
        ...(height !== undefined ? { height } : {}),
      });
    } else if (surface === 'site-info') {
      // Chrome's Page Info bubble. The URL is resolved from the SENDER window's active tab — main is
      // authoritative about which origin's data the bubble may show, never the renderer. `align:
      // 'start'` opens it rightward from the leading-edge button.
      const active = TabManager.forSenderWindow(win)?.getState();
      const url = active?.tabs.find((t) => t.id === active.activeId)?.url ?? '';
      if (url === '') {
        Logger.warn('Ignored popup:open site-info: no active tab URL');
        return;
      }
      PopupWindowManager.open({
        parent: win,
        key: 'site-info',
        query: { surface: 'site-info', url },
        anchor,
        width: SITE_INFO_WIDTH,
        align: align ?? 'start',
        ...(height !== undefined ? { height } : {}),
      });
    } else if (surface === 'ext' && id !== undefined) {
      const manifest = manifestById(id);
      if (manifest === undefined || !manifest.surfaces.includes('popup')) {
        Logger.warn('Ignored popup open for a non-popup extension', { id });
        return;
      }
      PopupWindowManager.open({
        parent: win,
        key: `ext:${id}`,
        query: { surface: 'ext', id },
        anchor,
      });
    } else if (surface === 'bookmark-folder' && id !== undefined) {
      // A bar folder's dropdown, floating over the page (a native window can't be occluded by the view).
      PopupWindowManager.open({
        parent: win,
        key: `bookmark-folder:${id}`,
        query: { surface, id },
        anchor,
        width: BOOKMARK_FOLDER_WIDTH,
        ...(height !== undefined ? { height } : {}),
      });
    } else if (
      (surface === 'bookmark-rename' || surface === 'bookmark-add-folder') &&
      id !== undefined
    ) {
      // Rename / add-folder dialog as a native window so the page stays visible behind it. The mode is
      // carried by the surface name; `id` is the target node (rename) or parent folder (add-folder).
      PopupWindowManager.open({
        parent: win,
        key: 'bookmark-dialog',
        query: { surface, id },
        anchor,
        width: BOOKMARK_DIALOG_WIDTH,
        ...(height !== undefined ? { height } : {}),
      });
    } else {
      Logger.warn('Ignored popup:open: unknown surface', { surface });
    }
  });
  // Self-resize: the open popup reports its measured content height so main shrinks the window to fit
  // (needs the sender window to identify which popup, so it can't use the window-less onAction helper).
  ipcMain.on(IpcChannels.popupResize, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = PopupResizeSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored popup:resize: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) PopupWindowManager.resize(win, parsed.data.height);
  });
  onSignal(IpcChannels.popupClose, () => {
    PopupWindowManager.close();
  });
  // Submenu flyout — a second native window to the LEFT of the main-menu popup. It attaches to the
  // currently-open primary popup, so it needs no sender window.
  ipcMain.on(IpcChannels.submenuOpen, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = SubmenuOpenSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored submenu:open: invalid payload');
      return;
    }
    const { kind, anchor, height } = parsed.data;
    PopupWindowManager.openSubmenu({ query: { surface: 'menu-sub', kind }, anchor, height });
  });
  onSignal(IpcChannels.submenuClose, () => {
    PopupWindowManager.closeSub();
  });
  // Web-page right-click menu (rendered popup surface): the popup reads the context captured at
  // right-click, then dispatches the chosen wired action — acted on against the active view in main.
  handle(IpcChannels.pageMenuGetContext, () => getPageMenuContext());
  onAction(IpcChannels.pageMenuAction, PageMenuActionSchema, (action) => {
    runPageMenuAction(action);
  });
  onAction(IpcChannels.pageMenuContributionAction, PageMenuContributionActionSchema, (input) => {
    runPageMenuContributionAction(input);
  });
  // Exit — quits the whole app regardless of the sender window (a popup can't use the window-close path).
  onSignal(IpcChannels.appQuit, () => {
    markQuitting(); // real quit → windows may close (the close-to-tray interceptor stands down)
    app.quit();
  });
  // Restart. `relaunch` only queues the new instance; the quit is what actually ends this one, and it
  // needs the same `markQuitting` stand-down as Exit or close-to-tray would swallow it.
  onSignal(IpcChannels.appRelaunch, () => {
    markQuitting();
    app.relaunch();
    app.quit();
  });
  onWindowAction(IpcChannels.tabsNavigate, NavigateInputSchema, (win, url) => {
    TabManager.forSenderWindow(win)?.navigateActive(url);
  });
  onWindowSignal(IpcChannels.tabsGoBack, (win) => {
    TabManager.forSenderWindow(win)?.goBack();
  });
  onWindowSignal(IpcChannels.tabsGoForward, (win) => {
    TabManager.forSenderWindow(win)?.goForward();
  });
  onWindowSignal(IpcChannels.tabsReload, (win) => {
    TabManager.forSenderWindow(win)?.reloadActive();
  });
  onWindowSignal(IpcChannels.tabsHome, (win) => {
    TabManager.forSenderWindow(win)?.goHome();
  });
  onWindowAction(IpcChannels.tabsReopenClosed, ReopenClosedSchema, (win, { id }) => {
    TabManager.forSenderWindow(win)?.reopenClosedTab(id);
  });
  // The recently-closed list (History menu section). Read-only and session-scoped — nothing here
  // survives a restart, so it is not a second history.
  handle(IpcChannels.tabsRecentlyClosed, (): ClosedTab[] => recentlyClosedTabs());
  // The restore notice's Undo (ADR-0038). Not window-scoped: the restore may have opened several
  // windows, and undoing it has to close all of them, not just the one the toast happened to land in.
  onSignal(IpcChannels.sessionUndoRestore, () => {
    undoSessionRestore();
  });
  // Content bounds/visibility are strictly per-window (each window reports its own content area), so
  // these MUST route by sender window — the focused-window fallback would misplace a background
  // window's view.
  onWindowAction(IpcChannels.tabsSetBounds, ContentBoundsSchema, (win, bounds) => {
    TabManager.forWindow(win)?.setContentBounds(bounds);
    // First real content rectangle from this window ⇒ its App chrome has painted the toolbar + tab
    // strip. That is the cue to reveal the window on a complete frame and to start the deferred
    // main-process init (see `chrome-ready.ts`). A 0×0 report is the pre-mount placeholder — ignore it.
    if (bounds.width > 0 && bounds.height > 0) markChromeReady(win);
  });
  onWindowAction(IpcChannels.tabsSetContentVisible, ContentVisibleSchema, (win, visible) => {
    TabManager.forWindow(win)?.setContentVisible(visible);
  });

  handleAsync(
    IpcChannels.tabsCapture,
    (event): Promise<string | null> =>
      TabManager.forSender(event.sender)?.captureActive() ?? Promise.resolve(null),
  );

  handle(
    IpcChannels.tabsGetState,
    (event): TabsState =>
      TabManager.forSender(event.sender)?.getState() ?? {
        tabs: [],
        groups: [],
        activeId: null,
        canGoBack: false,
        canGoForward: false,
        isPrivate: false,
        activeZoomFactor: 1,
        activeSecurityLevel: 'unknown',
      },
  );
}

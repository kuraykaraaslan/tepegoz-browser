import { app, BrowserWindow, ipcMain, type IpcMainEvent } from 'electron';
import { Logger } from '@tepegoz/libs';
import { IpcChannels, type TabsState } from '@tepegoz/desktop-ipc';
import {
  BookmarkContextMenuSchema,
  ContentBoundsSchema,
  ContentVisibleSchema,
  CreateBackgroundTabSchema,
  CreateTabInputSchema,
  ExtensionIdSchema,
  NavigateInputSchema,
  PageMenuActionSchema,
  PopupOpenSchema,
  PopupResizeSchema,
  SubmenuOpenSchema,
  TabGroupAssignSchema,
  TabGroupCreateSchema,
  TabGroupIdSchema,
  TabGroupMoveSchema,
  TabGroupUpdateSchema,
  TabIdSchema,
  TabMoveSchema,
  TabPinSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { isTrustedAppUrl } from '../lib/trusted-origin';
import TabManager from '../tabs';
import PopupWindowManager from '../popup-window';
import { manifestById } from '../../shared/extensions';
import { showTabContextMenu } from '../menus/tab-context-menu';
import { showBookmarkContextMenu } from '../menus/bookmark-context-menu';
import { showExtensionContextMenu } from '../menus/extension-context-menu';
import { showGroupContextMenu } from '../menus/tab-group-context-menu';
import { getPageMenuContext, runPageMenuAction } from '../menus/page-context-menu';
import { handle, handleAsync, onAction, onSignal, onWindowControl } from './ipc-helpers';

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

  onAction(IpcChannels.tabsCreate, CreateTabInputSchema, (url) => {
    TabManager.createTab(url);
  });
  onAction(IpcChannels.tabsCreateBackground, CreateBackgroundTabSchema, (url) => {
    TabManager.createTab(url, { background: true });
  });
  onAction(IpcChannels.tabsClose, TabIdSchema, (id) => {
    TabManager.closeTab(id);
  });
  onAction(IpcChannels.tabsActivate, TabIdSchema, (id) => {
    TabManager.activate(id);
  });
  // Advanced tab UX (ADR-0020): drag-reorder, groups, pinning.
  onAction(IpcChannels.tabsMove, TabMoveSchema, ({ id, toIndex, intoGroupId }) => {
    TabManager.moveTab(id, toIndex, intoGroupId);
  });
  onAction(IpcChannels.tabsPin, TabPinSchema, ({ id, pinned }) => {
    TabManager.setPinned(id, pinned);
  });
  onAction(IpcChannels.tabsGroupCreate, TabGroupCreateSchema, ({ memberIds }) => {
    TabManager.createGroup(memberIds);
  });
  onAction(IpcChannels.tabsGroupMove, TabGroupMoveSchema, ({ groupId, toIndex }) => {
    TabManager.moveGroup(groupId, toIndex);
  });
  onAction(IpcChannels.tabsGroupUpdate, TabGroupUpdateSchema, ({ groupId, name, color, collapsed, settings }) => {
    if (name !== undefined) TabManager.renameGroup(groupId, name);
    if (color !== undefined) TabManager.recolorGroup(groupId, color);
    if (collapsed !== undefined) TabManager.setGroupCollapsed(groupId, collapsed);
    if (settings !== undefined) TabManager.updateGroupSettings(groupId, settings);
  });
  onAction(IpcChannels.tabsGroupAssign, TabGroupAssignSchema, ({ tabId, groupId }) => {
    TabManager.assignToGroup(tabId, groupId);
  });
  onAction(IpcChannels.tabsGroupRemove, TabIdSchema, (tabId) => {
    TabManager.removeFromGroup(tabId);
  });
  onAction(IpcChannels.tabsUngroup, TabIdSchema, (groupId) => {
    TabManager.ungroup(groupId);
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
    const { surface, id, anchor, height } = parsed.data;
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
    } else if ((surface === 'bookmark-rename' || surface === 'bookmark-add-folder') && id !== undefined) {
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
  // Exit — quits the whole app regardless of the sender window (a popup can't use the window-close path).
  onSignal(IpcChannels.appQuit, () => {
    app.quit();
  });
  onAction(IpcChannels.tabsNavigate, NavigateInputSchema, (url) => {
    TabManager.navigateActive(url);
  });
  onSignal(IpcChannels.tabsGoBack, () => {
    TabManager.goBack();
  });
  onSignal(IpcChannels.tabsGoForward, () => {
    TabManager.goForward();
  });
  onSignal(IpcChannels.tabsReload, () => {
    TabManager.reloadActive();
  });
  onSignal(IpcChannels.tabsHome, () => {
    TabManager.goHome();
  });
  onSignal(IpcChannels.tabsReopenClosed, () => {
    TabManager.reopenClosedTab();
  });
  onAction(IpcChannels.tabsSetBounds, ContentBoundsSchema, (bounds) => {
    TabManager.setContentBounds(bounds);
  });
  onAction(IpcChannels.tabsSetContentVisible, ContentVisibleSchema, (visible) => {
    TabManager.setContentVisible(visible);
  });

  handleAsync(IpcChannels.tabsCapture, (): Promise<string | null> => TabManager.captureActive());

  handle(IpcChannels.tabsGetState, (): TabsState => TabManager.getState());
}

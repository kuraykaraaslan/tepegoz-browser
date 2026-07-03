import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { TAB_GROUP_COLORS } from '@tepegoz/tab-engine';
import { mainStrings } from '../lib/i18n-main';
import TabManager from '../tabs';

/**
 * Native tab-group header right-click menu (ADR-0020), mirroring Chrome's group menu: rename (opens the
 * inline editor in the chrome), a color submenu, new-tab-in-group, ungroup, and close-group. Built in the
 * main process so every action runs against TabManager's authoritative state.
 */
export function showGroupContextMenu(win: BrowserWindow, groupId: string): void {
  const info = TabManager.groupMenuInfo(groupId);
  if (info === undefined) return; // group vanished between right-click and IPC delivery

  const t = mainStrings();
  const colorItems: MenuItemConstructorOptions[] = TAB_GROUP_COLORS.map((color) => ({
    label: t.browser.groupColors[color],
    type: 'checkbox',
    checked: color === info.color,
    click: () => {
      TabManager.recolorGroup(groupId, color);
    },
  }));

  const template: MenuItemConstructorOptions[] = [
    {
      label: t.browser.renameGroup,
      // Rename is an inline text field in the chrome — ask the renderer to open its editor for this group.
      click: () => {
        if (!win.isDestroyed()) win.webContents.send(IpcChannels.tabsGroupStartRename, groupId);
      },
    },
    { label: t.browser.groupColor, submenu: colorItems },
    { type: 'separator' },
    {
      label: t.browser.newTabInGroup,
      click: () => {
        TabManager.newTabInGroup(groupId);
      },
    },
    {
      label: t.browser.ungroup,
      click: () => {
        TabManager.ungroup(groupId);
      },
    },
    {
      label: t.browser.closeGroup,
      click: () => {
        TabManager.closeGroup(groupId);
      },
    },
  ];

  Menu.buildFromTemplate(template).popup({ window: win });
}

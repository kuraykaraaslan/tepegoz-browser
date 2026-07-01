import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { mainStrings } from '../lib/i18n-main';
import TabManager from '../tabs';

/**
 * Native tab right-click menu, mirroring Chrome's tab context menu (the subset Phase 1a supports).
 * Built in the main process so it's a real OS menu and so every action runs against TabManager's
 * authoritative state — the renderer only forwards which tab was clicked.
 */
export function showTabContextMenu(win: BrowserWindow, tabId: string): void {
  const state = TabManager.getState();
  const idx = state.tabs.findIndex((tab) => tab.id === tabId);
  if (idx === -1) return; // tab vanished between right-click and IPC delivery

  const t = mainStrings();
  const hasOthers = state.tabs.length > 1;
  const hasRight = idx < state.tabs.length - 1;

  const template: MenuItemConstructorOptions[] = [
    {
      label: t.browser.newTabRight,
      click: () => {
        TabManager.createTabRight(tabId);
      },
    },
    { type: 'separator' },
    {
      label: t.browser.reload,
      click: () => {
        TabManager.reloadTab(tabId);
      },
    },
    {
      label: t.browser.duplicateTab,
      click: () => {
        TabManager.duplicateTab(tabId);
      },
    },
    { type: 'separator' },
    {
      label: t.browser.closeTab,
      click: () => {
        TabManager.closeTab(tabId);
      },
    },
    {
      label: t.browser.closeOtherTabs,
      enabled: hasOthers,
      click: () => {
        TabManager.closeOtherTabs(tabId);
      },
    },
    {
      label: t.browser.closeTabsRight,
      enabled: hasRight,
      click: () => {
        TabManager.closeTabsToRight(tabId);
      },
    },
  ];

  Menu.buildFromTemplate(template).popup({ window: win });
}

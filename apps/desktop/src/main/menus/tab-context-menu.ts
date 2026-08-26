import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { mainStrings } from '../lib/i18n-main';
import TabManager from '../tabs';
import { routeSubmenu } from './route-menu';

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
  // A tab can be hidden only while at least one OTHER tab stays visible (never leave an empty strip).
  const visibleCount = state.tabs.filter((tab) => tab.hidden !== true).length;
  const tab = state.tabs[idx]!;
  const isPinned = tab.pinned;
  const inGroup = tab.groupId !== null;
  // Groups the tab could be added to (all groups except its own).
  const otherGroups = state.groups.filter((g) => g.id !== tab.groupId);

  const groupSubmenu: MenuItemConstructorOptions[] = [
    {
      label: t.browser.addToNewGroup,
      click: () => {
        TabManager.createGroup([tabId]);
      },
    },
    ...(otherGroups.length > 0
      ? [
          { type: 'separator' as const },
          ...otherGroups.map((g) => ({
            label: g.name.trim().length > 0 ? g.name : t.browser.unnamedGroup,
            click: () => {
              TabManager.assignToGroup(tabId, g.id);
            },
          })),
        ]
      : []),
  ];

  const template: MenuItemConstructorOptions[] = [
    {
      label: isPinned ? t.browser.unpinTab : t.browser.pinTab,
      click: () => {
        TabManager.setPinned(tabId, !isPinned);
      },
    },
    {
      // Hide: leave the strip but keep the tab alive + rendering (for the background/task AI).
      label: t.browser.hideTab,
      enabled: visibleCount > 1,
      click: () => {
        TabManager.hideTab(tabId);
      },
    },
    {
      // Discard/sleep: the OPPOSITE of hide — free the tab's memory now rather than keep it alive.
      // `canDiscardTab` refuses the active/hidden/audible/already-discarded cases, so a disabled row
      // here is the same guard `discardTab` itself would apply, just visible before the click.
      label: t.browser.discardTab,
      enabled: TabManager.canDiscardTab(tabId),
      click: () => {
        TabManager.discardTab(tabId);
      },
    },
    { type: 'separator' },
    // Per-tab network route (Phase 5). Sits next to the group entry because it is the same kind of
    // decision — "which context does this tab belong to" — at a different scope.
    { label: t.browser.routeTabThrough, submenu: routeSubmenu('tab', tabId) },
    { type: 'separator' },
    { label: t.browser.addToGroup, submenu: groupSubmenu },
    ...(inGroup
      ? [
          {
            label: t.browser.removeFromGroup,
            click: () => {
              TabManager.removeFromGroup(tabId);
            },
          },
          {
            label: t.browser.ungroup,
            click: () => {
              if (tab.groupId !== null) TabManager.ungroup(tab.groupId);
            },
          },
        ]
      : []),
    { type: 'separator' },
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

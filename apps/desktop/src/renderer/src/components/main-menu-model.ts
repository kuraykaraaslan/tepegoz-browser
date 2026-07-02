import type { MenuItem } from '@tepegoz/browser-menu';
import type { Locale } from '@tepegoz/i18n';
import { extensionLabel } from '../../../shared/extensions';
import type { ExtensionDef } from '../extensions/registry';

/** Localized copy the main menu needs (mixed from several dictionaries; resolved by the caller). */
export interface MainMenuCopy {
  newTab: string;
  reopenTab: string;
  reload: string;
  exit: string;
  settings: string; // shared-core common.settings
  history: string; // history-ui title
  extensionsManage: string; // extensions-ui manage
  menuLabel: string; // browser.menu (aria-label)
  menu: {
    newWindow: string;
    newIncognito: string;
    profileYou: string;
    passwords: string;
    downloads: string;
    bookmarks: string;
    tabGroups: string;
    deleteBrowsingData: string;
    zoom: string;
    print: string;
    searchLens: string;
    translate: string;
    findEdit: string;
    castSaveShare: string;
    moreTools: string;
    help: string;
  };
}

/** Bridge actions for the real (wired) rows. Each already closes the popup after acting. */
export interface MainMenuActions {
  newTab: () => void;
  reopenTab: () => void;
  reload: () => void;
  openHistory: () => void;
  openExtension: (id: string) => void;
  manageExtensions: () => void;
  openSettings: () => void;
  exit: () => void;
}

/**
 * Builds the Chrome-style main-menu item model. Real features are wired to bridge actions; everything
 * not yet implemented is a disabled (greyed) placeholder so the menu mirrors Chrome's layout. The
 * former "Extensions ›" submenu is flattened: each enabled extension is a row, then "Manage extensions".
 */
export function buildMainMenuModel(
  copy: MainMenuCopy,
  actions: MainMenuActions,
  extensions: readonly ExtensionDef[],
  locale: Locale,
): MenuItem[] {
  const off = true; // placeholder marker (not-yet-implemented → disabled)
  return [
    { id: 'new-tab', label: copy.newTab, shortcut: 'Ctrl+T', onSelect: actions.newTab },
    { id: 'reopen-tab', label: copy.reopenTab, shortcut: 'Ctrl+Shift+T', onSelect: actions.reopenTab },
    { id: 'reload', label: copy.reload, shortcut: 'Ctrl+R', onSelect: actions.reload },
    { id: 'new-window', label: copy.menu.newWindow, shortcut: 'Ctrl+N', disabled: off },
    { id: 'new-incognito', label: copy.menu.newIncognito, shortcut: 'Ctrl+Shift+N', disabled: off },
    { kind: 'separator' },
    { kind: 'header', id: 'profile', content: copy.menu.profileYou },
    { id: 'passwords', label: copy.menu.passwords, disabled: off },
    { id: 'history', label: copy.history, onSelect: actions.openHistory },
    { id: 'downloads', label: copy.menu.downloads, shortcut: 'Ctrl+J', disabled: off },
    { id: 'bookmarks', label: copy.menu.bookmarks, disabled: off },
    { id: 'tab-groups', label: copy.menu.tabGroups, disabled: off },
    { kind: 'separator' },
    ...extensions.map(
      (ext): MenuItem => ({
        id: `ext:${ext.id}`,
        label: extensionLabel(ext.manifest, locale).name,
        icon: ext.icon,
        onSelect: () => actions.openExtension(ext.id),
      }),
    ),
    { id: 'manage-extensions', label: copy.extensionsManage, onSelect: actions.manageExtensions },
    { id: 'delete-browsing-data', label: copy.menu.deleteBrowsingData, disabled: off },
    { kind: 'separator' },
    { kind: 'zoom', id: 'zoom', label: copy.menu.zoom, value: 100, disabled: off },
    { id: 'print', label: copy.menu.print, shortcut: 'Ctrl+P', disabled: off },
    { id: 'search-lens', label: copy.menu.searchLens, disabled: off },
    { id: 'translate', label: copy.menu.translate, disabled: off },
    { id: 'find-edit', label: copy.menu.findEdit, disabled: off },
    { id: 'cast-save-share', label: copy.menu.castSaveShare, disabled: off },
    { id: 'more-tools', label: copy.menu.moreTools, disabled: off },
    { kind: 'separator' },
    { id: 'help', label: copy.menu.help, disabled: off },
    { id: 'settings', label: copy.settings, shortcut: 'Ctrl+,', onSelect: actions.openSettings },
    { kind: 'separator' },
    { id: 'exit', label: copy.exit, onSelect: actions.exit },
  ];
}

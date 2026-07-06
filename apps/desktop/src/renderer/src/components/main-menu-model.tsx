import { Icon, type IconName } from '@tepegoz/ui';
import type { MenuAction, MenuItem } from '@tepegoz/browser-menu';

/** Localized copy the main menu needs (mixed from several dictionaries; resolved by the caller). */
export interface MainMenuCopy {
  newTab: string;
  reopenTab: string;
  reload: string;
  exit: string;
  settings: string; // shared-core common.settings
  history: string; // history-ui title (submenu parent)
  extensions: string; // extensions-ui title (submenu parent)
  menu: {
    newWindow: string;
    newIncognito: string;
    profileYou: string;
    passwords: string;
    downloads: string;
    uploads: string;
    tasks: string;
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
    /** Short captions shown under the grouped icon buttons. */
    short: {
      newWindow: string;
      newIncognito: string;
      deleteBrowsingData: string;
      passwords: string;
      downloads: string;
      uploads: string;
      tasks: string;
      bookmarks: string;
      tabGroups: string;
      print: string;
      searchLens: string;
      translate: string;
      findEdit: string;
      castSaveShare: string;
      moreTools: string;
      help: string;
    };
  };
}

/** Bridge actions for the real (wired) full rows. Each already closes the popup after acting. */
export interface MainMenuActions {
  newTab: () => void;
  reopenTab: () => void;
  reload: () => void;
  openDownloads: () => void;
  openUploads: () => void;
  openTasks: () => void;
  openSettings: () => void;
  exit: () => void;
}

/** One icon button for an `actions` row (full `label` = tooltip, `caption` = short label under the icon).
 *  Placeholder (no `onSelect`) → disabled + greyed. */
function action(
  id: string,
  label: string,
  caption: string,
  icon: IconName,
  onSelect?: () => void,
): MenuAction {
  return {
    id,
    label,
    caption,
    icon: <Icon name={icon} />,
    disabled: onSelect === undefined,
    ...(onSelect !== undefined ? { onSelect } : {}),
  };
}

/**
 * Builds the compact Chrome-style main-menu model. Real features are full labeled rows; secondary /
 * not-yet-implemented items are grouped into `actions` rows of icon-only buttons (3–4 each) to keep the
 * menu short — placeholders are disabled (greyed). Extension names are NOT inline and History's recent
 * entries are NOT inline: both are `flyout` parents — the host opens them as separate windows to the
 * left (see MainMenuPopup / MenuSubPopup).
 */
export function buildMainMenuModel(copy: MainMenuCopy, actions: MainMenuActions): MenuItem[] {
  return [
    { id: 'new-tab', label: copy.newTab, shortcut: 'Ctrl+T', onSelect: actions.newTab },
    { id: 'reopen-tab', label: copy.reopenTab, shortcut: 'Ctrl+Shift+T', onSelect: actions.reopenTab },
    { id: 'reload', label: copy.reload, shortcut: 'Ctrl+R', onSelect: actions.reload },
    {
      kind: 'actions',
      id: 'window-actions',
      items: [
        action('new-window', copy.menu.newWindow, copy.menu.short.newWindow, 'newWindow'),
        action('new-incognito', copy.menu.newIncognito, copy.menu.short.newIncognito, 'incognito'),
        action('delete-data', copy.menu.deleteBrowsingData, copy.menu.short.deleteBrowsingData, 'trash'),
      ],
    },
    { kind: 'separator' },
    { kind: 'header', id: 'profile', content: copy.menu.profileYou },
    {
      kind: 'actions',
      id: 'data-actions',
      items: [
        action('passwords', copy.menu.passwords, copy.menu.short.passwords, 'key'),
        action('downloads', copy.menu.downloads, copy.menu.short.downloads, 'download', actions.openDownloads),
        action('uploads', copy.menu.uploads, copy.menu.short.uploads, 'upload', actions.openUploads),
        action('tasks', copy.menu.tasks, copy.menu.short.tasks, 'tasks', actions.openTasks),
        action('tab-groups', copy.menu.tabGroups, copy.menu.short.tabGroups, 'layers'),
      ],
    },
    { id: 'bookmarks', label: copy.menu.bookmarks, icon: <Icon name="bookmark" />, flyout: true },
    { id: 'history', label: copy.history, icon: <Icon name="history" />, flyout: true },
    { kind: 'separator' },
    { id: 'extensions', label: copy.extensions, icon: <Icon name="puzzle" />, flyout: true },
    { kind: 'separator' },
    { kind: 'zoom', id: 'zoom', label: copy.menu.zoom, value: 100, disabled: true },
    {
      kind: 'actions',
      id: 'page-actions',
      items: [
        action('print', copy.menu.print, copy.menu.short.print, 'print'),
        action('search-lens', copy.menu.searchLens, copy.menu.short.searchLens, 'search'),
        action('translate', copy.menu.translate, copy.menu.short.translate, 'translate'),
        action('find-edit', copy.menu.findEdit, copy.menu.short.findEdit, 'edit'),
      ],
    },
    {
      kind: 'actions',
      id: 'share-actions',
      items: [
        action('cast', copy.menu.castSaveShare, copy.menu.short.castSaveShare, 'share'),
        action('more-tools', copy.menu.moreTools, copy.menu.short.moreTools, 'tools'),
        action('help', copy.menu.help, copy.menu.short.help, 'help'),
      ],
    },
    { kind: 'separator' },
    { id: 'settings', label: copy.settings, shortcut: 'Ctrl+,', onSelect: actions.openSettings },
    { kind: 'separator' },
    { id: 'exit', label: copy.exit, onSelect: actions.exit },
  ];
}

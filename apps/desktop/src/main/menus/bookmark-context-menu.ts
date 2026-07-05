import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IpcChannels, type BookmarkMenuAction, type BookmarkNodeType } from '@tepegoz/desktop-ipc';
import { mainStrings } from '../lib/i18n-main';

/**
 * Native right-click menu for a bookmark or folder on the bar / manager. A pure DISPATCHER: every item
 * just sends a `bookmarks:menu-action` back to the renderer, which owns the tree view state and performs
 * the work (open via the tab APIs, delete/rename/add-folder via the tree IPC, then refetch). This keeps
 * all bookmark mutations on a single renderer-driven path, so the bar always reflects the change.
 */
export function showBookmarkContextMenu(
  win: BrowserWindow,
  id: string,
  type: BookmarkNodeType,
  variant: 'default' | 'folder-item' = 'default',
): void {
  const t = mainStrings().browser.bookmarkMenu;
  const send = (action: BookmarkMenuAction['action']): void => {
    win.webContents.send(IpcChannels.bookmarksMenuAction, {
      action,
      id,
      type,
    } satisfies BookmarkMenuAction);
  };

  // Reduced menu shown INSIDE a bar folder-dropdown popup — the actions that popup window can handle
  // itself (its own renderer subscribes to bookmarks:menu-action). "Move to Bookmarks bar" is the
  // drag-free way to take an item OUT of the folder (cross-window drag isn't possible).
  if (variant === 'folder-item') {
    const items: MenuItemConstructorOptions[] =
      type === 'folder'
        ? [
            { label: t.openAll, click: () => send('open-all') },
            { type: 'separator' },
            { label: t.moveToBar, click: () => send('move-to-bar') },
            { label: t.delete, click: () => send('delete') },
          ]
        : [
            { label: t.open, click: () => send('open') },
            { label: t.openNewTab, click: () => send('open-new-tab') },
            { type: 'separator' },
            { label: t.moveToBar, click: () => send('move-to-bar') },
            { label: t.delete, click: () => send('delete') },
          ];
    Menu.buildFromTemplate(items).popup({ window: win });
    return;
  }

  // The two fixed roots (bar background right-click, or a root in the manager tree) can't be renamed,
  // deleted, or "opened" — offer only Add folder + the manager.
  const isRoot = id === 'root-bar' || id === 'root-other';

  const template: MenuItemConstructorOptions[] = isRoot
    ? [
        { label: t.addFolder, click: () => send('add-folder') },
        { type: 'separator' },
        { label: t.manager, click: () => send('open-manager') },
      ]
    : type === 'folder'
      ? [
          { label: t.openAll, click: () => send('open-all') },
          { type: 'separator' },
          { label: t.rename, click: () => send('rename') },
          { label: t.addFolder, click: () => send('add-folder') },
          { type: 'separator' },
          { label: t.delete, click: () => send('delete') },
          { type: 'separator' },
          { label: t.manager, click: () => send('open-manager') },
        ]
      : [
          { label: t.open, click: () => send('open') },
          { label: t.openNewTab, click: () => send('open-new-tab') },
          { type: 'separator' },
          { label: t.rename, click: () => send('rename') },
          { label: t.moveToBar, click: () => send('move-to-bar') },
          { label: t.addFolder, click: () => send('add-folder') },
          { type: 'separator' },
          { label: t.delete, click: () => send('delete') },
          { type: 'separator' },
          { label: t.manager, click: () => send('open-manager') },
        ];

  Menu.buildFromTemplate(template).popup({ window: win });
}

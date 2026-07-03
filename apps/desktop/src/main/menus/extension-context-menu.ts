import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { INTERNAL_EXTENSIONS_URL, IpcChannels } from '@tepegoz/desktop-ipc';
import { mainStrings } from '../lib/i18n-main';
import { manifestById } from '../../shared/extensions';
import TabManager from '../tabs';

/**
 * Native right-click menu for a toolbar extension icon (Chrome-style). Built in the main process so it's a
 * real OS menu. "Settings page" / "Remove" are relayed back to the renderer (via `extension:context-menu-
 * action`) so the chosen action runs against the renderer's authoritative React state (extension
 * enabled-list + surface routing) — no preferences broadcast needed. "Manage extensions" opens the
 * internal manager tab directly (a navigation, not extension state).
 */
export function showExtensionContextMenu(win: BrowserWindow, extId: string): void {
  const manifest = manifestById(extId);
  if (manifest === undefined) return; // unknown / stale id between right-click and IPC delivery

  const t = mainStrings();
  const hasPage = manifest.surfaces.includes('page');

  const template: MenuItemConstructorOptions[] = [
    {
      label: t.extensions.settingsPage,
      enabled: hasPage,
      click: () => {
        win.webContents.send(IpcChannels.extensionContextMenuAction, { id: extId, action: 'page' });
      },
    },
    {
      label: t.extensions.remove,
      click: () => {
        win.webContents.send(IpcChannels.extensionContextMenuAction, { id: extId, action: 'remove' });
      },
    },
    { type: 'separator' },
    {
      label: t.extensions.manage,
      click: () => {
        TabManager.openInternalPage(INTERNAL_EXTENSIONS_URL);
      },
    },
  ];

  Menu.buildFromTemplate(template).popup({ window: win });
}

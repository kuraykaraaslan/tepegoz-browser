import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { INTERNAL_EXTENSIONS_URL, IpcChannels } from '@tepegoz/desktop-ipc';
import { mainStrings } from '../lib/i18n-main';
import PreferenceStore from '@tepegoz/preferences';
import { manifestById } from '../../shared/extensions';
import { chromeWindowFor } from '../lib/chrome-window';
import PopupWindowManager from '../popup-window';
import TabManager from '../tabs';

/**
 * Native right-click menu for an extension icon / Extensions-panel row (Chrome-style). Built in the main
 * process so it's a real OS menu. "Settings page" / "Unpin" / "Remove" are relayed back to the renderer
 * (via `extension:context-menu-action`) so the chosen action runs against the renderer's authoritative
 * React state (pinned list + extension enabled-list + surface routing) — no preferences broadcast needed.
 * "Manage extensions" opens the internal manager tab directly (a navigation, not extension state).
 *
 * `win` is the SENDER's window, which anchors the menu — but it may be the Extensions panel popup, whose
 * renderer owns none of that state, so the relay always targets the owning chrome window and the popup is
 * dismissed first (as Chrome's menu does).
 */
export function showExtensionContextMenu(win: BrowserWindow, extId: string): void {
  const manifest = manifestById(extId);
  if (manifest === undefined) return; // unknown / stale id between right-click and IPC delivery

  const t = mainStrings();
  const hasPage = manifest.surfaces.includes('page');
  const pinned = PreferenceStore.getAll().pinnedExtensions.includes(extId);
  const chrome = chromeWindowFor(win);
  const fromPopup = chrome !== win;
  const relay = (action: 'page' | 'unpin' | 'remove'): void => {
    if (fromPopup) PopupWindowManager.close();
    if (!chrome.isDestroyed()) {
      chrome.webContents.send(IpcChannels.extensionContextMenuAction, { id: extId, action });
    }
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: t.extensions.settingsPage,
      enabled: hasPage,
      click: () => {
        relay('page');
      },
    },
    // Only offered for an icon that is actually on the toolbar; pinning happens in the panel itself.
    ...(pinned
      ? [
          {
            label: t.extensions.unpin,
            click: () => {
              relay('unpin');
            },
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: t.extensions.remove,
      click: () => {
        relay('remove');
      },
    },
    { type: 'separator' },
    {
      label: t.extensions.manage,
      click: () => {
        if (fromPopup) PopupWindowManager.close();
        TabManager.openInternalPage(INTERNAL_EXTENSIONS_URL);
      },
    },
  ];

  Menu.buildFromTemplate(template).popup({ window: win });
}

import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import {
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_SETTINGS_URL,
  IpcChannels,
  isExtensionEnabled,
} from '@tepegoz/desktop-ipc';
import { BUILTIN_MANIFESTS, extensionLabel } from '../../shared/extensions';
import { mainLocale, mainResources } from '../lib/i18n-main';
import PreferenceStore from '@tepegoz/preferences';
import TabManager from '../tabs';

/**
 * Native main (hamburger) menu — a real OS popup so it renders ABOVE the tab's WebContentsView (a DOM
 * dropdown would be hidden behind that native view). Phase 1a lists ONLY wired actions; History /
 * Downloads / Bookmarks / Extensions / Zoom / Print arrive in later phases. Tab actions (incl. opening
 * the internal Settings tab) run against TabManager; the Agent Console is chrome UI state, so it
 * signals the renderer.
 */
export function showMainMenu(win: BrowserWindow): void {
  const t = mainResources();
  const locale = mainLocale();
  const { extensions } = PreferenceStore.getAll();
  const extensionSubmenu: MenuItemConstructorOptions[] = [
    ...BUILTIN_MANIFESTS.filter((m) => isExtensionEnabled(extensions, m.id)).map((m) => ({
      label: extensionLabel(m, locale).name,
      click: () => {
        win.webContents.send(IpcChannels.extensionOpen, m.id);
      },
    })),
    { type: 'separator' },
    {
      label: t.extensions.manage,
      click: () => {
        TabManager.openInternalPage(INTERNAL_EXTENSIONS_URL);
      },
    },
  ];
  const template: MenuItemConstructorOptions[] = [
    {
      label: t.browser.newTab,
      accelerator: 'CmdOrCtrl+T',
      click: () => {
        TabManager.createTab();
      },
    },
    {
      label: t.browser.reload,
      accelerator: 'CmdOrCtrl+R',
      click: () => {
        TabManager.reloadActive();
      },
    },
    { type: 'separator' },
    {
      label: t.history.title,
      click: () => {
        TabManager.openInternalPage(INTERNAL_HISTORY_URL);
      },
    },
    {
      label: t.extensions.title,
      submenu: extensionSubmenu,
    },
    {
      label: t.browser.settings,
      accelerator: 'CmdOrCtrl+,',
      click: () => {
        TabManager.openInternalPage(INTERNAL_SETTINGS_URL);
      },
    },
    { type: 'separator' },
    {
      label: t.browser.exit,
      click: () => {
        app.quit();
      },
    },
  ];

  Menu.buildFromTemplate(template).popup({ window: win });
}

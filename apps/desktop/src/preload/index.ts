import { contextBridge } from 'electron';
import type { TepegozApi } from '@tepegoz/desktop-ipc';
import { windowTabsApi } from './api-window-tabs';
import { agentModelsApi } from './api-agent-models';
import { bookmarksHistoryApi } from './api-bookmarks-history';
import { settingsMiscApi } from './api-settings-misc';
import { loginsMacrosApi } from './api-logins-macros';
import { downloadsApi } from './api-downloads';
import { uploadsApi } from './api-uploads';
import { tasksApi } from './api-tasks';

/**
 * The ONLY bridge between renderer and main. A small, named, typed API — never raw ipcRenderer
 * (electron-desktop-security BLOCKING). Assembled from the `api-*.ts` slices (ADR-0010 250-line
 * cap split of what used to be one object literal here).
 */
const api: TepegozApi = {
  ...settingsMiscApi,
  ...windowTabsApi,
  ...agentModelsApi,
  ...bookmarksHistoryApi,
  ...loginsMacrosApi,
  ...downloadsApi,
  ...uploadsApi,
  ...tasksApi,
  platform: process.platform,
};

contextBridge.exposeInMainWorld('tepegoz', api);

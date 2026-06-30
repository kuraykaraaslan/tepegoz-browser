import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels, type AppInfo, type TepegozApi } from '../shared/ipc-contract';

/**
 * The ONLY bridge between renderer and main. A small, named, typed API — never raw ipcRenderer
 * (electron-desktop-security BLOCKING).
 */
const api: TepegozApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.appGetInfo) as Promise<AppInfo>,
  platform: process.platform,
};

contextBridge.exposeInMainWorld('tepegoz', api);

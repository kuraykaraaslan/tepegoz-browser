import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannels,
  type AppInfo,
  type CredentialsStatus,
  type Preferences,
  type ProviderId,
  type TepegozApi,
} from '../shared/ipc-contract';

/**
 * The ONLY bridge between renderer and main. A small, named, typed API — never raw ipcRenderer
 * (electron-desktop-security BLOCKING).
 */
const api: TepegozApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.appGetInfo) as Promise<AppInfo>,
  getPreferences: () => ipcRenderer.invoke(IpcChannels.prefsGet) as Promise<Preferences>,
  updatePreferences: (patch: Partial<Preferences>) =>
    ipcRenderer.invoke(IpcChannels.prefsSet, patch) as Promise<Preferences>,
  getCredentialsStatus: () =>
    ipcRenderer.invoke(IpcChannels.credentialsStatus) as Promise<CredentialsStatus>,
  setProviderKey: (provider: ProviderId, apiKey: string) =>
    ipcRenderer.invoke(IpcChannels.credentialsSet, { provider, apiKey }) as Promise<CredentialsStatus>,
  removeProviderKey: (provider: ProviderId) =>
    ipcRenderer.invoke(IpcChannels.credentialsRemove, { provider }) as Promise<CredentialsStatus>,
  minimizeWindow: () => {
    ipcRenderer.send(IpcChannels.windowMinimize);
  },
  toggleMaximizeWindow: () => {
    ipcRenderer.send(IpcChannels.windowMaximizeToggle);
  },
  closeWindow: () => {
    ipcRenderer.send(IpcChannels.windowClose);
  },
  isWindowMaximized: () =>
    ipcRenderer.invoke(IpcChannels.windowIsMaximized) as Promise<boolean>,
  onWindowMaximizedChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: unknown, maximized: boolean): void => {
      callback(maximized);
    };
    ipcRenderer.on(IpcChannels.windowMaximizedChanged, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.windowMaximizedChanged, listener);
    };
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('tepegoz', api);

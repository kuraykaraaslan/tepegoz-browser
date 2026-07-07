import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type AppInfo,
  type CredentialsStatus,
  type FileAccessFolderPickResult,
  type NewTabBackgroundImagePick,
  type PopupBlockerRequest,
  type PopupBlockerSettings,
  type Preferences,
  type ProviderId,
  type ProviderKeyMeta,
  type PublicSettings,
  type TepegozApi,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

/** App info + preferences + credentials + user-agent + popup-blocker + file-access-picker bridge
 *  methods. Split out of `index.ts` (ADR-0010 250-line cap). */
export const settingsMiscApi: Pick<
  TepegozApi,
  | 'getAppInfo'
  | 'getPreferences'
  | 'updatePreferences'
  | 'resetPreferences'
  | 'completeOnboarding'
  | 'getPublicSettings'
  | 'onPublicSettingsChanged'
  | 'getCredentialsStatus'
  | 'listCredentials'
  | 'addProviderKey'
  | 'removeProviderKeyById'
  | 'renameProviderKey'
  | 'reorderProviderKeys'
  | 'getUserAgent'
  | 'setUserAgent'
  | 'getPopupBlockerSettings'
  | 'setPopupBlockerSettings'
  | 'trustPopupOrigin'
  | 'getRecentRequests'
  | 'pickFileAccessFolder'
  | 'pickNewTabBackgroundImage'
  | 'getNewTabBackgroundImage'
> = {
  getAppInfo: () => invoke<AppInfo>(IpcChannels.appGetInfo),
  getPreferences: () => invoke<Preferences>(IpcChannels.prefsGet),
  updatePreferences: (patch: Partial<Preferences>) =>
    invoke<Preferences>(IpcChannels.prefsSet, patch),
  resetPreferences: () => invoke<Preferences>(IpcChannels.prefsReset),
  completeOnboarding: () => invoke<void>(IpcChannels.onboardingComplete),
  getPublicSettings: () => invoke<PublicSettings>(IpcChannels.publicSettingsGet),
  onPublicSettingsChanged: (callback: (settings: PublicSettings) => void) => {
    const listener = (_event: unknown, settings: PublicSettings): void => {
      callback(settings);
    };
    ipcRenderer.on(IpcChannels.publicSettingsChanged, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.publicSettingsChanged, listener);
    };
  },
  getCredentialsStatus: () => invoke<CredentialsStatus>(IpcChannels.credentialsStatus),
  listCredentials: () => invoke<ProviderKeyMeta[]>(IpcChannels.credentialsList),
  addProviderKey: (provider: ProviderId, label: string, apiKey: string) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsAdd, { provider, label, apiKey }),
  removeProviderKeyById: (id: string) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsRemoveById, { keyId: id }),
  renameProviderKey: (id: string, label: string) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsRename, { keyId: id, label }),
  reorderProviderKeys: (orderedIds: string[]) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsReorder, { orderedIds }),
  getUserAgent: () => invoke<string | null>(IpcChannels.userAgentGet),
  setUserAgent: (ua: string | null) => invoke<string | null>(IpcChannels.userAgentSet, ua),
  getPopupBlockerSettings: () => invoke<PopupBlockerSettings>(IpcChannels.popupBlockerGet),
  setPopupBlockerSettings: (patch: Partial<PopupBlockerSettings>) =>
    invoke<PopupBlockerSettings>(IpcChannels.popupBlockerSet, patch),
  trustPopupOrigin: (origin: string) => {
    ipcRenderer.send(IpcChannels.popupBlockerTrust, origin);
  },
  getRecentRequests: () => invoke<PopupBlockerRequest[]>(IpcChannels.popupBlockerRecentRequests),
  // File operations (Settings → File operations). The grant list rides on preferences; only the native
  // folder picker needs a bridge method (AI-driven consent reuses the agent HITL modal).
  pickFileAccessFolder: () => invoke<FileAccessFolderPickResult>(IpcChannels.fileAccessPickFolder),
  // New-tab background image: native picker (bytes stored in the blob store) + ref → data: URL resolver.
  pickNewTabBackgroundImage: () =>
    invoke<NewTabBackgroundImagePick>(IpcChannels.newtabPickBackgroundImage),
  getNewTabBackgroundImage: (ref: string) =>
    invoke<string | null>(IpcChannels.newtabGetBackgroundImage, ref),
};

import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type AdblockSettings,
  type AdblockState,
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
  type TranslateCloudFallbackRequest,
  type TranslateCloudFallbackResponse,
  type TranslateGlossaryTerm,
  type TranslatePageState,
  type TranslateSettings,
  type TranslateState,
  type TranslateTextInput,
  type TranslateTextResult,
  type TypoCheckInput,
  type TypoCheckResult,
  type TypoDictionaryInfo,
  type TypoSettings,
  type TypoState,
  type VideoPlayerPageState,
  type VideoPlayerSettings,
  type VideoPlayerState,
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
  | 'setProviderKeyModel'
  | 'reorderProviderKeys'
  | 'getUserAgent'
  | 'setUserAgent'
  | 'getPopupBlockerSettings'
  | 'setPopupBlockerSettings'
  | 'trustPopupOrigin'
  | 'getRecentRequests'
  | 'getAdblockSettings'
  | 'setAdblockSettings'
  | 'getAdblockState'
  | 'setAdblockSiteEnabled'
  | 'refreshAdblockLists'
  | 'getTypoSettings'
  | 'setTypoSettings'
  | 'getTypoState'
  | 'checkTypoText'
  | 'listTypoDictionaries'
  | 'downloadTypoDictionary'
  | 'cancelTypoDictionaryDownload'
  | 'deleteTypoDictionary'
  | 'showTypoDictionariesFolder'
  | 'setTypoSiteEnabled'
  | 'addTypoIgnoredWord'
  | 'onTypoDictionariesState'
  | 'getTranslateSettings'
  | 'setTranslateSettings'
  | 'getTranslateState'
  | 'translateText'
  | 'startPageTranslation'
  | 'restorePageOriginal'
  | 'setTranslateSiteEnabled'
  | 'addTranslateGlossaryTerm'
  | 'removeTranslateGlossaryTerm'
  | 'onTranslatePageState'
  | 'onTranslateCloudFallbackRequest'
  | 'respondTranslateCloudFallback'
  | 'getVideoPlayerSettings'
  | 'setVideoPlayerSettings'
  | 'getVideoPlayerState'
  | 'setVideoPlayerSiteEnabled'
  | 'onVideoPlayerPageState'
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
  setProviderKeyModel: (id: string, model: string) =>
    invoke<CredentialsStatus>(IpcChannels.credentialsSetModel, { keyId: id, model }),
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
  getAdblockSettings: () => invoke<AdblockSettings>(IpcChannels.adblockGet),
  setAdblockSettings: (patch: Partial<AdblockSettings>) =>
    invoke<AdblockSettings>(IpcChannels.adblockSet, patch),
  getAdblockState: () => invoke<AdblockState>(IpcChannels.adblockState),
  setAdblockSiteEnabled: (origin: string, enabled: boolean) =>
    invoke<AdblockSettings>(IpcChannels.adblockSiteSet, { origin, enabled }),
  refreshAdblockLists: () => invoke<AdblockState>(IpcChannels.adblockRefresh),
  getTypoSettings: () => invoke<TypoSettings>(IpcChannels.typoGet),
  setTypoSettings: (patch: Partial<TypoSettings>) =>
    invoke<TypoSettings>(IpcChannels.typoSet, patch),
  getTypoState: () => invoke<TypoState>(IpcChannels.typoState),
  checkTypoText: (input: TypoCheckInput) =>
    invoke<TypoCheckResult>(IpcChannels.typoCheck, input),
  listTypoDictionaries: () =>
    invoke<TypoDictionaryInfo[]>(IpcChannels.typoDictionariesList),
  downloadTypoDictionary: (id: string) =>
    invoke<void>(IpcChannels.typoDictionaryDownload, id),
  cancelTypoDictionaryDownload: (id: string) => {
    ipcRenderer.send(IpcChannels.typoDictionaryCancel, id);
  },
  deleteTypoDictionary: (id: string) => invoke<void>(IpcChannels.typoDictionaryDelete, id),
  showTypoDictionariesFolder: () => invoke<void>(IpcChannels.typoDictionaryShowFolder),
  setTypoSiteEnabled: (origin: string, enabled: boolean) =>
    invoke<TypoSettings>(IpcChannels.typoSiteSet, { origin, enabled }),
  addTypoIgnoredWord: (word: string, language: string) =>
    invoke<TypoSettings>(IpcChannels.typoIgnoredWordAdd, { word, language }),
  onTypoDictionariesState: (callback: (items: TypoDictionaryInfo[]) => void) => {
    const listener = (_event: unknown, items: TypoDictionaryInfo[]): void => {
      callback(items);
    };
    ipcRenderer.on(IpcChannels.typoDictionariesState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.typoDictionariesState, listener);
    };
  },
  getTranslateSettings: () => invoke<TranslateSettings>(IpcChannels.translateGet),
  setTranslateSettings: (patch: Partial<TranslateSettings>) =>
    invoke<TranslateSettings>(IpcChannels.translateSet, patch),
  getTranslateState: () => invoke<TranslateState>(IpcChannels.translateState),
  translateText: (input: TranslateTextInput) =>
    invoke<TranslateTextResult>(IpcChannels.translateText, input),
  startPageTranslation: () =>
    invoke<TranslatePageState | null>(IpcChannels.translatePageStart),
  restorePageOriginal: () =>
    invoke<TranslatePageState | null>(IpcChannels.translatePageRestore),
  setTranslateSiteEnabled: (origin: string, enabled: boolean) =>
    invoke<TranslateSettings>(IpcChannels.translateSiteSet, { origin, enabled }),
  addTranslateGlossaryTerm: (term: Omit<TranslateGlossaryTerm, 'id'>) =>
    invoke<TranslateSettings>(IpcChannels.translateGlossaryAdd, term),
  removeTranslateGlossaryTerm: (id: string) =>
    invoke<TranslateSettings>(IpcChannels.translateGlossaryRemove, id),
  onTranslatePageState: (callback: (state: TranslatePageState | null) => void) => {
    const listener = (_event: unknown, state: TranslatePageState | null): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.translatePageState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.translatePageState, listener);
    };
  },
  onTranslateCloudFallbackRequest: (callback: (request: TranslateCloudFallbackRequest) => void) => {
    const listener = (_event: unknown, request: TranslateCloudFallbackRequest): void => {
      callback(request);
    };
    ipcRenderer.on(IpcChannels.translateCloudFallbackRequest, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.translateCloudFallbackRequest, listener);
    };
  },
  respondTranslateCloudFallback: (response: TranslateCloudFallbackResponse) => {
    ipcRenderer.send(IpcChannels.translateCloudFallbackRespond, response);
  },
  // Unified Player (ext-video-player): settings + combined snapshot + per-site pause + live page-state push.
  getVideoPlayerSettings: () => invoke<VideoPlayerSettings>(IpcChannels.videoPlayerGet),
  setVideoPlayerSettings: (patch: Partial<VideoPlayerSettings>) =>
    invoke<VideoPlayerSettings>(IpcChannels.videoPlayerSet, patch),
  getVideoPlayerState: () => invoke<VideoPlayerState>(IpcChannels.videoPlayerState),
  setVideoPlayerSiteEnabled: (origin: string, enabled: boolean) =>
    invoke<VideoPlayerSettings>(IpcChannels.videoPlayerSiteSet, { origin, enabled }),
  onVideoPlayerPageState: (callback: (state: VideoPlayerPageState | null) => void) => {
    const listener = (_event: unknown, state: VideoPlayerPageState | null): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.videoPlayerPageState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.videoPlayerPageState, listener);
    };
  },
  // File operations (Settings → File operations). The grant list rides on preferences; only the native
  // folder picker needs a bridge method (AI-driven consent reuses the agent HITL modal).
  pickFileAccessFolder: () => invoke<FileAccessFolderPickResult>(IpcChannels.fileAccessPickFolder),
  // New-tab background image: native picker (bytes stored in the blob store) + ref → data: URL resolver.
  pickNewTabBackgroundImage: () =>
    invoke<NewTabBackgroundImagePick>(IpcChannels.newtabPickBackgroundImage),
  getNewTabBackgroundImage: (ref: string) =>
    invoke<string | null>(IpcChannels.newtabGetBackgroundImage, ref),
};

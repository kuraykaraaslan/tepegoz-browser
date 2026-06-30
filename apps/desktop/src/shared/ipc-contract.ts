/**
 * Typed IPC contract (internal-ai-rules / electron-desktop-security): the preload exposes ONLY a
 * small, named, typed API — never raw ipcRenderer. Channels are named `domain:action`.
 *
 * NOTE: this file is imported by the SANDBOXED preload, so it must stay dependency-free (no zod —
 * a sandboxed preload cannot `require` external npm modules). Runtime schemas live in `ipc-schemas.ts`
 * and `main/preferences/preferences.model.ts` (main-process only).
 */
export const IpcChannels = {
  appGetInfo: 'app:get-info',
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  credentialsStatus: 'credentials:status',
  credentialsSet: 'credentials:set',
  credentialsRemove: 'credentials:remove',
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximize-toggle',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export type ThemePref = 'system' | 'light' | 'dark';
export type LocalePref = 'system' | 'en' | 'tr';
export type ProviderId = 'anthropic' | 'openai' | 'gemini';

export interface Preferences {
  theme: ThemePref;
  locale: LocalePref;
  telemetryEnabled: boolean;
  /** Cost-saver: route simple capabilities to the local SLM (real routing lands in Phase 1b). */
  useLocalModelForSimpleTasks: boolean;
  defaultProvider: ProviderId;
}

/** Per-provider "is a key stored" flags — NEVER the keys themselves. */
export type ProviderKeyStatus = Record<ProviderId, boolean>;

export interface CredentialsStatus {
  /** Whether the OS keychain (safeStorage) can encrypt on this device. */
  encryptionAvailable: boolean;
  providers: ProviderKeyStatus;
}

/** The exact surface bridged to `window.tepegoz` in the renderer. */
export interface TepegozApi {
  getAppInfo(): Promise<AppInfo>;
  getPreferences(): Promise<Preferences>;
  updatePreferences(patch: Partial<Preferences>): Promise<Preferences>;
  getCredentialsStatus(): Promise<CredentialsStatus>;
  /** Renderer → main only (user-entered key). The raw key never flows back to the renderer. */
  setProviderKey(provider: ProviderId, apiKey: string): Promise<CredentialsStatus>;
  removeProviderKey(provider: ProviderId): Promise<CredentialsStatus>;
  // Custom window chrome (frameless): caption controls.
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  isWindowMaximized(): Promise<boolean>;
  /** Subscribe to maximize/restore state changes; returns an unsubscribe function. */
  onWindowMaximizedChange(callback: (maximized: boolean) => void): () => void;
  readonly platform: string;
}

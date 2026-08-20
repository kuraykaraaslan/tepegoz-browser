/**
 * App / preferences / credentials / window-chrome slice of {@link TepegozApi}. Type-only imports
 * (including the type-only circular import with `contract.ts`) keep this dependency-free for the
 * sandboxed preload. Composed into the full surface by `api.ts`.
 */
import type { AppInfo, CredentialsStatus, ProviderId, ProviderKeyMeta } from './contract';
import type { PublicSettings } from './public-settings';
import type { Preferences } from './preferences-types';

export interface AppApi {
  getAppInfo(): Promise<AppInfo>;
  getPreferences(): Promise<Preferences>;
  updatePreferences(patch: Partial<Preferences>): Promise<Preferences>;
  /** Reset all preferences to defaults. Encrypted credentials (the vault) are NOT affected. */
  resetPreferences(): Promise<Preferences>;
  /** Finish the first-run welcome flow and load the normal browser chrome. */
  completeOnboarding(): Promise<void>;
  /** The curated PUBLIC settings snapshot exposed to extensions (read-only; never carries secrets). */
  getPublicSettings(): Promise<PublicSettings>;
  /** Subscribe to public-settings changes; returns an unsubscribe function (like `onTabsState`). */
  onPublicSettingsChanged(callback: (settings: PublicSettings) => void): () => void;
  getCredentialsStatus(): Promise<CredentialsStatus>;
  /** Every stored key's metadata (no secret). Any number of keys per provider. */
  listCredentials(): Promise<ProviderKeyMeta[]>;
  /** Renderer → main only (user-entered key). The raw key never flows back to the renderer. A new key
   *  starts on auto; its model is pinned afterwards with {@link AppApi.setProviderKeyModel}. */
  addProviderKey(provider: ProviderId, label: string, apiKey: string): Promise<CredentialsStatus>;
  /** Remove one stored key by its id. */
  removeProviderKeyById(id: string): Promise<CredentialsStatus>;
  /** Rename one stored key by its id (label only — the secret is untouched). */
  renameProviderKey(id: string, label: string): Promise<CredentialsStatus>;
  /** Pin the model one stored key runs with ('' = auto). Applies when that key is its provider's
   *  highest-priority one — the key a run actually resolves to. */
  setProviderKeyModel(id: string, model: string): Promise<CredentialsStatus>;
  /** Reorder all keys (drag-drop priority). The top key's provider becomes the default provider. */
  reorderProviderKeys(orderedIds: string[]): Promise<CredentialsStatus>;
  // Custom window chrome (frameless): caption controls.
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  isWindowMaximized(): Promise<boolean>;
  /** Subscribe to maximize/restore state changes; returns an unsubscribe function. */
  onWindowMaximizedChange(callback: (maximized: boolean) => void): () => void;
}

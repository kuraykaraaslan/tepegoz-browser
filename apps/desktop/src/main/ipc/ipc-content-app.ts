import { app, BrowserWindow } from 'electron';
import {
  IpcChannels,
  type AIAdaptor,
  type AdaptorConnection,
  type AppInfo,
  type CredentialsStatus,
  type DefaultBrowserStatus,
  type ExtensionManifestWire,
  type McpServerStatusInfo,
  type Preferences,
  type ProviderKeyMeta,
  type PublicSettings,
} from '@tepegoz/desktop-ipc';
import {
  AddProviderKeyInputSchema,
  AppInfoSchema,
  RemoveKeyByIdSchema,
  RenameProviderKeyInputSchema,
  ReorderKeysSchema,
  SetProviderKeyModelSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { PROVIDER_MODEL_CATALOG } from '@tepegoz/model-gateway';
import { AppError } from '@tepegoz/libs';
import type { AIProvider } from '@tepegoz/shared-types';
import McpService from '../mcp/supervisor.electron';
import ExtensionCapabilityService from '../extensions/capability-supervisor.electron';
import FileOperationsHost from '../file-operations/file-operations-host';
import { DEFAULT_PREFERENCES, PreferencesPatchSchema } from '@tepegoz/preferences';
import { mainLocale } from '../lib/i18n-main';
import { buildAdaptorConnections, buildAiAdaptors } from '../agent/ai-adaptors';
import { getPublicSettings, broadcastPublicSettings } from '../settings/public-settings-host';
import CredentialVault from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { completeOnboarding } from '../browser-windows';
import adblockHost from '../extensions/adblock-host.electron';
import typoHost from '../extensions/typo-host.electron';
import translateHost from '../extensions/translate-host.electron';
import { builtinManifests } from '../../shared/extensions';
import { handle } from './ipc-helpers';
import { applyChromeGlass, isMicaSupported } from '../lib/glass';
import { setLaunchAtLogin } from '../launch-at-login';
import { getDefaultBrowserStatus, setAsDefaultBrowser } from '../default-browser';
import { refreshTray } from '../tray';
import { refreshApplicationMenu } from '../menus/application-menu';

/**
 * App info/preferences + public settings + onboarding + MCP/AI-adaptors/extensions + credentials
 * IPC handlers (extracted from `ipc-content.ts`, ADR-0010 250-line cap).
 */

function credentialsStatus(): CredentialsStatus {
  return {
    encryptionAvailable: CredentialVault.isEncryptionAvailable(),
    providers: CredentialVault.status(),
    keys: CredentialVault.listMeta(),
  };
}

/**
 * A per-key model pin is only meaningful if the RUNTIME can actually route to it, so the id must be one
 * the provider's catalog lists (the same list the picker is built from). '' = auto/tiered routing.
 * Rejecting here — at the trust boundary — keeps an unroutable id out of the vault entirely.
 */
function assertModelInCatalog(provider: AIProvider, model: string): void {
  if (model === '') return;
  if (!PROVIDER_MODEL_CATALOG[provider].some((m) => m.id === model)) {
    throw new AppError(`Unknown model '${model}' for provider '${provider}'.`, 400);
  }
}

/**
 * Keep `defaultProvider` in sync with the credential vault's key ORDER: the provider of the top
 * (highest-priority) key is the default. Called after any add/remove/reorder. Re-broadcasts public
 * settings (defaultProvider is public) when it actually changes. No-op when there are no keys.
 */
function syncDefaultProviderFromKeys(): void {
  const top = CredentialVault.topProvider();
  if (top === null) return;
  if (PreferenceStore.getAll().defaultProvider !== top) {
    PreferenceStore.update({ defaultProvider: top });
    broadcastPublicSettings();
  }
}

/** Register app-info/preferences/public-settings/onboarding/MCP/adaptors/extensions/credentials
 *  IPC handlers. */
export function registerAppIpc(): void {
  handle(IpcChannels.appGetInfo, (): AppInfo =>
    AppInfoSchema.parse({
      name: 'Tepegöz',
      version: app.getVersion(),
      platform: process.platform,
      glassAvailable: isMicaSupported(),
    }),
  );

  handle(IpcChannels.defaultBrowserGet, (): DefaultBrowserStatus => getDefaultBrowserStatus());

  handle(IpcChannels.defaultBrowserSet, (): DefaultBrowserStatus => setAsDefaultBrowser());

  handle(IpcChannels.prefsGet, (): Preferences => PreferenceStore.getAll());

  handle(IpcChannels.prefsSet, (_event, payload): Preferences => {
    const validated = PreferencesPatchSchema.parse(payload);
    const next = PreferenceStore.update(validated);
    // MCP servers or extension enablement may have changed — re-sync the supervisor's connected set.
    if (validated.mcpServers !== undefined || validated.extensions !== undefined) {
      void McpService.reconcile();
    }
    // Extension enablement also gates in-process agent capabilities (ADR-0021).
    if (validated.extensions !== undefined) {
      ExtensionCapabilityService.reconcile();
    }
    // File-access whitelist or master switch changed — re-sync the live FileAccessPolicy.
    if (validated.fileAccessGrants !== undefined || validated.fileOperationsEnabled !== undefined) {
      FileOperationsHost.reconcile();
    }
    if (validated.adblock !== undefined) {
      adblockHost.init();
    }
    if (validated.typo !== undefined) {
      typoHost.init();
    }
    if (validated.translate !== undefined) {
      translateHost.init();
    }
    // Launch-at-login toggled — register/unregister the OS login item (Win Run key / mac login item /
    // Linux XDG autostart), always with the background launcher so boot starts hidden + rendering.
    if (validated.launchAtLogin !== undefined) {
      setLaunchAtLogin(next.launchAtLogin);
    }
    // Glass toggled — apply the Mica backdrop live to every top-level chrome window (popups are children
    // and stay opaque). setBackgroundMaterial/setBackgroundColor take effect without recreating windows.
    if (validated.glassChrome !== undefined) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.getParentWindow() === null) applyChromeGlass(w, next.glassChrome);
      }
    }
    // Locale changed — the NATIVE surfaces do not re-render themselves. `refreshTray` was written for
    // exactly this and had never been called by anything (its own comment said "called from the prefs
    // reconcile"; nothing did), so switching to Turkish left the tray menu in English until restart.
    // The macOS application menu has the same problem, hence both here.
    if (validated.locale !== undefined) {
      refreshTray();
      refreshApplicationMenu();
    }
    // Any change may touch a PUBLIC setting (theme/locale/etc.) — push the fresh snapshot to
    // subscribed extensions. The projection ignores private keys, so this never leaks them.
    broadcastPublicSettings();
    return next;
  });

  handle(IpcChannels.publicSettingsGet, (): PublicSettings => getPublicSettings());

  handle(IpcChannels.prefsReset, (): Preferences => {
    // Merging the full defaults over the current prefs resets every field. Credentials live in the
    // vault (not preferences), so they are untouched. Reconcile downstream services + re-broadcast.
    const next = PreferenceStore.update(DEFAULT_PREFERENCES);
    void McpService.reconcile();
    ExtensionCapabilityService.reconcile();
    adblockHost.init();
    typoHost.init();
    translateHost.init();
    // A reset can change the locale back to the default, so the native surfaces need it too.
    refreshTray();
    refreshApplicationMenu();
    broadcastPublicSettings();
    return next;
  });

  handle(IpcChannels.onboardingComplete, (event): void => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win !== null) completeOnboarding(win);
  });

  handle(IpcChannels.mcpGetStatus, (): McpServerStatusInfo[] => McpService.getStatus());

  handle(IpcChannels.adaptorsList, (): AdaptorConnection[] =>
    buildAdaptorConnections(mainLocale()),
  );

  // The live AIAdaptor inventory for the Settings "run locally" list — system + extension + MCP groups
  // built from the single CapabilityRegistry, so the list needs no maintenance as tools change.
  handle(IpcChannels.aiAdaptorsList, (): AIAdaptor[] => buildAiAdaptors(mainLocale()));

  // Built-in extension identity for the renderer (it pairs each with lazily-loaded surfaces + icon).
  // Read-only, trusted direction; `mcpServer` is stripped — the renderer never needs it.
  handle(IpcChannels.extensionsListManifests, (): ExtensionManifestWire[] =>
    builtinManifests().map((m) => ({
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description,
      icon: m.icon,
      surfaces: m.surfaces,
      actions: m.actions,
      labels: m.labels,
      permissions: m.permissions,
    })),
  );

  handle(IpcChannels.credentialsStatus, (): CredentialsStatus => credentialsStatus());

  handle(IpcChannels.credentialsList, (): ProviderKeyMeta[] => CredentialVault.listMeta());

  handle(IpcChannels.credentialsAdd, (_event, payload): CredentialsStatus => {
    const { provider, label, apiKey } = AddProviderKeyInputSchema.parse(payload);
    CredentialVault.addKey(provider, label, apiKey);
    // The first key ever added becomes the top key → sync the default provider to it.
    syncDefaultProviderFromKeys();
    return credentialsStatus();
  });

  handle(IpcChannels.credentialsRemoveById, (_event, payload): CredentialsStatus => {
    const { keyId } = RemoveKeyByIdSchema.parse(payload);
    CredentialVault.removeKey(keyId);
    // Removing the top key promotes the next one → re-sync the default provider.
    syncDefaultProviderFromKeys();
    return credentialsStatus();
  });

  handle(IpcChannels.credentialsRename, (_event, payload): CredentialsStatus => {
    const { keyId, label } = RenameProviderKeyInputSchema.parse(payload);
    CredentialVault.renameKey(keyId, label);
    return credentialsStatus();
  });

  handle(IpcChannels.credentialsSetModel, (_event, payload): CredentialsStatus => {
    const { keyId, model } = SetProviderKeyModelSchema.parse(payload);
    const meta = CredentialVault.listMeta().find((k) => k.id === keyId);
    if (meta === undefined) {
      throw new AppError('Key not found.', 404, 'keyNotFound');
    }
    assertModelInCatalog(meta.provider, model);
    CredentialVault.setKeyModel(keyId, model);
    return credentialsStatus();
  });

  handle(IpcChannels.credentialsReorder, (_event, payload): CredentialsStatus => {
    const { orderedIds } = ReorderKeysSchema.parse(payload);
    CredentialVault.reorderKeys(orderedIds);
    // The new top key defines the default provider.
    syncDefaultProviderFromKeys();
    return credentialsStatus();
  });
}

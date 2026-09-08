import { app, BrowserWindow, clipboard, shell, webContents } from 'electron';
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
  type PreferencesImportResult,
  type ProviderKeyMeta,
  type PublicSettings,
} from '@tepegoz/desktop-ipc';
import {
  AddProviderKeyInputSchema,
  AppInfoSchema,
  PreferencesImportJsonSchema,
  RemoveKeyByIdSchema,
  RenameProviderKeyInputSchema,
  ReorderKeysSchema,
  SetProviderKeyModelSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { PROVIDER_MODEL_CATALOG, providerRegions } from '@tepegoz/model-gateway';
import { AppError } from '@tepegoz/libs';
import { AI_PROVIDERS, type AIProvider } from '@tepegoz/shared-types';
import McpService from '../mcp/supervisor.electron';
import ExtensionCapabilityService from '../extensions/capability-supervisor.electron';
import FileOperationsHost from '../file-operations/file-operations-host';
import {
  DEFAULT_PREFERENCES,
  parsePreferencesImport,
  PreferencesPatchSchema,
} from '@tepegoz/preferences';
import { mainLocale, mainStrings } from '../lib/i18n-main';
import { buildAppInfo, diagnosticsText, thirdPartyNoticesPath } from '../lib/app-info';
import { reapplyZoomEverywhere } from '../site-zoom';
import { buildAdaptorConnections, buildAiAdaptors } from '../agent/ai-adaptors';
import { getPublicSettings, broadcastPublicSettings } from '../settings/public-settings-host';
import CredentialVault from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { completeOnboarding } from '../browser-windows';
import adblockHost from '../extensions/adblock-host.electron';
import typoHost from '../extensions/typo-host.electron';
import translateHost from '../extensions/translate-host.electron';
import { builtinManifests } from '../../shared/extensions';
import { handle, parsePayload } from './ipc-helpers';
import { applyChromeGlass, isMicaSupported } from '../lib/glass';
import { applyNativeThemeSource, resolveSurfaceTheme } from '../lib/surface-theme';
import { applyStrictGuard } from './strict-guard';
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
    // Region options for the add-key picker — only the multi-endpoint providers appear; `baseURL`
    // stays main-side (resolved by the runtime), the renderer sees just `{ id, label }`.
    regions: Object.fromEntries(
      AI_PROVIDERS.map(
        (p) => [p, providerRegions(p).map((r) => ({ id: r.id, label: r.label }))] as const,
      ).filter(([, opts]) => opts.length > 0),
    ),
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

/**
 * Reconcile every downstream service after a change that could have touched ANY preference key — a
 * reset, or an import. The per-key `prefs:set` fan-out cannot be reused here because it keys each
 * reconcile off "was this key in the patch"; a bulk write has no such patch to inspect, so it runs
 * the full set. Credentials are never in preferences, so the vault is not part of this.
 */
function reconcileAfterBulkPreferenceChange(): void {
  void McpService.reconcile();
  ExtensionCapabilityService.reconcile();
  adblockHost.init();
  typoHost.init();
  translateHost.init();
  applyNativeThemeSource();
  applyStrictGuard();
  refreshTray();
  refreshApplicationMenu();
  broadcastPublicSettings();
}

/** Register app-info/preferences/public-settings/onboarding/MCP/adaptors/extensions/credentials
 *  IPC handlers. */
export function registerAppIpc(): void {
  handle(IpcChannels.appGetInfo, (): AppInfo =>
    AppInfoSchema.parse(buildAppInfo(isMicaSupported())),
  );

  // Diagnostics: main composes AND copies. The renderer supplies no text, so this channel cannot be
  // used to write arbitrary content to the user's clipboard — the only thing it can put there is this
  // build's own version block.
  handle(IpcChannels.appCopyDiagnostics, (): string => {
    const text = diagnosticsText(buildAppInfo(isMicaSupported()), mainLocale());
    clipboard.writeText(text);
    return text;
  });

  handle(IpcChannels.appOpenThirdPartyNotices, async (): Promise<boolean> => {
    const path = thirdPartyNoticesPath();
    if (path === null) return false;
    // `openPath` resolves to a non-empty error string on failure — a file that exists but cannot be
    // opened is still a click that did nothing, so it reports the same `false` as a missing file.
    const err = await shell.openPath(path);
    return err === '';
  });

  // The profile directory: preferences, the database, downloaded models, logs. Everything the app
  // keeps about this user lives there, and until now nothing in the UI would show them where.
  handle(IpcChannels.appOpenDataFolder, async (): Promise<boolean> => {
    return (await shell.openPath(app.getPath('userData'))) === '';
  });

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
    // A new default zoom that only took effect on the next navigation would read as a broken setting.
    if (validated.defaultPageZoom !== undefined) {
      reapplyZoomEverywhere(webContents.getAllWebContents());
    }
    // Theme mode changed — push it into Chromium so browsed pages, native form controls, scrollbars
    // and the PDF viewer follow the choice instead of the OS scheme. Without this branch the picker
    // themes the chrome only. `resolveSurfaceTheme` (native popup first paint) reads the same pref.
    if (validated.theme !== undefined) {
      applyNativeThemeSource();
    }
    // "Hardened reading" toggled from Settings — reconcile the process-global inbound guard now.
    // The agent panel's own setter already does this; going through `prefs:set` did not, so the
    // Settings toggle stayed inert until the next app start.
    if (validated.agentStrictGuard !== undefined) {
      applyStrictGuard();
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
    // Glass OR the theme changed — re-apply the backdrop live to every top-level chrome window (popups
    // are children, and each is created fresh with the resolved colour). setBackgroundMaterial/
    // setBackgroundColor take effect without recreating windows.
    //
    // The theme belongs in this condition because the non-glass fill is the window's PRE-PAINT ground:
    // leave it on the colour that was current at launch and the next reload/resize flashes the old
    // theme through before the renderer repaints.
    if (
      validated.glassChrome !== undefined ||
      validated.theme !== undefined ||
      validated.themeColor !== undefined
    ) {
      const ground = resolveSurfaceTheme().color;
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.getParentWindow() === null) {
          applyChromeGlass(w, next.glassChrome, ground);
        }
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
    reconcileAfterBulkPreferenceChange();
    return next;
  });

  handle(IpcChannels.settingsExport, (): string =>
    // No secrets: API keys are in the keychain-sealed vault, not here. Main only stringifies — the
    // untrusted renderer does the Blob download (same split as bookmarks / history / password export).
    JSON.stringify(PreferenceStore.getAll(), null, 2),
  );

  handle(IpcChannels.settingsImport, (_event, payload): PreferencesImportResult => {
    const json = parsePayload(PreferencesImportJsonSchema, payload);
    let split: ReturnType<typeof parsePreferencesImport>;
    try {
      split = parsePreferencesImport(json);
    } catch {
      // Not JSON, or JSON that is not an object — there is nothing to apply. A malformed file is a
      // bad request, mapped to the same generic 400 as any other rejected renderer payload.
      throw new AppError(mainStrings().errors.badRequest, 400);
    }
    const applied = Object.keys(split.patch).length;
    if (applied > 0) {
      // Same fan-out as a reset: a bulk write can move theme, locale, strict-guard, extension
      // enablement — none of which the live process follows off the preference on its own.
      PreferenceStore.update(split.patch);
      reconcileAfterBulkPreferenceChange();
    }
    return { applied, skipped: split.skipped };
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
    const { provider, label, apiKey, region } = AddProviderKeyInputSchema.parse(payload);
    // Only an id this provider actually offers reaches the vault — a stale/foreign id is dropped to ''
    // (the default endpoint) rather than persisted as an unroutable region.
    const validRegion =
      region !== undefined && providerRegions(provider).some((r) => r.id === region)
        ? region
        : undefined;
    CredentialVault.addKey(provider, label, apiKey, validRegion);
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

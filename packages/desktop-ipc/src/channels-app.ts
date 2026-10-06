/**
 * App, preferences, trust profiles, profile, credential and window chrome channels. Part of `IpcChannels` (see `channels.ts`); dependency-free
 * because the SANDBOXED preload imports it.
 */
export const ipcChannelsApp = {
  appGetInfo: 'app:get-info',
  /**
   * Put the version/engine/build block on the clipboard for a bug report. MAIN composes the text and
   * the renderer sends nothing: the narrowest possible channel, and the only one that guarantees the
   * pasted report describes the build that actually ran rather than whatever a renderer typed.
   */
  appCopyDiagnostics: 'app:copy-diagnostics',
  /** Open the shipped Chromium/third-party notices file. Resolves `false` when the build has none. */
  appOpenThirdPartyNotices: 'app:open-third-party-notices',
  /** Open the profile directory — preferences, the database, downloaded models, logs. */
  appOpenDataFolder: 'app:open-data-folder',
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  /** Restore all preferences to their defaults (does NOT touch the encrypted credential vault). */
  prefsReset: 'prefs:reset',
  /** The whole `preferences.json` as pretty-printed JSON, for the user to save. No secrets — API keys
   *  live in the keychain-sealed vault, not here — so a plain JSON export is safe and re-importable. */
  settingsExport: 'settings:export',
  /** Renderer→main: the JSON text of a previously exported file. Main `JSON.parse`s it and validates
   *  each key against the preferences schema individually, applying only the keys that pass. */
  settingsImport: 'settings:import',
  /** Finish first-run onboarding and switch the window into the normal browser chrome. */
  onboardingComplete: 'onboarding:complete',
  // Curated public settings exposed to extensions (read-only). `changed` is a main→renderer push.
  publicSettingsGet: 'public-settings:get',
  publicSettingsChanged: 'public-settings:changed',
  // Scoped Trust Profiles — the standing per-site posture the Policy Kernel applies. Read/write only:
  // the renderer names a domain and a level, main decides what that level is allowed to mean.
  trustProfilesList: 'trust-profiles:list',
  trustProfilesSet: 'trust-profiles:set',
  trustProfilesRemove: 'trust-profiles:remove',
  /** A profile's reusable part only (domain + level, no sync metadata, no tombstoned rows) as one JSON
   *  string the renderer downloads via Blob — same split as `tasksExport`/`macrosExport`. */
  trustProfilesExport: 'trust-profiles:export',
  /** Renderer→main: the JSON text of a previously exported trust-profiles file. Main validates every
   *  entry (`TrustProfileImportEntrySchema`) and applies the ones that pass through the exact same
   *  `setTrustProfile` a manual level change uses — never a parallel write. */
  trustProfilesImport: 'trust-profiles:import',
  // Chrome-style multi-profile identities (ADR-0045). `getActive` is this process's own profile
  // (process-per-profile); `switch` and `create`-then-switch spawn / focus that profile's process.
  profilesList: 'profiles:list',
  profilesGetActive: 'profiles:get-active',
  profilesCreate: 'profiles:create',
  profilesRename: 'profiles:rename',
  profilesDelete: 'profiles:delete',
  profilesSwitch: 'profiles:switch',
  credentialsStatus: 'credentials:status',
  credentialsList: 'credentials:list',
  credentialsAdd: 'credentials:add',
  credentialsRemoveById: 'credentials:remove-by-id',
  credentialsRename: 'credentials:rename',
  /** Pin the model ONE stored key runs with ('' = auto/tiered routing). */
  credentialsSetModel: 'credentials:set-model',
  /** Reorder keys (drag-and-drop priority); the top key's provider becomes the default. */
  credentialsReorder: 'credentials:reorder',
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximize-toggle',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
  /** Default-browser registration (Phase 2b): read the OS's current http/https handler, or ask to
   *  become it. Both go through main because `app.setAsDefaultProtocolClient` is a main-process API. */
  defaultBrowserGet: 'default-browser:get',
  defaultBrowserSet: 'default-browser:set',
} as const;

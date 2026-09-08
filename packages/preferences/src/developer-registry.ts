import type { Preferences } from '@tepegoz/desktop-ipc';

/**
 * Per-key metadata for the **Developer settings** surface ([ADR-0041](../../../docs/adr/0041-developer-settings-surface.md),
 * track `docs/tracks/developer-settings-surface.md` — Tier A).
 *
 * The raw editor lists every top-level `Preferences` key flat, with no sense of which knobs are safe to
 * touch, which need a relaunch, and which are internal bookkeeping that a human should never hand-edit.
 * This registry is that missing context, as **one tested source** rather than scattered `if (key === …)`
 * checks in the component.
 *
 * `PREFERENCE_METADATA` is pinned with `satisfies Record<keyof Preferences, PreferenceMeta>`, so adding
 * a preference to the schema without classifying it here is a **compile error**, not a silently
 * unclassified row. The reverse (a stale row for a removed key) is caught by the completeness test.
 */

/**
 * How settled a preference is.
 *
 * - `stable` — an ordinary knob with a real Settings surface; editing it here is just a shortcut.
 * - `experimental` — wired but not finished for v1 (e.g. on-device model routing lands in Phase 1b);
 *   the value is honoured but the behaviour behind it may change.
 * - `internal` — bookkeeping the app maintains for itself (one-time seed sentinels, derived mirrors,
 *   restored window geometry). Hand-editing one of these does nothing useful and can desync app state.
 */
export type PreferenceStability = 'stable' | 'experimental' | 'internal';

export interface PreferenceMeta {
  readonly stability: PreferenceStability;
  /**
   * `true` when the value is read once at process startup (before `app.whenReady()` for Chromium
   * switches, or in a boot module for app-level ones), so a change only takes effect after a relaunch.
   * Drives the "restart to apply" hint in the editor.
   */
  readonly restartRequired: boolean;
}

const stable: PreferenceMeta = { stability: 'stable', restartRequired: false };
const stableRestart: PreferenceMeta = { stability: 'stable', restartRequired: true };
const experimental: PreferenceMeta = { stability: 'experimental', restartRequired: false };
const internal: PreferenceMeta = { stability: 'internal', restartRequired: false };

export const PREFERENCE_METADATA = {
  theme: stable,
  themeColor: stable,
  locale: stable,
  telemetryEnabled: stable,
  useLocalModelForSimpleTasks: experimental,
  // On-device inference is a Phase-1a no-op placeholder; real local routing activates in Phase 1b.
  localProvider: experimental,
  localActions: experimental,
  agentProviderOverride: stable,
  agentModelOverride: stable,
  agentAutonomy: stable,
  agentEffort: stable,
  agentStrictGuard: stable,
  agentTokenQuota: stable,
  // Derived by main from the credential vault's key order — no UI, and a hand-edit is overwritten.
  defaultProvider: internal,
  region: stable,
  dateFormat: stable,
  searchEngineId: stable,
  // First-run welcome sentinel.
  onboardingCompleted: internal,
  customSearchEngines: stable,
  networkConnections: stable,
  networkGeneralBinding: stable,
  networkBinaries: stable,
  homepageUrl: stable,
  showBookmarksBar: stable,
  newTabShortcuts: stable,
  newTabBackground: stable,
  downloadDirectory: stable,
  downloadAskEachTime: stable,
  clearOnExit: stable,
  downloadHistoryRetention: stable,
  showDownloadsWhenDone: stable,
  // Read once at startup, before `whenReady` (crash-reporter-boot.ts).
  crashReportingEnabled: stableRestart,
  extensions: stable,
  pinnedExtensions: stable,
  userAgent: stable,
  mcpServers: stable,
  notificationsEnabled: stable,
  sitePermissions: stable,
  siteZoomFactors: stable,
  popupBlocker: stable,
  adblock: stable,
  safeBrowsingEnabled: stable,
  typo: stable,
  translate: stable,
  videoPlayer: stable,
  // One-time seed sentinels, set by the main-process host.
  popupBlockerSeeded: internal,
  fileOperationsEnabled: stable,
  fileAccessGrants: stable,
  fileAccessSeeded: internal,
  glassChrome: stable,
  // Restored window placement — rewritten on every move/resize.
  windowBounds: internal,
  closeToTray: stable,
  keepAwakeInTray: stable,
  pauseTasksOnSleep: stable,
  startupMode: stable,
  kioskUrl: stable,
  launchAtLogin: stable,
  // One-time tray hint sentinel.
  trayHintShown: internal,
  tabDiscardEnabled: stable,
  // GPU compositing — Chromium decides this once, at startup (hardware-acceleration-boot.ts).
  hardwareAccelerationEnabled: stableRestart,
  defaultPageZoom: stable,
  reduceMotion: stable,
  tabDiscardIdleMinutes: stable,
  // Chromium reads command-line switches only at startup; the flags card already says "relaunch".
  chromiumFlags: stableRestart,
} as const satisfies Record<keyof Preferences, PreferenceMeta>;

const DEFAULT_META: PreferenceMeta = stable;

/**
 * Metadata for one preference key. Falls back to `stable` / no-restart for a key that reached the
 * schema before it was classified here — the same fail-*open* choice the visibility map makes for a
 * brand-new key, because an unclassified knob is not a security decision the way an unclassified
 * public projection is.
 */
export function preferenceMeta(key: keyof Preferences): PreferenceMeta {
  return PREFERENCE_METADATA[key] ?? DEFAULT_META;
}

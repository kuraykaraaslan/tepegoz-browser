import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { Logger } from '@tepegoz/libs';
import { applyChromiumSwitches } from './chromium-flags-boot';
import { applyHardwareAccelerationPreference } from './hardware-acceleration-boot';
import { applyCrashReporterPreference } from './crash-reporter-boot';
import {
  armHealthTimer,
  beginLaunch,
  isSafeMode,
  previousLaunchCrashed,
} from './recovery/safe-mode';
import {
  notifyProfileReset,
  notifySafeMode,
  notifySessionRestored,
} from './recovery/recovery-notices';
import { installSecurity } from './security';
import { registerIpc } from './ipc';
import { initStores } from './stores.electron';
import { resolveAndPinProfile } from './profiles/profile-boot';
import { setProfilePartitionScope } from '@tepegoz/tab-engine';
import { applyNativeThemeSource } from './lib/surface-theme';
import { initHosts, openWindow } from './browser-windows';
import { initTray, revealAllWindows } from './tray';
import { installApplicationMenu } from './menus/application-menu';
import { getDb } from './db/database.electron';
import { settleClearOnExit } from './privacy/clear-on-exit.electron';
import TabManager from './tabs';
import { extractLaunchUrl } from './launch-url';
import { openPageContextMenu } from './menus/page-context-menu';
import {
  registerInternalPagesProtocol,
  registerInternalPagesScheme,
} from './internal-pages/protocol';
import { scheduleDeferredInit } from './deferred-init.electron';
import { initBrowsingNetwork } from './network-boot.electron';
import { registerPowerHooks } from './power-hooks-boot.electron';
import { registerQuitLifecycle } from './quit-lifecycle-boot.electron';

// Last-resort process-level hooks: an async error that escapes every boundary must be LOGGED, not a
// silent crash. Both are logged and survived — a stray error in a single main-process event handler
// (e.g. a tab's WebContents teardown listener) must never tear down the user's window(s)/app.
process.on('unhandledRejection', (reason) => {
  Logger.error('Unhandled promise rejection in main', { reason: String(reason) });
});
process.on('uncaughtException', (err) => {
  Logger.error('Uncaught exception in main', { err: String(err), stack: err.stack ?? '' });
});

// App-specific identity → userData at %APPDATA%/Tepegöz instead of the shared default "Electron" dir.
// This avoids cross-instance GPU/disk-cache contention ("Unable to move the cache: Access is denied").
app.setName('Tepegöz');
// Windows: bind an explicit AppUserModelID so the taskbar groups windows under our brand icon
// (and notifications are attributed to Tepegöz) rather than the default Electron identity.
if (process.platform === 'win32') app.setAppUserModelId('com.tepegoz.browser');

// `tepegoz://` internal-page scheme (Faz 0, phases/tracks/protocol-tepegoz-pages.md) — MUST run before
// app.whenReady() resolves; Electron only reads privileged-scheme registration once, at startup.
registerInternalPagesScheme();

// Process-per-profile (ADR-0045, docs/tracks/multi-profile-isolation.md): decide which profile THIS
// process is and pin `userData` to its own directory (`%APPDATA%/tepegoz/Profiles/<id>`), so EVERY
// later app.getPath('userData') — the stores, the SQLite DB, Chromium's partitions — resolves inside
// that one profile. This subsumes the old single-directory pin: it still carries the pre-rename
// "Tepegöz" settings over, still lets an explicit `--user-data-dir=…` win outright (the AI-1 eval
// harness isolates a run that way), and additionally runs the one-time flat → `Profiles/default/`
// migration and reads the registry's last-active pointer. MUST precede requestSingleInstanceLock()
// below, whose lock is keyed by the user-data dir and therefore yields one instance PER PROFILE.
const CURRENT_PROFILE_ID = resolveAndPinProfile();
// Every Chromium partition name this process builds is scoped to the profile from here on
// (`persist:tepegoz-profile-<id>` / `--app`), before any partition is materialized into a Session.
setProfilePartitionScope(CURRENT_PROFILE_ID);

// Crash counter + safe-mode decision (ADR-0038). MUST run here: after the userData pin (the record lives
// in that directory) and before anything else can fail, because every gate below asks `isSafeMode()` and
// a launch that crashes before this line would never be counted. The record is stamped "in flight" now
// and cleared either 60 s from now or on `before-quit` — see recovery/crash-counter.ts for why the
// presumption is inverted.
beginLaunch();

// Chromium command-line switches — the app's baseline (keep hidden/occluded surfaces compositing so a
// backgrounded tab the agent drives stays perceivable) plus the user's allowlisted flag overrides
// (Developer settings, dev-only — ADR-0041). MUST run before whenReady (Chromium reads switches once,
// at startup) and AFTER the userData pin above (the overrides are read from that dir's preferences.json).
// Trade-off of the baseline: no timer/occlusion throttling → higher idle CPU/battery (accepted for an
// agentic browser). See `chromium-flags-boot.ts` for the merge that keeps `enable-features` single.
applyChromiumSwitches(app);

// GPU compositing, same before-whenReady constraint and the same read-the-file-directly approach.
// Kept as its own call rather than folded into the switches above: this is not a command-line switch,
// it is an Electron API that must be invoked, and burying it in a function named for flags would hide
// the one setting on this screen that cannot take effect without a restart.
applyHardwareAccelerationPreference(app);

// Native crash reporter (ADR-0038 distribution infra). Same before-`whenReady` / read-the-file-
// directly constraint: the dump directory must be set before `crashReporter.start`, and
// `PreferenceStore.init` runs later. Opt-in, fails closed, local minidumps only — never uploaded.
applyCrashReporterPreference(app);

// Default-browser inbound routing (macOS): a link opened while Tepegöz is already running arrives here,
// not through argv. Registered at module scope (before `whenReady`) because Electron can fire `open-url`
// during a cold launch before the app is ready — in that case the URL is queued and picked up by the
// `whenReady` bootstrap below, the same way a Windows/Linux cold launch reads it from `process.argv`.
let pendingOpenUrl: string | null = null;
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (!/^https?:\/\//i.test(url)) return;
  if (!app.isReady() || TabManager.all().length === 0) {
    pendingOpenUrl = url;
    return;
  }
  TabManager.createTab(url);
  revealAllWindows();
});

// Single instance: a second launch focuses the existing window rather than fighting over the cache.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // A second launch reveals the app — restoring every window from the tray / minimize (close-to-tray
    // means the "missing" window is hidden, not gone), or opening a fresh one if somehow none exist.
    if (TabManager.all().length === 0) openWindow({ foreground: true });
    else revealAllWindows();
    // Default-browser inbound routing (Windows/Linux): the OS launches a SECOND process carrying the
    // clicked link as an argument; `requestSingleInstanceLock` hands it to the FIRST process as
    // `commandLine` instead of letting the second one open its own window. Without this, "open link in
    // Tepegöz" while Tepegöz is already running would just flash the existing window and go nowhere.
    const url = extractLaunchUrl(commandLine);
    if (url !== null) TabManager.createTab(url);
  });

  void app
    // `async` for one reason, and it is load-bearing: the clear-on-exit settle below must finish
    // before the first window exists. A window opening onto data the user asked to be rid of, even
    // for a frame, is the failure that setting is bought to prevent.
    .whenReady()
    .then(async () => {
      // macOS: the BrowserWindow `icon` is ignored (the dock uses the app bundle), so set it here
      // for dev/unpackaged runs. Windows/Linux get the brand icon via the window itself.
      // The embedded engine, logged once per run. ADR-0019 governs how quickly a Chromium security
      // bump is adopted; a claim about which engine shipped is only checkable if each run says so. This
      // line is what a crash report or a user's log is read against.
      Logger.info('Engine', {
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        node: process.versions.node,
        profile: CURRENT_PROFILE_ID,
      });

      if (process.platform === 'darwin') {
        app.dock?.setIcon(join(app.getAppPath(), 'resources', 'icon.png'));
      }

      installSecurity();
      // `protocol.handle` must be called after whenReady — see phases/tracks/protocol-tepegoz-pages.md.
      registerInternalPagesProtocol();
      initStores();
      // "Clear when the browser closes", settled before anything reads the profile: if the previous
      // session was killed rather than quit, its clear is owed and is done now. Then the marker is
      // armed for this session. Awaited — a window opening onto data the user asked to be rid of,
      // even for a frame, is the failure this setting exists to prevent.
      await settleClearOnExit(getDb());
      // Push the persisted theme mode into Chromium before the first window/tab, so browsed pages,
      // native form controls, scrollbars and the PDF viewer follow the Appearance choice — not just
      // the chrome. The prefs reconcile keeps it live after a change.
      applyNativeThemeSource();
      // Safe mode (ADR-0038 rung 3): `--safe-mode`, or two consecutive launches that died before proving
      // themselves healthy. It switches off the four subsystems most likely to be WHY they died —
      // extensions, the agent runtime, MCP, and session restore — and keeps everything the user needs to
      // fix the cause: the chrome, tabs, preferences, and the settings surface. Read once here so every
      // gate below reflects the same decision, and so the set of things it disables is readable in one
      // place rather than inferred from scattered calls.
      const safeMode = isSafeMode();
      initBrowsingNetwork(safeMode);
      registerIpc();
      // Composition root wires the page context menu to the tab layer's right-click signal. The tab
      // layer deliberately does not import the menu (that made it depend on its own consumer — see
      // `contextMenuObservers`), so this subscription is what makes right-click open anything at all.
      TabManager.onContextMenu((win, wc, params, viewBounds, nav) => {
        void openPageContextMenu(win, wc, params, viewBounds, nav);
      });
      initHosts();
      // Replaces Electron's DEFAULT menu, which bound Ctrl+Shift+I straight to its own
      // `toggleDevTools` role and so walked around the sensitive-site gate (see application-menu.ts).
      // Installed BEFORE the first window so that gate is never briefly bypassable during launch.
      installApplicationMenu();
      // Default-browser inbound routing, cold-launch case: the OS started Tepegöz FOR this link (Windows
      // passes it on `process.argv`; a macOS `open-url` that raced `whenReady` is queued above). Opening
      // with `tabs: 'none'` skips the ordinary session-restore/new-tab bootstrap so the window shows
      // exactly the page that was clicked, matching what every other default browser does.
      const launchUrl = pendingOpenUrl ?? extractLaunchUrl(process.argv);
      pendingOpenUrl = null;
      let chromeWindow: BrowserWindow;
      if (launchUrl !== null) {
        chromeWindow = openWindow({ tabs: 'none' });
        TabManager.forWindow(chromeWindow)?.createTab(launchUrl);
      } else {
        chromeWindow = openWindow();
      }
      // What just happened, if anything worth saying happened. Both are silent on an ordinary launch:
      // safe mode announces itself because half the browser is missing, and the restore notice appears
      // only after an UNCLEAN shutdown — carrying the Undo that makes always-restoring safe to do
      // without Chrome's blocking "Restore pages?" dialog (ADR-0038).
      notifySafeMode(chromeWindow);
      notifyProfileReset(chromeWindow);
      if (previousLaunchCrashed()) notifySessionRestored(chromeWindow);
      // A launch still alive a minute from now clears the crash counter, so today's rough start does not
      // count against tomorrow's.
      armHealthTimer();
      // The system-tray icon (close-to-tray target) — created once, after the first window exists.
      initTray();

      // ── Deferred init ─────────────────────────────────────────────────────────────────────────────
      // Everything the FIRST PAINT does not need. It runs the moment the chrome reports its first real
      // layout (`chrome-ready.ts`) — i.e. in PARALLEL with the renderer parsing its bundle and mounting
      // — with a wall-clock fallback so a renderer that never signals still ends up with a fully-armed
      // browser. Ordering within it is preserved from when this was one straight-line block.
      scheduleDeferredInit(safeMode);

      // Sleep/resume hooks (see power-hooks-boot.electron.ts).
      registerPowerHooks();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          openWindow();
        }
      });
    })
    .catch((err: unknown) => {
      Logger.error('Failed to start Tepegöz', { err: String(err) });
    });

  registerQuitLifecycle();
}

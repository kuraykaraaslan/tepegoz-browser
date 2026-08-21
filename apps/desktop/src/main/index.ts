import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, powerMonitor } from 'electron';
import { KEEP_RENDERING_SWITCHES, Logger } from '@tepegoz/libs';
import { installSecurity } from './security';
import { abortActiveAgentRuns, registerIpc } from './ipc';
import { registerBasicAuthHandler } from './auth/basic-auth-broker';
import { registerCertificateHandler } from './auth/certificate-broker';
import { initStores } from './stores.electron';
import { initHosts, openWindow } from './browser-windows';
import { initTray, revealAllWindows } from './tray';
import { isQuitting, markQuitting } from './quit-state';
import { emitSystemPause, emitSystemResume } from './power-lifecycle';
import PreferenceStore from '@tepegoz/preferences';
import { closeDatabase } from './db/database.electron';
import TabManager from './tabs';
import { openPageContextMenu } from './menus/page-context-menu';
import BrowsingSessions from './network/browsing-sessions.electron';
import ConnectionPool from './network/connection-pool.electron';
import BindingService from './network/binding-service.electron';
import { broadcastNetworkState } from './ipc/ipc-network';
import PopupWindowManager from './popup-window';
import McpService from './mcp/supervisor.electron';
import ExtensionCapabilityService from './extensions/capability-supervisor.electron';
import ActionInterceptorService from './extensions/action-interceptors.electron';
import popupBlockerHost from './extensions/popup-blocker-host.electron';
import userAgentHost from './extensions/user-agent-host.electron';
import adblockHost from './extensions/adblock-host.electron';
import AdblockEngineService from './extensions/adblock-engine.electron';
import typoHost, { typoCapabilityHost } from './extensions/typo-host.electron';
import TypoPageInjector from './extensions/typo-page-injector.electron';
import typoContextMenuContributor from './extensions/typo-context-menu-contributor.electron';
import translateHost, { translateCapabilityHost } from './extensions/translate-host.electron';
import TranslatePageInjector from './extensions/translate-page-injector-controller.electron';
import videoPlayerHost from './extensions/video-player-host.electron';
import VideoPlayerPageInjector from './extensions/video-player-page-injector.electron';
import translateContextMenuContributor from './extensions/translate-context-menu-contributor.electron';
import PageContextMenuContributionService from './menus/page-context-menu-contributions';
import MacroService from './macro/macro-service.electron';
import { macrosCapabilities } from '@tepegoz/ext-macros/capabilities';
import { typoCapabilities } from '@tepegoz/ext-typo/capabilities';
import { translateCapabilities } from '@tepegoz/ext-translate/capabilities';
import { registerBrowserTools } from '@tepegoz/browser-tools';
import { registerTabTools } from '@tepegoz/tab-engine';
import { registerJournalTools } from '@tepegoz/journal-tools';
import { registerDownloadTools } from '@tepegoz/downloads/tools';
import { registerClipboardTools } from '@tepegoz/clipboard/tools';
import { registerUploadTools } from '@tepegoz/uploads/tools';
import { registerScreenshotTools } from '@tepegoz/screenshots/tools';
import { registerTaskTools } from '@tepegoz/tasks/tools';
import { registerWebTools } from '@tepegoz/web-tools/tools';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import FileOperationsHost from './file-operations/file-operations-host';
import { browserHost } from './agent/browser-host.electron';
import { journalHost } from './agent/journal-host.electron';
import DownloadService from './downloads/download-service.electron';
import { downloadToolsHost } from './downloads/download-tools-host.electron';
import { clipboardToolsHost } from './clipboard/clipboard-tools-host.electron';
import UploadService from './uploads/upload-service.electron';
import { uploadToolsHost } from './uploads/upload-tools-host.electron';
import BrowsingWebRequestService from './web-request/browsing-web-request-service.electron';
import TaskService from './tasks/task-service.electron';
import { taskToolsHost } from './tasks/task-tools-host.electron';
import { runTaskAgent } from './agent/task-agent-runner.electron';
import { maybeRunEval } from './agent/agent-eval-runner.electron';
import { webToolsHost } from './web/web-tools-host.electron';

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

// Keep the renderer compositing even when a chrome window is occluded, backgrounded, or hidden to the
// tray — so a hidden tab (kept attached-but-occluded) and a tray-hidden window stay perceivable and
// drivable by the agent. Once Chromium pauses the compositor for a non-visible surface, render-DOM
// perception (`document.elementFromPoint` → null) and screenshots go blank. MUST run before whenReady
// (Chromium reads switches at startup). Previously applied ONLY by the eval harness; now shipped in
// production because background/hidden tabs the AI drives are a core capability. Trade-off: no
// timer/occlusion throttling → higher idle CPU/battery on laptops (accepted for an agentic browser).
for (const chromiumSwitch of KEEP_RENDERING_SWITCHES) {
  if (chromiumSwitch.value === undefined) app.commandLine.appendSwitch(chromiumSwitch.name);
  else app.commandLine.appendSwitch(chromiumSwitch.name, chromiumSwitch.value);
}

// Single Chrome-like user-data directory named `tepegoz` (app.setName above is only the display /
// taskbar name). Pin it explicitly BEFORE whenReady so EVERY app.getPath('userData') — stores, the
// SQLite DB, and the browsing partitions — resolves here. One-time: carry the small settings files
// over from the pre-rename "Tepegöz" folder so existing preferences + encrypted API keys survive.
// An explicit `--user-data-dir=…` WINS, exactly as it does in Chrome. Without this the pin below is
// unconditional and silently discards the switch, so the app can only ever run against the one real
// profile: a test harness cannot isolate a run, and two instances cannot be kept apart. The AI-1 eval
// hit precisely that — it passed `--user-data-dir` per trial and every trial still opened the developer's
// own profile and restored the previous trial's session on top of its own navigation.
if (app.commandLine.getSwitchValue('user-data-dir').length === 0) {
  const appDataDir = app.getPath('appData');
  const legacyDir = join(appDataDir, 'Tepegöz');
  const userDataDir = join(appDataDir, 'tepegoz');
  if (existsSync(legacyDir)) {
    mkdirSync(userDataDir, { recursive: true });
    for (const file of ['preferences.json', 'credentials.enc.json']) {
      const src = join(legacyDir, file);
      const dst = join(userDataDir, file);
      if (existsSync(src) && !existsSync(dst)) {
        try {
          copyFileSync(src, dst);
        } catch (err) {
          Logger.warn('Failed to carry over legacy user-data file', { file, err: String(err) });
        }
      }
    }
  }
  app.setPath('userData', userDataDir);
}

// Single instance: a second launch focuses the existing window rather than fighting over the cache.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // A second launch reveals the app — restoring every window from the tray / minimize (close-to-tray
    // means the "missing" window is hidden, not gone), or opening a fresh one if somehow none exist.
    if (TabManager.all().length === 0) openWindow({ foreground: true });
    else revealAllWindows();
  });

  void app
    .whenReady()
    .then(() => {
      // macOS: the BrowserWindow `icon` is ignored (the dock uses the app bundle), so set it here
      // for dev/unpackaged runs. Windows/Linux get the brand icon via the window itself.
      // The embedded engine, logged once per run. ADR-0019 governs how quickly a Chromium security
      // bump is adopted; a claim about which engine shipped is only checkable if each run says so. This
      // line is what a crash report or a user's log is read against.
      Logger.info('Engine', {
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        node: process.versions.node,
      });

      if (process.platform === 'darwin') {
        app.dock?.setIcon(join(app.getAppPath(), 'resources', 'icon.png'));
      }

      installSecurity();
      initStores();
      // Apply the persisted User-Agent override to the browsing session BEFORE the first tab opens
      // (a no-op default when the extension is disabled).
      userAgentHost.init();
      // Own the Electron webRequest listener set for EVERY browsing session — the base partition and
      // every Phase 5 `--conn-` tunnel partition created later. Feature services register with this
      // multiplexer so Electron's "last listener wins" behavior cannot make them silently replace each
      // other; the multiplexer in turn registers with `BrowsingSessions` so a session created after
      // startup is not born without a filtering plane. CRITICAL: a session this cannot attach to is
      // refused outright rather than served unfiltered.
      BrowsingSessions.register(
        'web-request',
        (ses, partition) => {
          BrowsingWebRequestService.attach(
            ses.webRequest,
            // Tunnel partitions only: Chromium pre-resolves hostnames through the host resolver, NOT
            // through the session's SOCKS proxy, so a page inside a tunnel can still hand the user's
            // own resolver the list of sites it links to. Direct partitions keep prefetching — it is a
            // real speed win and nothing there is being hidden.
            BrowsingSessions.isTunnelPartition(partition)
              ? { stampResponseHeaders: { 'X-DNS-Prefetch-Control': 'off' } }
              : {},
          );
        },
        { critical: true },
      );
      // Create the base browsing session now, so every attacher registered above has run before the
      // first tab can load anything.
      BrowsingSessions.direct();
      // Browser downloads: attach the browsing-session will-download handler before any page can start
      // a download, load the SQLite projection, and route every file through quarantine first.
      DownloadService.init();
      UploadService.init();
      // Adblock Shield: load persisted settings, register network hooks, then restore/download lists
      // in the background. Until an engine is ready, the multiplexer fails open.
      adblockHost.init();
      AdblockEngineService.init();
      typoHost.init();
      TypoPageInjector.start();
      PageContextMenuContributionService.provide(typoContextMenuContributor);
      translateHost.init();
      TranslatePageInjector.start();
      PageContextMenuContributionService.provide(translateContextMenuContributor);
      videoPlayerHost.init();
      VideoPlayerPageInjector.start();
      // Load the popup-blocker settings before any page can call window.open, and register its
      // `popup:open` interceptor with the generic action-interception plane (ADR-0022).
      popupBlockerHost.init();
      ActionInterceptorService.provide(popupBlockerHost.interceptors);
      // Network privacy (Phase 5): load the configured connections (nothing is dialled here — a
      // connection comes up only when something binds to it) and push the routing picture to the chrome
      // whenever a tunnel's health changes, so an indicator can never sit on a stale "protected".
      ConnectionPool.init();
      BindingService.installNewTabRoute();
      BindingService.installGroupExitGuard();
      ConnectionPool.onStatusChange(() => {
        broadcastNetworkState();
      });
      // 401/407 challenges need a handler or Chromium cancels the request outright.
      registerBasicAuthHandler(app);
      // Without a handler Chromium rejects a bad certificate silently; explain it instead.
      registerCertificateHandler(app);
      registerIpc();
      // Composition root wires the page context menu to the tab layer's right-click signal. The tab
      // layer deliberately does not import the menu (that made it depend on its own consumer — see
      // `contextMenuObservers`), so this subscription is what makes right-click open anything at all.
      TabManager.onContextMenu((win, wc, params, viewBounds, nav) => {
        void openPageContextMenu(win, wc, params, viewBounds, nav);
      });
      initHosts();
      openWindow();
      // The system-tray icon (close-to-tray target) — created once, after the first window exists.
      initTray();
      TaskService.setRunner(runTaskAgent);
      // Let saved-task policy synthesis pre-approve routine write tools (click/type/navigate) on the
      // task's own origin. `destructive`/`financial` tools are deliberately excluded — they still pause
      // for approval even on the target site (mirrors the interactive agent's "act" autonomy). Evaluated
      // lazily at save time, so it sees the fully-registered registry (browser/extension tools below).
      TaskService.setWriteToolIdsProvider(() =>
        CapabilityRegistry.list()
          .filter((tool) => tool.dangerClass === 'state_changing')
          .map((tool) => tool.id),
      );
      TaskService.init();
      // Connect configured MCP servers in the background (non-blocking; a bad server must not delay
      // startup). Their tools register into the CapabilityRegistry as they become ready (ADR-0018).
      McpService.start();
      // The agent's built-in browser/tab/journal tools are always-on, package-owned builtins
      // (ADR-0021/0024 update), registered directly into the CapabilityRegistry behind the same
      // ToolGateway PEP — like the file_* tools — bound to their injected hosts. They belong to their
      // domains (@tepegoz/browser-tools · tab-engine · journal-tools), not the Agent extension, so they
      // no longer vanish when `com.tepegoz.agent` is disabled (the runtime that invokes them only runs
      // when the extension is enabled). `browserHost` also implements the tab host (TabHost).
      registerBrowserTools({ host: browserHost });
      registerScreenshotTools({ host: browserHost });
      registerTabTools({ host: browserHost });
      registerJournalTools({ host: journalHost });
      registerDownloadTools({ host: downloadToolsHost });
      registerClipboardTools({ host: clipboardToolsHost });
      registerUploadTools({ host: uploadToolsHost });
      registerTaskTools({ host: taskToolsHost });
      registerWebTools({ host: webToolsHost });
      // Register enabled built-in extensions' in-process agent capabilities into the same
      // CapabilityRegistry, behind the same ToolGateway PEP (ADR-0021). Meta extension-management tools
      // are always on. Each `provide` is gated on its extension being enabled by `start()`'s reconcile —
      // so disabling `com.tepegoz.macros` unregisters the macro tools (ADR-0024 kill-switch).
      ExtensionCapabilityService.provide(macrosCapabilities(), MacroService.capabilityHost());
      ExtensionCapabilityService.provide(typoCapabilities(), typoCapabilityHost);
      ExtensionCapabilityService.provide(translateCapabilities(), translateCapabilityHost);
      ExtensionCapabilityService.start();
      // Sandboxed file operations: seed the default ~/tepegoz grant (first run), sync the access policy
      // from prefs, and register the file_* / fileaccess_* tools into the same CapabilityRegistry.
      FileOperationsHost.init();

      // AI-1 eval harness batch mode — INERT unless TEPEGOZ_EVAL=1. Runs after every tool is registered
      // so the driven scenario sees the full CapabilityRegistry, then quits.
      void maybeRunEval();

      // Sleep/resume hooks. Phase 1b: the Recovery Coordinator resumes durable tasks from their last
      // checkpoint on 'resume' (Opera Neon's "task drops on sleep" lesson).
      // System power lifecycle. The pause/resume seam fires (gated on `pauseTasksOnSleep`) so the future
      // task-runtime "resume interrupted work" feature can pause on sleep / power-save and continue on
      // wake. Today the transitions are captured + logged; nothing subscribes to actually pause yet.
      powerMonitor.on('suspend', () => {
        Logger.info('System suspending');
        if (PreferenceStore.getAll().pauseTasksOnSleep) emitSystemPause();
      });
      powerMonitor.on('resume', () => {
        Logger.info('System resumed');
        if (PreferenceStore.getAll().pauseTasksOnSleep) emitSystemResume();
      });
      powerMonitor.on('on-battery', () => {
        Logger.info('On battery power (power-save proxy)');
        if (PreferenceStore.getAll().pauseTasksOnSleep) emitSystemPause();
      });
      powerMonitor.on('on-ac', () => {
        Logger.info('On AC power');
        if (PreferenceStore.getAll().pauseTasksOnSleep) emitSystemResume();
      });

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          openWindow();
        }
      });
    })
    .catch((err: unknown) => {
      Logger.error('Failed to start Tepegöz', { err: String(err) });
    });

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return;
    // Background mode: with close-to-tray on, keep the app ALIVE in the tray even when the last window/tab
    // is gone — it quits only from the tray's Quit / the menu's Exit. Clicking the tray reopens a fresh
    // window with a new tab (see showOrOpenApp). A real quit already set the quitting flag, so let it pass.
    if (!isQuitting() && PreferenceStore.getAll().closeToTray) return;
    app.quit();
  });

  // Quit orchestration, in dependency order. before-quit (windows still alive): stop the agent so no
  // tool/journal write races teardown, drop the popup child window, snapshot the session while every
  // tab's webContents can still report its URL. The window 'closed' handler then persists + resets as
  // usual, and will-quit (all windows gone) finally flushes + closes the SQLite connection — after
  // this, getDb() is null and any straggling handler no-ops.
  app.on('before-quit', () => {
    // A real quit is underway — let the window close-interceptor (close-to-tray) allow windows to close.
    markQuitting();
    abortActiveAgentRuns();
    TaskService.stop();
    void McpService.stop();
    PopupWindowManager.close();
    TabManager.persistNow();
  });
  app.on('will-quit', () => {
    closeDatabase();
  });
}

import { whenAnyChromeReady } from './chrome-ready';
import McpService from './mcp/supervisor.electron';
import ChatMessenger, { CHAT_EXTENSION_ID } from './chat/chat-service.electron';
import BackgroundConnectionService from './extensions/background-connection.electron';
import ExtensionCapabilityService from './extensions/capability-supervisor.electron';
import ActionInterceptorService from './extensions/action-interceptors.electron';
import popupBlockerHost from './extensions/popup-blocker-host.electron';
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
import { chatCapabilities } from '@tepegoz/ext-chat/capabilities';
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
import { downloadToolsHost } from './downloads/download-tools-host.electron';
import { clipboardToolsHost } from './clipboard/clipboard-tools-host.electron';
import { uploadToolsHost } from './uploads/upload-tools-host.electron';
import TaskService from './tasks/task-service.electron';
import { taskToolsHost } from './tasks/task-tools-host.electron';
import { runTaskAgent } from './agent/task-agent-runner.electron';
import { maybeRunEval } from './agent/agent-eval-runner.electron';
import { webToolsHost } from './web/web-tools-host.electron';
import TabDiscardService from './tab-discard-service';

/**
 * Deferred init: everything the FIRST PAINT does not need, split out of the app entry. Armed by
 * `scheduleDeferredInit` once the first window exists.
 */
export function scheduleDeferredInit(safeMode: boolean): void {
  let deferredInitDone = false;
  const runDeferredInit = (): void => {
    if (deferredInitDone) return;
    deferredInitDone = true;

    // Built-in extensions — the whole layer, skipped wholesale in safe mode. A page injector or a
    // network hook is exactly the kind of code that can take the main process down on every launch,
    // and it is the kind the user can then disable from Settings once they are back in. Deferred:
    // the adblock engine deserialize is a heavy CPU chunk, and the multiplexer / injectors fail
    // open until they are ready, so a page that loads in the gap is unfiltered for a beat, not broken.
    if (!safeMode) {
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
      // Register the popup-blocker's `popup:open` interceptor with the generic action-interception
      // plane (ADR-0022). Trade-off in safe mode: unblocked popups. Accepted deliberately — a
      // browser that starts and lets popups through is recoverable; one that will not start is not.
      popupBlockerHost.init();
      ActionInterceptorService.provide(popupBlockerHost.interceptors);
    }
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
    // The agent runtime's scheduler. Off in safe mode: a saved task that fires on launch and drives a
    // page is a crash the user cannot get in front of, because it starts before they can click.
    if (!safeMode) TaskService.init();
    // Background-tab discard (sleep): a once-a-minute sweep, gated on the (default-on) preference.
    TabDiscardService.init();
    // Connect configured MCP servers in the background (non-blocking; a bad server must not delay
    // startup). Their tools register into the CapabilityRegistry as they become ready (ADR-0018).
    // Off in safe mode — an MCP server is third-party code this process spawns.
    if (!safeMode) McpService.start();
    // The messenger extension (`com.tepegoz.chat`): connect its enabled accounts in the background.
    // Registered as a `BackgroundConnectionService` provider (the shared prerequisite
    // `phases/extensions/README.md` owed) rather than calling `ChatMessenger` directly — a future
    // `ext-mail` provider gets the same init/stop/reconcile/notifyEgressChange fan-out for free
    // instead of duplicating these four call sites. `init()` builds the service unconditionally;
    // `start()` inside it is what checks the extension preference, so a later enable-toggle
    // (`BackgroundConnectionService.reconcile()`) can spin the accounts up.
    // Off in safe mode — a background socket to a chat server is third-party-reachable code.
    if (!safeMode) {
      BackgroundConnectionService.provide({
        extensionId: CHAT_EXTENSION_ID,
        init: () => ChatMessenger.init(),
        stop: () => ChatMessenger.stop(),
        reconcile: () => ChatMessenger.reconcile(),
        notifyEgressChange: () => {
          ChatMessenger.notifyEgressChange();
        },
      });
      void BackgroundConnectionService.init();
    }
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
    // Skipped in safe mode: `start()` is the reconcile that ENABLES extensions (the agent extension
    // among them), so not calling it is what keeps the extension layer — and the agent runtime that
    // only runs while `com.tepegoz.agent` is enabled — switched off for this launch.
    if (!safeMode) {
      ExtensionCapabilityService.provide(macrosCapabilities(), MacroService.capabilityHost());
      ExtensionCapabilityService.provide(typoCapabilities(), typoCapabilityHost);
      ExtensionCapabilityService.provide(translateCapabilities(), translateCapabilityHost);
      ExtensionCapabilityService.provide(chatCapabilities(), ChatMessenger.capabilityHost());
      ExtensionCapabilityService.start();
    }
    // Sandboxed file operations: seed the default ~/tepegoz grant (first run), sync the access policy
    // from prefs, and register the file_* / fileaccess_* tools into the same CapabilityRegistry.
    FileOperationsHost.init();

    // AI-1 eval harness batch mode — INERT unless TEPEGOZ_EVAL=1. Runs after every tool is registered
    // so the driven scenario sees the full CapabilityRegistry, then quits.
    void maybeRunEval();
  };
  if (process.env.TEPEGOZ_EVAL === '1') {
    // Eval batches must be deterministic and must not hinge on a renderer paint race — arm fully now.
    runDeferredInit();
  } else {
    whenAnyChromeReady(runDeferredInit);
    // Fallback: a renderer that never completes the handshake still gets a fully-armed browser.
    const armFallback = setTimeout(runDeferredInit, 3000);
    armFallback.unref?.();
  }
}

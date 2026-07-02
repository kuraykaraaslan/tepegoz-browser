import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import { z } from 'zod';
import { AppError, Logger, toBoundary } from '@tepegoz/libs';
import {
  IpcChannels,
  encodeBoundaryMessage,
  type AgentApprovalRequest,
  type AgentEvent,
  type AgentEventKind,
  type AgentPlanPreview,
  type AgentRunResult,
  type AppInfo,
  type BookmarkEntry,
  type CredentialsStatus,
  type HistoryEntry,
  type IpcChannel,
  type McpServerStatusInfo,
  type NotificationState,
  type Preferences,
  type TabsState,
  type TokenUsageSnapshot,
} from '@tepegoz/desktop-ipc';
import {
  AgentApprovalResponseSchema,
  AgentPlanResponseSchema,
  AgentRunIdSchema,
  AgentRunInputSchema,
  AppInfoSchema,
  BookmarkToggleSchema,
  BookmarkUrlSchema,
  HistoryQuerySchema,
  HistoryUrlSchema,
  UserAgentSelectionSchema,
  PopupOpenSchema,
  ContentBoundsSchema,
  ContentVisibleSchema,
  CreateTabInputSchema,
  NavigateInputSchema,
  NotificationIdSchema,
  RemoveProviderKeyInputSchema,
  SetProviderKeyInputSchema,
  TabIdSchema,
} from '@tepegoz/desktop-ipc/schemas';
import NotificationStore from '@tepegoz/notifications';
import NotificationHost from './notifications/notification-host';
import type { ConfirmRequest } from '@tepegoz/capability-plane';
import { TokenLedger } from '@tepegoz/model-gateway';
import { BookmarkStore, EventJournal, HistoryStore } from '@tepegoz/persistence';
import { isWebUrl } from '@tepegoz/navigation';
import type { EventType, Plan } from '@tepegoz/shared-types';
import { randomUUID } from 'node:crypto';
import AgentService, { type PlanApprovalDecision } from './agent/agent-service';
import McpService from './mcp/supervisor.electron';
import { getDb } from './db/database.electron';
import { PreferencesPatchSchema } from '@tepegoz/preferences';
import { isTrustedAppUrl } from './lib/trusted-origin';
import { mainStrings } from './lib/i18n-main';
import CredentialVault from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import TabManager from './tabs';
import UserAgentManager from './user-agent';
import PopupWindowManager from './popup-window';
import { manifestById } from '../shared/extensions';
import { showTabContextMenu } from './menus/tab-context-menu';

/** Native main-menu popup width (px); its height is computed by the renderer and clamped in main. */
const MAIN_MENU_WIDTH = 300;
/** Native notification-center popup width (px). */
const NOTIFICATIONS_WIDTH = 360;

/** Reject IPC from frames that are not our own app content (exact-host allow-list). */
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!isTrustedAppUrl(url)) {
    Logger.warn('Rejected IPC from untrusted sender', { url });
    throw new AppError(mainStrings().errors.forbidden, 403);
  }
}

/**
 * Single boundary for every handler (ADR-0009): validate sender, run the handler, and map ANY thrown
 * value to { message, statusCode } via toBoundary — logging the full error in main (redacted) and
 * letting ONLY the mapped, clean pair cross to the untrusted renderer (raw zod/internal text never
 * leaks). The pair travels encoded in the Error message (Electron drops custom fields) and the
 * preload decodes it back into a typed IpcBoundaryError for the renderer.
 */
function handle<T>(
  channel: IpcChannel,
  fn: (event: IpcMainInvokeEvent, payload: unknown) => T,
): void {
  ipcMain.handle(channel, (event, payload: unknown): T => {
    try {
      assertTrustedSender(event);
      return fn(event, payload);
    } catch (err) {
      const boundary = toBoundary(err);
      Logger.error(`IPC ${channel} failed`, {
        statusCode: boundary.statusCode,
        message: boundary.message,
      });
      throw new Error(encodeBoundaryMessage(boundary.message, boundary.statusCode));
    }
  });
}

/** Async variant of {@link handle}: awaits the handler so a rejected promise is mapped at the
 *  boundary too (the sync `handle` would let an async rejection escape unmapped). */
function handleAsync<T>(
  channel: IpcChannel,
  fn: (event: IpcMainInvokeEvent, payload: unknown) => Promise<T>,
): void {
  ipcMain.handle(channel, async (event, payload: unknown): Promise<T> => {
    try {
      assertTrustedSender(event);
      return await fn(event, payload);
    } catch (err) {
      const boundary = toBoundary(err);
      Logger.error(`IPC ${channel} failed`, {
        statusCode: boundary.statusCode,
        message: boundary.message,
      });
      throw new Error(encodeBoundaryMessage(boundary.message, boundary.statusCode));
    }
  });
}

function credentialsStatus(): CredentialsStatus {
  return {
    encryptionAvailable: CredentialVault.isEncryptionAvailable(),
    providers: CredentialVault.status(),
  };
}

// Agent run + HITL state (registerIpc runs once at startup, so module scope is fine).
let runCounter = 0;
let approvalCounter = 0;
let planCounter = 0;
// Phase 1a: ToolGateway's confirm/audit handlers are process-global statics, so exactly ONE agent
// run may be active at a time (see ADR-0013). A second concurrent request is rejected.
let agentRunActive = false;
const runControllers = new Map<string, AbortController>();
const pendingApprovals = new Map<string, { runId: string; resolve: (approved: boolean) => void }>();
const pendingPlans = new Map<
  string,
  { runId: string; resolve: (decision: PlanApprovalDecision) => void }
>();

/** Abort every in-flight agent run and unblock any HITL prompt parked on a promise (fail-safe deny),
 *  so quit doesn't race a half-finished run against store/database teardown. Called from before-quit. */
export function abortActiveAgentRuns(): void {
  for (const controller of runControllers.values()) controller.abort();
  for (const [id, entry] of pendingApprovals) {
    pendingApprovals.delete(id);
    entry.resolve(false);
  }
  for (const [id, entry] of pendingPlans) {
    pendingPlans.delete(id);
    entry.resolve({ approved: false });
  }
}

function tokenUsage(): TokenUsageSnapshot {
  const t = TokenLedger.totals();
  return { inputTokens: t.inputTokens, outputTokens: t.outputTokens, totalTokens: t.totalTokens };
}

/** Truncated, safe preview of tool args for the HITL modal (never the full payload). */
function safeArgsPreview(args: unknown): string {
  let s: string | undefined;
  try {
    s = JSON.stringify(args);
  } catch {
    s = String(args);
  }
  s ??= 'undefined';
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

/** Maps a UI agent-event kind to a journal EventType. Unmapped kinds (e.g. 'plan') are not journaled. */
const JOURNAL_TYPE_BY_KIND: Partial<Record<AgentEventKind, EventType>> = {
  step_start: 'AgentStepExecuted',
  step_ok: 'AgentStepExecuted',
  step_error: 'AgentStepExecuted',
  awaiting_approval: 'HitlRequested',
  handoff: 'HandoffRequested',
  done: 'TaskSucceeded',
  error: 'TaskFailed',
};

/** Register all typed IPC handlers. */
export function registerIpc(): void {
  handle(IpcChannels.appGetInfo, (): AppInfo =>
    AppInfoSchema.parse({
      name: 'Tepegöz',
      version: app.getVersion(),
      platform: process.platform,
    }),
  );

  handle(IpcChannels.prefsGet, (): Preferences => PreferenceStore.getAll());

  handle(IpcChannels.prefsSet, (_event, payload): Preferences => {
    const validated = PreferencesPatchSchema.parse(payload);
    const next = PreferenceStore.update(validated);
    // MCP servers or extension enablement may have changed — re-sync the supervisor's connected set.
    if (validated.mcpServers !== undefined || validated.extensions !== undefined) {
      void McpService.reconcile();
    }
    return next;
  });

  handle(IpcChannels.mcpGetStatus, (): McpServerStatusInfo[] => McpService.getStatus());

  handle(IpcChannels.credentialsStatus, (): CredentialsStatus => credentialsStatus());

  handle(IpcChannels.credentialsSet, (_event, payload): CredentialsStatus => {
    const { provider, apiKey } = SetProviderKeyInputSchema.parse(payload);
    CredentialVault.setKey(provider, apiKey);
    return credentialsStatus();
  });

  handle(IpcChannels.credentialsRemove, (_event, payload): CredentialsStatus => {
    const { provider } = RemoveProviderKeyInputSchema.parse(payload);
    CredentialVault.removeKey(provider);
    return credentialsStatus();
  });

  // Custom window chrome controls (fire-and-forget): act on the SENDER's window only, and ignore
  // anything from an untrusted frame.
  const onWindowControl = (channel: string, action: (win: BrowserWindow) => void): void => {
    ipcMain.on(channel, (event: IpcMainEvent) => {
      if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) action(win);
    });
  };
  onWindowControl(IpcChannels.windowMinimize, (win) => {
    win.minimize();
  });
  onWindowControl(IpcChannels.windowMaximizeToggle, (win) => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  onWindowControl(IpcChannels.windowClose, (win) => {
    win.close();
  });

  handle(IpcChannels.windowIsMaximized, (event): boolean => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });

  // Browser tabs (fire-and-forget). Validate sender + payload; ignore anything untrusted/malformed.
  const onAction = <T>(channel: string, schema: z.ZodType<T>, fn: (value: T) => void): void => {
    ipcMain.on(channel, (event: IpcMainEvent, payload: unknown) => {
      if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
      const parsed = schema.safeParse(payload);
      if (parsed.success) fn(parsed.data);
      else Logger.warn(`Ignored ${channel}: invalid payload`);
    });
  };
  const onSignal = (channel: string, fn: () => void): void => {
    ipcMain.on(channel, (event: IpcMainEvent) => {
      if (isTrustedAppUrl(event.senderFrame?.url ?? '')) fn();
    });
  };

  onAction(IpcChannels.tabsCreate, CreateTabInputSchema, (url) => {
    TabManager.createTab(url);
  });
  onAction(IpcChannels.tabsClose, TabIdSchema, (id) => {
    TabManager.closeTab(id);
  });
  onAction(IpcChannels.tabsActivate, TabIdSchema, (id) => {
    TabManager.activate(id);
  });
  // Native tab context menu: needs the sender's window to anchor the popup, so it can't use the
  // window-less onAction helper.
  ipcMain.on(IpcChannels.tabsContextMenu, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = TabIdSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored tabs:context-menu: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showTabContextMenu(win, parsed.data);
  });
  // Popup windows — a native child window anchored under a toolbar control (needs the sender window).
  // Reusable primitive: the main menu, extension popups, and future surfaces route through here.
  ipcMain.on(IpcChannels.popupOpen, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = PopupOpenSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored popup:open: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const { surface, id, anchor, height } = parsed.data;
    if (surface === 'main-menu') {
      PopupWindowManager.open({
        parent: win,
        key: 'main-menu',
        query: { surface: 'main-menu' },
        anchor,
        width: MAIN_MENU_WIDTH,
        // exactOptionalPropertyTypes: only pass height when the renderer actually measured one.
        ...(height !== undefined ? { height } : {}),
      });
    } else if (surface === 'notifications') {
      PopupWindowManager.open({
        parent: win,
        key: 'notifications',
        query: { surface: 'notifications' },
        anchor,
        width: NOTIFICATIONS_WIDTH,
        ...(height !== undefined ? { height } : {}),
      });
    } else if (surface === 'ext' && id !== undefined) {
      const manifest = manifestById(id);
      if (manifest === undefined || !manifest.surfaces.includes('popup')) {
        Logger.warn('Ignored popup open for a non-popup extension', { id });
        return;
      }
      PopupWindowManager.open({
        parent: win,
        key: `ext:${id}`,
        query: { surface: 'ext', id },
        anchor,
      });
    } else {
      Logger.warn('Ignored popup:open: unknown surface', { surface });
    }
  });
  onSignal(IpcChannels.popupClose, () => {
    PopupWindowManager.close();
  });
  // Notification center — a snapshot getter plus fire-and-forget mutations. Live state is PUSHED from
  // NotificationHost (store subscription) to every app window, so there is no subscribe handler here.
  handle(IpcChannels.notificationsList, (): NotificationState => NotificationStore.state());
  onAction(IpcChannels.notificationsDismiss, NotificationIdSchema, (id) => {
    NotificationStore.dismiss(id);
  });
  onAction(IpcChannels.notificationsMarkRead, NotificationIdSchema, (id) => {
    NotificationStore.markRead(id);
  });
  onSignal(IpcChannels.notificationsDismissAll, () => {
    NotificationStore.dismissAll();
  });
  onSignal(IpcChannels.notificationsMarkAllRead, () => {
    NotificationStore.markAllRead();
  });
  // Exit — quits the whole app regardless of the sender window (a popup can't use the window-close path).
  onSignal(IpcChannels.appQuit, () => {
    app.quit();
  });
  onAction(IpcChannels.tabsNavigate, NavigateInputSchema, (url) => {
    TabManager.navigateActive(url);
  });
  onSignal(IpcChannels.tabsGoBack, () => {
    TabManager.goBack();
  });
  onSignal(IpcChannels.tabsGoForward, () => {
    TabManager.goForward();
  });
  onSignal(IpcChannels.tabsReload, () => {
    TabManager.reloadActive();
  });
  onSignal(IpcChannels.tabsReopenClosed, () => {
    TabManager.reopenClosedTab();
  });
  onAction(IpcChannels.tabsSetBounds, ContentBoundsSchema, (bounds) => {
    TabManager.setContentBounds(bounds);
  });
  onAction(IpcChannels.tabsSetContentVisible, ContentVisibleSchema, (visible) => {
    TabManager.setContentVisible(visible);
  });

  handleAsync(IpcChannels.tabsCapture, (): Promise<string | null> => TabManager.captureActive());

  handle(IpcChannels.tabsGetState, (): TabsState => TabManager.getState());

  // Agent (Do mode). agent:run streams live events back to the SENDER and round-trips HITL approvals;
  // the raw API key and tool args never cross to the renderer (only a truncated preview does).
  handleAsync(IpcChannels.agentRun, async (event, payload): Promise<AgentRunResult> => {
    const prompt = AgentRunInputSchema.parse(payload);
    if (agentRunActive) {
      throw new AppError('An agent task is already running', 409);
    }
    agentRunActive = true;
    const sender = event.sender;
    const runId = `run-${String(++runCounter)}`;
    const controller = new AbortController();
    runControllers.set(runId, controller);

    const sendEvent = (e: AgentEvent): void => {
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentEvent, e);
    };
    const onEvent = (kind: AgentEventKind, message: string, detail?: string): void => {
      sendEvent({
        runId,
        kind,
        message,
        ts: Date.now(),
        ...(detail !== undefined ? { detail } : {}),
      });
      // Project agent events into the Event Journal (append-only audit; DoD "→ Event Journal").
      // message/detail can carry model output (untrusted) — strip secrets/PII BEFORE the write and
      // mark the record accordingly, per the journal schema's redaction contract (plan §13.9).
      const db = getDb();
      const type = JOURNAL_TYPE_BY_KIND[kind];
      if (db !== null && type !== undefined) {
        const safeMessage = Logger.redact(message);
        const safeDetail = detail !== undefined ? Logger.redact(detail) : undefined;
        try {
          EventJournal.append(db, {
            id: randomUUID(),
            type,
            ts: Date.now(),
            actor: 'agent',
            correlationId: runId,
            payload:
              safeDetail !== undefined
                ? { kind, message: safeMessage, detail: safeDetail }
                : { kind, message: safeMessage },
            redacted: true,
          });
        } catch (err) {
          Logger.warn('Journal append failed', { err: String(err) });
        }
      }
      // Human Handoff Controller: surface the handoff across every channel — the user may be looking
      // elsewhere while the agent runs. NotificationHost records it in the center, shows a toast, and
      // raises a native OS notification (all localized, gated on the notifications preference).
      if (kind === 'handoff') {
        NotificationHost.push({
          source: 'agent',
          kind: 'warning',
          title: mainStrings().agent.handoff.notifyTitle,
          body: message,
          channels: ['center', 'toast', 'native'],
        });
      }
    };
    const requestApproval = (req: ConfirmRequest): Promise<boolean> => {
      const approvalId = `appr-${String(++approvalCounter)}`;
      const request: AgentApprovalRequest = {
        runId,
        approvalId,
        toolName: req.toolName,
        reason: req.policy.reason,
        biometric: req.policy.biometric,
        argsPreview: safeArgsPreview(req.args),
      };
      onEvent('awaiting_approval', `Approval needed: ${req.toolName}`, req.policy.reason);
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentApprovalRequest, request);
      return new Promise<boolean>((resolve) => {
        pendingApprovals.set(approvalId, { runId, resolve });
        setTimeout(() => {
          if (pendingApprovals.delete(approvalId)) resolve(false); // fail-safe deny on no response
        }, 120_000);
      });
    };
    const requestPlanApproval = (plan: Plan): Promise<PlanApprovalDecision> => {
      const planId = `plan-${String(++planCounter)}`;
      const preview: AgentPlanPreview = {
        runId,
        planId,
        goal: plan.goal,
        steps: plan.steps.map((s) => ({ id: s.id, tool: s.tool, rationale: s.rationale })),
      };
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentPlanPreview, preview);
      return new Promise<PlanApprovalDecision>((resolve) => {
        pendingPlans.set(planId, { runId, resolve });
        setTimeout(() => {
          if (pendingPlans.delete(planId)) resolve({ approved: false }); // fail-safe reject
        }, 120_000);
      });
    };

    try {
      const summary = await AgentService.run(prompt, {
        onEvent,
        requestPlanApproval,
        requestApproval,
        signal: controller.signal,
      });
      return { runId, stoppedReason: summary.stoppedReason, ok: summary.ok };
    } catch (err) {
      onEvent('error', err instanceof Error ? err.message : 'Agent run failed');
      throw err;
    } finally {
      runControllers.delete(runId);
      agentRunActive = false;
      if (!sender.isDestroyed()) sender.send(IpcChannels.tokenUsage, tokenUsage());
    }
  });

  onAction(IpcChannels.agentCancel, AgentRunIdSchema, (runId) => {
    runControllers.get(runId)?.abort();
    // Unblock a run parked on a pending HITL prompt so cancel takes effect immediately (not after the
    // 120s fail-safe): reject its plan/approval promises now.
    for (const [id, entry] of pendingApprovals) {
      if (entry.runId === runId) {
        pendingApprovals.delete(id);
        entry.resolve(false);
      }
    }
    for (const [id, entry] of pendingPlans) {
      if (entry.runId === runId) {
        pendingPlans.delete(id);
        entry.resolve({ approved: false });
      }
    }
  });
  onAction(
    IpcChannels.agentApprovalResponse,
    AgentApprovalResponseSchema,
    ({ approvalId, approved }) => {
      const entry = pendingApprovals.get(approvalId);
      if (entry !== undefined) {
        pendingApprovals.delete(approvalId);
        entry.resolve(approved);
      }
    },
  );
  onAction(
    IpcChannels.agentPlanResponse,
    AgentPlanResponseSchema,
    ({ planId, approved, skipStepIds }) => {
      const entry = pendingPlans.get(planId);
      if (entry !== undefined) {
        pendingPlans.delete(planId);
        entry.resolve(skipStepIds !== undefined ? { approved, skipStepIds } : { approved });
      }
    },
  );

  handle(IpcChannels.tokenUsageGet, (): TokenUsageSnapshot => tokenUsage());

  // Browsing history (tepegoz://history). Each returns the fresh list so the page re-renders.
  handle(IpcChannels.historyList, (): HistoryEntry[] => {
    const db = getDb();
    return db !== null ? HistoryStore.list(db) : [];
  });
  handle(IpcChannels.historySearch, (_event, payload): HistoryEntry[] => {
    const query = HistoryQuerySchema.parse(payload).trim();
    const db = getDb();
    if (db === null) return [];
    return query.length === 0 ? HistoryStore.list(db) : HistoryStore.search(db, query);
  });
  handle(IpcChannels.historyDelete, (_event, payload): HistoryEntry[] => {
    const url = HistoryUrlSchema.parse(payload);
    const db = getDb();
    if (db === null) return [];
    HistoryStore.deleteUrl(db, url);
    return HistoryStore.list(db);
  });
  handle(IpcChannels.historyClear, (): HistoryEntry[] => {
    const db = getDb();
    if (db !== null) HistoryStore.clear(db);
    return [];
  });

  // Bookmarks. Only http(s) pages are bookmarkable — internal tepegoz:// pages and non-web schemes
  // are rejected here (defense in depth alongside the renderer only offering the star on web pages).
  handle(IpcChannels.bookmarksList, (): BookmarkEntry[] => {
    const db = getDb();
    return db !== null ? BookmarkStore.list(db) : [];
  });
  handle(IpcChannels.bookmarksToggle, (_event, payload): boolean => {
    const { url, title } = BookmarkToggleSchema.parse(payload);
    const db = getDb();
    if (db === null || !isWebUrl(url)) return false;
    if (BookmarkStore.isBookmarked(db, url)) {
      BookmarkStore.remove(db, url);
      return false;
    }
    BookmarkStore.add(db, { url, title: title.trim().length > 0 ? title : url, ts: Date.now() });
    return true;
  });
  handle(IpcChannels.bookmarksIsBookmarked, (_event, payload): boolean => {
    const url = BookmarkUrlSchema.parse(payload);
    const db = getDb();
    return db !== null && BookmarkStore.isBookmarked(db, url);
  });

  // User-Agent switcher extension: read/apply the UA override for browsed pages.
  handle(IpcChannels.userAgentGet, (): string | null => UserAgentManager.get());
  handle(IpcChannels.userAgentSet, (_event, payload): string | null => {
    const ua = UserAgentSelectionSchema.parse(payload);
    return UserAgentManager.set(ua);
  });
}

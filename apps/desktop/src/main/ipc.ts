import { app, BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { AppError, Logger, toBoundary } from '@tepegoz/libs';
import {
  IpcChannels,
  type AgentApprovalRequest,
  type AgentEvent,
  type AgentEventKind,
  type AgentPlanPreview,
  type AgentRunResult,
  type AppInfo,
  type CredentialsStatus,
  type IpcChannel,
  type Preferences,
  type TabsState,
  type TokenUsageSnapshot,
} from '../shared/ipc-contract';
import {
  AgentApprovalResponseSchema,
  AgentPlanResponseSchema,
  AgentRunIdSchema,
  AgentRunInputSchema,
  AppInfoSchema,
  ContentBoundsSchema,
  ContentVisibleSchema,
  CreateTabInputSchema,
  NavigateInputSchema,
  RemoveProviderKeyInputSchema,
  SetProviderKeyInputSchema,
  TabIdSchema,
} from '../shared/ipc-schemas';
import type { ConfirmRequest } from '@tepegoz/capability-plane';
import { TokenLedger } from '@tepegoz/model-gateway';
import AgentService, { type PlanApprovalDecision } from './agent/agent-service';
import { PreferencesPatchSchema } from './preferences/preferences.model';
import { isTrustedAppUrl } from './lib/trusted-origin';
import CredentialVault from './security/credential-vault';
import PreferenceStore from './preferences/preference-store';
import TabManager from './tabs';
import { showTabContextMenu } from './menus/tab-context-menu';

/** Reject IPC from frames that are not our own app content (exact-host allow-list). */
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!isTrustedAppUrl(url)) {
    Logger.warn('Rejected IPC from untrusted sender', { url });
    throw new AppError('Forbidden', 403);
  }
}

/**
 * Single boundary for every handler (ADR-0009): validate sender, run the handler, and map ANY thrown
 * value to { message, statusCode } via toBoundary — logging the full error in main (redacted) and
 * letting ONLY the mapped, clean message cross to the untrusted renderer (raw zod/internal text and
 * the statusCode never leak across the boundary).
 */
function handle<T>(channel: IpcChannel, fn: (event: IpcMainInvokeEvent, payload: unknown) => T): void {
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
      throw new Error(boundary.message);
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
      throw new Error(boundary.message);
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

/** Register all typed IPC handlers. */
export function registerIpc(): void {
  handle(
    IpcChannels.appGetInfo,
    (): AppInfo =>
      AppInfoSchema.parse({
        name: 'Tepegöz',
        version: app.getVersion(),
        platform: process.platform,
      }),
  );

  handle(IpcChannels.prefsGet, (): Preferences => PreferenceStore.getAll());

  handle(IpcChannels.prefsSet, (_event, payload): Preferences => {
    const validated = PreferencesPatchSchema.parse(payload);
    return PreferenceStore.update(validated);
  });

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
  onAction(IpcChannels.tabsSetBounds, ContentBoundsSchema, (bounds) => {
    TabManager.setContentBounds(bounds);
  });
  onAction(IpcChannels.tabsSetContentVisible, ContentVisibleSchema, (visible) => {
    TabManager.setContentVisible(visible);
  });

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
      sendEvent({ runId, kind, message, ts: Date.now(), ...(detail !== undefined ? { detail } : {}) });
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
    const requestPlanApproval = (plan: {
      goal: string;
      steps: { id: string; tool: string; rationale: string }[];
    }): Promise<PlanApprovalDecision> => {
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
}

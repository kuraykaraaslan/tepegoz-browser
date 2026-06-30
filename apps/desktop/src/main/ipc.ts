import { app, BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { AppError, Logger, toBoundary } from '@tepegoz/libs';
import {
  IpcChannels,
  type AgentApprovalRequest,
  type AgentEvent,
  type AgentEventKind,
  type AgentRunResult,
  type AppInfo,
  type CredentialsStatus,
  type IpcChannel,
  type Preferences,
  type TabsState,
} from '../shared/ipc-contract';
import {
  AgentApprovalResponseSchema,
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
import AgentService from './agent/agent-service';
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
const runControllers = new Map<string, AbortController>();
const pendingApprovals = new Map<string, (approved: boolean) => void>();

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
        pendingApprovals.set(approvalId, resolve);
        setTimeout(() => {
          if (pendingApprovals.delete(approvalId)) resolve(false); // fail-safe deny on no response
        }, 120_000);
      });
    };

    try {
      const summary = await AgentService.run(prompt, {
        onEvent,
        requestApproval,
        signal: controller.signal,
      });
      return { runId, stoppedReason: summary.stoppedReason, ok: summary.ok };
    } catch (err) {
      onEvent('error', err instanceof Error ? err.message : 'Agent run failed');
      throw err;
    } finally {
      runControllers.delete(runId);
    }
  });

  onAction(IpcChannels.agentCancel, AgentRunIdSchema, (runId) => {
    runControllers.get(runId)?.abort();
  });
  onAction(
    IpcChannels.agentApprovalResponse,
    AgentApprovalResponseSchema,
    ({ approvalId, approved }) => {
      const resolve = pendingApprovals.get(approvalId);
      if (resolve !== undefined) {
        pendingApprovals.delete(approvalId);
        resolve(approved);
      }
    },
  );
}

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import { z } from 'zod';
import { AppError, Logger, toBoundary } from '@tepegoz/libs';
import {
  AGENT_EFFORT_LEVELS,
  IpcChannels,
  PROVIDER_IDS,
  encodeBoundaryMessage,
  type AIAdaptor,
  type AgentApprovalRequest,
  type AgentAutonomy,
  type AgentConfig,
  type AgentEvent,
  type AgentEventKind,
  type AgentModelChoice,
  type AgentPlanPreview,
  type AgentRunResult,
  type AppInfo,
  type BookmarkEntry,
  type BookmarkTreeNode,
  type CredentialsStatus,
  type ExtensionManifestWire,
  type FileAccessFolderPickResult,
  type HistoryEntry,
  type IpcChannel,
  type LocalModelInfo,
  type Macro,
  type MacroSummary,
  type McpServerStatusInfo,
  type NotificationState,
  type PopupBlockerRequest,
  type PopupBlockerSettings,
  type Preferences,
  type ProviderKeyMeta,
  type PublicSettings,
  type TabsState,
  type TokenUsageSnapshot,
} from '@tepegoz/desktop-ipc';
import {
  AgentApprovalResponseSchema,
  AgentOpenFileSchema,
  AgentPlanResponseSchema,
  AgentRunIdSchema,
  AgentRunInputSchema,
  AppInfoSchema,
  BookmarkToggleSchema,
  BookmarkUrlSchema,
  BookmarkCreateFolderSchema,
  BookmarkRenameSchema,
  BookmarkRemoveSchema,
  BookmarkMoveSchema,
  BookmarkContextMenuSchema,
  HistoryPageParamsSchema,
  HistorySearchParamsSchema,
  HistoryUrlSchema,
  UserAgentSelectionSchema,
  PopupBlockerPatchSchema,
  PopupOriginSchema,
  CreateBackgroundTabSchema,
  PopupOpenSchema,
  PopupResizeSchema,
  PageMenuActionSchema,
  SubmenuOpenSchema,
  ContentBoundsSchema,
  ContentVisibleSchema,
  CreateTabInputSchema,
  ExtensionIdSchema,
  NavigateInputSchema,
  NotificationIdSchema,
  NotificationPermissionResponseSchema,
  AddProviderKeyInputSchema,
  RemoveKeyByIdSchema,
  RenameProviderKeyInputSchema,
  ReorderKeysSchema,
  TabIdSchema,
  TabGroupIdSchema,
  TabMoveSchema,
  TabPinSchema,
  TabGroupCreateSchema,
  TabGroupMoveSchema,
  TabGroupUpdateSchema,
  TabGroupAssignSchema,
  MacroSchema,
  MacroIdSchema,
  MacroRunInputSchema,
  MacroRunDraftSchema,
  MacroAttachCsvSchema,
} from '@tepegoz/desktop-ipc/schemas';
import NotificationStore from '@tepegoz/notifications';
import NotificationHost from './notifications/notification-host';
import NotificationPermissionBroker from './notifications/permission-broker';
import type { ConfirmRequest } from '@tepegoz/capability-plane';
import { TokenLedger } from '@tepegoz/model-gateway';
import { EventJournal, HistoryStore } from '@tepegoz/persistence';
import { BookmarkTreeStore, isBookmarkable } from '@tepegoz/bookmarks';
import {
  isRunnableProvider,
  type AIProvider,
  type EventType,
  type Plan,
} from '@tepegoz/shared-types';
import { randomUUID } from 'node:crypto';
import AgentService, { type PlanApprovalDecision } from './agent/agent-service';
import FileOperationsHost from './file-operations/file-operations-host';
import McpService from './mcp/supervisor.electron';
import ModelManager from './model-catalog/model-manager.electron';
import ExtensionCapabilityService from './extensions/capability-supervisor.electron';
import MacroService from './macro/macro-service.electron';
import { getDb } from './db/database.electron';
import { DEFAULT_PREFERENCES, PreferencesPatchSchema } from '@tepegoz/preferences';
import { isTrustedAppUrl } from './lib/trusted-origin';
import { mainLocale, mainStrings } from './lib/i18n-main';
import { buildAiAdaptors } from './agent/ai-adaptors';
import { getPublicSettings, broadcastPublicSettings } from './settings/public-settings-host';
import CredentialVault from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import TabManager from './tabs';
import UserAgentManager from './user-agent';
import PopupBlockerManager from './popup-blocker';
import PopupWindowManager from './popup-window';
import { builtinManifests, manifestById } from '../shared/extensions';
import { showTabContextMenu } from './menus/tab-context-menu';
import { showBookmarkContextMenu } from './menus/bookmark-context-menu';
import { showExtensionContextMenu } from './menus/extension-context-menu';
import { showGroupContextMenu } from './menus/tab-group-context-menu';
import { getPageMenuContext, runPageMenuAction } from './menus/page-context-menu';

/** Native main-menu popup width (px); its height is computed by the renderer and clamped in main. */
const MAIN_MENU_WIDTH = 300;
/** Native user (profile) menu popup width (px). */
const USER_MENU_WIDTH = 320;
/** Native notification-center popup width (px). */
const NOTIFICATIONS_WIDTH = 360;
/** Native bookmark folder-dropdown popup width (px). */
const BOOKMARK_FOLDER_WIDTH = 280;
/** Native bookmark rename / add-folder dialog popup width (px). */
const BOOKMARK_DIALOG_WIDTH = 320;

/** Notify every app window that the bookmark tree changed (a popup-window mutation must reach the main
 *  window's bar + manager). Mirrors `broadcastPublicSettings`. */
function broadcastBookmarksChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IpcChannels.bookmarksChanged);
  }
}

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
    keys: CredentialVault.listMeta(),
  };
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


/** The effective provider the NEXT run resolves to (mirrors `resolveProvider`, non-throwing for the
 *  panel's display). `local` availability is proxied by "a model is selected" here. */
function effectiveAgentProvider(prefs: Preferences, hasKey: (p: AIProvider) => boolean): AIProvider {
  const localAvailable = prefs.localProvider.selectedModelId !== '';
  const ov = prefs.agentProviderOverride;
  if (ov === 'local' && localAvailable) return 'local';
  if (ov !== null && ov !== 'local' && isRunnableProvider(ov) && hasKey(ov)) return ov;
  if (prefs.localProvider.mode === 'default' && localAvailable) return 'local';
  const top = CredentialVault.topProvider();
  return top !== null && isRunnableProvider(top) ? top : 'anthropic';
}

/** Build the Agent panel's config: selectable providers (with a usable-now flag) + the current choice +
 *  the autonomy level. Data-driven from the vault status + prefs. */
function buildAgentConfig(): AgentConfig {
  const prefs = PreferenceStore.getAll();
  const status = CredentialVault.status();
  const hasKey = (p: AIProvider): boolean => status[p];
  const localModel = prefs.localProvider.selectedModelId;
  const choices: AgentModelChoice[] = [
    { provider: 'anthropic', label: 'Claude', available: hasKey('anthropic') },
    { provider: 'openai', label: 'OpenAI', available: hasKey('openai') },
    {
      provider: 'local',
      label: localModel !== '' ? `Local: ${localModel}` : 'Local',
      available: localModel !== '',
    },
  ];
  return {
    provider: effectiveAgentProvider(prefs, hasKey),
    choices,
    autonomy: prefs.agentAutonomy,
    effort: prefs.agentEffort,
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
    // Extension enablement also gates in-process agent capabilities (ADR-0021).
    if (validated.extensions !== undefined) {
      ExtensionCapabilityService.reconcile();
    }
    // File-access whitelist or master switch changed — re-sync the live FileAccessPolicy.
    if (validated.fileAccessGrants !== undefined || validated.fileOperationsEnabled !== undefined) {
      FileOperationsHost.reconcile();
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
    broadcastPublicSettings();
    return next;
  });

  handle(IpcChannels.mcpGetStatus, (): McpServerStatusInfo[] => McpService.getStatus());

  // The live AIAdaptor inventory for the Settings "run locally" list — system + extension + MCP groups
  // built from the single CapabilityRegistry, so the list needs no maintenance as tools change.
  handle(IpcChannels.aiAdaptorsList, (): AIAdaptor[] => buildAiAdaptors(mainLocale()));

  // Built-in extension identity for the renderer (it pairs each with lazily-loaded surfaces + icon).
  // Read-only, trusted direction; `mcpServer` is stripped — the renderer never needs it.
  handle(
    IpcChannels.extensionsListManifests,
    (): ExtensionManifestWire[] =>
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

  handle(IpcChannels.credentialsReorder, (_event, payload): CredentialsStatus => {
    const { orderedIds } = ReorderKeysSchema.parse(payload);
    CredentialVault.reorderKeys(orderedIds);
    // The new top key defines the default provider.
    syncDefaultProviderFromKeys();
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
  onAction(IpcChannels.tabsCreateBackground, CreateBackgroundTabSchema, (url) => {
    TabManager.createTab(url, { background: true });
  });
  onAction(IpcChannels.tabsClose, TabIdSchema, (id) => {
    TabManager.closeTab(id);
  });
  onAction(IpcChannels.tabsActivate, TabIdSchema, (id) => {
    TabManager.activate(id);
  });
  // Advanced tab UX (ADR-0020): drag-reorder, groups, pinning.
  onAction(IpcChannels.tabsMove, TabMoveSchema, ({ id, toIndex, intoGroupId }) => {
    TabManager.moveTab(id, toIndex, intoGroupId);
  });
  onAction(IpcChannels.tabsPin, TabPinSchema, ({ id, pinned }) => {
    TabManager.setPinned(id, pinned);
  });
  onAction(IpcChannels.tabsGroupCreate, TabGroupCreateSchema, ({ memberIds }) => {
    TabManager.createGroup(memberIds);
  });
  onAction(IpcChannels.tabsGroupMove, TabGroupMoveSchema, ({ groupId, toIndex }) => {
    TabManager.moveGroup(groupId, toIndex);
  });
  onAction(IpcChannels.tabsGroupUpdate, TabGroupUpdateSchema, ({ groupId, name, color, collapsed }) => {
    if (name !== undefined) TabManager.renameGroup(groupId, name);
    if (color !== undefined) TabManager.recolorGroup(groupId, color);
    if (collapsed !== undefined) TabManager.setGroupCollapsed(groupId, collapsed);
  });
  onAction(IpcChannels.tabsGroupAssign, TabGroupAssignSchema, ({ tabId, groupId }) => {
    TabManager.assignToGroup(tabId, groupId);
  });
  onAction(IpcChannels.tabsGroupRemove, TabIdSchema, (tabId) => {
    TabManager.removeFromGroup(tabId);
  });
  onAction(IpcChannels.tabsUngroup, TabIdSchema, (groupId) => {
    TabManager.ungroup(groupId);
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
  // Native bookmark context menu — also needs the sender's window to anchor the popup.
  ipcMain.on(IpcChannels.bookmarksContextMenu, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = BookmarkContextMenuSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored bookmarks:context-menu: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showBookmarkContextMenu(win, parsed.data.id, parsed.data.type, parsed.data.variant);
  });
  // Native extension-icon context menu — also needs the sender's window to anchor + to push the choice.
  ipcMain.on(IpcChannels.extensionContextMenu, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = ExtensionIdSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored extension:context-menu: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showExtensionContextMenu(win, parsed.data);
  });
  // Native group-header context menu — also needs the sender's window to anchor + to push the rename.
  ipcMain.on(IpcChannels.tabsGroupContextMenu, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = TabGroupIdSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored tabs:group-context-menu: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showGroupContextMenu(win, parsed.data);
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
    } else if (surface === 'user-menu') {
      PopupWindowManager.open({
        parent: win,
        key: 'user-menu',
        query: { surface: 'user-menu' },
        anchor,
        width: USER_MENU_WIDTH,
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
    } else if (surface === 'bookmark-folder' && id !== undefined) {
      // A bar folder's dropdown, floating over the page (a native window can't be occluded by the view).
      PopupWindowManager.open({
        parent: win,
        key: `bookmark-folder:${id}`,
        query: { surface, id },
        anchor,
        width: BOOKMARK_FOLDER_WIDTH,
        ...(height !== undefined ? { height } : {}),
      });
    } else if ((surface === 'bookmark-rename' || surface === 'bookmark-add-folder') && id !== undefined) {
      // Rename / add-folder dialog as a native window so the page stays visible behind it. The mode is
      // carried by the surface name; `id` is the target node (rename) or parent folder (add-folder).
      PopupWindowManager.open({
        parent: win,
        key: 'bookmark-dialog',
        query: { surface, id },
        anchor,
        width: BOOKMARK_DIALOG_WIDTH,
        ...(height !== undefined ? { height } : {}),
      });
    } else {
      Logger.warn('Ignored popup:open: unknown surface', { surface });
    }
  });
  // Self-resize: the open popup reports its measured content height so main shrinks the window to fit
  // (needs the sender window to identify which popup, so it can't use the window-less onAction helper).
  ipcMain.on(IpcChannels.popupResize, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = PopupResizeSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored popup:resize: invalid payload');
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) PopupWindowManager.resize(win, parsed.data.height);
  });
  onSignal(IpcChannels.popupClose, () => {
    PopupWindowManager.close();
  });
  // Submenu flyout — a second native window to the LEFT of the main-menu popup. It attaches to the
  // currently-open primary popup, so it needs no sender window.
  ipcMain.on(IpcChannels.submenuOpen, (event: IpcMainEvent, payload: unknown) => {
    if (!isTrustedAppUrl(event.senderFrame?.url ?? '')) return;
    const parsed = SubmenuOpenSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignored submenu:open: invalid payload');
      return;
    }
    const { kind, anchor, height } = parsed.data;
    PopupWindowManager.openSubmenu({ query: { surface: 'menu-sub', kind }, anchor, height });
  });
  onSignal(IpcChannels.submenuClose, () => {
    PopupWindowManager.closeSub();
  });
  // Web-page right-click menu (rendered popup surface): the popup reads the context captured at
  // right-click, then dispatches the chosen wired action — acted on against the active view in main.
  handle(IpcChannels.pageMenuGetContext, () => getPageMenuContext());
  onAction(IpcChannels.pageMenuAction, PageMenuActionSchema, (action) => {
    runPageMenuAction(action);
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
  // Per-site Web Notification consent answer (renderer → main); resolves the pending broker prompt.
  onAction(IpcChannels.notificationPermissionRespond, NotificationPermissionResponseSchema, (res) => {
    NotificationPermissionBroker.respond(res);
  });
  // File operations: native directory picker for the Settings "Add folder" button. Chosen paths are
  // canonicalized (symlinks resolved) so they match the sandbox's realpath comparisons when persisted.
  handleAsync(IpcChannels.fileAccessPickFolder, async (event): Promise<FileAccessFolderPickResult> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    const paths = await Promise.all(result.filePaths.map((p) => FileOperationsHost.canonicalize(p)));
    return { paths, cancelled: result.canceled };
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
  onSignal(IpcChannels.tabsHome, () => {
    TabManager.goHome();
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
    /** Present the standard HITL approval modal and await the user's answer. */
    const promptApproval = (req: ConfirmRequest): Promise<boolean> => {
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
    // File tools self-gate on their folder grant mode: an op within the granted mode runs silently,
    // one outside every grant is refused, and an escalation / grant-management tool falls through to the
    // standard approval modal so the user consents. Every other tool goes straight to the modal.
    const requestApproval = async (req: ConfirmRequest): Promise<boolean> => {
      const decision = await FileOperationsHost.consentDecision(req);
      if (decision.type === 'auto') return decision.approved;
      return promptApproval(req);
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
  onSignal(IpcChannels.agentNewConversation, () => {
    AgentService.newConversation();
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

  // Agent panel config: current provider + selectable choices + autonomy level, and setters.
  handle(IpcChannels.agentGetConfig, (): AgentConfig => buildAgentConfig());
  handle(IpcChannels.agentSetProvider, (_event, payload): void => {
    const provider = z.enum(PROVIDER_IDS).parse(payload);
    PreferenceStore.update({ agentProviderOverride: provider });
  });
  handle(IpcChannels.agentSetAutonomy, (_event, payload): void => {
    const level: AgentAutonomy = z.enum(['ask', 'act', 'auto']).parse(payload);
    PreferenceStore.update({ agentAutonomy: level });
  });
  handle(IpcChannels.agentSetEffort, (_event, payload): void => {
    const level = z.enum(AGENT_EFFORT_LEVELS).parse(payload);
    PreferenceStore.update({ agentEffort: level });
  });
  // Open a file the agent produced — gated to the whitelisted folders (403 → refused + logged, never
  // opens outside a grant). Fire-and-forget; the async open runs off the handler.
  onAction(IpcChannels.agentOpenFile, AgentOpenFileSchema, (path) => {
    void (async () => {
      try {
        const real = await FileOperationsHost.assertOpenablePath(path);
        await shell.openPath(real);
      } catch (err) {
        Logger.warn('Refused to open agent file', { path, err: String(err) });
      }
    })();
  });

  // On-device model management. Progress/install changes are pushed to every window via models:state.
  ModelManager.setProgressListener((models) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IpcChannels.modelsState, models);
    }
  });
  const ModelIdSchema = z.string().min(1).max(64);
  handle(IpcChannels.modelsList, (): LocalModelInfo[] => ModelManager.list());
  handleAsync(IpcChannels.modelsDownload, async (_event, payload): Promise<void> => {
    await ModelManager.download(ModelIdSchema.parse(payload));
  });
  onAction(IpcChannels.modelsCancel, ModelIdSchema, (id) => {
    ModelManager.cancel(id);
  });
  handle(IpcChannels.modelsSelect, (_event, payload): void => {
    ModelManager.select(ModelIdSchema.parse(payload));
  });
  handle(IpcChannels.modelsDelete, (_event, payload): void => {
    ModelManager.remove(ModelIdSchema.parse(payload));
  });

  // Browsing history (tepegoz://history).
  handle(IpcChannels.historyList, (_event, payload): HistoryEntry[] => {
    const { limit, offset } = HistoryPageParamsSchema.parse(payload ?? {});
    const db = getDb();
    return db !== null ? HistoryStore.list(db, limit, offset) : [];
  });
  handle(IpcChannels.historySearch, (_event, payload): HistoryEntry[] => {
    const { query, limit, offset } = HistorySearchParamsSchema.parse(payload ?? {});
    const db = getDb();
    if (db === null) return [];
    return query.trim().length === 0
      ? HistoryStore.list(db, limit, offset)
      : HistoryStore.search(db, query.trim(), limit, offset);
  });
  handle(IpcChannels.historyDelete, (_event, payload): void => {
    const url = HistoryUrlSchema.parse(payload);
    const db = getDb();
    if (db !== null) HistoryStore.deleteUrl(db, url);
  });
  handle(IpcChannels.historyClear, (): void => {
    const db = getDb();
    if (db !== null) HistoryStore.clear(db);
  });

  // Bookmarks. http(s) pages plus trusted system paths (tepegoz:// internal pages, file://) are
  // bookmarkable; executable/smuggling schemes are rejected here via isBookmarkable (defense in depth
  // alongside the renderer only offering the star on bookmarkable pages). See @tepegoz/bookmarks.
  handle(IpcChannels.bookmarksList, (): BookmarkEntry[] => {
    const db = getDb();
    return db !== null ? BookmarkTreeStore.listFlat(db) : [];
  });
  handle(IpcChannels.bookmarksToggle, (_event, payload): boolean => {
    const { url, title, favicon } = BookmarkToggleSchema.parse(payload);
    const db = getDb();
    if (db === null || !isBookmarkable(url)) return false;
    const result = BookmarkTreeStore.toggleAtBar(db, url, title, favicon ?? null);
    broadcastBookmarksChanged();
    return result;
  });
  handle(IpcChannels.bookmarksIsBookmarked, (_event, payload): boolean => {
    const url = BookmarkUrlSchema.parse(payload);
    const db = getDb();
    return db !== null && BookmarkTreeStore.isBookmarkedAnywhere(db, url);
  });
  // Bookmark tree (folders + ordering) for the interactive bar + manager. Mutations return void; the
  // renderer refetches getBookmarkTree after each so the bar/manager reflect the change.
  handle(IpcChannels.bookmarksTree, (): BookmarkTreeNode[] => {
    const db = getDb();
    return db !== null ? BookmarkTreeStore.getTree(db) : [];
  });
  handle(IpcChannels.bookmarksCreateFolder, (_event, payload): void => {
    const { parentId, title, index } = BookmarkCreateFolderSchema.parse(payload);
    const db = getDb();
    if (db !== null) {
      BookmarkTreeStore.createFolder(
        db,
        index === undefined ? { parentId, title } : { parentId, title, index },
      );
      broadcastBookmarksChanged();
    }
  });
  handle(IpcChannels.bookmarksRename, (_event, payload): void => {
    const { id, title } = BookmarkRenameSchema.parse(payload);
    const db = getDb();
    if (db !== null) {
      BookmarkTreeStore.rename(db, id, title);
      broadcastBookmarksChanged();
    }
  });
  handle(IpcChannels.bookmarksRemove, (_event, payload): void => {
    const id = BookmarkRemoveSchema.parse(payload);
    const db = getDb();
    if (db !== null) {
      BookmarkTreeStore.remove(db, id);
      broadcastBookmarksChanged();
    }
  });
  handle(IpcChannels.bookmarksMove, (_event, payload): void => {
    const { id, newParentId, index } = BookmarkMoveSchema.parse(payload);
    const db = getDb();
    if (db !== null) {
      BookmarkTreeStore.move(db, id, newParentId, index);
      broadcastBookmarksChanged();
    }
  });

  // User-Agent switcher extension: read/apply the UA override for browsed pages.
  handle(IpcChannels.userAgentGet, (): string | null => UserAgentManager.get());
  handle(IpcChannels.userAgentSet, (_event, payload): string | null => {
    const ua = UserAgentSelectionSchema.parse(payload);
    return UserAgentManager.set(ua);
  });

  // Popup Blocker (strict) extension: read/patch settings + trust an origin.
  handle(IpcChannels.popupBlockerGet, (): PopupBlockerSettings => PopupBlockerManager.get());
  handle(IpcChannels.popupBlockerSet, (_event, payload): PopupBlockerSettings => {
    const patch = PopupBlockerPatchSchema.parse(payload) as Partial<PopupBlockerSettings>;
    return PopupBlockerManager.update(patch);
  });
  onAction(IpcChannels.popupBlockerTrust, PopupOriginSchema, (origin) => {
    PopupBlockerManager.trustOrigin(origin);
  });
  handle(IpcChannels.popupBlockerRecentRequests, (): PopupBlockerRequest[] =>
    PopupBlockerManager.getRecentRequests(),
  );

  // Macros (ext-macros): CRUD + CSV attach, deterministic run (streamed located progress), and record
  // (streamed captured Steps). The macro IR is validated with MacroSchema at this trust boundary.
  handle(IpcChannels.macrosList, (): MacroSummary[] => MacroService.list());
  handle(IpcChannels.macrosGet, (_event, payload): Macro | null =>
    MacroService.get(MacroIdSchema.parse(payload)),
  );
  handle(IpcChannels.macrosSave, (_event, payload): MacroSummary =>
    MacroService.save(MacroSchema.parse(payload)),
  );
  handle(IpcChannels.macrosDelete, (_event, payload): void => {
    MacroService.delete(MacroIdSchema.parse(payload));
  });
  handle(IpcChannels.macrosAttachCsv, (_event, payload): string =>
    MacroService.attachCsv(MacroAttachCsvSchema.parse(payload).content),
  );
  handle(IpcChannels.macrosRun, (event, payload): { runId: string } => {
    const input = MacroRunInputSchema.parse(payload);
    const sender = event.sender;
    const runId = MacroService.run(input, (progress) => {
      if (!sender.isDestroyed()) sender.send(IpcChannels.macrosRunProgress, progress);
    });
    return { runId };
  });
  handle(IpcChannels.macrosRunDraft, (event, payload): { runId: string } => {
    const { macro, variables } = MacroRunDraftSchema.parse(payload);
    const sender = event.sender;
    const runId = MacroService.runDraft(macro, variables, (progress) => {
      if (!sender.isDestroyed()) sender.send(IpcChannels.macrosRunProgress, progress);
    });
    return { runId };
  });
  onAction(IpcChannels.macrosCancel, MacroIdSchema, (runId) => {
    MacroService.cancel(runId);
  });
  handleAsync(IpcChannels.macrosRecordStart, async (event): Promise<void> => {
    const sender = event.sender;
    await MacroService.recordStart((index, step) => {
      if (!sender.isDestroyed()) sender.send(IpcChannels.macrosRecordStep, { index, step });
    });
  });
  handleAsync(IpcChannels.macrosRecordStop, (): Promise<void> => MacroService.recordStop());
}

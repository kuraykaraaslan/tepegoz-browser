import { readFile } from 'node:fs/promises';
import { app, BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import {
  IpcChannels,
  isExtensionEnabled,
  type AIAdaptor,
  type AdaptorConnection,
  type AppInfo,
  type BookmarkEntry,
  type BookmarkImportResult,
  type BookmarkTreeNode,
  type CredentialsStatus,
  type ExtensionManifestWire,
  type FileAccessFolderPickResult,
  type HistoryEntry,
  type LocalModelInfo,
  type Macro,
  type MacroSummary,
  type McpServerStatusInfo,
  type NewTabBackgroundImagePick,
  type NotificationState,
  type PopupBlockerRequest,
  type PopupBlockerSettings,
  type Preferences,
  type ProviderKeyMeta,
  type PublicSettings,
} from '@tepegoz/desktop-ipc';
import { AppError } from '@tepegoz/libs';
import { macrosManifest } from '@tepegoz/ext-macros/manifest';
import {
  AddProviderKeyInputSchema,
  AppInfoSchema,
  BookmarkCreateFolderSchema,
  BookmarkImportSchema,
  BookmarkMoveSchema,
  BookmarkRemoveSchema,
  BookmarkRenameSchema,
  BookmarkToggleSchema,
  BookmarkUrlSchema,
  HistoryPageParamsSchema,
  HistorySearchParamsSchema,
  HistoryUrlSchema,
  MacroAttachCsvSchema,
  MacroIdSchema,
  MacroRunDraftSchema,
  MacroRunInputSchema,
  MacroSchema,
  CasRefSchema,
  NotificationIdSchema,
  NotificationPermissionResponseSchema,
  PopupBlockerPatchSchema,
  PopupOriginSchema,
  RemoveKeyByIdSchema,
  RenameProviderKeyInputSchema,
  ReorderKeysSchema,
  UserAgentSelectionSchema,
} from '@tepegoz/desktop-ipc/schemas';
import NotificationStore from '@tepegoz/notifications';
import WebPermissionBroker from '../web-permissions/permission-broker';
import { BlobStore, HistoryStore } from '@tepegoz/persistence';
import { BookmarkTreeStore, importBookmarksHtmlToStore, isBookmarkable } from '@tepegoz/bookmarks';
import FileOperationsHost from '../file-operations/file-operations-host';
import McpService from '../mcp/supervisor.electron';
import ModelManager from '../model-catalog/model-manager.electron';
import ExtensionCapabilityService from '../extensions/capability-supervisor.electron';
import MacroService, { type MacroCursorOpts } from '../macro/macro-service.electron';
import { getDb } from '../db/database.electron';
import { DEFAULT_PREFERENCES, PreferencesPatchSchema } from '@tepegoz/preferences';
import { mainLocale } from '../lib/i18n-main';
import { buildAdaptorConnections, buildAiAdaptors } from '../agent/ai-adaptors';
import { getPublicSettings, broadcastPublicSettings } from '../settings/public-settings-host';
import CredentialVault from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import TabManager from '../tabs';
import { completeOnboarding } from '../browser-windows';
import userAgentHost from '../extensions/user-agent-host.electron';
import popupBlockerHost from '../extensions/popup-blocker-host.electron';
import { builtinManifests } from '../../shared/extensions';
import { handle, handleAsync, onAction, onSignal } from './ipc-helpers';
import { applyChromeGlass, isMicaSupported } from '../lib/glass';

/**
 * App info/preferences + credentials + MCP/AI-adaptors/extensions + notifications + history +
 * bookmarks + user-agent + popup-blocker + macros + local-models IPC domain (split out of `ipc.ts`,
 * ADR-0010 250-line cap).
 */

/** Notify every app window that the bookmark tree changed (a popup-window mutation must reach the main
 *  window's bar + manager). Mirrors `broadcastPublicSettings`. */
function broadcastBookmarksChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IpcChannels.bookmarksChanged);
  }
}

/** Max size for an uploaded new-tab background image (bytes stored in the content-addressed blob store). */
const MAX_NEWTAB_BG_BYTES = 8 * 1024 * 1024;

/** Sniff an image MIME from magic bytes (defense in depth beyond the dialog filter). Returns null when
 *  the content isn't a recognized image, so a mislabelled/hostile file is rejected on upload. */
function sniffImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && bytes.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  // SVG is text — accept when an <svg tag appears near the head (past any XML/doctype prolog).
  if (bytes.toString('utf8', 0, Math.min(bytes.length, 512)).toLowerCase().includes('<svg'))
    return 'image/svg+xml';
  return null;
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

/** Register the app-info/preferences/credentials/MCP/extensions/notifications/history/bookmarks/
 *  user-agent/popup-blocker/macros/local-models IPC handlers. */
export function registerContentIpc(): void {
  handle(IpcChannels.appGetInfo, (): AppInfo =>
    AppInfoSchema.parse({
      name: 'Tepegöz',
      version: app.getVersion(),
      platform: process.platform,
      glassAvailable: isMicaSupported(),
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
    // Glass toggled — apply the Mica backdrop live to every top-level chrome window (popups are children
    // and stay opaque). setBackgroundMaterial/setBackgroundColor take effect without recreating windows.
    if (validated.glassChrome !== undefined) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.getParentWindow() === null) applyChromeGlass(w, next.glassChrome);
      }
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

  // File operations: native directory picker for the Settings "Add folder" button. Chosen paths are
  // canonicalized (symlinks resolved) so they match the sandbox's realpath comparisons when persisted.
  handleAsync(
    IpcChannels.fileAccessPickFolder,
    async (event): Promise<FileAccessFolderPickResult> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] });
      const paths = await Promise.all(
        result.filePaths.map((p) => FileOperationsHost.canonicalize(p)),
      );
      return { paths, cancelled: result.canceled };
    },
  );

  // New-tab background image: native picker → validate (real image, ≤ size cap) → content-addressed blob
  // store. Only the cas:// ref is persisted (in prefs.newTabBackground.imageRef); bytes live in the DB.
  handleAsync(
    IpcChannels.newtabPickBackgroundImage,
    async (event): Promise<NewTabBackgroundImagePick> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const opts: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
      };
      const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      const filePath = result.filePaths[0];
      if (result.canceled || filePath === undefined) return { ref: '', dataUrl: '', cancelled: true };
      const db = getDb();
      if (db === null) throw new AppError('Storage is unavailable', 500);
      const bytes = await readFile(filePath);
      if (bytes.length > MAX_NEWTAB_BG_BYTES) throw new AppError('Image is too large (max 8 MB)', 413);
      const mime = sniffImageMime(bytes);
      if (mime === null) throw new AppError('Unsupported image type', 415);
      // put() inserts with refcount 0 and there is no unref API, so replacing the image leaves an orphan
      // blob — harmless (deduped by hash; a future GC can sweep refcount-0 rows).
      const ref = BlobStore.put(db, bytes);
      return { ref, dataUrl: `data:${mime};base64,${bytes.toString('base64')}`, cancelled: false };
    },
  );

  handle(IpcChannels.newtabGetBackgroundImage, (_event, payload): string | null => {
    const ref = CasRefSchema.parse(payload);
    const db = getDb();
    if (db === null) return null;
    const bytes = BlobStore.get(db, ref);
    if (bytes === undefined) return null;
    const mime = sniffImageMime(bytes) ?? 'image/png';
    return `data:${mime};base64,${bytes.toString('base64')}`;
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
  onAction(
    IpcChannels.notificationPermissionRespond,
    NotificationPermissionResponseSchema,
    (res) => {
      WebPermissionBroker.respond(res);
    },
  );

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
  handle(IpcChannels.bookmarksImport, (_event, payload): BookmarkImportResult => {
    const input = BookmarkImportSchema.parse(payload);
    const db = getDb();
    if (db === null)
      return { imported: 0, skipped: 0, folders: 0, errors: ['Database is unavailable'] };

    const result = importBookmarksHtmlToStore(db, input);
    if (result.imported > 0 || result.folders > 0) broadcastBookmarksChanged();
    return result;
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
  handle(IpcChannels.userAgentGet, (): string | null => userAgentHost.get());
  handle(IpcChannels.userAgentSet, (_event, payload): string | null => {
    const ua = UserAgentSelectionSchema.parse(payload);
    return userAgentHost.set(ua);
  });

  // Popup Blocker (strict) extension: read/patch settings + trust an origin.
  handle(IpcChannels.popupBlockerGet, (): PopupBlockerSettings => popupBlockerHost.get());
  handle(IpcChannels.popupBlockerSet, (_event, payload): PopupBlockerSettings => {
    const patch = PopupBlockerPatchSchema.parse(payload) as Partial<PopupBlockerSettings>;
    return popupBlockerHost.update(patch);
  });
  onAction(IpcChannels.popupBlockerTrust, PopupOriginSchema, (origin) => {
    popupBlockerHost.trustOrigin(origin);
  });
  handle(IpcChannels.popupBlockerRecentRequests, (): PopupBlockerRequest[] =>
    popupBlockerHost.getRecentRequests(),
  );

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

  // Macros (ext-macros): CRUD + CSV attach, deterministic run (streamed located progress), and record
  // (streamed captured Steps). The macro IR is validated with MacroSchema at this trust boundary.
  // Every handler refuses when `com.tepegoz.macros` is disabled — the same enabled-gate that already
  // governs the agent-capability path (ADR-0024), so the direct IPC path can't outlive the extension.
  const requireMacrosEnabled = (): void => {
    if (!isExtensionEnabled(PreferenceStore.getAll().extensions, macrosManifest.id)) {
      throw new AppError('Macros extension is disabled', 403);
    }
  };
  handle(IpcChannels.macrosList, (): MacroSummary[] => {
    requireMacrosEnabled();
    return MacroService.list();
  });
  handle(IpcChannels.macrosGet, (_event, payload): Macro | null => {
    requireMacrosEnabled();
    return MacroService.get(MacroIdSchema.parse(payload));
  });
  handle(IpcChannels.macrosSave, (_event, payload): MacroSummary => {
    requireMacrosEnabled();
    return MacroService.save(MacroSchema.parse(payload));
  });
  handle(IpcChannels.macrosDelete, (_event, payload): void => {
    requireMacrosEnabled();
    MacroService.delete(MacroIdSchema.parse(payload));
  });
  handle(IpcChannels.macrosAttachCsv, (_event, payload): string => {
    requireMacrosEnabled();
    return MacroService.attachCsv(MacroAttachCsvSchema.parse(payload).content);
  });
  handle(IpcChannels.macrosRun, (event, payload): { runId: string } => {
    requireMacrosEnabled();
    const input = MacroRunInputSchema.parse(payload);
    const sender = event.sender;
    const cursorOpts: MacroCursorOpts = {
      onCursorMove: (x, y) => {
        if (sender.isDestroyed()) return;
        const b = TabManager.getContentBounds();
        sender.send(IpcChannels.cursorPosition, { x: x + b.x, y: y + b.y, visible: true });
      },
      onCursorHide: () => {
        if (!sender.isDestroyed())
          sender.send(IpcChannels.cursorPosition, { x: 0, y: 0, visible: false });
      },
    };
    const runId = MacroService.run(
      input,
      (progress) => {
        if (!sender.isDestroyed()) sender.send(IpcChannels.macrosRunProgress, progress);
      },
      cursorOpts,
    );
    return { runId };
  });
  handle(IpcChannels.macrosRunDraft, (event, payload): { runId: string } => {
    requireMacrosEnabled();
    const { macro, variables } = MacroRunDraftSchema.parse(payload);
    const sender = event.sender;
    const cursorOpts: MacroCursorOpts = {
      onCursorMove: (x, y) => {
        if (sender.isDestroyed()) return;
        const b = TabManager.getContentBounds();
        sender.send(IpcChannels.cursorPosition, { x: x + b.x, y: y + b.y, visible: true });
      },
      onCursorHide: () => {
        if (!sender.isDestroyed())
          sender.send(IpcChannels.cursorPosition, { x: 0, y: 0, visible: false });
      },
    };
    const runId = MacroService.runDraft(
      macro,
      variables,
      (progress) => {
        if (!sender.isDestroyed()) sender.send(IpcChannels.macrosRunProgress, progress);
      },
      cursorOpts,
    );
    return { runId };
  });
  onAction(IpcChannels.macrosCancel, MacroIdSchema, (runId) => {
    if (!isExtensionEnabled(PreferenceStore.getAll().extensions, macrosManifest.id)) return;
    MacroService.cancel(runId);
  });
  handleAsync(IpcChannels.macrosRecordStart, async (event): Promise<void> => {
    requireMacrosEnabled();
    const sender = event.sender;
    await MacroService.recordStart((index, step) => {
      if (!sender.isDestroyed()) sender.send(IpcChannels.macrosRecordStep, { index, step });
    });
  });
  handleAsync(IpcChannels.macrosRecordStop, (): Promise<void> => {
    requireMacrosEnabled();
    return MacroService.recordStop();
  });
}

import { readFile } from 'node:fs/promises';
import { BrowserWindow, dialog } from 'electron';
import {
  IpcChannels,
  type BookmarkEntry,
  type BookmarkImportResult,
  type BookmarkTreeNode,
  type FileAccessFolderPickResult,
  type HistoryEntry,
  type NewTabBackgroundImagePick,
  type NotificationState,
} from '@tepegoz/desktop-ipc';
import { AppError } from '@tepegoz/libs';
import {
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
  CasRefSchema,
  NotificationIdSchema,
  BasicAuthResponseSchema,
  CertificateErrorResponseSchema,
  NotificationPermissionResponseSchema,
} from '@tepegoz/desktop-ipc/schemas';
import NotificationStore from '@tepegoz/notifications';
import WebPermissionBroker from '../web-permissions/permission-broker';
import { resolveBasicAuth } from '../auth/basic-auth-broker';
import { resolveCertificateError } from '../auth/certificate-broker';
import { BlobStore, HistoryStore } from '@tepegoz/persistence';
import {
  BookmarkTreeStore,
  importBookmarksHtmlToStore,
  isBookmarkable,
  serializeBookmarksHtml,
} from '@tepegoz/bookmarks';
import FileOperationsHost from '../file-operations/file-operations-host';
import { getDb } from '../db/database.electron';
import { handle, handleAsync, onAction, onSignal } from './ipc-helpers';

/**
 * File-access picker + new-tab background image + notification center + history + bookmarks IPC
 * handlers (extracted from `ipc-content.ts`, ADR-0010 250-line cap).
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
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (bytes.length >= 6 && bytes.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  // SVG is text — accept when an <svg tag appears near the head (past any XML/doctype prolog).
  if (bytes.toString('utf8', 0, Math.min(bytes.length, 512)).toLowerCase().includes('<svg'))
    return 'image/svg+xml';
  return null;
}

/** Register file-access picker + new-tab background + notifications + history + bookmarks handlers. */
export function registerBrowsingIpc(): void {
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
      const result = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      const filePath = result.filePaths[0];
      if (result.canceled || filePath === undefined)
        return { ref: '', dataUrl: '', cancelled: true };
      const db = getDb();
      if (db === null) throw new AppError('Storage is unavailable', 500, 'storageUnavailable');
      const bytes = await readFile(filePath);
      if (bytes.length > MAX_NEWTAB_BG_BYTES)
        throw new AppError('Image is too large (max 8 MB)', 413, 'imageTooLarge');
      const mime = sniffImageMime(bytes);
      if (mime === null) throw new AppError('Unsupported image type', 415, 'unsupportedImageType');
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

  // Basic-auth answer (renderer → main); resolves the pending 401/407 challenge. The payload carries
  // credentials, so it is validated and forwarded — never logged, never persisted.
  onAction(IpcChannels.authBasicRespond, BasicAuthResponseSchema, (res) => {
    resolveBasicAuth(res);
  });

  // TLS certificate warning answer (renderer → main). Anything other than an explicit proceed leaves
  // the broker's default in place, which is to refuse the connection.
  onAction(IpcChannels.certificateErrorRespond, CertificateErrorResponseSchema, (res) => {
    resolveCertificateError(res);
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
  handle(IpcChannels.bookmarksImport, (_event, payload): BookmarkImportResult => {
    const input = BookmarkImportSchema.parse(payload);
    const db = getDb();
    if (db === null)
      return { imported: 0, skipped: 0, folders: 0, errors: ['Database is unavailable'] };

    const result = importBookmarksHtmlToStore(db, input);
    if (result.imported > 0 || result.folders > 0) broadcastBookmarksChanged();
    return result;
  });
  handle(IpcChannels.bookmarksExport, (): string => {
    // A local-first browser whose data cannot leave it is not local-first. The import side has existed
    // since Phase 1a; this is the exit path, in the same format, so the export is also a real backup.
    const db = getDb();
    return db === null
      ? serializeBookmarksHtml([])
      : serializeBookmarksHtml(BookmarkTreeStore.getTree(db));
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
}

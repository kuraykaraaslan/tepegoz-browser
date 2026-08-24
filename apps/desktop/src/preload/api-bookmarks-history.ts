import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type AppNotification,
  type BookmarkEntry,
  type BookmarkImportInput,
  type SiteClearPlan,
  type BookmarkImportResult,
  type BookmarkMenuAction,
  type BookmarkNodeType,
  type BookmarkTreeNode,
  type HistoryEntry,
  type BasicAuthRequest,
  type BasicAuthResponse,
  type CertificateErrorRequest,
  type CertificateErrorResponse,
  type ClientCertificateChoice,
  type ClientCertificateRequest,
  type ClientCertificateResponse,
  type NotificationPermissionRequest,
  type NotificationPermissionResponse,
  type NotificationState,
  type TepegozApi,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

/** Browsing history + bookmarks (incl. the folder tree) + notification-center bridge methods.
 *  Split out of `index.ts` (ADR-0010 250-line cap). */
export const bookmarksHistoryApi: Pick<
  TepegozApi,
  | 'getHistory'
  | 'searchHistory'
  | 'deleteHistory'
  | 'clearHistory'
  | 'planSiteDataClear'
  | 'clearSiteData'
  | 'listBookmarks'
  | 'toggleBookmark'
  | 'isBookmarked'
  | 'getBookmarkTree'
  | 'importBookmarks'
  | 'exportBookmarks'
  | 'listClientCertificateChoices'
  | 'forgetClientCertificateChoices'
  | 'createBookmarkFolder'
  | 'renameBookmark'
  | 'removeBookmark'
  | 'moveBookmark'
  | 'showBookmarkContextMenu'
  | 'onBookmarkMenuAction'
  | 'onBookmarksChanged'
  | 'listNotifications'
  | 'onNotificationsState'
  | 'onNotificationToast'
  | 'dismissNotification'
  | 'dismissAllNotifications'
  | 'markNotificationRead'
  | 'markAllNotificationsRead'
  | 'onNotificationPermissionRequest'
  | 'onBasicAuthRequest'
  | 'respondBasicAuth'
  | 'onCertificateErrorRequest'
  | 'respondCertificateError'
  | 'onClientCertificateRequest'
  | 'respondClientCertificate'
  | 'respondNotificationPermission'
> = {
  getHistory: (params?: { limit?: number; offset?: number }) =>
    invoke<HistoryEntry[]>(IpcChannels.historyList, params),
  searchHistory: (params: { query: string; limit?: number; offset?: number }) =>
    invoke<HistoryEntry[]>(IpcChannels.historySearch, params),
  deleteHistory: (url: string) => invoke<void>(IpcChannels.historyDelete, url),
  clearHistory: () => invoke<void>(IpcChannels.historyClear),
  planSiteDataClear: (url: string) => invoke<SiteClearPlan | null>(IpcChannels.siteDataPlan, url),
  clearSiteData: (url: string) => invoke<SiteClearPlan | null>(IpcChannels.siteDataClear, url),
  listBookmarks: () => invoke<BookmarkEntry[]>(IpcChannels.bookmarksList),
  toggleBookmark: (url: string, title: string, favicon?: string | null) =>
    invoke<boolean>(IpcChannels.bookmarksToggle, { url, title, favicon }),
  isBookmarked: (url: string) => invoke<boolean>(IpcChannels.bookmarksIsBookmarked, url),
  getBookmarkTree: () => invoke<BookmarkTreeNode[]>(IpcChannels.bookmarksTree),
  exportBookmarks: () => invoke<string>(IpcChannels.bookmarksExport),
  importBookmarks: (input: BookmarkImportInput) =>
    invoke<BookmarkImportResult>(IpcChannels.bookmarksImport, input),
  createBookmarkFolder: (parentId: string, title: string, index?: number) =>
    invoke<void>(IpcChannels.bookmarksCreateFolder, { parentId, title, index }),
  renameBookmark: (id: string, title: string) =>
    invoke<void>(IpcChannels.bookmarksRename, { id, title }),
  removeBookmark: (id: string) => invoke<void>(IpcChannels.bookmarksRemove, id),
  moveBookmark: (id: string, newParentId: string, index: number) =>
    invoke<void>(IpcChannels.bookmarksMove, { id, newParentId, index }),
  showBookmarkContextMenu: (
    id: string,
    type: BookmarkNodeType,
    variant?: 'default' | 'folder-item',
  ) => {
    ipcRenderer.send(IpcChannels.bookmarksContextMenu, { id, type, variant });
  },
  onBookmarkMenuAction: (callback: (action: BookmarkMenuAction) => void) => {
    const listener = (_event: unknown, action: BookmarkMenuAction): void => callback(action);
    ipcRenderer.on(IpcChannels.bookmarksMenuAction, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.bookmarksMenuAction, listener);
    };
  },
  onBookmarksChanged: (callback: () => void) => {
    const listener = (): void => callback();
    ipcRenderer.on(IpcChannels.bookmarksChanged, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.bookmarksChanged, listener);
    };
  },
  listNotifications: () => invoke<NotificationState>(IpcChannels.notificationsList),
  onNotificationsState: (callback: (state: NotificationState) => void) => {
    const listener = (_event: unknown, state: NotificationState): void => {
      callback(state);
    };
    ipcRenderer.on(IpcChannels.notificationsState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.notificationsState, listener);
    };
  },
  onNotificationToast: (callback: (toast: AppNotification) => void) => {
    const listener = (_event: unknown, toast: AppNotification): void => {
      callback(toast);
    };
    ipcRenderer.on(IpcChannels.notificationsToast, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.notificationsToast, listener);
    };
  },
  dismissNotification: (id: string) => {
    ipcRenderer.send(IpcChannels.notificationsDismiss, id);
  },
  dismissAllNotifications: () => {
    ipcRenderer.send(IpcChannels.notificationsDismissAll);
  },
  markNotificationRead: (id: string) => {
    ipcRenderer.send(IpcChannels.notificationsMarkRead, id);
  },
  markAllNotificationsRead: () => {
    ipcRenderer.send(IpcChannels.notificationsMarkAllRead);
  },
  onNotificationPermissionRequest: (callback: (request: NotificationPermissionRequest) => void) => {
    const listener = (_event: unknown, request: NotificationPermissionRequest): void => {
      callback(request);
    };
    ipcRenderer.on(IpcChannels.notificationPermissionRequest, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.notificationPermissionRequest, listener);
    };
  },
  respondNotificationPermission: (response: NotificationPermissionResponse) => {
    ipcRenderer.send(IpcChannels.notificationPermissionRespond, response);
  },
  onBasicAuthRequest: (callback: (request: BasicAuthRequest) => void) => {
    const listener = (_event: unknown, request: BasicAuthRequest): void => {
      callback(request);
    };
    ipcRenderer.on(IpcChannels.authBasicRequest, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.authBasicRequest, listener);
    };
  },
  respondBasicAuth: (response: BasicAuthResponse) => {
    ipcRenderer.send(IpcChannels.authBasicRespond, response);
  },
  onCertificateErrorRequest: (callback: (request: CertificateErrorRequest) => void) => {
    const listener = (_event: unknown, request: CertificateErrorRequest): void => {
      callback(request);
    };
    ipcRenderer.on(IpcChannels.certificateErrorRequest, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.certificateErrorRequest, listener);
    };
  },
  respondCertificateError: (response: CertificateErrorResponse) => {
    ipcRenderer.send(IpcChannels.certificateErrorRespond, response);
  },
  onClientCertificateRequest: (callback: (request: ClientCertificateRequest) => void) => {
    const listener = (_event: unknown, request: ClientCertificateRequest): void => {
      callback(request);
    };
    ipcRenderer.on(IpcChannels.clientCertificateRequest, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.clientCertificateRequest, listener);
    };
  },
  respondClientCertificate: (response: ClientCertificateResponse) => {
    ipcRenderer.send(IpcChannels.clientCertificateRespond, response);
  },
  listClientCertificateChoices: () =>
    invoke<ClientCertificateChoice[]>(IpcChannels.clientCertificateList),
  forgetClientCertificateChoices: () => invoke<void>(IpcChannels.clientCertificateForget),
};

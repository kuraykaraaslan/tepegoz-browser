import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The history + bookmarks + notification-center + HITL-prompt slice of the preload bridge — one
 * shape, exhaustively pinned: every method to its exact channel + payload, `ipcRenderer.send`
 * fire-and-forget vs `invoke`, and every `on*` subscription wires a listener and removes exactly that
 * listener on its returned fn. What's worth calling out beyond the sweep: the payload RESHAPES —
 * getPageInfo → {url}, toggleBookmark → {url, title, favicon}, setBookmarkTags → {id, tags},
 * create/move-folder → their named triples, sendScreenshotEncoded → {requestId, bytes}.
 */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve()),
);
vi.mock('./ipc-invoke', () => ({ invoke }));
const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn(), send: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { bookmarksHistoryApi: api } = await import('./api-bookmarks-history');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue(undefined);
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
  ipc.send.mockClear();
});

type Row = [name: string, run: () => unknown, channel: string, payload?: unknown];

const INVOKES: Row[] = [
  ['getHistory', () => api.getHistory({ limit: 5 }), IpcChannels.historyList, { limit: 5 }],
  [
    'searchHistory',
    () => api.searchHistory({ query: 'w', forOmnibox: true }),
    IpcChannels.historySearch,
    { query: 'w', forOmnibox: true },
  ],
  ['deleteHistory', () => api.deleteHistory('u'), IpcChannels.historyDelete, 'u'],
  ['clearHistory', () => api.clearHistory(), IpcChannels.historyClear],
  ['planSiteDataClear', () => api.planSiteDataClear('u'), IpcChannels.siteDataPlan, 'u'],
  ['clearSiteData', () => api.clearSiteData('u'), IpcChannels.siteDataClear, 'u'],
  [
    'clearBrowsingData',
    () => api.clearBrowsingData({ range: 'last-hour', categories: ['history'] }),
    IpcChannels.browsingDataClear,
    { range: 'last-hour', categories: ['history'] },
  ],
  ['getPageInfo', () => api.getPageInfo('u'), IpcChannels.pageInfoGet, { url: 'u' }],
  ['listBookmarks', () => api.listBookmarks(), IpcChannels.bookmarksList],
  [
    'toggleBookmark',
    () => api.toggleBookmark('u', 'T', null),
    IpcChannels.bookmarksToggle,
    { url: 'u', title: 'T', favicon: null },
  ],
  ['isBookmarked', () => api.isBookmarked('u'), IpcChannels.bookmarksIsBookmarked, 'u'],
  ['getBookmarkTree', () => api.getBookmarkTree(), IpcChannels.bookmarksTree],
  ['listAgentCapabilities', () => api.listAgentCapabilities(), IpcChannels.agentCapabilitiesList],
  ['extractArticle', () => api.extractArticle(), IpcChannels.readerExtract],
  [
    'captureScreenshot',
    () => api.captureScreenshot('viewport'),
    IpcChannels.screenshotCapture,
    'viewport',
  ],
  ['openPrivateWindow', () => api.openPrivateWindow(), IpcChannels.windowsOpenPrivate],
  ['exportBookmarks', () => api.exportBookmarks(), IpcChannels.bookmarksExport],
  [
    'setBookmarkTags',
    () => api.setBookmarkTags('b', ['x']),
    IpcChannels.bookmarksSetTags,
    { id: 'b', tags: ['x'] },
  ],
  ['listBookmarkTags', () => api.listBookmarkTags(), IpcChannels.bookmarksListTags],
  [
    'importBookmarks',
    () => api.importBookmarks({ html: '<a>' } as never),
    IpcChannels.bookmarksImport,
    { html: '<a>' },
  ],
  ['detectBrowserProfiles', () => api.detectBrowserProfiles(), IpcChannels.bookmarksDetectProfiles],
  [
    'importBookmarkProfile',
    () => api.importBookmarkProfile('chrome:a'),
    IpcChannels.bookmarksImportProfile,
    'chrome:a',
  ],
  [
    'createBookmarkFolder',
    () => api.createBookmarkFolder('root', 'N', 1),
    IpcChannels.bookmarksCreateFolder,
    { parentId: 'root', title: 'N', index: 1 },
  ],
  [
    'renameBookmark',
    () => api.renameBookmark('b', 'N'),
    IpcChannels.bookmarksRename,
    { id: 'b', title: 'N' },
  ],
  ['removeBookmark', () => api.removeBookmark('b'), IpcChannels.bookmarksRemove, 'b'],
  [
    'moveBookmark',
    () => api.moveBookmark('b', 'f', 0),
    IpcChannels.bookmarksMove,
    { id: 'b', newParentId: 'f', index: 0 },
  ],
  ['listNotifications', () => api.listNotifications(), IpcChannels.notificationsList],
  [
    'listClientCertificateChoices',
    () => api.listClientCertificateChoices(),
    IpcChannels.clientCertificateList,
  ],
  [
    'forgetClientCertificateChoices',
    () => api.forgetClientCertificateChoices(),
    IpcChannels.clientCertificateForget,
  ],
];

const SENDS: Row[] = [
  [
    'sendScreenshotEncoded',
    () => api.sendScreenshotEncoded('r', new Uint8Array()),
    IpcChannels.screenshotEncoded,
    { requestId: 'r', bytes: new Uint8Array() },
  ],
  [
    'showBookmarkContextMenu',
    () => api.showBookmarkContextMenu('b', 'bookmark'),
    IpcChannels.bookmarksContextMenu,
    { id: 'b', type: 'bookmark', variant: undefined },
  ],
  [
    'dismissNotification',
    () => api.dismissNotification('n'),
    IpcChannels.notificationsDismiss,
    'n',
  ],
  [
    'dismissAllNotifications',
    () => api.dismissAllNotifications(),
    IpcChannels.notificationsDismissAll,
    undefined,
  ],
  [
    'markNotificationRead',
    () => api.markNotificationRead('n'),
    IpcChannels.notificationsMarkRead,
    'n',
  ],
  [
    'markAllNotificationsRead',
    () => api.markAllNotificationsRead(),
    IpcChannels.notificationsMarkAllRead,
    undefined,
  ],
  [
    'respondNotificationPermission',
    () => api.respondNotificationPermission({ ok: true } as never),
    IpcChannels.notificationPermissionRespond,
    { ok: true },
  ],
  [
    'respondBasicAuth',
    () => api.respondBasicAuth({ requestId: 'a', cancelled: true } as never),
    IpcChannels.authBasicRespond,
    { requestId: 'a', cancelled: true },
  ],
  [
    'respondCertificateError',
    () => api.respondCertificateError({ requestId: 'a', proceed: false }),
    IpcChannels.certificateErrorRespond,
    { requestId: 'a', proceed: false },
  ],
  [
    'respondClientCertificate',
    () => api.respondClientCertificate({ requestId: 'a' } as never),
    IpcChannels.clientCertificateRespond,
    { requestId: 'a' },
  ],
];

const SUBS: [
  name: string,
  subscribe: (cb: (...a: unknown[]) => void) => () => void,
  channel: string,
][] = [
  ['onScreenshotEncode', (cb) => api.onScreenshotEncode(cb), IpcChannels.screenshotEncode],
  ['onReaderToggle', (cb) => api.onReaderToggle(cb), IpcChannels.readerToggle],
  ['onBookmarkMenuAction', (cb) => api.onBookmarkMenuAction(cb), IpcChannels.bookmarksMenuAction],
  ['onBookmarksChanged', (cb) => api.onBookmarksChanged(cb), IpcChannels.bookmarksChanged],
  ['onNotificationsState', (cb) => api.onNotificationsState(cb), IpcChannels.notificationsState],
  ['onNotificationToast', (cb) => api.onNotificationToast(cb), IpcChannels.notificationsToast],
  [
    'onNotificationPermissionRequest',
    (cb) => api.onNotificationPermissionRequest(cb),
    IpcChannels.notificationPermissionRequest,
  ],
  ['onBasicAuthRequest', (cb) => api.onBasicAuthRequest(cb), IpcChannels.authBasicRequest],
  [
    'onCertificateErrorRequest',
    (cb) => api.onCertificateErrorRequest(cb),
    IpcChannels.certificateErrorRequest,
  ],
  [
    'onClientCertificateRequest',
    (cb) => api.onClientCertificateRequest(cb),
    IpcChannels.clientCertificateRequest,
  ],
];

describe.each(INVOKES)('invoke: %s', (_n, run, channel, payload) => {
  it('hits its channel with the right payload', () => {
    run();
    if (payload === undefined) expect(invoke).toHaveBeenCalledWith(channel);
    else expect(invoke).toHaveBeenCalledWith(channel, payload);
  });
});

describe.each(SENDS)('send: %s', (_n, run, channel, payload) => {
  it('is a fire-and-forget send, not an invoke', () => {
    run();
    if (payload === undefined) expect(ipc.send).toHaveBeenCalledWith(channel);
    else expect(ipc.send).toHaveBeenCalledWith(channel, payload);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe.each(SUBS)('subscription: %s', (_n, subscribe, channel) => {
  it('wires a listener and removes exactly that listener on the returned fn', () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    expect(ipc.on).toHaveBeenCalledWith(channel, expect.any(Function));
    const listener = ipc.on.mock.calls[0]![1] as (...a: unknown[]) => void;
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(channel, listener);
  });
});

describe('reopenClosedTab-style payload reshapes carry through the callback', () => {
  it('onScreenshotEncode forwards the whole payload; onReaderToggle forwards nothing', () => {
    const enc = vi.fn();
    api.onScreenshotEncode(enc);
    (ipc.on.mock.calls[0]![1] as (e: unknown, p: unknown) => void)({}, { requestId: 'r' });
    expect(enc).toHaveBeenCalledWith({ requestId: 'r' });

    ipc.on.mockClear();
    const toggle = vi.fn();
    api.onReaderToggle(toggle);
    (ipc.on.mock.calls[0]![1] as () => void)();
    expect(toggle).toHaveBeenCalledWith();
  });
});

describe('the notification / HITL-prompt listeners forward only their payload', () => {
  it.each([
    ['onNotificationsState', (cb: (p: unknown) => void) => api.onNotificationsState(cb), { unread: 2 }],
    ['onNotificationToast', (cb: (p: unknown) => void) => api.onNotificationToast(cb), { id: 't1', title: 'Hi' }],
    [
      'onNotificationPermissionRequest',
      (cb: (p: unknown) => void) => api.onNotificationPermissionRequest(cb),
      { requestId: 'p1', origin: 'https://x.test' },
    ],
    ['onBasicAuthRequest', (cb: (p: unknown) => void) => api.onBasicAuthRequest(cb), { requestId: 'a1', host: 'x.test' }],
    [
      'onCertificateErrorRequest',
      (cb: (p: unknown) => void) => api.onCertificateErrorRequest(cb),
      { requestId: 'c1', url: 'https://x.test' },
    ],
    [
      'onClientCertificateRequest',
      (cb: (p: unknown) => void) => api.onClientCertificateRequest(cb),
      { requestId: 'cc1', certificates: [] },
    ],
  ])('%s', (_n, subscribe, sample) => {
    const cb = vi.fn();
    subscribe(cb);
    (ipc.on.mock.calls[0]![1] as (e: unknown, p: unknown) => void)({ senderId: 1 }, sample);
    expect(cb).toHaveBeenCalledWith(sample);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `registerBrowsingIpc` — the file-picker / new-tab-background / notification-center / history /
 * bookmarks IPC surface. Pinned: history + bookmark handlers pass the validated payload to their store
 * (empty results when the DB is unavailable); `bookmarksToggle` refuses an unbookmarkable URL and
 * rebroadcasts on success; `newtabGetBackgroundImage` reconstructs a data URL from the blob store;
 * `newtabPickBackgroundImage` validates size + magic bytes (413 / 415) before storing; the notification
 * + auth responder channels delegate to their brokers; and `fileAccessPickFolder` canonicalizes picks.
 */

vi.mock('@tepegoz/desktop-ipc', () => ({
  IpcChannels: new Proxy({}, { get: (_t, k) => k, has: () => true }),
}));
vi.mock(
  '@tepegoz/desktop-ipc/schemas',
  () =>
    new Proxy(
      {},
      {
        get: (_t, k) => (k === '__esModule' ? true : { parse: (x: unknown) => x ?? {} }),
        has: () => true,
      },
    ),
);

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError }));

const notifStore = vi.hoisted(() => ({
  state: vi.fn(() => ({ items: [] })),
  dismiss: vi.fn(),
  markRead: vi.fn(),
  dismissAll: vi.fn(),
  markAllRead: vi.fn(),
}));
vi.mock('@tepegoz/notifications', () => ({ default: notifStore }));

const broker = vi.hoisted(() => ({ respond: vi.fn() }));
vi.mock('../web-permissions/permission-broker', () => ({ default: broker }));
vi.mock('../screenshots/user-screenshot.electron', () => ({ captureAndStore: vi.fn() }));
vi.mock('../reader/reader.electron', () => ({
  readActiveTabArticle: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../web-permissions/agent-matrix', () => ({ agentCapabilityMatrix: () => [] }));
vi.mock('../private-window-opener', () => ({ openPrivateWindow: vi.fn() }));
const basicAuth = vi.hoisted(() => ({ resolveBasicAuth: vi.fn() }));
vi.mock('../auth/basic-auth-broker', () => basicAuth);
const certBroker = vi.hoisted(() => ({ resolveCertificateError: vi.fn() }));
vi.mock('../auth/certificate-broker', () => certBroker);
const clientCert = vi.hoisted(() => ({
  clearClientCertificateChoices: vi.fn(),
  listClientCertificateChoices: vi.fn(() => []),
  resolveClientCertificate: vi.fn(),
}));
vi.mock('../auth/client-certificate-broker', () => clientCert);

const HistoryStore = vi.hoisted(() => ({
  list: vi.fn(() => ['H']),
  search: vi.fn(() => ['S']),
  searchForOmnibox: vi.fn(() => ['O']),
  deleteUrl: vi.fn(),
  clear: vi.fn(),
}));
const BlobStore = vi.hoisted(() => ({
  get: vi.fn((): Buffer | undefined => undefined),
  put: vi.fn(() => 'cas://ref1'),
}));
vi.mock('@tepegoz/persistence', () => ({ HistoryStore, BlobStore }));

const BookmarkTreeStore = vi.hoisted(() => ({
  listFlat: vi.fn(() => ['B']),
  toggleAtBar: vi.fn(() => true),
  isBookmarked: vi.fn(() => false),
}));
const isBookmarkable = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/bookmarks', () => ({
  BookmarkTreeStore,
  importBookmarksHtmlToStore: vi.fn(),
  isBookmarkable,
  serializeBookmarksHtml: () => '<html></html>',
}));
vi.mock('./ipc-bookmark-profiles', () => ({ registerBookmarkProfileIpc: vi.fn() }));
vi.mock('../file-operations/file-operations-host', () => ({
  default: { canonicalize: (p: string) => Promise.resolve(`/real${p}`) },
}));

const getDb = vi.hoisted(() => vi.fn((): unknown => ({ __db: true })));
vi.mock('../db/database.electron', () => ({ getDb }));

const H = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, p: unknown) => unknown>(),
  actions: new Map<string, (v: unknown) => void>(),
  signals: new Map<string, () => void>(),
}));
vi.mock('./ipc-helpers', () => ({
  handle: (ch: string, fn: (e: unknown, p: unknown) => unknown) => H.handlers.set(ch, fn),
  handleAsync: (ch: string, fn: (e: unknown, p: unknown) => unknown) => H.handlers.set(ch, fn),
  onAction: (ch: string, _schema: unknown, fn: (v: unknown) => void) => H.actions.set(ch, fn),
  onSignal: (ch: string, fn: () => void) => H.signals.set(ch, fn),
}));

const bw = vi.hoisted(() => ({
  fromWebContents: vi.fn((): unknown => null),
  getAllWindows: vi.fn(() => [] as unknown[]),
}));
const dialog = vi.hoisted(() => ({
  showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] as string[] })),
}));
vi.mock('electron', () => ({ BrowserWindow: bw, dialog }));

const readFile = vi.hoisted(() => vi.fn((): Promise<Buffer> => Promise.resolve(Buffer.from([]))));
vi.mock('node:fs/promises', () => ({ readFile }));

const mod = await import('./ipc-content-browsing');
const event = { sender: {} };
const call = (ch: string, payload?: unknown): unknown => H.handlers.get(ch)!(event, payload);

beforeEach(() => {
  vi.clearAllMocks();
  getDb.mockReturnValue({ __db: true });
  isBookmarkable.mockReturnValue(true);
  bw.getAllWindows.mockReturnValue([]);
  BlobStore.get.mockReturnValue(undefined);
  dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
  mod.registerBrowsingIpc();
});

describe('history', () => {
  it('list / delete / clear pass through to HistoryStore, and empty when the DB is gone', () => {
    expect(call('historyList', { limit: 10, offset: 0 })).toEqual(['H']);
    call('historyDelete', 'https://x/');
    call('historyClear');
    expect(HistoryStore.deleteUrl).toHaveBeenCalledWith({ __db: true }, 'https://x/');
    expect(HistoryStore.clear).toHaveBeenCalled();

    getDb.mockReturnValue(null);
    expect(call('historyList', {})).toEqual([]);
  });

  it('search lists on an empty query, omnibox-searches or full-searches otherwise', () => {
    expect(call('historySearch', { query: '   ', limit: 5, offset: 0 })).toEqual(['H']);
    expect(call('historySearch', { query: 'cat', limit: 5, offset: 0, forOmnibox: true })).toEqual([
      'O',
    ]);
    expect(call('historySearch', { query: 'cat', limit: 5, offset: 0, forOmnibox: false })).toEqual(
      ['S'],
    );
  });
});

describe('bookmarks', () => {
  it('list delegates to the tree store', () => {
    expect(call('bookmarksList')).toEqual(['B']);
  });

  it('toggle refuses an unbookmarkable URL, else toggles + rebroadcasts', () => {
    isBookmarkable.mockReturnValue(false);
    expect(call('bookmarksToggle', { url: 'javascript:x', title: 't' })).toBe(false);

    isBookmarkable.mockReturnValue(true);
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    bw.getAllWindows.mockReturnValue([win]);
    expect(call('bookmarksToggle', { url: 'https://x/', title: 't', favicon: null })).toBe(true);
    expect(BookmarkTreeStore.toggleAtBar).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith('bookmarksChanged');
  });
});

describe('new-tab background image', () => {
  it('reconstructs a data URL from the blob store, or null when absent', () => {
    BlobStore.get.mockReturnValue(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]));
    expect(call('newtabGetBackgroundImage', 'cas://x')).toMatch(/^data:image\/png;base64,/);

    BlobStore.get.mockReturnValue(undefined);
    expect(call('newtabGetBackgroundImage', 'cas://x')).toBeNull();
  });

  it('picker: cancel returns a cancelled result', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await call('newtabPickBackgroundImage')).toEqual({
      ref: '',
      dataUrl: '',
      cancelled: true,
    });
  });

  it('picker: a valid PNG is stored and returned as a data URL', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/pics/bg.png'] });
    readFile.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]));
    const res = (await call('newtabPickBackgroundImage')) as { ref: string; cancelled: boolean };
    expect(res).toMatchObject({ ref: 'cas://ref1', cancelled: false });
    expect(BlobStore.put).toHaveBeenCalled();
  });

  it('picker: 413 on an oversized image, 415 on an unrecognised type', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/pics/big.png'] });
    readFile.mockResolvedValue(Buffer.alloc(9 * 1024 * 1024, 0x89));
    await expect(call('newtabPickBackgroundImage')).rejects.toMatchObject({ statusCode: 413 });

    readFile.mockResolvedValue(Buffer.from([1, 2, 3, 4, 5, 6]));
    await expect(call('newtabPickBackgroundImage')).rejects.toMatchObject({ statusCode: 415 });
  });
});

describe('responder + list channels', () => {
  it('notification center: snapshot + fire-and-forget mutations', () => {
    expect(call('notificationsList')).toEqual({ items: [] });
    H.actions.get('notificationsDismiss')!('n1');
    H.signals.get('notificationsDismissAll')!();
    expect(notifStore.dismiss).toHaveBeenCalledWith('n1');
    expect(notifStore.dismissAll).toHaveBeenCalled();
  });

  it('auth responders forward to their brokers', () => {
    H.actions.get('authBasicRespond')!({ ok: true });
    H.actions.get('certificateErrorRespond')!({ proceed: false });
    H.actions.get('notificationPermissionRespond')!({ allow: true });
    expect(basicAuth.resolveBasicAuth).toHaveBeenCalledWith({ ok: true });
    expect(certBroker.resolveCertificateError).toHaveBeenCalledWith({ proceed: false });
    expect(broker.respond).toHaveBeenCalledWith({ allow: true });
  });

  it('client-certificate forget clears every remembered choice', () => {
    call('clientCertificateForget');
    expect(clientCert.clearClientCertificateChoices).toHaveBeenCalled();
  });
});

describe('fileAccessPickFolder', () => {
  it('canonicalizes the picked folders', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/home/docs'] });
    expect(await call('fileAccessPickFolder')).toEqual({
      paths: ['/real/home/docs'],
      cancelled: false,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-content-browsing.ts` — history + bookmarks + notification-center + HITL-response IPC. This
 * suite pins the history query branching and the HITL relays (the rest of the ~29 handlers are the
 * same delegation shape):
 *   - historyList / historySearch return [] when there is no database;
 *   - historySearch: an empty query falls back to `list`; `forOmnibox` routes to
 *     `searchForOmnibox` (time-windowed), otherwise plain `search`;
 *   - historyDelete / historyClear no-op without a db;
 *   - authBasicRespond / certificateErrorRespond `safeParse` the renderer payload before relaying;
 *   - windowsOpenPrivate delegates to the private-window opener.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => h.handlers.set(c, fn),
    on: (c: string, fn: (e: unknown, p: unknown) => void) => h.listeners.set(c, fn),
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => ({ id: 'w' }), getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn() },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { forbidden: 'forbidden' } }),
}));

const db = vi.hoisted((): { value: unknown } => ({ value: {} }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const store = vi.hoisted(() => ({
  list: vi.fn(() => [{ url: 'a' }]),
  search: vi.fn(() => [{ url: 'plain' }]),
  searchForOmnibox: vi.fn(() => [{ url: 'omni' }]),
  deleteUrl: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('@tepegoz/persistence', () => ({
  HistoryStore: store,
  BlobStore: { put: vi.fn(), get: vi.fn() },
}));

const openPrivateWindow = vi.hoisted(() => vi.fn());
vi.mock('../private-window-opener', () => ({ openPrivateWindow }));
const resolveBasicAuth = vi.hoisted(() => vi.fn());
vi.mock('../auth/basic-auth-broker', () => ({ resolveBasicAuth }));
const resolveCertificateError = vi.hoisted(() => vi.fn());
vi.mock('../auth/certificate-broker', () => ({ resolveCertificateError }));
vi.mock('../auth/client-certificate-broker', () => ({
  clearClientCertificateChoices: vi.fn(),
  listClientCertificateChoices: vi.fn(() => []),
  resolveClientCertificate: vi.fn(),
}));
vi.mock('@tepegoz/notifications', () => ({
  default: { state: () => ({ items: [] }), add: vi.fn(), subscribe: vi.fn() },
}));
vi.mock('../web-permissions/permission-broker', () => ({ default: {} }));
vi.mock('../web-permissions/agent-matrix', () => ({ agentCapabilityMatrix: () => [] }));
vi.mock('../screenshots/user-screenshot.electron', () => ({ captureAndStore: vi.fn() }));
vi.mock('../reader/reader.electron', () => ({ readActiveTabArticle: vi.fn() }));
vi.mock('../file-operations/file-operations-host', () => ({ default: {} }));
vi.mock('./ipc-bookmark-profiles', () => ({ registerBookmarkProfileIpc: vi.fn() }));
vi.mock('@tepegoz/bookmarks', () => ({
  BookmarkTreeStore: class {},
  importBookmarksHtmlToStore: vi.fn(),
  isBookmarkable: () => true,
  serializeBookmarksHtml: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));

const { registerBrowsingIpc } = await import('./ipc-content-browsing');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const call = (channel: string, payload?: unknown) => h.handlers.get(channel)?.(ev, payload);
const fire = (channel: string, payload?: unknown) => h.listeners.get(channel)?.(ev, payload);

beforeEach(() => {
  h.handlers.clear();
  h.listeners.clear();
  Object.values(store).forEach((f) => f.mockClear());
  openPrivateWindow.mockClear();
  resolveBasicAuth.mockClear();
  resolveCertificateError.mockClear();
  db.value = {};
  registerBrowsingIpc();
});

describe('history — no database', () => {
  it('list / search return [] and no store call', () => {
    db.value = null;
    expect(call(IpcChannels.historyList, {})).toEqual([]);
    expect(call(IpcChannels.historySearch, { query: 'x' })).toEqual([]);
    call(IpcChannels.historyDelete, 'https://ex.test/');
    call(IpcChannels.historyClear);
    expect(store.deleteUrl).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
  });
});

describe('historySearch branching', () => {
  it('an empty / whitespace query falls back to list', () => {
    call(IpcChannels.historySearch, { query: '   ' });
    expect(store.list).toHaveBeenCalled();
    expect(store.search).not.toHaveBeenCalled();
  });

  it('forOmnibox routes to the time-windowed omnibox search', () => {
    call(IpcChannels.historySearch, { query: 'weather', forOmnibox: true, limit: 8 });
    expect(store.searchForOmnibox).toHaveBeenCalledWith(db.value, 'weather', expect.any(Number), 8);
    expect(store.search).not.toHaveBeenCalled();
  });

  it('a plain search (no forOmnibox) routes to `search` with db + query + limit', () => {
    call(IpcChannels.historySearch, { query: 'weather', limit: 8 });
    expect(store.searchForOmnibox).not.toHaveBeenCalled();
    expect(store.search).toHaveBeenCalledTimes(1);
    expect(store.search.mock.calls[0]!.slice(0, 3)).toEqual([db.value, 'weather', 8]);
  });
});

describe('history mutations', () => {
  it('delete validates the url then deletes; clear clears', () => {
    call(IpcChannels.historyDelete, 'https://ex.test/');
    call(IpcChannels.historyClear);
    expect(store.deleteUrl).toHaveBeenCalledWith(db.value, 'https://ex.test/');
    expect(store.clear).toHaveBeenCalledWith(db.value);
  });
});

describe('windowsOpenPrivate', () => {
  it('delegates to the private-window opener', () => {
    call(IpcChannels.windowsOpenPrivate);
    expect(openPrivateWindow).toHaveBeenCalledTimes(1);
  });
});

describe('HITL responses are relayed after a safeParse', () => {
  it('a valid basic-auth response reaches resolveBasicAuth', () => {
    fire(IpcChannels.authBasicRespond, {
      requestId: 'a1',
      cancelled: false,
      username: 'u',
      password: 'p',
    });
    expect(resolveBasicAuth).toHaveBeenCalledTimes(1);
  });

  it('a malformed basic-auth response is dropped', () => {
    fire(IpcChannels.authBasicRespond, { requestId: 'a1' });
    expect(resolveBasicAuth).not.toHaveBeenCalled();
  });

  it('a valid certificate-error response reaches resolveCertificateError', () => {
    fire(IpcChannels.certificateErrorRespond, { requestId: 'c1', proceed: false });
    expect(resolveCertificateError).toHaveBeenCalledTimes(1);
  });
});

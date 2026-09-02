import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-content-extensions.ts` — user-agent / popup-blocker / adblock / typo / translate / video IPC.
 * Pure delegation; what's pinned is that each payload is schema-checked before the host is touched,
 * the typo-dictionary progress listener broadcasts to every live window, and an untrusted sender frame
 * reaches nothing.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
}));
const bw = vi.hoisted(() => ({ windows: [] as unknown[] }));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => bw.windows, fromWebContents: () => ({ id: 'w' }) },
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => h.handlers.set(c, fn),
    on: (c: string, fn: (e: unknown, p: unknown) => void) => h.listeners.set(c, fn),
    removeHandler: () => undefined,
  },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { forbidden: 'forbidden' } }),
}));

const stub = (methods: string[]) => Object.fromEntries(methods.map((m) => [m, vi.fn(() => ({}))]));

const uaHost = vi.hoisted(() => ({ get: vi.fn(() => 'UA'), set: vi.fn((v: unknown) => v) }));
vi.mock('../extensions/user-agent-host.electron', () => ({ default: uaHost }));

const popupHost = vi.hoisted(() => ({
  get: vi.fn(() => ({})),
  update: vi.fn((p: unknown) => p),
  trustOrigin: vi.fn(),
  getRecentRequests: vi.fn(() => []),
}));
vi.mock('../extensions/popup-blocker-host.electron', () => ({ default: popupHost }));

const adHost = vi.hoisted(() => ({
  get: vi.fn(() => ({})),
  update: vi.fn((p: unknown) => p),
  state: vi.fn(() => ({})),
  setSiteEnabled: vi.fn((o: string, e: boolean) => ({ o, e })),
}));
vi.mock('../extensions/adblock-host.electron', () => ({ default: adHost }));
vi.mock('../extensions/adblock-engine.electron', () => ({
  default: { refresh: vi.fn(() => Promise.resolve()) },
}));

const typoHost = vi.hoisted(() => ({
  get: vi.fn(() => ({})),
  update: vi.fn((p: unknown) => p),
  state: vi.fn(() => ({})),
  check: vi.fn((i: unknown) => ({ i })),
  setSiteEnabled: vi.fn(),
  addIgnoredWord: vi.fn(),
}));
vi.mock('../extensions/typo-host.electron', () => ({ default: typoHost }));

const dictMgr = vi.hoisted(() => ({
  setProgressListener: vi.fn(),
  list: vi.fn(() => []),
  download: vi.fn(() => Promise.resolve()),
  cancel: vi.fn(),
  remove: vi.fn(),
  showFolder: vi.fn(() => Promise.resolve()),
}));
vi.mock('../extensions/typo-dictionary-manager.electron', () => ({ default: dictMgr }));

vi.mock('../extensions/translate-host.electron', () => ({
  default: stub([
    'get',
    'update',
    'state',
    'pageState',
    'translateText',
    'setSiteEnabled',
    'addGlossary',
    'removeGlossary',
  ]),
  respondTranslateCloudFallback: vi.fn(),
}));
vi.mock('../extensions/translate-page-injector-controller.electron', () => ({
  default: stub(['toggle', 'retranslate']),
}));
vi.mock('../extensions/video-player-host.electron', () => ({
  default: stub(['get', 'update', 'state', 'setSiteEnabled']),
}));
vi.mock('../extensions/video-player-page-injector.electron', () => ({
  default: stub(['toggle']),
  getVideoPlayerPageState: vi.fn(() => ({})),
}));

const { registerExtensionsIpc } = await import('./ipc-content-extensions');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil.example/' }, sender: {} };
const call = (c: string, p?: unknown, e: unknown = ev) => h.handlers.get(c)?.(e, p);

beforeEach(() => {
  h.handlers.clear();
  h.listeners.clear();
  bw.windows = [];
  [uaHost, popupHost, adHost, typoHost, dictMgr].forEach((o) =>
    Object.values(o).forEach((f) => (f as ReturnType<typeof vi.fn>).mockClear()),
  );
  registerExtensionsIpc();
});

describe('schema-gated delegation', () => {
  it('user-agent:set validates a nullable string then applies it', () => {
    expect(call(IpcChannels.userAgentSet, 'Mozilla/5.0')).toBe('Mozilla/5.0');
    expect(uaHost.set).toHaveBeenCalledWith('Mozilla/5.0');
    expect(() => call(IpcChannels.userAgentSet, { not: 'a string' })).toThrow();
  });

  it('adblock:set rejects an unknown blockingMode, accepts a valid partial patch', () => {
    expect(() => call(IpcChannels.adblockSet, { blockingMode: 'everything' })).toThrow();
    call(IpcChannels.adblockSet, { enabled: false });
    expect(adHost.update).toHaveBeenCalledWith({ enabled: false });
  });

  it('adblock:site-set needs an {origin, enabled} pair', () => {
    call(IpcChannels.adblockSiteSet, { origin: 'https://ex.test', enabled: false });
    expect(adHost.setSiteEnabled).toHaveBeenCalledWith('https://ex.test', false);
    expect(() => call(IpcChannels.adblockSiteSet, { origin: 'https://ex.test' })).toThrow();
  });

  it('typo:check requires non-empty text', async () => {
    await call(IpcChannels.typoCheck, { text: 'teh cat' });
    expect(typoHost.check).toHaveBeenCalledWith(expect.objectContaining({ text: 'teh cat' }));
    await expect(call(IpcChannels.typoCheck, { text: '' })).rejects.toBeDefined();
  });

  it('typo:dictionary-download validates the id before touching the manager', async () => {
    await expect(call(IpcChannels.typoDictionaryDownload, 'x'.repeat(200))).rejects.toBeDefined();
    expect(dictMgr.download).not.toHaveBeenCalled();
    await call(IpcChannels.typoDictionaryDownload, 'en-US');
    expect(dictMgr.download).toHaveBeenCalledWith('en-US');
  });
});

describe('typo-dictionary progress broadcast', () => {
  it('pushes dictionary state to every live window', () => {
    const send = vi.fn();
    bw.windows = [
      { isDestroyed: () => false, webContents: { send } },
      { isDestroyed: () => true, webContents: { send: vi.fn() } },
    ];
    const listener = dictMgr.setProgressListener.mock.calls[0]![0] as (d: unknown) => void;
    listener([{ id: 'en-US', progress: 1 }]);
    expect(send).toHaveBeenCalledWith(IpcChannels.typoDictionariesState, [
      { id: 'en-US', progress: 1 },
    ]);
  });
});

describe('untrusted sender', () => {
  it('reaches none of the extension hosts', () => {
    expect(() => call(IpcChannels.adblockGet, undefined, evil)).toThrow();
    expect(() => call(IpcChannels.typoGet, undefined, evil)).toThrow();
    expect(adHost.get).not.toHaveBeenCalled();
    expect(typoHost.get).not.toHaveBeenCalled();
  });
});

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

const translateHost = vi.hoisted(() => ({
  get: vi.fn(() => ({})),
  update: vi.fn((p: unknown) => p),
  state: vi.fn(() => ({})),
  translateText: vi.fn((i: unknown) => ({ i })),
  setSiteEnabled: vi.fn((o: string, e: boolean) => ({ o, e })),
  addGlossaryTerm: vi.fn((t: unknown) => ({ t })),
  removeGlossaryTerm: vi.fn((id: unknown) => ({ id })),
}));
const respondTranslateCloudFallback = vi.hoisted(() => vi.fn());
vi.mock('../extensions/translate-host.electron', () => ({
  default: translateHost,
  respondTranslateCloudFallback,
}));
const translatePageInjector = vi.hoisted(() => ({
  translateActive: vi.fn(() => Promise.resolve(null)),
  restoreActive: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../extensions/translate-page-injector-controller.electron', () => ({
  default: translatePageInjector,
}));
const videoHost = vi.hoisted(() => ({
  get: vi.fn(() => ({})),
  update: vi.fn((p: unknown) => p),
  setSiteEnabled: vi.fn((o: string, e: boolean) => ({ o, e })),
}));
vi.mock('../extensions/video-player-host.electron', () => ({ default: videoHost }));
const videoInjector = vi.hoisted(() => ({ refreshActive: vi.fn(() => Promise.resolve()) }));
vi.mock('../extensions/video-player-page-injector.electron', () => ({
  default: videoInjector,
  getVideoPlayerPageState: vi.fn(() => ({ __page: true })),
}));

const { registerExtensionsIpc } = await import('./ipc-content-extensions');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil.example/' }, sender: {} };
const call = (c: string, p?: unknown, e: unknown = ev) => h.handlers.get(c)?.(e, p);
const fire = (c: string, p?: unknown, e: unknown = ev) => h.listeners.get(c)?.(e, p);

beforeEach(() => {
  h.handlers.clear();
  h.listeners.clear();
  bw.windows = [];
  [
    uaHost,
    popupHost,
    adHost,
    typoHost,
    dictMgr,
    translateHost,
    translatePageInjector,
    videoHost,
    videoInjector,
  ].forEach((o) => Object.values(o).forEach((f) => (f as ReturnType<typeof vi.fn>).mockClear()));
  respondTranslateCloudFallback.mockClear();
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

describe('read-only delegators forward straight to their host', () => {
  it('user-agent / popup-blocker / adblock / typo reads', async () => {
    expect(call(IpcChannels.userAgentGet)).toBe('UA');
    call(IpcChannels.popupBlockerGet);
    expect(popupHost.get).toHaveBeenCalled();
    call(IpcChannels.popupBlockerRecentRequests);
    expect(popupHost.getRecentRequests).toHaveBeenCalled();
    call(IpcChannels.adblockGet);
    call(IpcChannels.adblockState);
    expect(adHost.state).toHaveBeenCalled();
    call(IpcChannels.typoGet);
    call(IpcChannels.typoState);
    call(IpcChannels.typoDictionariesList);
    expect(dictMgr.list).toHaveBeenCalled();

    await call(IpcChannels.adblockRefresh);
    await call(IpcChannels.typoDictionaryShowFolder);
    expect(dictMgr.showFolder).toHaveBeenCalled();
  });

  it('translate + video reads', async () => {
    call(IpcChannels.translateGet);
    call(IpcChannels.translateState);
    expect(translateHost.state).toHaveBeenCalled();
    await call(IpcChannels.translatePageStart);
    expect(translatePageInjector.translateActive).toHaveBeenCalled();
    await call(IpcChannels.translatePageRestore);
    expect(translatePageInjector.restoreActive).toHaveBeenCalled();

    call(IpcChannels.videoPlayerGet);
    expect(videoHost.get).toHaveBeenCalled();
    const state = call(IpcChannels.videoPlayerState) as { page: unknown };
    expect(state.page).toEqual({ __page: true });
  });
});

describe('write delegators validate then apply', () => {
  it('popup-blocker:trust routes a valid origin to the host (onAction)', () => {
    fire(IpcChannels.popupBlockerTrust, 'https://trusted.test');
    expect(popupHost.trustOrigin).toHaveBeenCalledWith('https://trusted.test');
    fire(IpcChannels.popupBlockerTrust, 42); // invalid → swallowed, host untouched
    expect(popupHost.trustOrigin).toHaveBeenCalledTimes(1);
  });

  it('typo:site-set / ignored-word-add / dictionary-delete / dictionary-cancel', () => {
    call(IpcChannels.typoSiteSet, { origin: 'https://x.test', enabled: false });
    expect(typoHost.setSiteEnabled).toHaveBeenCalledWith('https://x.test', false);

    call(IpcChannels.typoIgnoredWordAdd, { word: 'blorp', language: 'en' });
    expect(typoHost.addIgnoredWord).toHaveBeenCalledWith('blorp', 'en');

    call(IpcChannels.typoDictionaryDelete, 'en-US');
    expect(dictMgr.remove).toHaveBeenCalledWith('en-US');

    fire(IpcChannels.typoDictionaryCancel, 'en-US');
    expect(dictMgr.cancel).toHaveBeenCalledWith('en-US');
  });

  it('translate:site-set / glossary add+remove / cloud-fallback-respond', () => {
    call(IpcChannels.translateSiteSet, { origin: 'https://x.test', enabled: true });
    expect(translateHost.setSiteEnabled).toHaveBeenCalledWith('https://x.test', true);

    call(IpcChannels.translateGlossaryAdd, {
      source: 'cat',
      target: 'kedi',
      caseSensitive: false,
    });
    expect(translateHost.addGlossaryTerm).toHaveBeenCalled();

    call(IpcChannels.translateGlossaryRemove, 'gloss-1');
    expect(translateHost.removeGlossaryTerm).toHaveBeenCalledWith('gloss-1');

    fire(IpcChannels.translateCloudFallbackRespond, {
      requestId: 'r1',
      allow: true,
      remember: false,
    });
    expect(respondTranslateCloudFallback).toHaveBeenCalled();
  });

  it('video-player:site-set re-skins the active tab after the update', async () => {
    await call(IpcChannels.videoPlayerSiteSet, { origin: 'https://x.test', enabled: false });
    expect(videoHost.setSiteEnabled).toHaveBeenCalledWith('https://x.test', false);
    expect(videoInjector.refreshActive).toHaveBeenCalled();
  });

  it('the settings-patch write delegators hand the schema-checked patch to their host', async () => {
    call(IpcChannels.popupBlockerSet, { enabled: true });
    expect(popupHost.update).toHaveBeenCalledWith({ enabled: true });

    call(IpcChannels.typoSet, { autoDetectLanguage: false });
    expect(typoHost.update).toHaveBeenCalledWith({ autoDetectLanguage: false });

    call(IpcChannels.translateSet, { enabled: false });
    expect(translateHost.update).toHaveBeenCalledWith({ enabled: false });

    await call(IpcChannels.translateText, { text: 'hola mundo' });
    expect(translateHost.translateText).toHaveBeenCalledWith({ text: 'hola mundo' });

    await call(IpcChannels.videoPlayerSet, { theme: 'dark' });
    expect(videoHost.update).toHaveBeenCalledWith({ theme: 'dark' });
    expect(videoInjector.refreshActive).toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-content-tools.ts` — on-device model management + macros IPC. Pinned:
 *   - model ids are schema-checked before ModelManager is touched;
 *   - the progress listener ModelManager is handed broadcasts `models:state` to every live window;
 *   - EVERY macros handler is behind the `com.tepegoz.macros` enabled-gate — the direct IPC path
 *     cannot outlive the extension (ADR-0024), so it throws 403 when the extension is disabled;
 *   - macro ids are schema-checked; an untrusted sender frame reaches nothing.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
}));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => bw.windows, fromWebContents: () => ({ id: 'win' }) },
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => h.handlers.set(c, fn),
    on: (c: string, fn: (e: unknown, p: unknown) => void) => h.listeners.set(c, fn),
    removeHandler: () => undefined,
  },
}));
const bw = vi.hoisted(() => ({ windows: [] as unknown[] }));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { forbidden: 'forbidden' } }),
}));

vi.mock('@tepegoz/ext-macros/manifest', () => ({ macrosManifest: { id: 'com.tepegoz.macros' } }));

const mm = vi.hoisted(() => ({
  setProgressListener: vi.fn(),
  list: vi.fn(() => [{ id: 'm1' }]),
  download: vi.fn(() => Promise.resolve()),
  cancel: vi.fn(),
  select: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../model-catalog/model-manager.electron', () => ({ default: mm }));

const macros = vi.hoisted(() => ({
  list: vi.fn(() => [{ id: 'x1' }]),
  get: vi.fn((id: string) => ({ id })),
  save: vi.fn(),
  delete: vi.fn(),
  attachCsv: vi.fn(),
  run: vi.fn(() => 'run-1'),
}));
vi.mock('../macro/macro-service.electron', () => ({ default: macros }));

const prefs = vi.hoisted((): { extensions: { id: string; status: string }[] } => ({
  extensions: [],
}));
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs } }));
vi.mock('../tabs', () => ({ default: { getContentBounds: () => ({ x: 0, y: 0 }) } }));

const { registerToolsIpc } = await import('./ipc-content-tools');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil.example/' }, sender: {} };
const call = (channel: string, payload?: unknown, event: unknown = ev) =>
  h.handlers.get(channel)?.(event, payload);

beforeEach(() => {
  h.handlers.clear();
  h.listeners.clear();
  bw.windows = [];
  Object.values(mm).forEach((f) => f.mockClear());
  Object.values(macros).forEach((f) => f.mockClear());
  prefs.extensions = [];
  registerToolsIpc();
});

describe('on-device models', () => {
  it('lists via ModelManager', () => {
    expect(call(IpcChannels.modelsList)).toEqual([{ id: 'm1' }]);
  });

  it('rejects an over-long model id before downloading', async () => {
    await expect(call(IpcChannels.modelsDownload, 'x'.repeat(200))).rejects.toBeDefined();
    expect(mm.download).not.toHaveBeenCalled();
  });

  it('select / delete validate the id then delegate', () => {
    call(IpcChannels.modelsSelect, 'llama-3');
    call(IpcChannels.modelsDelete, 'llama-3');
    expect(mm.select).toHaveBeenCalledWith('llama-3');
    expect(mm.remove).toHaveBeenCalledWith('llama-3');
  });

  it('broadcasts models:state to every live window from the progress listener', () => {
    const send = vi.fn();
    bw.windows = [
      { isDestroyed: () => false, webContents: { send } },
      { isDestroyed: () => true, webContents: { send: vi.fn() } },
    ];
    const listener = mm.setProgressListener.mock.calls[0]![0] as (m: unknown) => void;
    listener([{ id: 'm1', progress: 0.5 }]);
    expect(send).toHaveBeenCalledWith(IpcChannels.modelsState, [{ id: 'm1', progress: 0.5 }]);
  });
});

describe('macros enabled-gate', () => {
  it('serves list/get when com.tepegoz.macros is enabled', () => {
    expect(call(IpcChannels.macrosList)).toEqual([{ id: 'x1' }]);
    expect(call(IpcChannels.macrosGet, 'x1')).toEqual({ id: 'x1' });
  });

  it('throws 403 on every macros handler when the extension is disabled', () => {
    prefs.extensions = [{ id: 'com.tepegoz.macros', status: 'disabled' }];
    for (const ch of [IpcChannels.macrosList, IpcChannels.macrosGet, IpcChannels.macrosDelete]) {
      expect(() => call(ch, 'x1')).toThrow(/disabled/);
    }
    expect(macros.list).not.toHaveBeenCalled();
    expect(macros.delete).not.toHaveBeenCalled();
  });

  it('validates the macro id on get/delete', () => {
    expect(() => call(IpcChannels.macrosGet, '')).toThrow();
    expect(() => call(IpcChannels.macrosDelete, '')).toThrow();
  });
});

describe('untrusted sender', () => {
  it('reaches neither the model nor the macro services', () => {
    expect(() => call(IpcChannels.modelsList, undefined, evil)).toThrow();
    expect(() => call(IpcChannels.macrosList, undefined, evil)).toThrow();
    expect(mm.list).not.toHaveBeenCalled();
    expect(macros.list).not.toHaveBeenCalled();
  });
});

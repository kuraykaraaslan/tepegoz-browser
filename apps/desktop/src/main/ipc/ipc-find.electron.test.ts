import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-find.ts` — find-in-page + the omnibox/menu zoom controls. Delegation, mostly; what it decides
 * is (1) every channel targets the SENDER window's active tab (never the focused one), (2) an internal
 * tab with no WebContents is a silent no-op rather than a crash, (3) a bad `zoom:command` direction is
 * dropped by the schema, and (4) untrusted frames route nowhere.
 */

interface FakeWc {
  isDestroyed: () => boolean;
  getZoomFactor: () => number;
}

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
  window: { id: 'win' },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => {
      h.handlers.set(c, fn);
    },
    on: (c: string, fn: (e: unknown, p: unknown) => void) => {
      h.listeners.set(c, fn);
    },
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => h.window },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({ mainStrings: () => ({ errors: { forbidden: 'forbidden' } }) }));

const find = vi.hoisted(() => ({ run: vi.fn(), stop: vi.fn() }));
vi.mock('../find-in-page', () => ({
  runFindInPage: (win: unknown, wc: unknown, query: unknown) => {
    find.run(win, wc, query);
  },
  stopFindInPage: (wc: unknown) => {
    find.stop(wc);
  },
}));

const wt = vi.hoisted(() => ({
  // Set for real in `beforeEach`; starts null so the property type is `FakeWc | null`.
  wc: null as FakeWc | null,
  zoomActive: vi.fn(),
  resolve: true,
}));
vi.mock('../tabs', () => ({
  default: {
    forSenderWindow: () =>
      wt.resolve
        ? {
            activeWebContents: () => wt.wc,
            zoomActive: (d: string) => {
              wt.zoomActive(d);
            },
          }
        : undefined,
  },
}));

const { registerFindIpc } = await import('./ipc-find');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil/' }, sender: {} };
const QUERY = { query: 'hi', forward: true, findNext: true, matchCase: false };

beforeEach(() => {
  h.handlers.clear();
  h.listeners.clear();
  find.run.mockClear();
  find.stop.mockClear();
  wt.zoomActive.mockClear();
  wt.wc = { isDestroyed: () => false, getZoomFactor: () => 1.25 };
  wt.resolve = true;
  registerFindIpc();
});

describe('registerFindIpc', () => {
  it('registers find start/stop + zoom command as listeners and zoom get as a handler', () => {
    expect([...h.listeners.keys()].sort()).toEqual(
      [IpcChannels.findStart, IpcChannels.findStop, IpcChannels.zoomCommand].sort(),
    );
    expect([...h.handlers.keys()]).toEqual([IpcChannels.zoomGet]);
  });

  it('find:start runs the query against the sender window active tab', () => {
    h.listeners.get(IpcChannels.findStart)?.(ev, QUERY);
    expect(find.run).toHaveBeenCalledWith(h.window, wt.wc, QUERY);
  });

  it('find:start is a no-op when the active tab has no WebContents (internal page)', () => {
    wt.wc = null;
    h.listeners.get(IpcChannels.findStart)?.(ev, QUERY);
    expect(find.run).not.toHaveBeenCalled();
  });

  it('find:stop clears the sender window active tab', () => {
    h.listeners.get(IpcChannels.findStop)?.(ev, undefined);
    expect(find.stop).toHaveBeenCalledWith(wt.wc);
  });

  it('zoom:command routes a valid direction to zoomActive', () => {
    h.listeners.get(IpcChannels.zoomCommand)?.(ev, { direction: 'in' });
    expect(wt.zoomActive).toHaveBeenCalledWith('in');
  });

  it('zoom:command drops an invalid direction', () => {
    h.listeners.get(IpcChannels.zoomCommand)?.(ev, { direction: 'sideways' });
    expect(wt.zoomActive).not.toHaveBeenCalled();
  });

  it('zoom:get returns the active tab zoom as a whole-number percent', () => {
    expect(h.handlers.get(IpcChannels.zoomGet)?.(ev, undefined)).toBe(125);
  });

  it('zoom:get falls back to 100 when there is no active tab', () => {
    wt.resolve = false;
    expect(h.handlers.get(IpcChannels.zoomGet)?.(ev, undefined)).toBe(100);
  });

  it('ignores an untrusted sender on every channel', () => {
    h.listeners.get(IpcChannels.findStart)?.(evil, QUERY);
    h.listeners.get(IpcChannels.findStop)?.(evil, undefined);
    h.listeners.get(IpcChannels.zoomCommand)?.(evil, { direction: 'in' });
    expect(() => h.handlers.get(IpcChannels.zoomGet)?.(evil, undefined)).toThrow();
    expect(find.run).not.toHaveBeenCalled();
    expect(find.stop).not.toHaveBeenCalled();
    expect(wt.zoomActive).not.toHaveBeenCalled();
  });
});

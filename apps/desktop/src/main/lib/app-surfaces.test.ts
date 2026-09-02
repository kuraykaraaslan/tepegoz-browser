import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Our own surfaces" — the set a `broadcastToAppSurfaces` call actually reaches. The bug this module
 * exists to prevent is a broadcast that stops at the chrome: a `tepegoz://` page is a `WebContentsView`
 * inside a tab, invisible to `BrowserWindow.getAllWindows()`. So the pins are: chrome windows are
 * always included, a `tepegoz://` page is included via `isTrustedAppUrl`, a browsed page never is, a
 * destroyed surface is skipped, each surface appears exactly once even when it shows up in both passes,
 * and `broadcastToAppSurfaces` sends to each exactly once.
 */

const windows = vi.hoisted(() => ({ all: [] as unknown[] }));
const contents = vi.hoisted(() => ({ all: [] as unknown[] }));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => windows.all },
  webContents: { getAllWebContents: () => contents.all },
}));
vi.mock('./trusted-origin', () => ({
  isTrustedAppUrl: (url: string) => url.startsWith('tepegoz://'),
}));

const { appSurfaceContents, broadcastToAppSurfaces } = await import('./app-surfaces');

interface FakeWC {
  id: number;
  destroyed?: boolean;
  url?: string;
  send: ReturnType<typeof vi.fn>;
}

function wc(id: number, opts: { destroyed?: boolean; url?: string } = {}): FakeWC {
  const destroyed = opts.destroyed ?? false;
  const url = opts.url ?? '';
  return {
    id,
    destroyed,
    url,
    send: vi.fn(),
    isDestroyed: () => destroyed,
    getURL: () => url,
  } as unknown as FakeWC;
}

const win = (contentsObj: FakeWC, destroyed = false) => ({
  isDestroyed: () => destroyed,
  webContents: contentsObj,
});

beforeEach(() => {
  windows.all = [];
  contents.all = [];
});

describe('appSurfaceContents', () => {
  it('always includes a live chrome window, whatever its URL', () => {
    const chrome = wc(1, { url: 'file:///app/index.html' });
    windows.all = [win(chrome)];
    expect(appSurfaceContents()).toEqual([chrome]);
  });

  it('includes a tepegoz:// page that only getAllWebContents knows about', () => {
    const settingsPage = wc(2, { url: 'tepegoz://settings' });
    contents.all = [settingsPage];
    expect(appSurfaceContents()).toEqual([settingsPage]);
  });

  it('never includes a browsed page', () => {
    const browsed = wc(3, { url: 'https://example.test/' });
    contents.all = [browsed];
    expect(appSurfaceContents()).toEqual([]);
  });

  it('skips a destroyed window and a destroyed web-contents', () => {
    const deadWin = wc(4, { url: 'tepegoz://history' });
    const deadWc = wc(5, { url: 'tepegoz://downloads', destroyed: true });
    windows.all = [win(deadWin, true)];
    contents.all = [deadWc];
    expect(appSurfaceContents()).toEqual([]);
  });

  it('returns a surface that appears in BOTH passes exactly once', () => {
    const chrome = wc(6, { url: 'tepegoz://settings' });
    windows.all = [win(chrome)];
    contents.all = [chrome];
    expect(appSurfaceContents()).toEqual([chrome]);
  });
});

describe('broadcastToAppSurfaces', () => {
  it('sends the channel and args to every surface exactly once', () => {
    const chrome = wc(7, { url: 'file:///app/index.html' });
    const page = wc(8, { url: 'tepegoz://settings' });
    windows.all = [win(chrome)];
    contents.all = [page];

    broadcastToAppSurfaces('public-settings:changed', { theme: 'dark' });

    expect(chrome.send).toHaveBeenCalledExactlyOnceWith('public-settings:changed', { theme: 'dark' });
    expect(page.send).toHaveBeenCalledExactlyOnceWith('public-settings:changed', { theme: 'dark' });
  });
});

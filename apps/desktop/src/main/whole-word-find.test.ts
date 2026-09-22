import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, WebContents } from 'electron';
import { IpcChannels, type FindInPageQuery } from '@tepegoz/desktop-ipc';
import { releaseWholeWordSession, runWholeWordFind, stopWholeWordFind } from './whole-word-find';

/** Minimal stand-ins, same shape as `find-in-page.test.ts`'s — the module only uses the event surface
 *  plus `executeJavaScriptInIsolatedWorld`, so no Electron runtime is needed. */
function makeWebContents() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const wc = {
    isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: vi.fn(),
    on(event: string, fn: (...args: unknown[]) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
      return wc;
    },
    once(event: string, fn: (...args: unknown[]) => void) {
      return wc.on(event, fn);
    },
    off(event: string, fn: (...args: unknown[]) => void) {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((l) => l !== fn),
      );
      return wc;
    },
    emit(event: string, ...args: unknown[]) {
      for (const fn of listeners.get(event) ?? []) fn(...args);
    },
    listenerCount: (event: string) => (listeners.get(event) ?? []).length,
  };
  return wc;
}

function makeWindow() {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  };
}

type Wc = ReturnType<typeof makeWebContents>;
type Win = ReturnType<typeof makeWindow>;

const asWc = (wc: Wc) => wc as unknown as WebContents;
const asWin = (win: Win) => win as unknown as BrowserWindow;

const query = (over: Partial<FindInPageQuery> = {}): FindInPageQuery => ({
  query: 'cat',
  forward: true,
  findNext: true,
  matchCase: false,
  wholeWord: true,
  ...over,
});

let wc: Wc;
let win: Win;

beforeEach(() => {
  wc = makeWebContents();
  win = makeWindow();
});

describe('runWholeWordFind — search (findNext: true)', () => {
  it('runs a search script in the isolated world and echoes the result with the query', async () => {
    wc.executeJavaScriptInIsolatedWorld.mockResolvedValue({ matches: 3, activeMatchOrdinal: 1 });
    await runWholeWordFind(asWin(win), asWc(wc), query());

    expect(wc.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(1);
    const [worldId, [{ code }]] = wc.executeJavaScriptInIsolatedWorld.mock.calls[0] as [
      number,
      [{ code: string }],
    ];
    expect(typeof worldId).toBe('number');
    expect(code).toContain('"search"');

    expect(win.webContents.send).toHaveBeenCalledWith(IpcChannels.findResult, {
      query: 'cat',
      activeMatchOrdinal: 1,
      matches: 3,
    });
  });

  it('rejects an empty/over-length query without touching the isolated world', async () => {
    await runWholeWordFind(asWin(win), asWc(wc), query({ query: '' }));
    expect(wc.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith(IpcChannels.findResult, {
      query: '',
      activeMatchOrdinal: 0,
      matches: 0,
    });
  });

  it('treats a malformed script result as no matches instead of throwing', async () => {
    wc.executeJavaScriptInIsolatedWorld.mockResolvedValue({ garbage: true });
    await runWholeWordFind(asWin(win), asWc(wc), query());
    expect(win.webContents.send).toHaveBeenCalledWith(IpcChannels.findResult, {
      query: 'cat',
      activeMatchOrdinal: 0,
      matches: 0,
    });
  });

  it('treats a rejected script evaluation as no matches instead of throwing', async () => {
    wc.executeJavaScriptInIsolatedWorld.mockRejectedValue(new Error('boom'));
    await expect(runWholeWordFind(asWin(win), asWc(wc), query())).resolves.toBeUndefined();
    expect(win.webContents.send).toHaveBeenCalledWith(IpcChannels.findResult, {
      query: 'cat',
      activeMatchOrdinal: 0,
      matches: 0,
    });
  });
});

describe('runWholeWordFind — step (findNext: false)', () => {
  it('runs a step script instead of a search', async () => {
    wc.executeJavaScriptInIsolatedWorld.mockResolvedValue({ matches: 3, activeMatchOrdinal: 2 });
    await runWholeWordFind(asWin(win), asWc(wc), query({ findNext: false, forward: true }));

    const [, [{ code }]] = wc.executeJavaScriptInIsolatedWorld.mock.calls[0] as [
      number,
      [{ code: string }],
    ];
    expect(code).toContain('"step"');
    expect(win.webContents.send).toHaveBeenCalledWith(IpcChannels.findResult, {
      query: 'cat',
      activeMatchOrdinal: 2,
      matches: 3,
    });
  });
});

describe('runWholeWordFind — out-of-order responses', () => {
  it('drops a slower earlier request once a later one has answered', async () => {
    let resolveFirst: (v: unknown) => void = () => undefined;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    wc.executeJavaScriptInIsolatedWorld
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({ matches: 1, activeMatchOrdinal: 1 });

    const firstCall = runWholeWordFind(asWin(win), asWc(wc), query({ query: 'ca' }));
    await runWholeWordFind(asWin(win), asWc(wc), query({ query: 'cat' })); // resolves first
    win.webContents.send.mockClear();

    resolveFirst({ matches: 99, activeMatchOrdinal: 1 }); // the stale answer arrives late
    await firstCall;

    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});

describe('navigation', () => {
  it('zeroes the counters when the page navigates away from the searched document', async () => {
    wc.executeJavaScriptInIsolatedWorld.mockResolvedValue({ matches: 2, activeMatchOrdinal: 1 });
    await runWholeWordFind(asWin(win), asWc(wc), query());
    win.webContents.send.mockClear();

    wc.emit('did-start-navigation');

    expect(win.webContents.send).toHaveBeenCalledWith(IpcChannels.findResult, {
      query: '',
      activeMatchOrdinal: 0,
      matches: 0,
    });
  });

  it('stays quiet when nothing is being searched', () => {
    wc.emit('did-start-navigation');
    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});

describe('stopWholeWordFind', () => {
  it('runs the clear script', () => {
    wc.executeJavaScriptInIsolatedWorld.mockResolvedValue({ matches: 0, activeMatchOrdinal: 0 });
    stopWholeWordFind(asWc(wc));
    const [, [{ code }]] = wc.executeJavaScriptInIsolatedWorld.mock.calls[0] as [
      number,
      [{ code: string }],
    ];
    expect(code).toContain('"clear"');
  });

  it('tolerates there being no active tab', () => {
    expect(() => stopWholeWordFind(null)).not.toThrow();
  });

  it('drops the in-flight query, so a late result for it is no longer echoed', async () => {
    let resolveSearch: (v: unknown) => void = () => undefined;
    wc.executeJavaScriptInIsolatedWorld.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    const search = runWholeWordFind(asWin(win), asWc(wc), query());
    wc.executeJavaScriptInIsolatedWorld.mockResolvedValueOnce({
      matches: 0,
      activeMatchOrdinal: 0,
    });
    stopWholeWordFind(asWc(wc));
    win.webContents.send.mockClear();

    resolveSearch({ matches: 5, activeMatchOrdinal: 1 });
    await search;

    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});

describe('releaseWholeWordSession', () => {
  it('detaches every listener it attached', async () => {
    wc.executeJavaScriptInIsolatedWorld.mockResolvedValue({ matches: 1, activeMatchOrdinal: 1 });
    await runWholeWordFind(asWin(win), asWc(wc), query());
    expect(wc.listenerCount('did-start-navigation')).toBe(1);

    releaseWholeWordSession(asWc(wc));
    expect(wc.listenerCount('did-start-navigation')).toBe(0);
  });
});

describe('view teardown', () => {
  it("the view's own 'destroyed' event drops the session so a later find re-subscribes", async () => {
    wc.executeJavaScriptInIsolatedWorld.mockResolvedValue({ matches: 1, activeMatchOrdinal: 1 });
    await runWholeWordFind(asWin(win), asWc(wc), query());
    expect(wc.listenerCount('did-start-navigation')).toBe(1);

    wc.emit('destroyed');

    await runWholeWordFind(asWin(win), asWc(wc), query());
    expect(wc.listenerCount('did-start-navigation')).toBe(2); // stale listener remains, plus a new one
  });
});

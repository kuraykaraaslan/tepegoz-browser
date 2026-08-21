import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, WebContents } from 'electron';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { releaseFindSession, runFindInPage, stopFindInPage } from './find-in-page';

/** Minimal stand-ins: the module only uses the event/find surface, so no Electron runtime is needed. */
function makeWebContents() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const wc = {
    isDestroyed: () => false,
    findInPage: vi.fn(),
    stopFindInPage: vi.fn(),
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

let wc: Wc;
let win: Win;

beforeEach(() => {
  wc = makeWebContents();
  win = makeWindow();
});

describe('runFindInPage', () => {
  it('passes the query and the search direction through to Chromium', () => {
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: false,
      findNext: true,
      matchCase: true,
    });
    expect(wc.findInPage).toHaveBeenCalledWith('alpha', {
      forward: false,
      findNext: true,
      matchCase: true,
    });
  });

  it('forwards match counts to the chrome window, echoing the query they belong to', () => {
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: true,
      findNext: false,
      matchCase: false,
    });
    wc.emit('found-in-page', {}, { activeMatchOrdinal: 2, matches: 7 });

    expect(win.webContents.send).toHaveBeenCalledWith(IpcChannels.findResult, {
      query: 'alpha',
      activeMatchOrdinal: 2,
      matches: 7,
    });
  });

  it('echoes the LATEST query, so a result arriving after a retype is identifiable as stale', () => {
    const run = (query: string) => {
      runFindInPage(asWin(win), asWc(wc), {
        query,
        forward: true,
        findNext: false,
        matchCase: false,
      });
    };
    run('alp');
    run('alpha');
    // Chromium answers the first request only after the second was issued.
    wc.emit('found-in-page', {}, { activeMatchOrdinal: 1, matches: 30 });

    const [, payload] = win.webContents.send.mock.calls.at(-1) as [string, { query: string }];
    expect(payload.query).toBe('alpha');
  });

  it('subscribes once per view no matter how many searches run on it', () => {
    for (const query of ['a', 'ab', 'abc']) {
      runFindInPage(asWin(win), asWc(wc), {
        query,
        forward: true,
        findNext: false,
        matchCase: false,
      });
    }
    expect(wc.listenerCount('found-in-page')).toBe(1);
  });
});

describe('findNext semantics (the bug this feature shipped with)', () => {
  // Measured on Electron 33.4.11: `findInPage(text, { findNext: false })` with no open find session
  // emits NO `found-in-page` event and no error. `findNext` means "this opens a session", not "go to
  // the next match", and having it backwards made every first search silently return nothing.
  it('opens a session when nothing is being searched, even if the caller says follow-up', () => {
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: true,
      findNext: false,
      matchCase: false,
    });
    expect(wc.findInPage).toHaveBeenCalledWith(
      'alpha',
      expect.objectContaining({ findNext: true }),
    );
  });

  it('passes a follow-up through once a session is open, so stepping keeps the match set', () => {
    const open = { query: 'alpha', forward: true, findNext: true, matchCase: false };
    runFindInPage(asWin(win), asWc(wc), open);
    runFindInPage(asWin(win), asWc(wc), { ...open, findNext: false });

    expect(wc.findInPage).toHaveBeenLastCalledWith(
      'alpha',
      expect.objectContaining({ findNext: false }),
    );
  });

  it('re-opens after a stop, rather than stepping into a session that was closed', () => {
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: true,
      findNext: true,
      matchCase: false,
    });
    stopFindInPage(asWc(wc));
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: true,
      findNext: false,
      matchCase: false,
    });

    expect(wc.findInPage).toHaveBeenLastCalledWith(
      'alpha',
      expect.objectContaining({ findNext: true }),
    );
  });

  it('re-opens after a navigation cleared the session', () => {
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: true,
      findNext: true,
      matchCase: false,
    });
    wc.emit('did-start-navigation');
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: true,
      findNext: false,
      matchCase: false,
    });

    expect(wc.findInPage).toHaveBeenLastCalledWith(
      'alpha',
      expect.objectContaining({ findNext: true }),
    );
  });
});

describe('navigation', () => {
  it('zeroes the counters when the page navigates away from the searched document', () => {
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: true,
      findNext: false,
      matchCase: false,
    });
    win.webContents.send.mockClear();
    wc.emit('did-start-navigation');

    expect(win.webContents.send).toHaveBeenCalledWith(IpcChannels.findResult, {
      query: '',
      activeMatchOrdinal: 0,
      matches: 0,
    });
  });

  it('stays quiet when nothing is being searched', () => {
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: true,
      findNext: false,
      matchCase: false,
    });
    wc.emit('did-start-navigation');
    win.webContents.send.mockClear();
    wc.emit('did-start-navigation'); // a second navigation with no active query

    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});

describe('stopFindInPage', () => {
  it('clears the page selection', () => {
    stopFindInPage(asWc(wc));
    expect(wc.stopFindInPage).toHaveBeenCalledWith('clearSelection');
  });

  it('tolerates there being no active tab', () => {
    expect(() => {
      stopFindInPage(null);
    }).not.toThrow();
  });

  it('drops the in-flight query, so a late result for it is no longer echoed', () => {
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: true,
      findNext: false,
      matchCase: false,
    });
    stopFindInPage(asWc(wc));
    win.webContents.send.mockClear();
    wc.emit('found-in-page', {}, { activeMatchOrdinal: 1, matches: 3 });

    const [, payload] = win.webContents.send.mock.calls.at(-1) as [string, { query: string }];
    expect(payload.query).toBe('');
  });
});

describe('releaseFindSession', () => {
  it('detaches every listener it attached', () => {
    runFindInPage(asWin(win), asWc(wc), {
      query: 'alpha',
      forward: true,
      findNext: false,
      matchCase: false,
    });
    releaseFindSession(asWc(wc));

    expect(wc.listenerCount('found-in-page')).toBe(0);
    expect(wc.listenerCount('did-start-navigation')).toBe(0);
  });
});

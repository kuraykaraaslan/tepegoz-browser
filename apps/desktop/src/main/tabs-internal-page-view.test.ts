import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Real `WebContentsView`s for internal (`tepegoz://…`) tabs. Pinned: `hasRealPage` gates on the
 * known base-URL set; the dev-server rewrite (`tepegoz://<host>#hash` → `<ELECTRON_RENDERER_URL>?
 * page=<host>#hash`, PROD + non-tepegoz URLs untouched); `createInternalPageView` building the view
 * with the chrome prefs + pre-paint colour, wiring only the context menu, and loading; the
 * navigate/show/hide/destroy lifecycle; the unwire/rewire context-menu swap; and the context-menu
 * handler skipping a destroyed window and otherwise fanning out to the observers with nav state.
 */

const URLS = {
  INTERNAL_SETTINGS_URL: 'tepegoz://settings/',
  INTERNAL_EXTENSIONS_URL: 'tepegoz://extensions/',
  INTERNAL_HISTORY_URL: 'tepegoz://history/',
  INTERNAL_DOWNLOADS_URL: 'tepegoz://downloads/',
  INTERNAL_UPLOADS_URL: 'tepegoz://uploads/',
  INTERNAL_BOOKMARKS_URL: 'tepegoz://bookmarks/',
  INTERNAL_PROCESS_URL: 'tepegoz://process/',
  INTERNAL_DEVELOPER_URL: 'tepegoz://developer/',
};
vi.mock('@tepegoz/desktop-ipc', () => URLS);
vi.mock('./window', () => ({ CHROME_WEB_PREFERENCES: { preload: '/preload.js' } }));
vi.mock('./lib/surface-theme', () => ({ resolveSurfaceTheme: () => ({ color: '#101828' }) }));

const observer = vi.hoisted(() => vi.fn());
vi.mock('./tabs-shared', () => ({
  contextMenuObservers: new Set([observer]),
  internalBaseUrl: (u: string) => `${u.split('#')[0]!.replace(/\/?$/, '/')}`,
}));

class WebContentsViewMock {
  webPreferences: unknown;
  setBackgroundColor = vi.fn();
  setBounds = vi.fn();
  webContents = {
    on: vi.fn(),
    removeListener: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    getURL: vi.fn(() => ''),
    isDestroyed: vi.fn(() => false),
    close: vi.fn(),
    navigationHistory: { canGoBack: vi.fn(() => true), canGoForward: vi.fn(() => false) },
  };
  constructor(opts: { webPreferences: unknown }) {
    this.webPreferences = opts.webPreferences;
  }
}
vi.mock('electron', () => ({ WebContentsView: WebContentsViewMock }));

const mod = await import('./tabs-internal-page-view');

function fakeWin(destroyed = false) {
  const children: unknown[] = [];
  return {
    isDestroyed: () => destroyed,
    contentView: {
      children,
      addChildView: vi.fn((v: unknown) => children.push(v)),
      removeChildView: vi.fn((v: unknown) => {
        const i = children.indexOf(v);
        if (i >= 0) children.splice(i, 1);
      }),
    },
  };
}
/** Pass a fake window / view where the SUT expects the electron type. */
const asWin = (w: ReturnType<typeof fakeWin>) => w as never;
const asView = (v: unknown) => v as never;
const bounds = () => ({ x: 0, y: 0, width: 800, height: 600 });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['ELECTRON_RENDERER_URL'];
});
afterEach(() => {
  delete process.env['ELECTRON_RENDERER_URL'];
});

describe('hasRealPage', () => {
  it('is true for a known internal base URL (hash ignored) and false otherwise', () => {
    expect(mod.hasRealPage('tepegoz://settings/#privacy')).toBe(true);
    expect(mod.hasRealPage('tepegoz://developer/')).toBe(true);
    expect(mod.hasRealPage('tepegoz://tasks/')).toBe(false);
  });
});

describe('the dev-server URL rewrite (via navigateInternalPageView)', () => {
  const view = () => new WebContentsViewMock({ webPreferences: {} }) as never;

  it('PROD (no ELECTRON_RENDERER_URL): loads the tepegoz:// URL unchanged', () => {
    const v = view();
    mod.navigateInternalPageView(v, 'tepegoz://settings/#a');
    expect((v as unknown as WebContentsViewMock).webContents.loadURL).toHaveBeenCalledWith(
      'tepegoz://settings/#a',
    );
  });

  it('DEV: rewrites to <devUrl>?page=<host><hash>', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    const v = view();
    mod.navigateInternalPageView(v, 'tepegoz://settings/#privacy');
    expect((v as unknown as WebContentsViewMock).webContents.loadURL).toHaveBeenCalledWith(
      'http://localhost:5173?page=settings#privacy',
    );
  });

  it('DEV: a non-tepegoz URL is left alone', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    const v = view();
    mod.navigateInternalPageView(v, 'https://example.com/');
    expect((v as unknown as WebContentsViewMock).webContents.loadURL).toHaveBeenCalledWith(
      'https://example.com/',
    );
  });

  it('is a no-op when the view is already at the target URL', () => {
    const v = view();
    (v as unknown as WebContentsViewMock).webContents.getURL.mockReturnValue('tepegoz://settings/');
    mod.navigateInternalPageView(v, 'tepegoz://settings/');
    expect((v as unknown as WebContentsViewMock).webContents.loadURL).not.toHaveBeenCalled();
  });
});

describe('createInternalPageView', () => {
  it('builds the view with the chrome prefs + pre-paint colour, wires the context menu, and loads', () => {
    const win = fakeWin();
    const v = mod.createInternalPageView(
      asWin(win),
      'tepegoz://history/',
      bounds,
    ) as unknown as WebContentsViewMock;
    expect(v.webPreferences).toEqual({ preload: '/preload.js' });
    expect(v.setBackgroundColor).toHaveBeenCalledWith('#101828');
    expect(v.webContents.on).toHaveBeenCalledWith('context-menu', expect.any(Function));
    expect(v.webContents.loadURL).toHaveBeenCalledWith('tepegoz://history/');
  });
});

describe('the context-menu handler', () => {
  function handlerFor(win: ReturnType<typeof fakeWin>): (e: unknown, p: unknown) => void {
    const v = mod.createInternalPageView(
      asWin(win),
      'tepegoz://history/',
      bounds,
    ) as unknown as WebContentsViewMock;
    return v.webContents.on.mock.calls.find((c) => c[0] === 'context-menu')![1] as (
      e: unknown,
      p: unknown,
    ) => void;
  }

  it('fans out to every observer with the window, params, bounds and nav state', () => {
    const win = fakeWin();
    handlerFor(win)({}, { x: 5, y: 6 });
    expect(observer).toHaveBeenCalledWith(win, expect.anything(), { x: 5, y: 6 }, bounds(), {
      canGoBack: true,
      canGoForward: false,
    });
  });

  it('does nothing when the window is already destroyed', () => {
    handlerFor(fakeWin(true))({}, {});
    expect(observer).not.toHaveBeenCalled();
  });
});

describe('show / hide / destroy + unwire / rewire', () => {
  it('showInternalPageView attaches once then sizes; hideInternalPageView detaches', () => {
    const win = fakeWin();
    const v = mod.createInternalPageView(asWin(win), 'tepegoz://settings/', bounds);
    mod.showInternalPageView(asWin(win), v, bounds());
    mod.showInternalPageView(asWin(win), v, bounds());
    expect(win.contentView.addChildView).toHaveBeenCalledTimes(1);
    expect((v as unknown as WebContentsViewMock).setBounds).toHaveBeenCalledWith(bounds());

    mod.hideInternalPageView(asWin(win), v);
    expect(win.contentView.removeChildView).toHaveBeenCalledWith(v);
  });

  it('unwireInternalPageView drops the handler; a second call is a no-op', () => {
    const win = fakeWin();
    const v = mod.createInternalPageView(
      asWin(win),
      'tepegoz://settings/',
      bounds,
    ) as unknown as WebContentsViewMock;
    mod.unwireInternalPageView(asView(v));
    expect(v.webContents.removeListener).toHaveBeenCalledWith('context-menu', expect.any(Function));
    v.webContents.removeListener.mockClear();
    mod.unwireInternalPageView(asView(v));
    expect(v.webContents.removeListener).not.toHaveBeenCalled();
  });

  it('rewireInternalPageView swaps the handler for a fresh window binding', () => {
    const win1 = fakeWin();
    const v = mod.createInternalPageView(
      asWin(win1),
      'tepegoz://settings/',
      bounds,
    ) as unknown as WebContentsViewMock;
    v.webContents.on.mockClear();
    const win2 = fakeWin();
    mod.rewireInternalPageView(asWin(win2), asView(v), bounds);
    expect(v.webContents.removeListener).toHaveBeenCalled();
    expect(v.webContents.on).toHaveBeenCalledWith('context-menu', expect.any(Function));
  });

  it('destroyInternalPageView removes the child, unwires and closes — swallowing a throw', () => {
    const win = fakeWin();
    const v = mod.createInternalPageView(
      asWin(win),
      'tepegoz://settings/',
      bounds,
    ) as unknown as WebContentsViewMock;
    mod.destroyInternalPageView(asWin(win), asView(v));
    expect(win.contentView.removeChildView).toHaveBeenCalledWith(v);
    expect(v.webContents.close).toHaveBeenCalled();

    v.webContents.close.mockImplementation(() => {
      throw new Error('gone');
    });
    expect(() => mod.destroyInternalPageView(asWin(win), asView(v))).not.toThrow();
  });
});

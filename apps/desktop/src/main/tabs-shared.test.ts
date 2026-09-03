import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from 'electron';

const prefs = vi.hoisted(() => ({
  getAll: vi.fn<() => Record<string, unknown>>(() => ({})),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const extIdFromUrl = vi.hoisted(() => vi.fn<() => string | null>(() => null));
vi.mock('../shared/extensions', () => ({
  extensionIdFromPageUrl: extIdFromUrl,
  manifestById: vi.fn(() => undefined),
  extensionLabel: vi.fn(() => ({ name: 'Ext' })),
}));

vi.mock('./lib/i18n-main', () => ({
  mainLocale: () => 'en',
  mainStrings: () => ({
    browser: { untitled: 'New Tab', developerPageTitle: 'Developer' },
    extensions: { title: 'Extensions' },
    history: { title: 'History' },
    downloads: { title: 'Downloads' },
    uploads: { title: 'Uploads' },
    tasks: { title: 'Tasks' },
    bookmarks: { title: 'Bookmarks' },
    process: { title: 'Task Manager' },
    common: { settings: 'Settings' },
  }),
}));

const { browsedViewWebPreferences } = await import('./tabs-shared');

const FAKE_SESSION = { fake: true } as unknown as Session;

describe('browsedViewWebPreferences', () => {
  it('pins the renderer-hardening invariants for every browsed tab view', () => {
    const prefs = browsedViewWebPreferences(FAKE_SESSION);
    // A regression on any of these is a real sandbox escape surface, not a style nit.
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.webSecurity).toBe(true);
    // No preload key at all — a browsed page must never reach the contextBridge.
    expect('preload' in prefs).toBe(false);
  });

  it('passes the exact Session object through (never a partition name)', () => {
    expect(browsedViewWebPreferences(FAKE_SESSION).session).toBe(FAKE_SESSION);
  });

  it('enables Chromium’s built-in PDF viewer so application/pdf renders in-tab', () => {
    expect(browsedViewWebPreferences(FAKE_SESSION).plugins).toBe(true);
  });

  it('keeps background throttling off so AI-driven / background tabs run at full rate', () => {
    expect(browsedViewWebPreferences(FAKE_SESSION).backgroundThrottling).toBe(false);
  });
});

const { closedTabs, rememberClosedTab, takeClosedTab, recentlyClosedTabs } =
  await import('./tabs-shared');

describe('the recently-closed list', () => {
  beforeEach(() => {
    closedTabs.length = 0;
  });

  it('reads back newest-first, while Ctrl+Shift+T keeps taking the newest', () => {
    rememberClosedTab('https://a.example/', 'A', 1);
    rememberClosedTab('https://b.example/', 'B', 2);
    expect(recentlyClosedTabs().map((t) => t.url)).toEqual([
      'https://b.example/',
      'https://a.example/',
    ]);
    expect(takeClosedTab()?.url).toBe('https://b.example/');
    expect(takeClosedTab()?.url).toBe('https://a.example/');
    expect(takeClosedTab()).toBeUndefined();
  });

  it('takes the entry an id names out of the middle, leaving the order around it intact', () => {
    rememberClosedTab('https://a.example/', 'A', 1);
    rememberClosedTab('https://b.example/', 'B', 2);
    rememberClosedTab('https://c.example/', 'C', 3);
    const middle = recentlyClosedTabs()[1];
    expect(middle?.url).toBe('https://b.example/');
    expect(takeClosedTab(middle?.id)?.url).toBe('https://b.example/');
    expect(recentlyClosedTabs().map((t) => t.url)).toEqual([
      'https://c.example/',
      'https://a.example/',
    ]);
  });

  it('takes an entry only once — a stale menu row cannot reopen the same tab twice', () => {
    rememberClosedTab('https://a.example/', 'A', 1);
    const only = recentlyClosedTabs()[0];
    expect(takeClosedTab(only?.id)).toBeDefined();
    expect(takeClosedTab(only?.id)).toBeUndefined();
  });

  it('keeps the newest 25 and drops the oldest past the cap', () => {
    for (let i = 0; i < 30; i += 1) rememberClosedTab(`https://e.example/${String(i)}`, '', i);
    const list = recentlyClosedTabs();
    expect(list).toHaveLength(25);
    expect(list[0]?.url).toBe('https://e.example/29');
    expect(list.at(-1)?.url).toBe('https://e.example/5');
  });

  it('records the title, because a closed tab cannot be asked for it afterwards', () => {
    rememberClosedTab('https://a.example/', 'Release notes', 7);
    expect(recentlyClosedTabs()[0]).toMatchObject({ title: 'Release notes', closedAt: 7 });
  });
});

const shared = await import('./tabs-shared');

describe('homeUrl / searchUrlForQuery', () => {
  beforeEach(() => {
    prefs.getAll.mockReturnValue({});
  });

  it('homeUrl returns the preference, falling back to the built-in default when blank', () => {
    prefs.getAll.mockReturnValue({ homepageUrl: 'https://start.example/' });
    expect(shared.homeUrl()).toBe('https://start.example/');
    prefs.getAll.mockReturnValue({ homepageUrl: '' });
    expect(shared.homeUrl()).toBe('https://duckduckgo.com/');
  });

  it('searchUrlForQuery builds a query URL via the configured engine', () => {
    prefs.getAll.mockReturnValue({ searchEngineId: 'duckduckgo', customSearchEngines: [] });
    const url = shared.searchUrlForQuery('hello world');
    expect(url).toMatch(/^https?:\/\//);
    expect(url.toLowerCase()).toContain('hello');
  });
});

describe('popupWindowOptions', () => {
  it('hands the OPENER session straight through with the hardened webPreferences', () => {
    const opener = { id: 'opener-session' } as unknown as Session;
    const opts = shared.popupWindowOptions(opener);
    expect(opts.webPreferences).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      session: opener,
    });
    expect('preload' in (opts.webPreferences ?? {})).toBe(false);
  });
});

describe('session persister seam', () => {
  it('persistSession is a no-op until a persister is installed, then routes to it', () => {
    expect(() => {
      shared.persistSession();
    }).not.toThrow();
    const fn = vi.fn();
    shared.setSessionPersister(fn);
    shared.persistSession();
    expect(fn).toHaveBeenCalledTimes(1);
    shared.setSessionPersister(() => {}); // restore the default so other suites are unaffected
  });
});

describe('hadRecentGesture', () => {
  it('is true only within the activation window of the last recorded input', () => {
    const wc = {} as never;
    expect(shared.hadRecentGesture(wc)).toBe(false); // never recorded

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    shared.lastGestureAt.set(wc, now - 500); // within GESTURE_ACTIVATION_MS (1000)
    expect(shared.hadRecentGesture(wc)).toBe(true);

    shared.lastGestureAt.set(wc, now - 5000); // stale
    expect(shared.hadRecentGesture(wc)).toBe(false);
    vi.mocked(Date.now).mockRestore();
  });
});

describe('internalBaseUrl / internalTitleFor', () => {
  it('internalBaseUrl strips the fragment', () => {
    expect(shared.internalBaseUrl('tepegoz://settings#section')).toBe('tepegoz://settings');
    expect(shared.internalBaseUrl('tepegoz://settings')).toBe('tepegoz://settings');
  });

  it('internalTitleFor names each built-in internal page and defaults to Settings', () => {
    // Every known internal URL yields a non-empty localized title distinct from nothing.
    for (const u of [
      'tepegoz://newtab',
      'tepegoz://extensions',
      'tepegoz://history',
      'tepegoz://downloads',
    ]) {
      expect(shared.internalTitleFor(u)).toBeTruthy();
    }
    // An unrecognized internal URL falls back to the Settings label.
    expect(shared.internalTitleFor('tepegoz://something-else')).toBe('Settings');
  });

  it('titles a tepegoz://<extension-id> page from the extension manifest', async () => {
    extIdFromUrl.mockReturnValue('ext-abc');
    const ext = await import('../shared/extensions');
    vi.mocked(ext.manifestById).mockReturnValue({ name: 'My Extension' } as never);
    vi.mocked(ext.extensionLabel).mockReturnValue({ name: 'My Extension' } as never);
    expect(shared.internalTitleFor('tepegoz://ext-abc')).toBe('My Extension');
    extIdFromUrl.mockReturnValue(null);
  });
});

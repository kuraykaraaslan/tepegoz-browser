import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `WindowTabsMoves` — the cross-window tear-off / merge primitives, over a REAL `TabStore`.
 *   - `detachTab` removes a tab from this window WITHOUT destroying its live view, returning
 *     everything needed to re-home it (record + view + group), and returns null for an unknown id;
 *   - `adoptTab` mints a FRESH id (ids are per-store — a renderer-chosen key would be a renderer
 *     choosing which row to overwrite), re-creates the source group reusing its stable UUID, re-wires
 *     the live view (no reload), and focuses it.
 */

vi.mock('electron', () => ({
  WebContentsView: class {},
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showMessageBoxSync: () => 0 },
}));
vi.mock('@tepegoz/libs', () => ({
  Logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
vi.mock('./lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: { unloadTitle: 't', unloadDetail: 'd', unloadLeave: 'l', unloadStay: 's' },
  }),
}));
vi.mock('./lib/navigation-url', () => ({
  isWebUrl: () => true,
  internalPageUrl: () => null,
  toNavigationUrl: (u: string) => u,
}));
vi.mock('./network/browsing-sessions.electron', () => ({
  default: { defaultForNewTab: () => ({}), private: () => ({}) },
}));
// Must be `undefined`, not `null`: the base does `recorded !== undefined && recorded.errorCode` —
// returning null would trip the property read.
vi.mock('./network/certificate-recorder.electron', () => ({ getRecordedCert: () => undefined }));
vi.mock('./tabs-content-bounds', () => ({
  resolveViewBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
}));
vi.mock('./extensions/action-interceptors.electron', () => ({
  default: { shouldBlock: () => false },
}));

const wiring = { wireView: vi.fn(), unwireView: vi.fn() };
vi.mock('./tabs-view-wiring', () => wiring);
const internalView = {
  createInternalPageView: vi.fn(),
  destroyInternalPageView: vi.fn(),
  hasRealPage: () => false,
  hideInternalPageView: vi.fn(),
  navigateInternalPageView: vi.fn(),
  showInternalPageView: vi.fn(),
  rewireInternalPageView: vi.fn(),
  unwireInternalPageView: vi.fn(),
};
vi.mock('./tabs-internal-page-view', () => internalView);
vi.mock('./navigation/unload-broker', () => ({ askBeforeClose: vi.fn() }));
vi.mock('./tabs-shared', () => ({
  rememberClosedTab: vi.fn(),
  internalBaseUrl: (u: string) => u,
  internalTitleFor: () => 'Internal',
  browsedViewWebPreferences: () => ({}),
  homeUrl: () => 'https://example.com/',
  searchUrlForQuery: (q: string) => q,
  persistSession: vi.fn(),
  involuntaryGroupExitObservers: new Set(),
}));

const { WindowTabsMoves } = await import('./tabs-window-moves');

function fakeWindow() {
  const children: unknown[] = [];
  return {
    isDestroyed: () => false,
    close: vi.fn(),
    setTitle: vi.fn(),
    getContentSize: () => [1200, 800],
    webContents: { send: vi.fn() },
    contentView: {
      children,
      addChildView: (v: unknown) => children.push(v),
      removeChildView: (v: unknown) => {
        const i = children.indexOf(v);
        if (i !== -1) children.splice(i, 1);
      },
    },
  };
}

class Harness extends WindowTabsMoves {
  seed(title: string): string {
    const id = this.store.add({
      kind: 'web',
      title,
      url: 'https://x.test/',
      isLoading: false,
      faviconUrl: null,
    });
    const wc = {
      loadURL: () => Promise.resolve(),
      canGoBack: () => false,
      canGoForward: () => false,
      navigationHistory: { canGoBack: () => false, canGoForward: () => false },
      getURL: () => 'https://x.test/',
      getZoomFactor: () => 1,
      setZoomFactor: vi.fn(),
      isDestroyed: () => false,
      setVisible: vi.fn(),
      focus: vi.fn(),
    };
    this.views.set(id, {
      setBounds: vi.fn(),
      setVisible: vi.fn(),
      webContents: wc,
    } as never);
    return id;
  }
  has(id: string): boolean {
    return this.store.has(id);
  }
  groupIdOf(id: string): string | null {
    return this.store.get(id)?.groupId ?? null;
  }
  titleOf(id: string): string | undefined {
    return this.store.get(id)?.title;
  }
  seedInternal(id: string): void {
    this.internalPageViews.set(id, {
      setBounds: vi.fn(),
      webContents: { isDestroyed: () => false },
    } as never);
  }
  indexOf(id: string): number {
    return this.store.records().findIndex((r) => r.id === id);
  }
}

let tabs: Harness;
beforeEach(() => {
  wiring.wireView.mockClear();
  wiring.unwireView.mockClear();
  internalView.hideInternalPageView.mockClear();
  internalView.unwireInternalPageView.mockClear();
  internalView.rewireInternalPageView.mockClear();
  tabs = new Harness(fakeWindow() as never, false);
});

describe('detachTab', () => {
  it('returns null for an unknown id', () => {
    expect(tabs.detachTab('nope')).toBeNull();
  });

  it('removes the tab from the store but keeps its view alive, and unwires our handlers', () => {
    const a = tabs.seed('a');
    const detached = tabs.detachTab(a);
    expect(detached).not.toBeNull();
    expect(detached?.record.title).toBe('a');
    expect(detached?.view).not.toBeNull();
    expect(tabs.has(a)).toBe(false);
    expect(wiring.unwireView).toHaveBeenCalledTimes(1);
  });

  it('carries the source group when the tab was grouped', () => {
    const a = tabs.seed('a');
    const gid = tabs.createGroup([a]);
    const detached = tabs.detachTab(a);
    expect(detached?.group?.id).toBe(gid);
  });
});

describe('adoptTab', () => {
  it('mints a fresh id (never reuses the source id) and re-wires the live view', () => {
    const a = tabs.seed('a');
    const detached = tabs.detachTab(a)!;
    const newId = tabs.adoptTab(detached);
    expect(newId).not.toBe(a);
    expect(tabs.has(newId)).toBe(true);
    expect(tabs.titleOf(newId)).toBe('a');
    expect(wiring.wireView).toHaveBeenCalled();
  });

  it('carries the detached group snapshot forward into the adopting window', () => {
    const a = tabs.seed('a');
    const gid = tabs.createGroup([a]);
    const detached = tabs.detachTab(a)!;
    // The snapshot travels with the tab; the adopting window re-materialises the group from it.
    expect(detached.group?.id).toBe(gid);
    const newId = tabs.adoptTab(detached);
    expect(tabs.has(newId)).toBe(true);
  });

  it('round-trips a plain (ungrouped) tab with no group on the far side', () => {
    const a = tabs.seed('a');
    const detached = tabs.detachTab(a)!;
    const newId = tabs.adoptTab(detached);
    expect(tabs.groupIdOf(newId)).toBeNull();
  });

  it('drops the adopted tab at an explicit index when one is given', () => {
    tabs.seed('a');
    const b = tabs.seed('b');
    const detachedB = tabs.detachTab(b)!;
    const newId = tabs.adoptTab(detachedB, 0); // ask for the leading slot
    expect(tabs.indexOf(newId)).toBe(0);
  });
});

describe('detached internal-page views', () => {
  it('detachTab carries an internal-page view and drops our handler for it', () => {
    const a = tabs.seed('a');
    tabs.seedInternal(a);
    const detached = tabs.detachTab(a)!;
    expect(detached.internalPageView).not.toBeNull();
    expect(internalView.hideInternalPageView).toHaveBeenCalledTimes(1);
    expect(internalView.unwireInternalPageView).toHaveBeenCalledTimes(1);
  });

  it('adoptTab re-homes and re-wires a detached internal-page view', () => {
    const a = tabs.seed('a');
    tabs.seedInternal(a);
    const detached = tabs.detachTab(a)!;
    const newId = tabs.adoptTab(detached);
    expect(internalView.rewireInternalPageView).toHaveBeenCalledTimes(1);
    expect(tabs.has(newId)).toBe(true);
  });
});

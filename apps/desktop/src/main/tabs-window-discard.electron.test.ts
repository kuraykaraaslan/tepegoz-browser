import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `WindowTabsDiscard.canDiscard` — the safe-to-suspend predicate (Phase 2b tab discard/sleep), over a
 * real `TabStore`. A tab is discardable ONLY when it exists, is a `web` tab, is not already discarded,
 * is not the ACTIVE tab (that would look like a crash), is not `hidden` (the agent may be driving it),
 * and is not playing audio. `discardTab` is a no-op for anything `canDiscard` rejects, so a caller
 * never has to re-check.
 */

vi.mock('electron', () => ({
  WebContentsView: class {
    setBounds = vi.fn();
    setVisible = vi.fn();
    webContents = { loadURL: () => Promise.resolve(), isDestroyed: () => false, close: vi.fn() };
  },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showMessageBoxSync: () => 0 },
}));
vi.mock('@tepegoz/libs', () => ({
  Logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
vi.mock('@tepegoz/security-policy', () => ({ mayOpenDevTools: () => ({ allowed: true }) }));
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
vi.mock('./site-zoom', () => ({ applyZoomCommand: vi.fn() }));
vi.mock('./page-commands', () => ({
  printPage: vi.fn(),
  savePage: vi.fn(),
  viewSourcePage: vi.fn(),
}));
vi.mock('./clipboard/clipboard-service.electron', () => ({ default: {} }));
vi.mock('./downloads/download-service.electron', () => ({ default: {} }));
vi.mock('./network/browsing-sessions.electron', () => ({
  default: { defaultForNewTab: () => ({}), private: () => ({}) },
}));
vi.mock('./network/certificate-recorder.electron', () => ({ getRecordedCert: () => undefined }));
vi.mock('./tabs-content-bounds', () => ({
  resolveViewBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
}));
vi.mock('./extensions/action-interceptors.electron', () => ({
  default: { shouldBlock: () => false },
}));
const wiring = { wireView: vi.fn(), unwireView: vi.fn() };
vi.mock('./tabs-view-wiring', () => wiring);
vi.mock('./tabs-internal-page-view', () => ({
  createInternalPageView: vi.fn(),
  destroyInternalPageView: vi.fn(),
  hasRealPage: () => false,
  hideInternalPageView: vi.fn(),
  navigateInternalPageView: vi.fn(),
  showInternalPageView: vi.fn(),
  rewireInternalPageView: vi.fn(),
  unwireInternalPageView: vi.fn(),
}));
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

const { WindowTabsDiscard } = await import('./tabs-window-discard');

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
      removeChildView: vi.fn(),
    },
  };
}

class Harness extends WindowTabsDiscard {
  add(over: Record<string, unknown> = {}): string {
    return this.store.add({
      kind: 'web',
      title: 't',
      url: 'https://x.test/',
      isLoading: false,
      faviconUrl: null,
      ...over,
    });
  }
  patch(id: string, p: Record<string, unknown>): void {
    this.store.update(id, p);
  }
  setActive(id: string): void {
    this.store.setActive(id);
  }
  isDiscarded(id: string): boolean {
    return this.store.get(id)?.discarded === true;
  }
  addInternal(): string {
    return this.store.add({
      kind: 'internal',
      title: 'settings',
      url: 'tepegoz://settings',
      isLoading: false,
      faviconUrl: null,
    });
  }
  isLoadingOf(id: string): boolean | undefined {
    return this.store.get(id)?.isLoading;
  }
}

let tabs: Harness;
beforeEach(() => {
  wiring.unwireView.mockClear();
  tabs = new Harness(fakeWindow() as never, false);
});

describe('canDiscard', () => {
  it('is true for a plain background web tab', () => {
    const bg = tabs.add();
    tabs.add(); // a second tab so `bg` is not the only/active one
    expect(tabs.canDiscard(bg)).toBe(true);
  });

  it('is false for an unknown id', () => {
    expect(tabs.canDiscard('nope')).toBe(false);
  });

  it('is false for an internal (non-web) tab', () => {
    const internal = tabs.addInternal();
    expect(tabs.canDiscard(internal)).toBe(false);
  });

  it('is false for the ACTIVE tab', () => {
    const a = tabs.add();
    tabs.setActive(a);
    expect(tabs.canDiscard(a)).toBe(false);
  });

  it('is false for an already-discarded tab', () => {
    const a = tabs.add();
    tabs.add();
    tabs.patch(a, { discarded: true });
    expect(tabs.canDiscard(a)).toBe(false);
  });

  it('is false for a HIDDEN tab (the agent may be driving it)', () => {
    const a = tabs.add({ hidden: true });
    tabs.add();
    expect(tabs.canDiscard(a)).toBe(false);
  });

  it('is false for a tab that is playing audio', () => {
    const a = tabs.add({ audible: true });
    tabs.add();
    expect(tabs.canDiscard(a)).toBe(false);
  });
});

describe('discardTab', () => {
  it('is a silent no-op for a tab that cannot be discarded (active tab)', () => {
    const a = tabs.add();
    tabs.setActive(a);
    tabs.discardTab(a);
    expect(tabs.isDiscarded(a)).toBe(false);
    expect(wiring.unwireView).not.toHaveBeenCalled();
  });

  it('marks a discardable tab discarded and stops its loading flag', () => {
    const bg = tabs.add();
    tabs.add();
    tabs.patch(bg, { isLoading: true });
    tabs.discardTab(bg);
    expect(tabs.isDiscarded(bg)).toBe(true);
    expect(tabs.isLoadingOf(bg)).toBe(false);
  });
});

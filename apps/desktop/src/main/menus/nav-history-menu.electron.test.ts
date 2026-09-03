import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { BrowserWindow } from 'electron';

interface FakeEntry {
  url: string;
  title: string;
}

/** A stand-in for a tab's `webContents.navigationHistory`, recording where it was told to jump. */
function fakeTab(entries: FakeEntry[], activeIndex: number) {
  const jumps: number[] = [];
  return {
    jumps,
    wc: {
      navigationHistory: {
        getAllEntries: () => entries,
        getActiveIndex: () => activeIndex,
        canGoToOffset: (offset: number) =>
          activeIndex + offset >= 0 && activeIndex + offset < entries.length,
        goToOffset: (offset: number) => jumps.push(offset),
      },
    },
  };
}

/** Mutable stand-ins for the two collaborators the menu reaches for: the tab model and the OS menu. */
interface Harness {
  popped: unknown[][];
  activeId: string | null;
  webContentsForTab: Mock<(id: string) => unknown>;
  openInternalPage: Mock<(url: string) => void>;
  /** favicon `HistoryStore.faviconFor` should return, keyed by URL. */
  favicons: Record<string, string | null>;
}

const h = vi.hoisted((): Harness => ({
  popped: [],
  activeId: 'tab-1',
  webContentsForTab: vi.fn(() => null),
  openInternalPage: vi.fn(),
  favicons: {},
}));

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: (template: unknown[]) => ({
      popup: () => {
        h.popped.push(template);
      },
    }),
  },
  nativeImage: {
    // A tiny stand-in: a non-empty "image" that records the resize it was asked for.
    createFromDataURL: (dataUrl: string) => ({
      isEmpty: () => dataUrl.includes('EMPTY'),
      resize: (opts: unknown) => ({ __img: dataUrl, resizedTo: opts }),
    }),
  },
}));
vi.mock('../db/database.electron', () => ({ getDb: () => ({ __db: true }) }));
vi.mock('@tepegoz/persistence', () => ({
  HistoryStore: { faviconFor: (_db: unknown, url: string) => h.favicons[url] ?? null },
}));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ browser: { showFullHistory: 'Show full history' } }),
}));
vi.mock('../tabs', () => ({
  default: {
    forSenderWindow: () => ({
      getState: () => ({ activeId: h.activeId }),
      webContentsForTab: h.webContentsForTab,
      openInternalPage: h.openInternalPage,
    }),
  },
}));

const { showNavHistoryMenu } = await import('./nav-history-menu');

const WIN = {} as BrowserWindow;
/** The rows of the most recently popped menu, as `{ label, click }` pairs. */
function lastMenu(): { label?: string; type?: string; icon?: unknown; click?: () => void }[] {
  return (h.popped.at(-1) ?? []) as {
    label?: string;
    type?: string;
    icon?: unknown;
    click?: () => void;
  }[];
}

const HISTORY: FakeEntry[] = [
  { url: 'https://a.test/', title: 'A' },
  { url: 'https://b.test/', title: 'B' },
  { url: 'https://c.test/', title: '' },
];

beforeEach(() => {
  h.popped.length = 0;
  h.activeId = 'tab-1';
  h.favicons = {};
  h.openInternalPage.mockClear();
  h.webContentsForTab.mockReset();
});

describe('showNavHistoryMenu', () => {
  it('lists the back history nearest-first and ends with the full-history row', () => {
    const tab = fakeTab(HISTORY, 2);
    h.webContentsForTab.mockReturnValue(tab.wc);
    showNavHistoryMenu(WIN, 'back');
    expect(lastMenu().map((row) => row.label ?? row.type)).toEqual([
      'B',
      'A',
      'separator',
      'Show full history',
    ]);
  });

  it('falls back to the URL for an entry that never reported a title', () => {
    const tab = fakeTab(HISTORY, 0);
    h.webContentsForTab.mockReturnValue(tab.wc);
    showNavHistoryMenu(WIN, 'forward');
    expect(lastMenu().map((row) => row.label ?? row.type)).toEqual([
      'B',
      'https://c.test/',
      'separator',
      'Show full history',
    ]);
  });

  it('jumps by the row offset when an entry is chosen', () => {
    const tab = fakeTab(HISTORY, 2);
    h.webContentsForTab.mockReturnValue(tab.wc);
    showNavHistoryMenu(WIN, 'back');
    lastMenu()[1]?.click?.(); // the second row back
    expect(tab.jumps).toEqual([-2]);
  });

  it('acts on the tab that was active at right-click, not whatever is active later', () => {
    const tab = fakeTab(HISTORY, 2);
    h.webContentsForTab.mockReturnValue(tab.wc);
    showNavHistoryMenu(WIN, 'back');
    h.activeId = 'some-other-tab';
    lastMenu()[0]?.click?.();
    expect(h.webContentsForTab.mock.calls.map(([id]) => id)).toEqual(['tab-1', 'tab-1']);
  });

  it('does nothing when the entry went stale while the menu was open', () => {
    const tab = fakeTab(HISTORY, 2);
    h.webContentsForTab.mockReturnValue(tab.wc);
    showNavHistoryMenu(WIN, 'back');
    // The page navigated meanwhile: the tab is now at the start, so -2 no longer resolves.
    const moved = fakeTab(HISTORY, 0);
    h.webContentsForTab.mockReturnValue(moved.wc);
    lastMenu()[1]?.click?.();
    expect(moved.jumps).toEqual([]);
  });

  it('does nothing when the tab closed while the menu was open', () => {
    const tab = fakeTab(HISTORY, 2);
    h.webContentsForTab.mockReturnValue(tab.wc);
    showNavHistoryMenu(WIN, 'back');
    h.webContentsForTab.mockReturnValue(null);
    expect(() => lastMenu()[0]?.click?.()).not.toThrow();
    expect(tab.jumps).toEqual([]);
  });

  it('gives a row the stored favicon as an icon, and omits it when there is none or it will not decode', () => {
    h.favicons = {
      'https://a.test/': 'data:image/png;base64,AAAA',
      'https://b.test/': 'https://b.test/favicon.ico', // remote → never used from the chrome
    };
    const tab = fakeTab(HISTORY, 2);
    h.webContentsForTab.mockReturnValue(tab.wc);
    showNavHistoryMenu(WIN, 'back');
    // rows are nearest-first: [B, A, separator, full-history]
    const [rowB, rowA] = lastMenu();
    expect(rowA?.icon).toMatchObject({ __img: 'data:image/png;base64,AAAA' });
    expect(rowB?.icon).toBeUndefined(); // remote favicon is not rendered
  });

  it('omits the icon when the decoded image is empty', () => {
    h.favicons = { 'https://a.test/': 'data:image/png;base64,EMPTY' };
    const tab = fakeTab(HISTORY, 2);
    h.webContentsForTab.mockReturnValue(tab.wc);
    showNavHistoryMenu(WIN, 'back');
    expect(lastMenu()[1]?.icon).toBeUndefined();
  });

  it('opens the history page from the last row', () => {
    const tab = fakeTab(HISTORY, 2);
    h.webContentsForTab.mockReturnValue(tab.wc);
    showNavHistoryMenu(WIN, 'back');
    lastMenu().at(-1)?.click?.();
    expect(h.openInternalPage).toHaveBeenCalledWith('tepegoz://history');
  });

  it('pops no menu at all when that side is empty, or on an internal tab', () => {
    h.webContentsForTab.mockReturnValue(fakeTab(HISTORY, 2).wc);
    showNavHistoryMenu(WIN, 'forward'); // already at the newest entry
    h.webContentsForTab.mockReturnValue(null); // tepegoz://… tab — no view, no page history
    showNavHistoryMenu(WIN, 'back');
    h.webContentsForTab.mockReturnValue(fakeTab(HISTORY, 2).wc);
    h.activeId = null; // no active tab
    showNavHistoryMenu(WIN, 'back');
    expect(h.popped).toEqual([]);
  });
});

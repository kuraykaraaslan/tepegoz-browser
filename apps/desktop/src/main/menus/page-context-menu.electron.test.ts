import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `page-context-menu.ts` — the web-page right-click menu. The MAIN process stashes the click context
 * at open time; the popup surface reads it and dispatches an action back. Pinned:
 *   - the selection carried to the renderer is capped (label-only, 120 chars);
 *   - `getPageMenuContext` returns the WIRE context only — the captured x/y point stays in main;
 *   - an open superseded by a newer right-click does not stash its context;
 *   - every wired action routes to the right TabManager / clipboard / screenshot call, and the
 *     link/media/selection actions no-op when their field is empty;
 *   - `reader-mode` is forwarded to the focused window, not handled here.
 */

const popupOpen = vi.hoisted(() => vi.fn());
vi.mock('../popup-window', () => ({ default: { open: popupOpen } }));

const contrib = vi.hoisted(() => ({
  collect: vi.fn(() => Promise.resolve([])),
  runAction: vi.fn(() => Promise.resolve()),
}));
vi.mock('./page-context-menu-contributions', () => ({ default: contrib }));

const tm = vi.hoisted(() => ({
  goBack: vi.fn(),
  goForward: vi.fn(),
  reloadActive: vi.fn(),
  viewSourceActive: vi.fn(),
  inspectActiveAt: vi.fn(),
  printActive: vi.fn(),
  saveActive: vi.fn(),
  copyActive: vi.fn(),
  cutActive: vi.fn(),
  pasteActive: vi.fn(),
  selectAllActive: vi.fn(),
  createTab: vi.fn(),
  copyImageAtActive: vi.fn(),
  downloadUrlActive: vi.fn(),
  activeTabId: vi.fn(() => 'tab-1'),
  focusedWindow: vi.fn(),
}));
vi.mock('../tabs', () => ({ default: tm }));

const clipboardWriteText = vi.hoisted(() => vi.fn());
vi.mock('../clipboard/clipboard-service.electron', () => ({
  default: { writeText: clipboardWriteText },
}));
const savePageAsPdf = vi.hoisted(() => vi.fn());
vi.mock('../print/print-to-pdf.electron', () => ({ savePageAsPdf }));
const captureAndNotify = vi.hoisted(() => vi.fn());
vi.mock('../screenshots/screenshot-notify.electron', () => ({ captureAndNotify }));

const { openPageContextMenu, getPageMenuContext, runPageMenuAction, runPageMenuContributionAction } =
  await import('./page-context-menu');

const params = (over: Record<string, unknown> = {}) => ({
  pageURL: 'https://example.com/page',
  selectionText: 'hello world',
  linkURL: '',
  srcURL: '',
  mediaType: 'none',
  isEditable: false,
  editFlags: { canCopy: true, canCut: false, canPaste: false, canSelectAll: true },
  x: 40,
  y: 60,
  ...over,
});
const view = { isDestroyed: () => false };
const parent = { isDestroyed: () => false };
const bounds = { x: 5, y: 7, width: 100, height: 100 };
const nav = { canGoBack: true, canGoForward: false };

const open = (p = params()) =>
  openPageContextMenu(parent as never, view as never, p as never, bounds, nav);

beforeEach(() => {
  Object.values(tm).forEach((f) => f.mockClear());
  tm.activeTabId.mockReturnValue('tab-1');
  popupOpen.mockClear();
  contrib.collect.mockClear().mockResolvedValue([]);
  clipboardWriteText.mockClear();
  savePageAsPdf.mockClear();
  captureAndNotify.mockClear();
});

describe('context capture', () => {
  it('returns an empty context before any menu has opened', () => {
    expect(getPageMenuContext()).toMatchObject({ menuId: '', pageUrl: '', selectionText: '' });
  });

  it('caps the selection text at 120 chars and projects the edit flags', async () => {
    await open(params({ selectionText: 'x'.repeat(500) }));
    const ctx = getPageMenuContext();
    expect(ctx.selectionText.length).toBe(120);
    expect(ctx).toMatchObject({
      canCopy: true,
      canCut: false,
      canSelectAll: true,
      canGoBack: true,
    });
  });

  it('does not leak the captured x/y point into the wire context', async () => {
    await open();
    expect(getPageMenuContext()).not.toHaveProperty('x');
    expect(getPageMenuContext()).not.toHaveProperty('y');
  });

  it('opens the popup anchored at the view-relative click point', async () => {
    await open();
    const opts = popupOpen.mock.calls[0]![0] as { anchor: { x: number; y: number } };
    expect(opts.anchor).toMatchObject({ x: 45, y: 67 }); // viewBounds (5,7) + params (40,60)
  });
});

describe('wired actions', () => {
  it('routes navigation + edit actions to TabManager', async () => {
    await open();
    for (const [action, fn] of [
      ['back', tm.goBack],
      ['forward', tm.goForward],
      ['reload', tm.reloadActive],
      ['view-source', tm.viewSourceActive],
      ['print', tm.printActive],
      ['save', tm.saveActive],
      ['copy', tm.copyActive],
      ['cut', tm.cutActive],
      ['paste', tm.pasteActive],
      ['select-all', tm.selectAllActive],
    ] as const) {
      runPageMenuAction(action);
      expect(fn).toHaveBeenCalled();
    }
  });

  it('forwards reader-mode to the focused window rather than handling it', async () => {
    const send = vi.fn();
    tm.focusedWindow.mockReturnValue({ isDestroyed: () => false, webContents: { send } });
    await open();
    runPageMenuAction('reader-mode');
    expect(send).toHaveBeenCalled();
  });

  it('screenshot + save-as-pdf go to their helpers', async () => {
    await open();
    runPageMenuAction('screenshot-viewport');
    runPageMenuAction('screenshot-full-page');
    runPageMenuAction('save-as-pdf');
    expect(captureAndNotify).toHaveBeenCalledWith('viewport');
    expect(captureAndNotify).toHaveBeenCalledWith('fullPage');
    expect(savePageAsPdf).toHaveBeenCalledTimes(1);
  });

  it('search-selection opens a search tab for the captured selection, with the page as opener', async () => {
    await open(params({ selectionText: 'quantum' }));
    runPageMenuAction('search-selection');
    expect(tm.createTab).toHaveBeenCalledWith(
      expect.stringContaining('q=quantum'),
      expect.objectContaining({ openerId: 'tab-1' }),
    );
  });

  it('copy-link writes the link URL with the page origin, and no-ops when there is no link', async () => {
    await open(params({ linkURL: 'https://dest.example/a' }));
    runPageMenuAction('copy-link');
    expect(clipboardWriteText).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'https://dest.example/a', origin: 'https://example.com' }),
    );

    clipboardWriteText.mockClear();
    await open(params({ linkURL: '' }));
    runPageMenuAction('copy-link');
    expect(clipboardWriteText).not.toHaveBeenCalled();
  });

  it('save-media downloads the src URL, open-media-new-tab needs a non-empty src', async () => {
    await open(params({ srcURL: 'https://cdn.example/v.mp4', mediaType: 'video' }));
    runPageMenuAction('save-media');
    runPageMenuAction('open-media-new-tab');
    expect(tm.downloadUrlActive).toHaveBeenCalledWith('https://cdn.example/v.mp4');
    expect(tm.createTab).toHaveBeenCalledWith(
      'https://cdn.example/v.mp4',
      expect.objectContaining({ openerId: 'tab-1' }),
    );
  });

  it('copy-media-link falls back to no origin when the page URL is unparseable', async () => {
    await open(params({ pageURL: 'not a url', srcURL: 'https://cdn.example/v.mp4' }));
    runPageMenuAction('copy-media-link');
    expect(clipboardWriteText).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'https://cdn.example/v.mp4', origin: undefined }),
    );
  });

  it('inspect and copy-image carry the captured click point', async () => {
    await open();
    runPageMenuAction('inspect');
    runPageMenuAction('copy-image');
    expect(tm.inspectActiveAt).toHaveBeenCalledTimes(1);
    expect(tm.copyImageAtActive).toHaveBeenCalledTimes(1);
    // both get the same (x, y) — the point main kept out of the wire context
    expect(tm.inspectActiveAt.mock.calls[0]).toEqual(tm.copyImageAtActive.mock.calls[0]);
  });

  it('open-link-new-tab opens the link as a background tab with the page as opener', async () => {
    await open(params({ linkURL: 'https://dest.example/x' }));
    runPageMenuAction('open-link-new-tab');
    expect(tm.createTab).toHaveBeenCalledWith(
      'https://dest.example/x',
      expect.objectContaining({ background: true, openerId: 'tab-1' }),
    );
  });

  it('opener falls back to undefined when there is no active tab id', async () => {
    tm.activeTabId.mockReturnValue(null as never);
    await open(params({ linkURL: 'https://dest.example/y' }));
    runPageMenuAction('open-link-new-tab');
    expect(tm.createTab).toHaveBeenCalledWith(
      'https://dest.example/y',
      expect.objectContaining({ openerId: undefined }),
    );
  });
});

describe('contribution actions', () => {
  it('runPageMenuContributionAction forwards to the contribution service', () => {
    runPageMenuContributionAction({ contributionId: 'ext.copyThing', menuId: 'm1' } as never);
    expect(contrib.runAction).toHaveBeenCalledWith({
      contributionId: 'ext.copyThing',
      menuId: 'm1',
    });
  });
});

describe('superseded open', () => {
  it('does not stash the context of an open that a newer right-click overtook', async () => {
    contrib.collect.mockImplementation(
      () =>
        new Promise((resolve) => {
          // resolve the FIRST collect only after a second open has bumped openSeq
          setTimeout(() => resolve([]), 5);
        }),
    );
    const first = open(params({ selectionText: 'STALE' }));
    contrib.collect.mockResolvedValue([]);
    await open(params({ selectionText: 'FRESH' }));
    await first;
    expect(getPageMenuContext().selectionText).toBe('FRESH');
  });
});

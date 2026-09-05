// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { BookmarkTreeNode } from '@tepegoz/desktop-ipc';
import { browserDict } from '../../../i18n';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { BookmarkDialogPopup } from './BookmarkDialogPopup';

/**
 * Standalone native window for the bookmark rename / add-folder dialog. A separate window (not an
 * in-renderer modal) so the page stays visible behind it. Rename prefills the current title (found by
 * walking the fetched tree); add-folder starts blank. Submit mutates over IPC then always closes —
 * even a rejected mutation still dismisses, since the boundary already logged it.
 */

stubJsdomLayout();

const t = browserDict.en;

let n = 0;
const bm = (title: string, children: BookmarkTreeNode[] = []): BookmarkTreeNode => ({
  id: `b${String(n++)}`,
  parentId: null,
  type: children.length > 0 ? 'folder' : 'bookmark',
  title,
  url: children.length > 0 ? null : 'https://example.com',
  favicon: null,
  position: 0,
  createdAt: 0,
  updatedAt: 0,
  tags: [],
  children,
});

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  getBookmarkTree: vi.fn(() => Promise.resolve([] as BookmarkTreeNode[])),
  renameBookmark: vi.fn(() => Promise.resolve()),
  createBookmarkFolder: vi.fn(() => Promise.resolve()),
  closePopup: vi.fn(),
  resizePopup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  bridge.getBookmarkTree.mockResolvedValue([]);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BookmarkDialogPopup', () => {
  it('add-folder mode starts blank and never fetches the bookmark tree', async () => {
    render(<BookmarkDialogPopup mode="add-folder" id="f-root" />);
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    expect(bridge.getBookmarkTree).not.toHaveBeenCalled();
    expect(screen.getByText(t.newFolder)).toBeTruthy();
    expect(screen.getByPlaceholderText(t.folderNamePlaceholder)).toHaveProperty('value', '');
    expect(screen.getByRole('button', { name: t.add })).toBeTruthy();
  });

  it('rename mode prefills the title found by walking the tree, including a nested child', async () => {
    const target = bm('Deep bookmark');
    const tree = [bm('Top', [bm('Middle', [target])])];
    bridge.getBookmarkTree.mockResolvedValue(tree);
    render(<BookmarkDialogPopup mode="rename" id={target.id} />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(t.folderNamePlaceholder)).toHaveProperty(
        'value',
        'Deep bookmark',
      ),
    );
    expect(screen.getByText(t.renameTitle)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.save })).toBeTruthy();
  });

  it('rename mode leaves the field blank when the id is not found in the tree', async () => {
    bridge.getBookmarkTree.mockResolvedValue([bm('Something else')]);
    render(<BookmarkDialogPopup mode="rename" id="missing" />);
    await waitFor(() => expect(bridge.getBookmarkTree).toHaveBeenCalled());
    expect(screen.getByPlaceholderText(t.folderNamePlaceholder)).toHaveProperty('value', '');
  });

  it('rename mode survives a rejected tree fetch, keeping the field blank', async () => {
    bridge.getBookmarkTree.mockRejectedValueOnce(new Error('locked'));
    render(<BookmarkDialogPopup mode="rename" id="x" />);
    await waitFor(() => expect(bridge.getBookmarkTree).toHaveBeenCalled());
    expect(screen.getByPlaceholderText(t.folderNamePlaceholder)).toHaveProperty('value', '');
  });

  it('survives a rejected preferences fetch, still rendering with the default locale', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('down'));
    render(<BookmarkDialogPopup mode="add-folder" id="f-root" />);
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    expect(screen.getByText(t.newFolder)).toBeTruthy();
  });

  it('resolves the stored tr locale, and falls back through resolveLocale otherwise', async () => {
    bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    render(<BookmarkDialogPopup mode="add-folder" id="f-root" />);
    expect(await screen.findByText(browserDict.tr.newFolder)).toBeTruthy();

    cleanup();
    bridge.getPreferences.mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      locale: 'de' as (typeof DEFAULT_PREFERENCES)['locale'],
    });
    render(<BookmarkDialogPopup mode="add-folder" id="f-root" />);
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    expect(screen.getByText(t.newFolder)).toBeTruthy();
  });

  it('drops a preferences/tree fetch that resolves after unmount', async () => {
    let resolvePrefs: ((p: typeof DEFAULT_PREFERENCES) => void) | undefined;
    bridge.getPreferences.mockImplementationOnce(
      () =>
        new Promise<typeof DEFAULT_PREFERENCES>((resolve) => {
          resolvePrefs = resolve;
        }),
    );
    const { unmount } = render(<BookmarkDialogPopup mode="rename" id="x" />);
    unmount();
    resolvePrefs?.({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    await Promise.resolve();
    expect(bridge.getBookmarkTree).not.toHaveBeenCalled();
  });

  it('closes on Escape and via the Cancel button, without mutating anything', async () => {
    render(<BookmarkDialogPopup mode="add-folder" id="f-root" />);
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: t.cancel }));
    expect(bridge.closePopup).toHaveBeenCalledTimes(2);
    expect(bridge.createBookmarkFolder).not.toHaveBeenCalled();
  });

  it('submitting a blank value just closes, without creating anything', async () => {
    render(<BookmarkDialogPopup mode="add-folder" id="f-root" />);
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: t.add }));
    await waitFor(() => expect(bridge.closePopup).toHaveBeenCalledTimes(1));
    expect(bridge.createBookmarkFolder).not.toHaveBeenCalled();
  });

  it('submitting a trimmed value creates the folder then closes', async () => {
    render(<BookmarkDialogPopup mode="add-folder" id="f-root" />);
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(t.folderNamePlaceholder), {
      target: { value: '  Reading list  ' },
    });
    fireEvent.submit(screen.getByPlaceholderText(t.folderNamePlaceholder).closest('form')!);
    await waitFor(() =>
      expect(bridge.createBookmarkFolder).toHaveBeenCalledWith('f-root', 'Reading list'),
    );
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('submitting a rename renames the bookmark then closes, even if the write rejects', async () => {
    bridge.renameBookmark.mockRejectedValueOnce(new Error('vault locked'));
    render(<BookmarkDialogPopup mode="rename" id="b1" />);
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(t.folderNamePlaceholder), {
      target: { value: 'New title' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() => expect(bridge.renameBookmark).toHaveBeenCalledWith('b1', 'New title'));
    await waitFor(() => expect(bridge.closePopup).toHaveBeenCalledTimes(1));
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { BookmarksManager, type BookmarkManagerNode } from './bookmarks-ui';

function bm(id: string, title: string, url: string): BookmarkManagerNode {
  return { id, type: 'bookmark', title, url, favicon: null, children: [] };
}
function folder(id: string, title: string, children: BookmarkManagerNode[]): BookmarkManagerNode {
  return { id, type: 'folder', title, url: null, favicon: null, children };
}

const TREE: BookmarkManagerNode[] = [
  folder('root-bar', 'Bookmarks bar', [bm('a', 'Alpha', 'https://a.com/')]),
  folder('root-other', 'Other bookmarks', []),
];

function renderManager(over: Partial<Parameters<typeof BookmarksManager>[0]> = {}) {
  const props = {
    getTree: vi.fn().mockResolvedValue(TREE),
    refreshKey: 0,
    onMove: vi.fn(),
    onNewFolder: vi.fn(),
    onOpen: vi.fn(),
    onContextMenu: vi.fn(),
    onSetTags: vi.fn().mockResolvedValue([]),
    ...over,
  };
  render(
    <I18nProvider locale="en">
      <BookmarksManager {...props} />
    </I18nProvider>,
  );
  return props;
}

afterEach(cleanup);

describe('BookmarksManager', () => {
  it('renders the two roots and the selected folder contents', async () => {
    renderManager();
    await waitFor(() => expect(screen.getAllByText('Bookmarks bar').length).toBeGreaterThan(0));
    // Bar root is selected by default → its child bookmark shows in the right pane.
    expect(await screen.findByText('Alpha')).toBeDefined();
    expect(screen.getByText('Other bookmarks')).toBeDefined();
  });

  it('opens a bookmark on click', async () => {
    const { onOpen } = renderManager();
    fireEvent.click(await screen.findByText('Alpha'));
    expect(onOpen).toHaveBeenCalledWith('https://a.com/');
  });

  it('asks the host to create a folder in the selected folder via the New folder button', async () => {
    const { onNewFolder } = renderManager();
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByText('New folder'));
    expect(onNewFolder).toHaveBeenCalledWith('root-bar');
  });
});

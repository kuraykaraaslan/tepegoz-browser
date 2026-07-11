// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BookmarksBar, type BookmarkBarNode } from './bookmarks-bar';

const LABELS = { bar: 'Bookmarks bar', empty: 'No bookmarks yet.' };

function bookmark(id: string, title: string, url: string): BookmarkBarNode {
  return { id, type: 'bookmark', title, url, favicon: null, children: [] };
}
function folder(id: string, title: string, children: BookmarkBarNode[]): BookmarkBarNode {
  return { id, type: 'folder', title, url: null, favicon: null, children };
}

function renderBar(nodes: BookmarkBarNode[], over: Partial<Parameters<typeof BookmarksBar>[0]> = {}) {
  const props = {
    nodes,
    barRootId: 'root-bar',
    onOpen: vi.fn(),
    onOpenFolder: vi.fn(),
    onMove: vi.fn(),
    onContextMenu: vi.fn(),
    labels: LABELS,
    ...over,
  };
  render(<BookmarksBar {...props} />);
  return props;
}

afterEach(cleanup);

describe('BookmarksBar', () => {
  it('shows the empty state with no nodes', () => {
    renderBar([]);
    expect(screen.getByText('No bookmarks yet.')).toBeDefined();
  });

  it('opens a bookmark on click', () => {
    const { onOpen } = renderBar([bookmark('a', 'Alpha', 'https://a.com/')]);
    fireEvent.click(screen.getByText('Alpha'));
    expect(onOpen).toHaveBeenCalledWith('https://a.com/');
  });

  it('asks the host to open a folder dropdown (native popup) with an anchor', () => {
    const { onOpenFolder } = renderBar([folder('f', 'Work', [bookmark('c', 'Child', 'https://c.com/')])]);
    fireEvent.click(screen.getByText('Work'));
    expect(onOpenFolder).toHaveBeenCalledWith('f', expect.objectContaining({ x: expect.any(Number) as unknown }));
  });

  it('fires the context menu with the node id + type on right-click', () => {
    const { onContextMenu } = renderBar([bookmark('a', 'Alpha', 'https://a.com/')]);
    fireEvent.contextMenu(screen.getByText('Alpha'));
    expect(onContextMenu).toHaveBeenCalledWith('a', 'bookmark');
  });
});

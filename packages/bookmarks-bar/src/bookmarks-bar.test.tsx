// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BookmarksBar, type BookmarkBarNode } from './bookmarks-bar';

/**
 * The drag-end wiring and the drag overlay stay uncovered here: reaching them needs a simulated
 * dnd-kit pointer drag, and the decision they carry out — where a dragged chip lands — is already
 * pinned directly in `bar-drop-resolver.test.ts`. What is left in the component is the two-line
 * translation of that decision into an `onMove` call.
 */

const LABELS = { bar: 'Bookmarks bar', empty: 'No bookmarks yet.' };

function bookmark(id: string, title: string, url: string): BookmarkBarNode {
  return { id, type: 'bookmark', title, url, favicon: null, children: [] };
}
function folder(id: string, title: string, children: BookmarkBarNode[]): BookmarkBarNode {
  return { id, type: 'folder', title, url: null, favicon: null, children };
}

function renderBar(
  nodes: BookmarkBarNode[],
  over: Partial<Parameters<typeof BookmarksBar>[0]> = {},
) {
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
    const { onOpenFolder } = renderBar([
      folder('f', 'Work', [bookmark('c', 'Child', 'https://c.com/')]),
    ]);
    fireEvent.click(screen.getByText('Work'));
    expect(onOpenFolder).toHaveBeenCalledWith(
      'f',
      expect.objectContaining({ x: expect.any(Number) as unknown }),
    );
  });

  it('fires the context menu with the node id + type on right-click', () => {
    const { onContextMenu } = renderBar([bookmark('a', 'Alpha', 'https://a.com/')]);
    fireEvent.contextMenu(screen.getByText('Alpha'));
    expect(onContextMenu).toHaveBeenCalledWith('a', 'bookmark');
  });
});

describe('what a chip shows', () => {
  const withIcon = (id: string, title: string, favicon: string | null): BookmarkBarNode => ({
    id,
    type: 'bookmark',
    title,
    url: `https://${id}.test/`,
    favicon,
    children: [],
  });

  it('shows a favicon when there is one, and drops to the glyph when it fails to load', () => {
    // The bar is one row of tiny chips; a broken-image box in it is louder than the favicon was.
    renderBar([withIcon('a', 'Alpha', 'data:image/png;base64,AA')]);
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AA');

    fireEvent.error(img!);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Alpha')).toBeDefined();
  });

  it('labels an untitled bookmark by its url, in the chip and in its tooltip', () => {
    renderBar([withIcon('a', '', null)]);
    const chip = screen.getByText('https://a.test/');
    expect(chip.closest('[title]')?.getAttribute('title')).toBe('https://a.test/');
  });

  it('falls back to an empty label for a folder with no title', () => {
    // A folder has no url to fall back to, so the chip is icon-only rather than showing "undefined".
    renderBar([folder('f', '', [])]);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.textContent).not.toContain('undefined');
    expect(toolbar.textContent).not.toContain('null');
  });
});

describe('the bar itself', () => {
  it('scrolls horizontally on a vertical wheel, because the bar is one row', () => {
    // A wheel over a single-row strip means "show me more of it", and the strip only has an x axis.
    renderBar([bookmark('a', 'Alpha', 'https://a.com/')]);
    const toolbar = screen.getByRole('toolbar');
    Object.defineProperty(toolbar, 'scrollLeft', { value: 0, writable: true });

    fireEvent.wheel(toolbar, { deltaY: 120 });
    expect(toolbar.scrollLeft).toBe(120);
  });

  it('ignores a wheel with no vertical component', () => {
    renderBar([bookmark('a', 'Alpha', 'https://a.com/')]);
    const toolbar = screen.getByRole('toolbar');
    Object.defineProperty(toolbar, 'scrollLeft', { value: 7, writable: true });

    fireEvent.wheel(toolbar, { deltaY: 0 });
    expect(toolbar.scrollLeft).toBe(7);
  });

  it('opens the bar-root menu on a right-click over the empty area', () => {
    const { onContextMenu } = renderBar([bookmark('a', 'Alpha', 'https://a.com/')]);
    const toolbar = screen.getByRole('toolbar');

    fireEvent.contextMenu(toolbar);
    expect(onContextMenu).toHaveBeenCalledWith('root-bar', 'folder');
  });

  it('leaves a right-click ON a chip to the chip, so the row menu is not replaced by the bar menu', () => {
    // The chip has its own menu (open, edit, delete). If the bar answered every right-click, that
    // menu would never appear — the event reaches the bar by bubbling either way.
    const { onContextMenu } = renderBar([bookmark('a', 'Alpha', 'https://a.com/')]);

    fireEvent.contextMenu(screen.getByText('Alpha'));
    expect(onContextMenu).toHaveBeenCalledWith('a', 'bookmark');
    expect(onContextMenu).not.toHaveBeenCalledWith('root-bar', 'folder');
  });
});

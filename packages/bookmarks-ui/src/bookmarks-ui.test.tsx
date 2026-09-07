// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

/** The folder tree (left) and the item list (right) render the same names — scope every query. */
const tree = (): HTMLElement => {
  const el = document.querySelector('aside');
  if (el === null) throw new Error('folder tree not found');
  return el;
};
const list = (): HTMLElement => {
  const el = document.querySelector('section');
  if (el === null) throw new Error('item list not found');
  return el;
};

const NESTED: BookmarkManagerNode[] = [
  folder('root-bar', 'Bookmarks bar', [
    folder('work', 'Work', [folder('specs', 'Specs', []), bm('doc', 'A doc', 'https://doc.test/')]),
    bm('a', 'Alpha', 'https://a.com/'),
  ]),
  folder('root-other', 'Other bookmarks', []),
];

describe('the folder tree', () => {
  it('gives a disclosure only to folders that actually hold subfolders', async () => {
    // The tree lists FOLDERS. A folder holding only bookmarks has nothing to expand into, so an
    // arrow there would promise a level that does not exist — "Other bookmarks" and "Specs" get none.
    renderManager({ getTree: vi.fn().mockResolvedValue(NESTED) });
    await within(tree()).findByText('Work');

    expect(
      within(tree()).getAllByRole('button', { name: 'Expand or collapse folder' }),
    ).toHaveLength(2); // the bar root, and Work
    expect(within(tree()).queryByText('Specs')).toBeNull();
  });

  it('reveals and re-hides a nested folder on its own toggle', async () => {
    renderManager({ getTree: vi.fn().mockResolvedValue(NESTED) });
    await within(tree()).findByText('Work');
    const toggle = within(tree()).getAllByRole('button', {
      name: 'Expand or collapse folder',
    })[1]!;

    fireEvent.click(toggle);
    expect(await within(tree()).findByText('Specs')).toBeDefined();

    fireEvent.click(toggle);
    await waitFor(() => expect(within(tree()).queryByText('Specs')).toBeNull());
  });

  it('expanding a folder does not also select it, so the right pane stays put', async () => {
    renderManager({ getTree: vi.fn().mockResolvedValue(NESTED) });
    await within(tree()).findByText('Work');

    fireEvent.click(
      within(tree()).getAllByRole('button', { name: 'Expand or collapse folder' })[1]!,
    );
    expect(within(list()).getByText('Alpha')).toBeDefined();

    // clicking the row itself DOES select it
    fireEvent.click(within(tree()).getByText('Work'));
    await waitFor(() => expect(within(list()).queryByText('Alpha')).toBeNull());
    expect(within(list()).getByText('A doc')).toBeDefined();
  });

  it('relays a right-click on a tree folder as a folder context menu', async () => {
    const props = renderManager({ getTree: vi.fn().mockResolvedValue(NESTED) });
    await within(tree()).findByText('Work');

    fireEvent.contextMenu(within(tree()).getByText('Work'));
    expect(props.onContextMenu).toHaveBeenCalledWith('work', 'folder');
  });
});

describe('the item list', () => {
  const MIXED: BookmarkManagerNode[] = [
    folder('root-bar', 'Bookmarks bar', [
      folder('sub', 'A subfolder', [bm('inner', 'Inner', 'https://inner.test/')]),
      {
        id: 'ico',
        type: 'bookmark',
        title: 'With icon',
        url: 'https://i.test/',
        favicon: 'data:image/png;base64,AA',
        children: [],
      },
      {
        id: 'untitled',
        type: 'bookmark',
        title: '',
        url: 'https://untitled.test/',
        favicon: null,
        children: [],
      },
    ]),
    folder('root-other', 'Other bookmarks', []),
  ];

  it('shows a favicon, and drops it for the glyph when the image fails to load', async () => {
    // A dead favicon URL is ordinary — sites move them. The row must not keep a broken-image box.
    renderManager({ getTree: vi.fn().mockResolvedValue(MIXED) });
    await within(list()).findByText('With icon');

    const img = list().querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AA');

    fireEvent.error(img!);
    await waitFor(() => expect(list().querySelector('img')).toBeNull());
  });

  it('falls back to the URL for a bookmark with no title', async () => {
    renderManager({ getTree: vi.fn().mockResolvedValue(MIXED) });
    // both the title line and the address line read the url — but the row is not a blank strip
    expect(await within(list()).findAllByText('https://untitled.test/')).toHaveLength(2);
  });

  it('a folder row in the list navigates INTO the folder rather than opening anything', async () => {
    const props = renderManager({ getTree: vi.fn().mockResolvedValue(MIXED) });
    await within(list()).findByText('A subfolder');

    fireEvent.click(within(list()).getByText('A subfolder'));
    expect(await within(list()).findByText('Inner')).toBeDefined();
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('relays a right-click on a list row with that row’s own type', async () => {
    const props = renderManager({ getTree: vi.fn().mockResolvedValue(MIXED) });
    await within(list()).findByText('A subfolder');

    fireEvent.contextMenu(within(list()).getByText('A subfolder').closest('li')!);
    expect(props.onContextMenu).toHaveBeenCalledWith('sub', 'folder');

    fireEvent.contextMenu(within(list()).getByText('With icon').closest('li')!);
    expect(props.onContextMenu).toHaveBeenCalledWith('ico', 'bookmark');
  });
});

describe('export', () => {
  it('offers Export only when the host can produce a file', async () => {
    renderManager();
    await within(tree()).findByText('Bookmarks bar');
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('saves the html the host returns through an ordinary browser download', async () => {
    // The renderer never touches the filesystem: it takes a string over the bridge and lets the
    // browser save it, which keeps the untrusted-renderer boundary exactly where it is.
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    // Intercept the anchor the handler builds rather than patching the prototype, so nothing about
    // this test leaks into another one.
    const clicked: HTMLAnchorElement[] = [];
    const realCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        const anchor = el as HTMLAnchorElement;
        anchor.click = (): void => {
          clicked.push(anchor);
        };
      }
      return el;
    });

    try {
      const onExport = vi.fn().mockResolvedValue('<html>bookmarks</html>');
      renderManager({ onExport });
      await within(tree()).findByText('Bookmarks bar');

      fireEvent.click(screen.getByRole('button', { name: 'Export' }));

      await waitFor(() => expect(onExport).toHaveBeenCalled());
      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(clicked[0]?.download).toBe('tepegoz-bookmarks.html');
      expect(clicked[0]?.getAttribute('href')).toBe('blob:fake');
      // the object URL is released rather than leaked for the life of the page
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    } finally {
      createSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

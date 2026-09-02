import { describe, expect, it } from 'vitest';
import { buildFirefoxBookmarkTree, type FirefoxBookmarkRow } from './bookmark-import-firefox';
import { MAX_NODES, type ImportedBookmarkNode } from './bookmark-import-limits';

/** A `moz_bookmarks` row with the columns this importer reads; everything else defaulted. */
function row(over: Partial<FirefoxBookmarkRow> & { id: number; parent: number }): FirefoxBookmarkRow {
  return {
    type: 2,
    title: null,
    position: 0,
    guid: null,
    url: null,
    ...over,
  };
}
function bookmark(
  id: number,
  parent: number,
  title: string,
  url: string,
  position = 0,
): FirefoxBookmarkRow {
  return row({ id, parent, type: 1, title, url, position });
}
function children(node: ImportedBookmarkNode): ImportedBookmarkNode[] {
  return node.type === 'folder' ? node.children : [];
}
function titles(nodes: ImportedBookmarkNode[]): string[] {
  return nodes.map((n) => n.title);
}

/** The four real roots Firefox writes under the places root (id 1), plus the tags root it also writes. */
const ROOTS: FirefoxBookmarkRow[] = [
  row({ id: 2, parent: 1, title: 'Bookmarks Menu', position: 0, guid: 'menu________' }),
  row({ id: 3, parent: 1, title: 'Bookmarks Toolbar', position: 1, guid: 'toolbar_____' }),
  row({ id: 4, parent: 1, title: 'Tags', position: 2, guid: 'tags________' }),
  row({ id: 5, parent: 1, title: 'Other Bookmarks', position: 3, guid: 'unfiled_____' }),
];

describe('buildFirefoxBookmarkTree', () => {
  it('builds the roots in their stored order and nests their children', () => {
    const parsed = buildFirefoxBookmarkTree([
      ...ROOTS,
      row({ id: 10, parent: 3, title: 'Work', position: 0 }),
      bookmark(11, 10, 'Spec', 'https://spec.example'),
    ]);
    expect(titles(parsed.root.children)).toEqual([
      'Bookmarks Menu',
      'Bookmarks Toolbar',
      'Other Bookmarks',
    ]);
    const toolbar = parsed.root.children[1]!;
    expect(titles(children(children(toolbar)[0]!))).toEqual(['Spec']);
  });

  it('skips the tags root — its children are pointers to bookmarks that are already elsewhere', () => {
    // Importing it would give the user one copy of every tagged bookmark per tag, which is a
    // "successful" import that produces a tree they never had.
    const parsed = buildFirefoxBookmarkTree([
      ...ROOTS,
      row({ id: 20, parent: 4, title: 'turkish', position: 0 }),
      bookmark(21, 20, 'Tagged', 'https://tagged.example'),
      bookmark(22, 5, 'Real', 'https://tagged.example'),
    ]);
    expect(titles(parsed.root.children)).not.toContain('Tags');
    const other = parsed.root.children.find((n) => n.title === 'Other Bookmarks')!;
    expect(titles(children(other))).toEqual(['Real']);
  });

  it('still skips the tags root on an old profile that has no guids', () => {
    const parsed = buildFirefoxBookmarkTree([
      row({ id: 4, parent: 1, title: 'Tags', position: 0 }),
      row({ id: 5, parent: 1, title: 'Other Bookmarks', position: 1 }),
    ]);
    expect(titles(parsed.root.children)).toEqual(['Other Bookmarks']);
  });

  it('orders siblings by position, not by id', () => {
    const parsed = buildFirefoxBookmarkTree([
      row({ id: 5, parent: 1, title: 'Other Bookmarks', guid: 'unfiled_____' }),
      bookmark(31, 5, 'Third', 'https://c.example', 2),
      bookmark(32, 5, 'First', 'https://a.example', 0),
      bookmark(33, 5, 'Second', 'https://b.example', 1),
    ]);
    expect(titles(children(parsed.root.children[0]!))).toEqual(['First', 'Second', 'Third']);
  });

  it('drops separators and saved queries, keeps real pages', () => {
    const parsed = buildFirefoxBookmarkTree([
      row({ id: 5, parent: 1, title: 'Other Bookmarks', guid: 'unfiled_____' }),
      row({ id: 40, parent: 5, type: 3, position: 0 }),
      bookmark(41, 5, 'Most Visited', 'place:sort=8&maxResults=10', 1),
      bookmark(42, 5, 'Real', 'https://real.example', 2),
    ]);
    expect(titles(children(parsed.root.children[0]!))).toEqual(['Real']);
  });

  it('falls back to the URL when a bookmark has no title', () => {
    const parsed = buildFirefoxBookmarkTree([
      row({ id: 5, parent: 1, title: 'Other Bookmarks', guid: 'unfiled_____' }),
      row({ id: 50, parent: 5, type: 1, title: null, url: 'https://untitled.example' }),
    ]);
    expect(titles(children(parsed.root.children[0]!))).toEqual(['https://untitled.example']);
  });

  it('terminates on a folder cycle', () => {
    // `parent` is just an integer; a damaged profile can point a folder at its own descendant. Without
    // the visited set this walk never returns, and the import step hangs with no way out.
    const parsed = buildFirefoxBookmarkTree([
      row({ id: 5, parent: 1, title: 'Other Bookmarks', guid: 'unfiled_____' }),
      row({ id: 60, parent: 5, title: 'A' }),
      row({ id: 61, parent: 60, title: 'B' }),
      row({ id: 62, parent: 61, title: 'Loop back', position: 0 }),
      row({ id: 60, parent: 62, title: 'A again' }),
    ]);
    expect(titles(parsed.root.children)).toEqual(['Other Bookmarks']);
  });

  it('stops at the node cap and says so', () => {
    const rows: FirefoxBookmarkRow[] = [
      row({ id: 5, parent: 1, title: 'Other Bookmarks', guid: 'unfiled_____' }),
    ];
    for (let i = 0; i < MAX_NODES + 20; i++) {
      rows.push(bookmark(100 + i, 5, `B${i}`, `https://b${i}.example`, i));
    }
    const parsed = buildFirefoxBookmarkTree(rows);
    expect(parsed.truncated).toBe(true);
    expect(children(parsed.root.children[0]!).length).toBe(MAX_NODES - 1);
  });
});

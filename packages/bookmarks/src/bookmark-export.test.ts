import { describe, expect, it } from 'vitest';
import { serializeBookmarksHtml } from './bookmark-export';
import { parseBookmarksHtml, type ImportedBookmarkNode } from './bookmark-import';
import type { BookmarkTreeNode } from './bookmark-tree-store';

/**
 * The export is checked by importing it back.
 *
 * Asserting on the markup would test the writer against itself; feeding the output to the parser that
 * already reads Chrome's, Firefox's and Edge's files tests the thing that actually matters — that what
 * comes out can be read back in, here and elsewhere.
 */

let n = 0;
const bookmark = (title: string, url: string, favicon: string | null = null): BookmarkTreeNode => ({
  id: `b${String(n++)}`,
  parentId: 'root-bar',
  type: 'bookmark',
  title,
  url,
  favicon,
  position: 0,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  children: [],
});

const folder = (title: string, children: BookmarkTreeNode[]): BookmarkTreeNode => ({
  id: `f${String(n++)}`,
  parentId: null,
  type: 'folder',
  title,
  url: null,
  favicon: null,
  position: 0,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  children,
});

/** Compare only what the format carries: structure, titles, urls, icons. */
function shape(node: ImportedBookmarkNode): unknown {
  return node.type === 'folder'
    ? { folder: node.title, children: node.children.map(shape) }
    : { title: node.title, url: node.url, favicon: node.favicon };
}

function roundTrip(roots: BookmarkTreeNode[]): unknown {
  return parseBookmarksHtml(serializeBookmarksHtml(roots)).root.children.map(shape);
}

describe('bookmarks survive an export → import round trip', () => {
  it('keeps nested folders, order, and urls', () => {
    const tree = [
      folder('Bookmarks bar', [
        bookmark('Example', 'https://example.com/'),
        folder('Work', [bookmark('Docs', 'https://docs.example.com/a?b=1')]),
      ]),
    ];
    expect(roundTrip(tree)).toEqual([
      {
        folder: 'Bookmarks bar',
        children: [
          { title: 'Example', url: 'https://example.com/', favicon: null },
          {
            folder: 'Work',
            children: [{ title: 'Docs', url: 'https://docs.example.com/a?b=1', favicon: null }],
          },
        ],
      },
    ]);
  });

  it('keeps Turkish titles byte for byte', () => {
    // `İstanbul` and `ışık` are where a casing or normalization pass in a serializer shows up.
    const tree = [folder('Yer imleri', [bookmark('İstanbul ışık — Ağrı Dağı', 'https://a.test/')])];
    const out = roundTrip(tree) as { children: { title: string }[] }[];
    expect(out[0]?.children[0]?.title).toBe('İstanbul ışık — Ağrı Dağı');
  });

  it('escapes a title that is markup, rather than emitting it', () => {
    const tree = [folder('Bar', [bookmark('<script>alert(1)</script>', 'https://a.test/')])];
    const html = serializeBookmarksHtml(tree);
    expect(html).not.toContain('<script>');
    const out = roundTrip(tree) as { children: { title: string }[] }[];
    expect(out[0]?.children[0]?.title).toBe('<script>alert(1)</script>');
  });

  it('escapes ampersands and quotes in a URL without corrupting it', () => {
    const url = 'https://a.test/?q=1&r="2"';
    const tree = [folder('Bar', [bookmark('Query', url)])];
    const out = roundTrip(tree) as { children: { url: string }[] }[];
    expect(out[0]?.children[0]?.url).toBe(url);
  });

  it('carries the favicon through, so an export is not a downgrade', () => {
    const icon = 'data:image/png;base64,iVBORw0KGgo=';
    const tree = [folder('Bar', [bookmark('Iconic', 'https://a.test/', icon)])];
    const out = roundTrip(tree) as { children: { favicon: string | null }[] }[];
    expect(out[0]?.children[0]?.favicon).toBe(icon);
  });

  it('writes a file other browsers recognise', () => {
    const html = serializeBookmarksHtml([folder('Bar', [])]);
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html).toContain('CONTENT="text/html; charset=UTF-8"');
  });

  it('produces an empty but valid file when there is nothing to export', () => {
    expect(() => parseBookmarksHtml(serializeBookmarksHtml([]))).not.toThrow();
  });
});

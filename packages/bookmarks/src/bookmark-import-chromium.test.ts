import { describe, expect, it } from 'vitest';
import { parseChromiumBookmarksJson } from './bookmark-import-chromium';
import {
  MAX_DEPTH,
  MAX_NODES,
  type ImportedBookmarkFolder,
  type ImportedBookmarkNode,
} from './bookmark-import-limits';

function folder(name: string, children: unknown[]): unknown {
  return { type: 'folder', name, children };
}
function url(name: string, href: string): unknown {
  return { type: 'url', name, url: href };
}
function file(roots: Record<string, unknown>): string {
  return JSON.stringify({ checksum: 'x', version: 1, roots });
}

/** Titles of a folder's direct children, in order. */
function titles(children: ImportedBookmarkNode[]): string[] {
  return children.map((child) => child.title);
}

describe('parseChromiumBookmarksJson', () => {
  it('reads the three roots in the order Chromium presents them', () => {
    const parsed = parseChromiumBookmarksJson(
      file({
        other: folder('Other bookmarks', [url('B', 'https://b.example')]),
        bookmark_bar: folder('Bookmarks bar', [url('A', 'https://a.example')]),
        synced: folder('Mobile bookmarks', [url('C', 'https://c.example')]),
      }),
    );
    // Not the order of the keys in the file: the roots are read in a fixed order so the imported tree
    // looks like the browser it came from, whatever order that profile happened to serialize them in.
    expect(titles(parsed!.root.children)).toEqual([
      'Bookmarks bar',
      'Other bookmarks',
      'Mobile bookmarks',
    ]);
  });

  it('keeps mobile bookmarks — a partial import is the failure mode, not a simplification', () => {
    const parsed = parseChromiumBookmarksJson(
      file({ synced: folder('Mobile bookmarks', [url('Phone', 'https://phone.example')]) }),
    );
    const mobile = parsed!.root.children[0] as { children: ImportedBookmarkNode[] };
    expect(titles(mobile.children)).toEqual(['Phone']);
  });

  it('preserves nested folder structure', () => {
    const parsed = parseChromiumBookmarksJson(
      file({
        bookmark_bar: folder('Bookmarks bar', [
          folder('Work', [folder('Docs', [url('Spec', 'https://spec.example')])]),
        ]),
      }),
    );
    const bar = parsed!.root.children[0] as ImportedBookmarkFolder;
    const work = bar.children[0] as ImportedBookmarkFolder;
    const docs = work.children[0] as ImportedBookmarkFolder;
    expect([bar.title, work.title, docs.title, docs.children[0]!.title]).toEqual([
      'Bookmarks bar',
      'Work',
      'Docs',
      'Spec',
    ]);
  });

  it('names an untitled bookmark after its URL, and drops one with no URL at all', () => {
    const parsed = parseChromiumBookmarksJson(
      file({
        bookmark_bar: folder('Bookmarks bar', [
          { type: 'url', name: '', url: 'https://untitled.example' },
          { type: 'url', name: 'No href' },
        ]),
      }),
    );
    const bar = parsed!.root.children[0] as { children: ImportedBookmarkNode[] };
    expect(titles(bar.children)).toEqual(['https://untitled.example']);
  });

  it('carries no favicon, because the file has none', () => {
    const parsed = parseChromiumBookmarksJson(
      file({ bookmark_bar: folder('Bookmarks bar', [url('A', 'https://a.example')]) }),
    );
    const bar = parsed!.root.children[0] as { children: ImportedBookmarkNode[] };
    expect(bar.children[0]).toMatchObject({ type: 'bookmark', favicon: null });
  });

  it('returns null for text that is not a Chromium bookmarks file', () => {
    // Null, not an empty tree: "unreadable" and "read fine, found nothing" are different answers and
    // the user is owed the true one.
    expect(parseChromiumBookmarksJson('not json at all')).toBeNull();
    expect(parseChromiumBookmarksJson('{"version":1}')).toBeNull();
    expect(parseChromiumBookmarksJson('null')).toBeNull();
  });

  it('flattens past the depth cap instead of dropping what is below it', () => {
    let deepest: unknown = url('Buried', 'https://buried.example');
    for (let i = 0; i < MAX_DEPTH + 10; i++) deepest = folder(`L${i}`, [deepest]);
    const parsed = parseChromiumBookmarksJson(file({ bookmark_bar: folder('Bar', [deepest]) }));

    let node = parsed!.root.children[0] as ImportedBookmarkNode;
    let depth = 0;
    while (node.type === 'folder' && node.children[0] !== undefined) {
      node = node.children[0];
      depth++;
    }
    expect(node).toMatchObject({ title: 'Buried' });
    expect(depth).toBeLessThanOrEqual(MAX_DEPTH + 1);
  });

  it('stops at the node cap and says so', () => {
    const many = Array.from({ length: MAX_NODES + 50 }, (_, i) =>
      url(`B${i}`, `https://b${i}.example`),
    );
    const parsed = parseChromiumBookmarksJson(file({ bookmark_bar: folder('Bar', many) }));
    const bar = parsed!.root.children[0] as { children: ImportedBookmarkNode[] };
    expect(parsed!.truncated).toBe(true);
    expect(bar.children.length).toBe(MAX_NODES);
  });
});

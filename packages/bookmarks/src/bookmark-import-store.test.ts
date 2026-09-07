/**
 * Importing a browser bookmarks export: the Netscape HTML format every browser still writes.
 *
 * The file is untrusted input written by another program, so what these tests hold is the boundary:
 * a file that will not parse comes back as a readable error rather than a silent '0 imported', an
 * entity reference that would throw or produce ill-formed UTF-16 is dropped instead of taking the
 * import down, and no scheme outside http(s) survives into a stored url or favicon.
 *
 * One branch stays uncovered on purpose. `match[3] ?? ''` in the anchor arm cannot take its right
 * side: group 3 lives inside the same alternative as group 2, so any match that defines `match[2]`
 * has group 3 participating too (it is `[\s\S]*?`, which matches empty but always participates).
 * The fallback is there for the index type, not for a case the regex can produce.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Db } from '@tepegoz/persistence';
import { BOOKMARK_ROOT_OTHER, BookmarkTreeStore } from './bookmark-tree-store';
import {
  importBookmarksHtmlToStore,
  parseBookmarksHtml,
  sourceDisplayName,
  writeParsedBookmarksToStore,
  type ParsedBookmarks,
} from './bookmark-import';
import { MAX_FAVICON_CHARS } from './bookmark-import-limits';

let db: Db;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('importBookmarksHtmlToStore', () => {
  it('imports nested folders and skips duplicates or unsupported schemes', () => {
    BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_OTHER,
      title: 'Existing',
      url: 'https://example.com/existing',
    });

    const result = importBookmarksHtmlToStore(db, {
      source: 'chrome',
      data: `
        <DL><p>
          <DT><H3>Folder</H3>
          <DL><p>
            <DT><A HREF="https://example.com/new">New</A>
            <DT><A HREF="https://example.com/new">Duplicate in file</A>
            <DT><A HREF="https://example.com/existing">Duplicate existing</A>
            <DT><A HREF="javascript:alert(1)">Bad</A>
          </DL><p>
        </DL><p>
      `,
    });

    expect(result).toMatchObject({ imported: 1, skipped: 3, folders: 2, errors: [] });
    const tree = BookmarkTreeStore.getSubtree(db, BOOKMARK_ROOT_OTHER);
    expect(JSON.stringify(tree)).toContain('Imported from Chrome');
    expect(JSON.stringify(tree)).toContain('Folder');
    expect(JSON.stringify(tree)).toContain('https://example.com/new');
    expect(JSON.stringify(tree)).not.toContain('javascript:alert');
  });
});

describe('a file that is not a bookmarks file', () => {
  it('reports an error rather than an import that found nothing', () => {
    // "0 imported, no errors" reads as "your file was empty". It is not the same message as "this
    // file could not be read", and the difference decides whether the user tries a different export.
    const result = writeParsedBookmarksToStore(db, null, 'Imported');
    expect(result.errors).toEqual(['The bookmarks file could not be read.']);
    expect(result.imported).toBe(0);
    expect(result.folders).toBe(0);
  });

  it('reports the same error when the parsed shape fails the boundary check', () => {
    // `safeParse`, never `parse`: a malformed file has to come back as a result the user can read,
    // not as an exception thrown out of an IPC handler.
    const notATree = { type: 'folder', title: 'root', children: [{ type: 'wat' }] };
    const result = writeParsedBookmarksToStore(
      db,
      { root: notATree, truncated: false } as unknown as ParsedBookmarks,
      'Imported',
    );
    expect(result.errors).toEqual(['The bookmarks file could not be read.']);
    expect(result.imported).toBe(0);
  });

  it('creates no root folder when nothing is written', () => {
    // The root folder is created lazily on the first write, so a file with nothing importable in it
    // leaves no empty folder behind in the user's bookmarks.
    const before = BookmarkTreeStore.listFlat(db, 1000).length;
    const result = importBookmarksHtmlToStore(db, {
      source: 'chrome',
      data: '<DL><p><DT><A HREF="javascript:alert(1)">Bad</A></DL><p>',
    });
    expect(result.imported).toBe(0);
    expect(result.folders).toBe(0);
    expect(BookmarkTreeStore.listFlat(db, 1000)).toHaveLength(before);
  });

  it('creates no folder for a subfolder whose every entry was skipped', () => {
    const result = importBookmarksHtmlToStore(db, {
      source: 'chrome',
      data: `
        <DL><p>
          <DT><H3>All bad</H3>
          <DL><p>
            <DT><A HREF="javascript:alert(1)">Bad</A>
            <DT><A HREF="about:config">Also bad</A>
          </DL><p>
        </DL><p>`,
    });
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.folders).toBe(0);
  });
});

describe('naming the import', () => {
  it('names each browser it knows, and falls back for one it does not', () => {
    expect(sourceDisplayName('chrome')).toBe('Chrome');
    expect(sourceDisplayName('edge')).toBe('Edge');
    expect(sourceDisplayName('firefox')).toBe('Firefox');
    expect(sourceDisplayName('brave')).toBe('Brave');
    expect(sourceDisplayName('other')).toBe('Browser');
  });

  it('titles the created folder after the source', () => {
    importBookmarksHtmlToStore(db, {
      source: 'firefox',
      data: '<DL><p><DT><A HREF="https://a.test/">A</A></DL><p>',
    });
    const titles = BookmarkTreeStore.listFlat(db, 1000).map((b) => b.title);
    expect(titles).toContain('A');
    const tree = JSON.stringify(BookmarkTreeStore.getTree(db));
    expect(tree).toContain('Imported from Firefox');
  });
});

describe('titles that are missing or empty', () => {
  it('falls back to the url for a bookmark with no title', () => {
    // A bookmark row showing nothing is one the user cannot identify; the url at least says where it
    // goes.
    importBookmarksHtmlToStore(db, {
      source: 'chrome',
      data: '<DL><p><DT><A HREF="https://no-title.test/page"></A></DL><p>',
    });
    const found = BookmarkTreeStore.listFlat(db, 1000).find(
      (b) => b.url === 'https://no-title.test/page',
    );
    expect(found?.title).toBe('https://no-title.test/page');
  });

  it('falls back to "Folder" for a folder with no title', () => {
    importBookmarksHtmlToStore(db, {
      source: 'chrome',
      data: `
        <DL><p>
          <DT><H3></H3>
          <DL><p><DT><A HREF="https://inside.test/">Inside</A></DL><p>
        </DL><p>`,
    });
    expect(JSON.stringify(BookmarkTreeStore.getTree(db))).toContain('Folder');
  });
});

describe('titles from a parser that is not the HTML one', () => {
  it('still falls back for an empty title, because the writer is shared', () => {
    // The HTML parser substitutes its own fallbacks, so these arms are only reachable through the
    // OTHER import paths (Chromium JSON, Firefox places.sqlite) — which is exactly why the writer is
    // one function: the fallback cannot drift per source.
    const parsed: ParsedBookmarks = {
      truncated: false,
      root: {
        type: 'folder',
        title: 'root',
        children: [
          {
            type: 'folder',
            title: '   ',
            children: [
              { type: 'bookmark', title: '  ', url: 'https://untitled.test/page', favicon: null },
            ],
          },
        ],
      },
    };

    const result = writeParsedBookmarksToStore(db, parsed, 'Imported from Firefox');
    expect(result.imported).toBe(1);

    const saved = BookmarkTreeStore.listFlat(db, 1000).find(
      (b) => b.url === 'https://untitled.test/page',
    );
    expect(saved?.title).toBe('https://untitled.test/page');
    expect(JSON.stringify(BookmarkTreeStore.getTree(db))).toContain('Folder');
  });
});

describe('decoding what an exporter escaped', () => {
  const titleOf = (html: string): string | undefined =>
    parseBookmarksHtml(html).root.children[0]?.title;

  it('decodes every named entity the format uses', () => {
    expect(titleOf('<DL><p><DT><H3>a &amp; b</H3>')).toBe('a & b');
    expect(titleOf('<DL><p><DT><H3>&lt;tag&gt;</H3>')).toBe('<tag>');
    expect(titleOf('<DL><p><DT><H3>&quot;quoted&quot;</H3>')).toBe('"quoted"');
    expect(titleOf('<DL><p><DT><H3>it&apos;s</H3>')).toBe("it's");
    // a non-breaking space is a space, and the whitespace collapse then makes it an ordinary one
    expect(titleOf('<DL><p><DT><H3>a&nbsp;b</H3>')).toBe('a b');
  });

  it('decodes decimal and hex numeric references', () => {
    expect(titleOf('<DL><p><DT><H3>&#65;&#x42;</H3>')).toBe('AB');
  });

  it('drops a code point that would throw or produce ill-formed UTF-16', () => {
    // `String.fromCodePoint` THROWS above U+10FFFF, so an untrusted `&#99999999;` used to take the
    // whole import down; a lone surrogate does not throw but goes into SQLite ill-formed.
    expect(titleOf('<DL><p><DT><H3>a&#99999999;b</H3>')).toBe('ab');
    expect(titleOf('<DL><p><DT><H3>a&#xD800;b</H3>')).toBe('ab');
  });

  it('reads an href however the exporter quoted it', () => {
    const urlOf = (html: string): string | undefined => {
      const child = parseBookmarksHtml(html).root.children[0];
      return child?.type === 'bookmark' ? child.url : undefined;
    };
    expect(urlOf(`<DL><p><DT><A HREF="https://double.test/">D</A>`)).toBe('https://double.test/');
    expect(urlOf(`<DL><p><DT><A HREF='https://single.test/'>S</A>`)).toBe('https://single.test/');
    expect(urlOf(`<DL><p><DT><A HREF=https://bare.test/ ADD_DATE="1">B</A>`)).toBe(
      'https://bare.test/',
    );
  });

  it('skips an anchor with no href at all rather than importing a link to nowhere', () => {
    expect(parseBookmarksHtml('<DL><p><DT><A NAME="anchor">Not a link</A>').root.children).toEqual(
      [],
    );
  });
});

describe('favicons carried in the file', () => {
  const iconOf = (attrs: string): string | null | undefined => {
    const child = parseBookmarksHtml(`<DL><p><DT><A HREF="https://a.test/" ${attrs}>A</A>`).root
      .children[0];
    return child?.type === 'bookmark' ? child.favicon : undefined;
  };

  it('keeps an http(s) or inline icon', () => {
    expect(iconOf('ICON="data:image/png;base64,AA"')).toBe('data:image/png;base64,AA');
    expect(iconOf('ICON_URI="https://a.test/favicon.ico"')).toBe('https://a.test/favicon.ico');
  });

  it('refuses any other scheme, and an absent one', () => {
    // The icon comes out of a file someone else wrote; a `javascript:` or `file:` value there would
    // be rendered by whatever shows the bookmark.
    expect(iconOf('ICON="javascript:alert(1)"')).toBeNull();
    expect(iconOf('ICON="file:///etc/passwd"')).toBeNull();
    expect(iconOf('')).toBeNull();
  });

  it('refuses an icon longer than the cap rather than storing it', () => {
    expect(iconOf(`ICON="data:image/png;base64,${'A'.repeat(MAX_FAVICON_CHARS)}"`)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { parseBookmarksHtml } from './bookmark-import';
import {
  ImportedBookmarkFolderSchema,
  MAX_NODES,
  MAX_TITLE_CHARS,
  MAX_URL_CHARS,
} from './bookmark-import-limits';

/**
 * A bookmarks HTML export is untrusted input: not authored here, arriving from wherever the user got
 * it, and read by a hand-rolled regex parser. Every case below is something a file can actually
 * contain — these are security assertions, not parser trivia.
 */

/** One `<DT><A>` line, the smallest unit a hostile file repeats. */
function link(href: string, title = 'x'): string {
  return `<DT><A HREF="${href}">${title}</A>\n`;
}

describe('numeric character references', () => {
  it('does not CRASH on a code point above U+10FFFF', () => {
    // `String.fromCodePoint(99999999)` throws a RangeError, and `Number.isFinite` does not catch it —
    // 99999999 is perfectly finite. Before this guard, one such entity anywhere in a file took the
    // entire import down.
    expect(() => parseBookmarksHtml(link('https://e.com', 'a&#99999999;b'))).not.toThrow();
    const { root } = parseBookmarksHtml(link('https://e.com', 'a&#99999999;b'));
    expect(root.children[0]).toMatchObject({ title: 'ab' });
  });

  it('does not crash on an out-of-range HEX reference either', () => {
    const { root } = parseBookmarksHtml(link('https://e.com', 'a&#xFFFFFFF;b'));
    expect(root.children[0]).toMatchObject({ title: 'ab' });
  });

  it('drops a lone surrogate, which would be ill-formed UTF-16 in the database', () => {
    // `fromCodePoint` ACCEPTS these — it is the only one of the two problems that does not throw, and
    // therefore the one that would have reached SQLite and the UI unnoticed.
    const { root } = parseBookmarksHtml(link('https://e.com', 'a&#xD800;b'));
    expect(root.children[0]).toMatchObject({ title: 'ab' });
  });

  it('still decodes references that are legitimate, including astral ones', () => {
    // The guard must not become "reject anything unusual": an emoji in a bookmark title is ordinary.
    const { root } = parseBookmarksHtml(link('https://e.com', 'ok &#x1F600; &#65; &amp;'));
    expect(root.children[0]).toMatchObject({ title: 'ok 😀 A &' });
  });
});

describe('bounds on a single entry', () => {
  it('caps a title rather than dropping the bookmark it belongs to', () => {
    const { root } = parseBookmarksHtml(link('https://e.com', 'T'.repeat(50_000)));
    const first = root.children[0] as { title: string };
    expect(first.title).toHaveLength(MAX_TITLE_CHARS);
    // Truncated, NOT skipped — a malformed title is not a reason to lose the URL.
    expect(root.children).toHaveLength(1);
  });

  it('caps a URL', () => {
    const { root } = parseBookmarksHtml(link(`https://e.com/${'a'.repeat(50_000)}`));
    const first = root.children[0] as { url: string };
    expect(first.url).toHaveLength(MAX_URL_CHARS);
  });

  it('caps a folder title too', () => {
    const { root } = parseBookmarksHtml(`<DT><H3>${'F'.repeat(50_000)}</H3>`);
    const first = root.children[0] as { title: string };
    expect(first.title).toHaveLength(MAX_TITLE_CHARS);
  });

  it('drops an oversized favicon rather than storing it', () => {
    const huge = `data:image/png;base64,${'A'.repeat(200_000)}`;
    const { root } = parseBookmarksHtml(`<DT><A HREF="https://e.com" ICON="${huge}">x</A>`);
    expect(root.children[0]).toMatchObject({ favicon: null });
  });
});

describe('bounds on the file as a whole', () => {
  it('stops at the node cap and SAYS it stopped', () => {
    const { root, truncated } = parseBookmarksHtml(link('https://e.com').repeat(MAX_NODES + 50));
    expect(truncated).toBe(true);
    expect(root.children).toHaveLength(MAX_NODES);
  });

  it('reports truncated:false for a file that fits, so the flag means something', () => {
    const { truncated } = parseBookmarksHtml(link('https://e.com').repeat(10));
    expect(truncated).toBe(false);
  });

  it('bounds the work BEFORE the tree is built, not after', () => {
    // The point of capping inside the scan: a post-hoc check would have to allocate the whole tree
    // first, so the bound would protect nothing. A file far past the cap must still finish quickly.
    const started = Date.now();
    const { root } = parseBookmarksHtml(link('https://e.com').repeat(MAX_NODES * 4));
    expect(root.children).toHaveLength(MAX_NODES);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe('the schema at the boundary', () => {
  it('accepts what the parser produces', () => {
    const { root } = parseBookmarksHtml(`<DT><H3>F</H3>\n<DL>${link('https://e.com')}</DL>`);
    expect(ImportedBookmarkFolderSchema.safeParse(root).success).toBe(true);
  });

  it('rejects an over-long title, whatever produced it', () => {
    // The parser caps titles itself. This asserts the CONTRACT independently, so a future change that
    // stops capping is caught here rather than in the database.
    const tree = {
      type: 'folder',
      title: 'root',
      children: [
        {
          type: 'bookmark',
          title: 'T'.repeat(MAX_TITLE_CHARS + 1),
          url: 'https://e.com',
          favicon: null,
        },
      ],
    };
    expect(ImportedBookmarkFolderSchema.safeParse(tree).success).toBe(false);
  });

  it('rejects a bookmark with no URL at all', () => {
    const tree = {
      type: 'folder',
      title: 'root',
      children: [{ type: 'bookmark', title: 'x', url: '', favicon: null }],
    };
    expect(ImportedBookmarkFolderSchema.safeParse(tree).success).toBe(false);
  });

  it('validates nested folders, not just the top level', () => {
    const tree = {
      type: 'folder',
      title: 'root',
      children: [
        {
          type: 'folder',
          title: 'inner',
          children: [{ type: 'bookmark', title: 'x', url: 'u', favicon: 'not-a-number' }],
        },
      ],
    };
    expect(ImportedBookmarkFolderSchema.safeParse(tree).success).toBe(true);

    const bad = structuredClone(tree);
    (bad.children[0] as { children: { url: string }[] }).children[0]!.url = 'u'.repeat(
      MAX_URL_CHARS + 1,
    );
    expect(ImportedBookmarkFolderSchema.safeParse(bad).success).toBe(false);
  });
});

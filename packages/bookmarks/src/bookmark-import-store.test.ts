import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Db } from '@tepegoz/persistence';
import { BOOKMARK_ROOT_OTHER, BookmarkTreeStore } from './bookmark-tree-store';
import { importBookmarksHtmlToStore } from './bookmark-import';

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

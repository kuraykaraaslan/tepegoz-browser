import { describe, expect, it } from 'vitest';
import {
  BookmarkContextMenuSchema,
  BookmarkCreateFolderSchema,
  BookmarkImportProfileSchema,
  BookmarkImportSchema,
  BookmarkMoveSchema,
  BookmarkRemoveSchema,
  BookmarkRenameSchema,
  BookmarkSetTagsSchema,
  BookmarkToggleSchema,
  BookmarkUrlSchema,
} from './schemas-bookmarks';

/**
 * Runtime (zod) guards for the `bookmarks:*` IPC channels. The tree ops carry a node id bounded here;
 * the import-profile id in particular is pattern-locked to `<source>:<hex>` so even a handler bug
 * cannot be steered into treating it as anything path-shaped.
 */

describe('BookmarkToggleSchema / BookmarkUrlSchema', () => {
  it('toggle carries url + title + nullish favicon', () => {
    expect(BookmarkToggleSchema.parse({ url: 'https://x.test', title: 'X' })).toMatchObject({
      url: 'https://x.test',
    });
    expect(
      BookmarkToggleSchema.parse({ url: 'https://x.test', title: '', favicon: null }),
    ).toMatchObject({ favicon: null });
    expect(BookmarkToggleSchema.safeParse({ url: '', title: 'X' }).success).toBe(false);
  });

  it('is-bookmarked is a bare bounded URL', () => {
    expect(BookmarkUrlSchema.parse('https://x.test')).toBe('https://x.test');
    expect(BookmarkUrlSchema.safeParse('').success).toBe(false);
  });
});

describe('the tree ops', () => {
  it('create-folder needs a parent id + title, with an optional index', () => {
    expect(BookmarkCreateFolderSchema.parse({ parentId: 'root', title: 'New' })).toMatchObject({
      parentId: 'root',
    });
    expect(
      BookmarkCreateFolderSchema.safeParse({ parentId: 'root', title: '', index: -1 }).success,
    ).toBe(false);
  });

  it('rename / remove / move bound the node id', () => {
    expect(BookmarkRenameSchema.parse({ id: 'n1', title: 'T' })).toMatchObject({ id: 'n1' });
    expect(BookmarkRemoveSchema.parse('n1')).toBe('n1');
    expect(BookmarkMoveSchema.parse({ id: 'n1', newParentId: 'p1', index: 0 })).toMatchObject({
      index: 0,
    });
    expect(BookmarkMoveSchema.safeParse({ id: 'n1', newParentId: 'p1' }).success).toBe(false);
  });

  it('context-menu carries type + optional variant', () => {
    expect(BookmarkContextMenuSchema.parse({ id: 'n1', type: 'folder' })).toMatchObject({
      type: 'folder',
    });
    expect(
      BookmarkContextMenuSchema.safeParse({ id: 'n1', type: 'separator' }).success,
    ).toBe(false);
  });
});

describe('BookmarkSetTagsSchema', () => {
  it('bounds the tag list length and each tag', () => {
    expect(BookmarkSetTagsSchema.parse({ id: 'n1', tags: ['a', 'b'] })).toMatchObject({
      tags: ['a', 'b'],
    });
    expect(
      BookmarkSetTagsSchema.safeParse({ id: 'n1', tags: Array.from({ length: 65 }, () => 't') })
        .success,
    ).toBe(false);
  });
});

describe('import schemas', () => {
  it('BookmarkImportSchema fixes the source enum + html format', () => {
    expect(
      BookmarkImportSchema.parse({ source: 'chrome', format: 'html', data: '<a>' }),
    ).toMatchObject({ source: 'chrome' });
    expect(
      BookmarkImportSchema.safeParse({ source: 'safari', format: 'html', data: '' }).success,
    ).toBe(false);
    expect(
      BookmarkImportSchema.safeParse({ source: 'chrome', format: 'json', data: '' }).success,
    ).toBe(false);
  });

  it('BookmarkImportProfileSchema locks the id to <source>:<hex>', () => {
    expect(BookmarkImportProfileSchema.parse('chrome:9af3')).toBe('chrome:9af3');
    expect(BookmarkImportProfileSchema.safeParse('chrome:NOThex').success).toBe(false);
    expect(BookmarkImportProfileSchema.safeParse('../etc/passwd').success).toBe(false);
  });
});

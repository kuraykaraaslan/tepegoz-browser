import { z } from 'zod';

/**
 * The trust boundary for an imported bookmarks file.
 *
 * A bookmarks HTML export is **untrusted input**. It is not authored by this app, it arrives from
 * whatever the user was handed, and the working agreement's rule — zod `safeParse` at every trust
 * boundary — was going unmet on a path that had already shipped. The IPC envelope was validated
 * (`BookmarkImportSchema`: source, format, and a 10 MB cap on the payload) but nothing checked what the
 * PARSER produced from it, so two inputs stayed unbounded: an entry's title length, and the total node
 * count of the file. Ten megabytes of `<DT><A>` is a great many rows.
 *
 * **Both halves exist and neither replaces the other.** The caps are enforced *while parsing*, because
 * validating after the fact still means the enormous tree was built in memory first — a bound applied
 * to a structure that already exists is a bound on nothing. The `safeParse` below is the boundary
 * contract: it is what makes the shape checked rather than assumed, and it catches anything a future
 * change to the parser stops enforcing on its own.
 */

/** Longer than any bookmark title a person writes; short enough that 50k of them is not a problem. */
export const MAX_TITLE_CHARS = 300;
/** Comfortably past the ~2 000 characters browsers treat as the practical URL limit. */
export const MAX_URL_CHARS = 4_096;
/** Favicons arrive as `data:` URIs, which are legitimately large. */
export const MAX_FAVICON_CHARS = 100_000;
/**
 * Total nodes taken from one file. A heavy real profile is in the low thousands; this is an order of
 * magnitude above that, so no genuine import is truncated, and a hostile file still terminates.
 */
export const MAX_NODES = 50_000;
/**
 * Folder nesting descended into. Deeper folders are still imported — they flatten into the last folder
 * at this depth rather than being dropped, because losing a user's bookmarks is worse than misplacing
 * them.
 */
export const MAX_DEPTH = 64;

export interface ImportedBookmark {
  type: 'bookmark';
  title: string;
  url: string;
  favicon: string | null;
}

export interface ImportedBookmarkFolder {
  type: 'folder';
  title: string;
  children: ImportedBookmarkNode[];
}

export type ImportedBookmarkNode = ImportedBookmark | ImportedBookmarkFolder;

/**
 * What a parser found, and whether it stopped early. Shared by every import source (Netscape HTML,
 * Chromium JSON, Firefox `places.sqlite`) so the caps and the store writer are the same for all three.
 */
export interface ParsedBookmarks {
  root: ImportedBookmarkFolder;
  truncated: boolean;
}

const ImportedBookmarkSchema = z.object({
  type: z.literal('bookmark'),
  title: z.string().max(MAX_TITLE_CHARS),
  // `min(1)`: a bookmark without a URL is not a bookmark. The scheme allow-list is a separate check
  // (`isBookmarkable`) applied per entry at write time, so a bad scheme SKIPS one row rather than
  // rejecting the whole file — one hostile line must not cost the user the other 5 000.
  url: z.string().min(1).max(MAX_URL_CHARS),
  favicon: z.string().max(MAX_FAVICON_CHARS).nullable(),
});

export const ImportedBookmarkNodeSchema: z.ZodType<ImportedBookmarkNode> = z.lazy(() =>
  z.union([ImportedBookmarkSchema, ImportedBookmarkFolderSchema]),
);

export const ImportedBookmarkFolderSchema: z.ZodType<ImportedBookmarkFolder> = z.lazy(() =>
  z.object({
    type: z.literal('folder'),
    title: z.string().max(MAX_TITLE_CHARS),
    children: z.array(ImportedBookmarkNodeSchema).max(MAX_NODES),
  }),
);

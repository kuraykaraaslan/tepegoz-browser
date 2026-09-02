import { z } from 'zod';
import type { BookmarkImportInput } from './contract';

/** `bookmarks:toggle` payload — the page URL + its title (title defaults to the URL if empty) + the
 *  page's current favicon URL (http(s)/data:) captured at save time. */
export const BookmarkToggleSchema = z.object({
  url: z.string().min(1).max(4096),
  title: z.string().max(2048),
  favicon: z.string().max(100000).nullish(),
});
/** `bookmarks:is-bookmarked` payload — a single URL to look up. */
export const BookmarkUrlSchema = z.string().min(1).max(4096);

// Bookmark tree ops. A node id is a uuid or one of the two fixed roots. Handlers refuse the roots where
// it matters (delete/move a root). Folder ops carry no URL, so `isBookmarkable` is applied to bookmark
// ops only (not present here — the bar creates folders + moves; bookmarks are still added via the star).
const BookmarkNodeId = z.string().min(1).max(64);
/** `bookmarks:create-folder` — a new folder under `parentId` (optionally at `index`). */
export const BookmarkCreateFolderSchema = z.object({
  parentId: BookmarkNodeId,
  title: z.string().min(1).max(2048),
  index: z.number().int().min(0).max(100000).optional(),
});
/** `bookmarks:rename` — set a node's title. */
export const BookmarkRenameSchema = z.object({
  id: BookmarkNodeId,
  title: z.string().min(1).max(2048),
});
/** `bookmarks:remove` — delete a node (recursive; handler refuses roots). */
export const BookmarkRemoveSchema = BookmarkNodeId;
/** `bookmarks:move` — reparent + reorder a node to `index` within `newParentId`. */
export const BookmarkMoveSchema = z.object({
  id: BookmarkNodeId,
  newParentId: BookmarkNodeId,
  index: z.number().int().min(0).max(100000),
});
/** `bookmarks:context-menu` — pop the native menu for a node (renderer→main). `variant` 'folder-item'
 *  is the reduced menu shown inside a bar folder-dropdown popup (Open / Move to bar / Delete). */
export const BookmarkContextMenuSchema = z.object({
  id: BookmarkNodeId,
  type: z.enum(['folder', 'bookmark']),
  variant: z.enum(['default', 'folder-item']).optional(),
});

/**
 * Tag edits arrive from the untrusted renderer, so both the id and the list are bounded here as well
 * as normalized in the store. The caps are generous versions of the store's own — this rejects the
 * absurd, `normalizeTags` decides the exact set.
 */
export const BookmarkSetTagsSchema = z.object({
  id: BookmarkNodeId,
  tags: z.array(z.string().max(256)).max(64),
});

export const BookmarkImportSchema = z.object({
  source: z.enum(['chrome', 'edge', 'firefox', 'brave', 'other']),
  format: z.literal('html'),
  data: z.string().max(10_485_760),
}) satisfies z.ZodType<BookmarkImportInput>;

/**
 * `bookmarks:import-profile` — which detected profile to import, by the opaque id detection handed
 * out. Bounded and pattern-checked so that even a handler bug cannot be steered into treating this as
 * anything path-shaped: it is `<source>:<hex>` and nothing else.
 */
export const BookmarkImportProfileSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z]+:[0-9a-f]+$/);

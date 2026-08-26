import { z } from 'zod';

export const ContentBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/**
 * `popup:open` payload — the reusable native popup primitive. `surface` is the surface kind (e.g.
 * 'main-menu' | 'ext'); `id` is required only for the extension surface; `anchor` is the trigger's rect
 * to anchor under; `height` is an optional desired content height (clamped to the work area in main).
 */
export const PopupOpenSchema = z.object({
  surface: z.string().min(1).max(64),
  // A surface-specific target id: an extension id (ext popup) OR a bookmark node id/root (bookmark
  // surfaces). Kept a loose bounded string here; each surface handler re-validates it (the ext handler
  // via manifestById, the bookmark handlers via the tree store), so an unknown id is simply ignored.
  id: z.string().min(1).max(128).optional(),
  anchor: ContentBoundsSchema,
  height: z.number().int().positive().max(2000).optional(),
});

/** `popup:resize` payload — the open popup reports its measured content height so main shrinks the
 *  window to fit (removing the empty strip from the open-time height estimate). Clamped in main. */
export const PopupResizeSchema = z.object({
  height: z.number().int().positive().max(2000),
});

/** `page-menu:action` payload — which wired action of the web-page right-click menu to run. */
export const PageMenuActionSchema = z.enum([
  'back',
  'forward',
  'reload',
  'view-source',
  'inspect',
  'print',
  'save',
  'save-as-pdf',
  'reader-mode',
  'screenshot-viewport',
  'screenshot-full-page',
  'copy',
  'cut',
  'paste',
  'select-all',
  'search-selection',
  'copy-link',
  'open-link-new-tab',
  'copy-image',
  'copy-media-link',
  'save-media',
  'open-media-new-tab',
]);

/** `page-menu:contribution-action` payload — dispatches an item selected from a contributed section. */
export const PageMenuContributionActionSchema = z.object({
  menuId: z.string().min(1).max(128),
  contributorId: z.string().min(1).max(128),
  sectionId: z.string().min(1).max(128),
  itemId: z.string().min(1).max(128),
  actionId: z.string().min(1).max(128),
  payload: z.unknown().optional(),
});

/** `submenu:open` payload — a flyout submenu opened beside the main menu popup (its own native window). */
export const SubmenuOpenSchema = z.object({
  kind: z.string().min(1).max(32),
  anchor: ContentBoundsSchema,
  height: z.number().int().positive().max(2000).optional(),
});

/** `notifications:dismiss` / `notifications:mark-read` payload — a single notification id. */
export const NotificationIdSchema = z.string().min(1).max(128);

/** `notifications:permission-respond` payload — the user's answer to a Web Notification consent prompt. */
export const NotificationPermissionResponseSchema = z.object({
  requestId: z.string().min(1).max(128),
  allow: z.boolean(),
  remember: z.boolean(),
});

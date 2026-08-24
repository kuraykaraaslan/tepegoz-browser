/**
 * Web-page right-click (context) menu wire types for the desktop IPC contract. Dispatched in main
 * against the context captured at right-click time. Zod-free, preload-safe.
 */

/** The wired actions of the web-page right-click menu. Placeholder rows (Cast, Lens, …) have no action.
 *  Dispatched in main against the context captured at right-click time (inspect/copy-image use its x/y,
 *  link/media actions use the captured URLs). */
export type PageMenuAction =
  | 'back'
  | 'forward'
  | 'reload'
  | 'view-source'
  | 'inspect'
  | 'print'
  | 'save'
  | 'save-as-pdf'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'select-all'
  | 'search-selection'
  | 'copy-link'
  | 'open-link-new-tab'
  | 'copy-image'
  | 'copy-media-link'
  | 'save-media'
  | 'open-media-new-tab';

/** The media kind under the cursor (from Electron's `context-menu` params). `none` = not media. */
export type PageMenuMediaType = 'none' | 'image' | 'audio' | 'video' | 'canvas' | 'file' | 'plugin';

export type PageMenuContributionPlacement = 'top' | 'before-edit' | 'before-inspect' | 'bottom';

export interface PageMenuContributionItem {
  id: string;
  label: string;
  actionId: string;
  payload?: unknown;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
}

export interface PageMenuContributionSection {
  id: string;
  contributorId: string;
  title?: string;
  placement: PageMenuContributionPlacement;
  priority: number;
  items: PageMenuContributionItem[];
}

export interface PageMenuContributionActionInput {
  menuId: string;
  contributorId: string;
  sectionId: string;
  itemId: string;
  actionId: string;
  payload?: unknown;
}

/** Snapshot the page context menu reads to pick its variant + enable rows (captured at right-click). */
export interface PageMenuContext {
  menuId: string;
  contributions: PageMenuContributionSection[];
  canGoBack: boolean;
  canGoForward: boolean;
  pageUrl: string;
  /** Selected text (trimmed, truncated for display), or '' if none. */
  selectionText: string;
  /** The link href under the cursor, or '' if not on a link. */
  linkUrl: string;
  /** The media/source URL under the cursor, or '' if not on media. */
  srcUrl: string;
  mediaType: PageMenuMediaType;
  /** True when the cursor is in an editable field (input/textarea/contenteditable). */
  isEditable: boolean;
  canCopy: boolean;
  canCut: boolean;
  canPaste: boolean;
  canSelectAll: boolean;
}

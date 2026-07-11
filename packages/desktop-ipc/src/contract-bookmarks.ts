/**
 * Bookmark + history wire types for the desktop IPC contract. History lives in persistence; bookmarks
 * moved to their own feature package. Both are the single source for their entry type. Type-only imports
 * → erased, so the sandboxed preload stays dependency-free.
 */
import type { HistoryEntry } from '@tepegoz/persistence';
import type {
  BookmarkEntry,
  BookmarkNode,
  BookmarkNodeType,
  BookmarkTreeNode,
} from '@tepegoz/bookmarks';
export type { BookmarkEntry, BookmarkNode, BookmarkNodeType, BookmarkTreeNode, HistoryEntry };

/** Which action a native bookmark context-menu item asks the renderer to perform (main→renderer). */
export interface BookmarkMenuAction {
  action:
    | 'open'
    | 'open-new-tab'
    | 'open-all'
    | 'rename'
    | 'add-folder'
    | 'delete'
    | 'open-manager'
    | 'move-to-bar';
  /** The clicked node's id. */
  id: string;
  type: BookmarkNodeType;
}

export type BrowserImportSource = 'chrome' | 'edge' | 'firefox' | 'brave' | 'other';

export interface BookmarkImportInput {
  source: BrowserImportSource;
  format: 'html';
  data: string;
}

export interface BookmarkImportResult {
  imported: number;
  skipped: number;
  folders: number;
  errors: string[];
}

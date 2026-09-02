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

/**
 * A browser profile found on this computer, as the renderer is allowed to see it.
 *
 * Deliberately NOT the main-process record: there is no path here. The renderer picks a profile by
 * `id` and main resolves that id by re-running detection, so the untrusted side can never name a file
 * for the trusted side to open — and it never holds a string with the user's account name in it.
 */
export interface DetectedBrowserProfile {
  id: string;
  source: BrowserImportSource;
  /** The browser: "Chrome", "Firefox". */
  browserLabel: string;
  /** The profile as its own browser names it: "Default", "Work". */
  profileName: string;
  /** Last write time (ms) of the file that would be read — the list is offered newest-first. */
  modifiedAt: number;
}

export interface BookmarkImportResult {
  imported: number;
  skipped: number;
  folders: number;
  /** The file held more than the importer reads in one go, and the rest was not taken. Surfaced so a
   *  partial import cannot report itself as a complete one. */
  truncated: boolean;
  errors: string[];
}

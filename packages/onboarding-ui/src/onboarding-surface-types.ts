import type {
  BookmarkImportInput,
  BookmarkImportResult,
  BrowserImportSource,
  LoginImportResult,
} from '@tepegoz/desktop-ipc';

export type StepId = 'welcome' | 'account' | 'import' | 'finish';
export type ImportKind = 'bookmarks' | 'passwords';

export interface ImportState<T> {
  busy: boolean;
  result: T | null;
  error: string | null;
}

export interface OnboardingSurfaceProps {
  isMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  importBookmarks: (input: BookmarkImportInput) => Promise<BookmarkImportResult>;
  importLogins: (data: string, format: string) => Promise<LoginImportResult>;
  completeOnboarding: () => Promise<void>;
  /** `process.platform`, injected — decides where the window caption comes from (`captionLayout`). */
  platform: string;
}

export const SOURCES: BrowserImportSource[] = ['chrome', 'edge', 'firefox', 'brave', 'other'];

export const emptyBookmarkState: ImportState<BookmarkImportResult> = {
  busy: false,
  result: null,
  error: null,
};
export const emptyPasswordState: ImportState<LoginImportResult> = {
  busy: false,
  result: null,
  error: null,
};

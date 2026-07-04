import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { BookmarksUiStrings } from './en';

/**
 * This package's own dictionary. The React view consumes it with `useT(bookmarksUiDict)`; the non-React
 * main process resolves it via `pick(bookmarksUiDict, locale)` for the native tab title. Framework-agnostic
 * (no React import) so the main process can import it without pulling the React runtime.
 */
export const bookmarksUiDict = defineDict({ en, tr });

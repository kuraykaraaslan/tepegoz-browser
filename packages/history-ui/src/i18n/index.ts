import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { HistoryStrings } from './en';

/**
 * This package's own dictionary. The React view consumes it with `useT(historyDict)` (self-localizing);
 * the non-React main process resolves it via `pick(historyDict, locale)` for native tab titles. Framework
 * -agnostic (no React import) so the main process can import it without pulling the React runtime.
 */
export const historyDict = defineDict({ en, tr });

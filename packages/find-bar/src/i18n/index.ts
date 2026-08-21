import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { FindBarStrings } from './en';

/**
 * This package's own dictionary (ADR-0016). The React bar consumes it with `useT(findBarDict)`.
 * Framework-agnostic (no React import) so the main process could resolve it via `pick` if it ever
 * needs the strings for a native menu item.
 */
export const findBarDict = defineDict({ en, tr });

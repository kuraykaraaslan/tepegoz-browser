import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { ExtensionsStrings } from './en';

/**
 * This package's own dictionary. The grid consumes it with `useT(extensionsDict)` (self-localizing); the
 * app's tray/manager wrappers and the non-React main process (native menu + tab title) resolve it via
 * the same dict. Framework-agnostic (no React import) so the main process pulls no React runtime.
 */
export const extensionsDict = defineDict({ en, tr });

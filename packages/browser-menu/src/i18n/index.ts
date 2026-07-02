import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { BrowserMenuStrings } from './en';

/**
 * This package's own dictionary (structural strings). The menu component consumes it with
 * `useT(browserMenuDict)`; framework-agnostic (no React import here).
 */
export const browserMenuDict = defineDict({ en, tr });

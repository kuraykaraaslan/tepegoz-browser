import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { NotificationsUiStrings } from './en';

/**
 * This package's own dictionary (structural strings). Components consume it with
 * `useT(notificationsUiDict)`; framework-agnostic (no React import here).
 */
export const notificationsUiDict = defineDict({ en, tr });

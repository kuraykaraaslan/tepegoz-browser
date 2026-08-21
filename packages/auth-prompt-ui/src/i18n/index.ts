import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { AuthPromptStrings } from './en';

/** This package's own dictionary (ADR-0016). The prompt consumes it with `useT(authPromptDict)`. */
export const authPromptDict = defineDict({ en, tr });

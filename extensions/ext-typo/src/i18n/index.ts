import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { TypoStrings } from './en';

export const typoDict = defineDict({ en, tr });

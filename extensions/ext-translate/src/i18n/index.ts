import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { TranslateStrings } from './en';

export const translateDict = defineDict({ en, tr });

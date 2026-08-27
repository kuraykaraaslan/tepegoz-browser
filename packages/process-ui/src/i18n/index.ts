import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { ProcessStrings } from './en';
export const processDict = defineDict({ en, tr });

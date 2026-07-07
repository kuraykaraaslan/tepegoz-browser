import { defineDict } from '@tepegoz/i18n';
import { en, type NewTabStrings } from './en';
import { tr } from './tr';

export const newtabDict = defineDict({ en, tr });
export type { NewTabStrings };

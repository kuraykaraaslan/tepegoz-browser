import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { MacrosStrings } from './en';

/** This extension's own dictionary. React surfaces consume it with `useT(macrosDict)`. */
export const macrosDict = defineDict({ en, tr });

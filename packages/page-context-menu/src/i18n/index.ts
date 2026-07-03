import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { PageContextMenuStrings } from './en';

/** This package's own dictionary (page-menu content labels). Consumed with `useT(pageContextMenuDict)`. */
export const pageContextMenuDict = defineDict({ en, tr });

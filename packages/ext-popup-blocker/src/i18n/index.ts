import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { PopupBlockerStrings } from './en';

/** This extension's own dictionary. Consume with `useT(popupBlockerDict)` in the renderer, or
 *  `pick(popupBlockerDict, locale)` in the main process (for the "pop-up blocked" notification). */
export const popupBlockerDict = defineDict({ en, tr });

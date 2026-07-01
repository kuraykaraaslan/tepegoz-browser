import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { UserAgentStrings } from './en';

/** This extension's own dictionary. Consume with `useT(userAgentDict)` (self-localizing). */
export const userAgentDict = defineDict({ en, tr });

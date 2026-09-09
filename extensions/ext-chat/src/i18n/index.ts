import { defineDict } from '@tepegoz/i18n';
import { en, type ChatStrings } from './en';
import { tr } from './tr';

export const chatDict = defineDict({ en, tr });
export type { ChatStrings };

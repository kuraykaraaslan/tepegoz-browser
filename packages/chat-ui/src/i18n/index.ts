import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { ChatUiStrings } from './en';
export const chatUiDict = defineDict({ en, tr });

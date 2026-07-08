import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { AdblockStrings } from './en';

export const adblockDict = defineDict({ en, tr });

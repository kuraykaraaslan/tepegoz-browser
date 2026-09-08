import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { ProfilesStrings } from './en';
export const profilesDict = defineDict({ en, tr });

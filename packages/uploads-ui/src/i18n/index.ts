import { defineDict } from '@tepegoz/i18n';
import { en, type UploadsStrings } from './en';
import { tr } from './tr';

export const uploadsDict = defineDict({ en, tr });
export type { UploadsStrings };

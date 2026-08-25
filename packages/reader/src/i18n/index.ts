import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { ReaderStrings } from './en';

/** This package's own dictionary (ADR-0016). */
export const readerDict = defineDict({ en, tr });

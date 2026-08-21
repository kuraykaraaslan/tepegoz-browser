import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { CertWarningStrings } from './en';

/** This package's own dictionary (ADR-0016). Consumed with `useT(certWarningDict)`. */
export const certWarningDict = defineDict({ en, tr });

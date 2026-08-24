import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';
import { en as clientCertEn } from './client-cert-en';
import { tr as clientCertTr } from './client-cert-tr';

export type { CertWarningStrings } from './en';
export type { ClientCertPickerStrings } from './client-cert-en';

/** This package's own dictionary (ADR-0016). Consumed with `useT(certWarningDict)`. */
export const certWarningDict = defineDict({ en, tr });

/** The client-certificate chooser's own dictionary. Separate from the warning above because they are
 *  separate surfaces answering opposite questions — one is about the SITE's certificate, one about the
 *  USER's — and a shared dict would invite copy from one to drift into the other. */
export const clientCertPickerDict = defineDict({ en: clientCertEn, tr: clientCertTr });

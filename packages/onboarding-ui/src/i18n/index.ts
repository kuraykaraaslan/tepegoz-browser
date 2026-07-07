import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { OnboardingStrings } from './en';
export const onboardingDict = defineDict({ en, tr });

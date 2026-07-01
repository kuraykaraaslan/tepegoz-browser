import { defineDict } from '@tepegoz/i18n';
import { en } from './en';
import { tr } from './tr';

export type { AgentStrings } from './en';

/** This extension's own dictionary. Consume with `useT(agentDict)` (self-localizing). */
export const agentDict = defineDict({ en, tr });

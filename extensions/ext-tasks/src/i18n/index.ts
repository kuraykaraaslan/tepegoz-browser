import { defineDict } from '@tepegoz/i18n';
import { en, type TasksStrings } from './en';
import { tr } from './tr';

export const tasksDict = defineDict({ en, tr });
export type { TasksStrings };

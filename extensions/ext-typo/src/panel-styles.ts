import type { TypoLanguage } from './types';

export const BTN_GHOST =
  'shrink-0 rounded-md border border-border px-2 py-1 text-xs text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';
export const BTN_PRIMARY =
  'shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground ' +
  'hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';
export const FIELD =
  'w-full rounded-md border border-border bg-surface-base px-2 py-1.5 text-sm text-text-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
export const BOX = 'rounded-md border border-border px-3 py-2';

export const LANGUAGE_OPTIONS: Array<{ value: TypoLanguage; label: string }> = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
];

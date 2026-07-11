/**
 * Shared Tailwind class strings for the Agent panel's buttons. Extracted from `panel.tsx`
 * (ADR-0010 file-size split) so the panel shell and its sub-components share one source.
 */
export const BTN_PRIMARY =
  'rounded-md bg-surface-overlay px-3 py-1.5 text-sm font-medium text-text-primary ' +
  'hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
export const BTN_GHOST =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
export const ICON_BTN =
  'rounded-md p-1.5 text-text-secondary hover:bg-surface-overlay hover:text-text-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

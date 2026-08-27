/**
 * Shared Tailwind class strings for the nav toolbar and its sub-controls. A plain module (no React)
 * so `nav-toolbar.tsx` and `zoom-indicator.tsx` can both use it without importing each other
 * (dependency-cruiser `no-circular`).
 */

/** Base class for a 32px toolbar icon button. Exported so hosts can style matching controls
 *  (e.g. pinned extension icons) the same way. */
export const NAV_BTN =
  'flex h-8 w-8 items-center justify-center rounded-md text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary transition-colors ' +
  'disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

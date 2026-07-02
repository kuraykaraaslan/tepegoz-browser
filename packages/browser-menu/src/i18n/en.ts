/**
 * This package's OWN strings (structural / a11y only). English is the source shape; `tr.ts` must match
 * it exactly. Menu CONTENT labels (New tab, History, …) are NOT here — they are injected by the host
 * because they belong to other packages' dictionaries (browser/history/extensions/core), ADR-0017.
 */
export const en = {
  /** Default accessible name for the menu container (host usually injects a more specific one). */
  menuLabel: 'Menu',
  zoom: {
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    reset: 'Reset zoom',
  },
};

export type BrowserMenuStrings = typeof en;

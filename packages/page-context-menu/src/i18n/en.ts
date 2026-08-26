/**
 * This package's OWN content strings — the Chrome-style page (web view) right-click menu labels across
 * all variants (default / selection / link / image / media / editable). English is the source shape;
 * `tr.ts` must match it exactly (ADR-0016 — Turkish is first-class). Structural/a11y menu strings
 * (zoom etc.) belong to `@tepegoz/browser-menu`, not here.
 */
export const en = {
  /** Accessible name for the menu container. */
  menuLabel: 'Page menu',
  // Default page menu.
  back: 'Back',
  forward: 'Forward',
  reload: 'Reload',
  saveAs: 'Save as…',
  print: 'Print…',
  saveAsPdf: 'Save as PDF…',
  cast: 'Cast…',
  searchLens: 'Search this tab with Google Lens',
  readingMode: 'Open in reading mode',
  sendToDevices: 'Send to your devices',
  createQr: 'Create QR Code for this page',
  translate: 'Translate…',
  extensions: 'Extensions',
  viewSource: 'View page source',
  inspect: 'Inspect',
  // Editable field.
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select all',
  // Text selection. `%s` is replaced with the (elided) selected text.
  searchWebFor: 'Search the web for “%s”',
  copyLinkToHighlight: 'Copy link to highlight',
  translateSelection: 'Translate selection',
  // Link.
  openLinkNewTab: 'Open link in new tab',
  copyLinkAddress: 'Copy link address',
  // Image.
  openImageNewTab: 'Open image in new tab',
  saveImageAs: 'Save image as…',
  copyImage: 'Copy image',
  copyImageAddress: 'Copy image address',
  // Media (video / audio).
  openMediaNewTab: 'Open in new tab',
  saveMediaAs: 'Save as…',
  copyMediaAddress: 'Copy address',
  readerMode: 'Reading view',
  screenshotViewport: 'Screenshot this view',
  screenshotFullPage: 'Screenshot the whole page',
};

export type PageContextMenuStrings = typeof en;

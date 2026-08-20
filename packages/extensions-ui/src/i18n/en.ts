/** English is the source shape for this package's own strings; `tr.ts` must match it exactly. */
export const en = {
  title: 'Extensions',
  manage: 'Manage extensions',
  search: 'Search extensions',
  empty: 'No matching extensions',
  // Toolbar-icon right-click menu.
  settingsPage: 'Settings page',
  remove: 'Remove',
  // Toolbar pinning + the puzzle button's Extensions panel.
  pin: 'Pin to toolbar',
  unpin: 'Unpin from toolbar',
  moreOptions: 'More options',
  noneEnabled: 'No extensions enabled',
  // Panel group headings. Derived from each manifest's declared permissions — there is no per-site host
  // permission model yet, so these say what the data supports, not Chrome's "this site" wording.
  groupPageAccess: 'Can read or change page content',
  groupNoAccess: 'No page access needed',
};

export type ExtensionsStrings = typeof en;

/** English is the source shape for this extension's own strings; `tr.ts` must match it exactly. Also
 *  holds the strings used in the "pop-up blocked" notification (raised from the main process). */
export const en = {
  title: 'Popup Blocker',
  description:
    'Blocks pop-ups by default. Allow individual pop-ups from the notification, or trust a whole site.',
  enabled: 'Enabled',
  enabledHint: 'Block pop-ups on every site',
  showNotifications: 'Notify me when a pop-up is blocked',
  trustedSites: 'Trusted sites',
  trustedEmpty: 'No trusted sites yet.',
  trustedHint: 'Pop-ups from these sites are always allowed.',
  remove: 'Remove',
  recentRequests: 'Recent blocked pop-ups',
  recentRequestsEmpty: 'No pop-ups blocked this session.',
  open: 'Open',
  // Notification raised from the main process when a pop-up is blocked.
  blockedTitle: 'Pop-up blocked',
  allow: 'Allow',
  background: 'Background',
  redirect: 'Redirect',
  trust: 'Trust site',
};

export type PopupBlockerStrings = typeof en;

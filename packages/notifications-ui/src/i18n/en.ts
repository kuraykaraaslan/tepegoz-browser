/**
 * This package's OWN strings (structural / a11y only). English is the source shape; `tr.ts` must match
 * it exactly. Notification CONTENT (title/body) is injected as data — only chrome copy lives here.
 */
export const en = {
  /** Accessible name for the center container + its header title. */
  title: 'Notifications',
  /** Shown when the center has no items. */
  empty: 'No notifications yet',
  markAllRead: 'Mark all as read',
  clearAll: 'Clear all',
  /** Per-row action a11y labels. */
  dismiss: 'Dismiss',
  markRead: 'Mark as read',
  /** Unread indicator a11y label. */
  unread: 'Unread',
  /** Native/website notification consent prompt. `{origin}` is composed by the host. */
  permissionTitle: 'Allow notifications?',
  permissionBody: 'wants to show notifications.',
  permissionAllow: 'Allow',
  permissionBlock: 'Block',
  permissionRemember: 'Remember this decision',
};

export type NotificationsUiStrings = typeof en;

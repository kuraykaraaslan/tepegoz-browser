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
  permissionClipboardReadTitle: 'Allow clipboard read?',
  permissionClipboardReadBody: 'wants to read text from the clipboard.',
  permissionClipboardWriteTitle: 'Allow clipboard write?',
  permissionClipboardWriteBody: 'wants to write text to the clipboard.',
  permissionAllow: 'Allow',
  permissionBlock: 'Block',
  permissionRemember: 'Remember this decision',
  // Camera / microphone / location joined the brokered set with the Permissions Center. The wording
  // says what the site GETS, not what the API is called: "use your camera" is what a person is
  // deciding about; "requests the mediaDevices permission" is not.
  permissionCameraTitle: 'Use your camera?',
  permissionCameraBody: 'wants to use your camera. You can change this later in Settings.',
  permissionMicrophoneTitle: 'Use your microphone?',
  permissionMicrophoneBody: 'wants to use your microphone. You can change this later in Settings.',
  permissionGeolocationTitle: 'Know your location?',
  permissionGeolocationBody: 'wants to know where you are. You can change this later in Settings.',
};

export type NotificationsUiStrings = typeof en;

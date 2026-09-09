export const en = {
  /** Own-presence + contact-presence labels (XMPP show values). */
  presence: {
    online: 'Online',
    away: 'Away',
    xa: 'Away for a while',
    dnd: 'Do not disturb',
    offline: 'Offline',
  },
  /** Date separators in the message timeline. */
  day: {
    today: 'Today',
    yesterday: 'Yesterday',
  },
  timeline: {
    /** Marks a message the sender later edited. */
    edited: 'edited',
    /** Stands in for a message the sender retracted. */
    redacted: 'Message deleted',
    /** Divider the "jump to unread" control scrolls to. */
    newMessages: 'New messages',
  },
  delivery: {
    pending: 'Sending…',
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
    failed: 'Not sent',
  },
};

export type ChatUiStrings = typeof en;

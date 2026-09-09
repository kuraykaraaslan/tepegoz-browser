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
  composer: {
    placeholder: 'Write a message…',
    send: 'Send',
    /** Precedes the quoted author in the reply banner: "Replying to" + name. */
    replyingTo: 'Replying to',
    editing: 'Editing message',
    cancel: 'Cancel',
    /** Shown when the draft exceeds the protocol's body limit. */
    tooLong: 'This message is too long to send.',
  },
  list: {
    empty: 'No conversations yet',
    /** Screen-reader suffix on the unread count badge, e.g. "3 unread". */
    unread: 'unread',
    /** Screen-reader suffix on the mention count badge, e.g. "2 mentions". */
    mentions: 'mentions',
    /** Title on the muted-conversation icon. */
    muted: 'Muted',
  },
};

export type ChatUiStrings = typeof en;

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
  workspace: {
    /** Left-column tab: the conversation list. */
    chatsTab: 'Chats',
    /** Left-column tab: the roster. */
    contactsTab: 'Contacts',
    /** Shown when no account is configured yet. */
    noAccounts: 'Add a chat account to get started.',
    /** Shown in the message pane when nothing is selected. */
    noSelection: 'Pick a conversation.',
    /** Accessible label for the account switcher. */
    accountSwitcher: 'Account',
    typing: 'typing…',
  },
  roster: {
    title: 'Contacts',
    search: 'Search contacts',
    /** Header for contacts that belong to no roster group. */
    ungrouped: 'Other contacts',
    /** Suffix on a group's connected count, e.g. "3 online". */
    online: 'online',
    empty: 'No contacts yet',
    noMatch: 'No contacts match your search.',
    add: 'Add contact',
    addPlaceholder: 'user@example.org',
    remove: 'Remove',
    /** Marker on a contact who can see the user's presence but is not yet mutual. */
    pending: 'Awaiting response',
  },
  setup: {
    title: 'Add an XMPP account',
    label: 'Account name',
    labelHint: 'Shown in the account switcher — e.g. "Work", "Personal".',
    jid: 'Jabber ID (JID)',
    jidHint: 'you@example.org',
    password: 'Password',
    advanced: 'Connection settings',
    host: 'Server host',
    hostHint: 'Leave blank to look it up automatically (SRV).',
    port: 'Port',
    security: 'Security',
    securityTls: 'Direct TLS',
    securityStarttls: 'STARTTLS',
    wsUrl: 'WebSocket URL',
    add: 'Add account',
    cancel: 'Cancel',
    errors: {
      labelRequired: 'Give the account a name.',
      jidRequired: 'Enter your Jabber ID.',
      jidInvalid: 'That does not look like a JID (user@domain).',
      passwordRequired: 'Enter your password.',
      portInvalid: 'Port must be a number between 1 and 65535.',
      wsUrlInvalid: 'Enter a valid URL, or leave this blank.',
    },
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

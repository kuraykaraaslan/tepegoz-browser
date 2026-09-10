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
  roomBrowser: {
    title: 'Find a room',
    /** Label for the conference-service input. */
    service: 'Room service',
    servicePlaceholder: 'conference.example.org',
    browse: 'Browse',
    search: 'Filter rooms',
    /** Field to join a room by its full address. */
    joinByAddress: 'Join by address',
    joinByAddressPlaceholder: 'room@conference.example.org',
    join: 'Join',
    /** Suffix on a room's occupant count, e.g. "42 online". */
    online: 'online',
    /** Marker on a password-protected room. */
    locked: 'Password required',
    /** Marker on a members-only room. */
    membersOnly: 'Members only',
    empty: 'No rooms found',
    loading: 'Loading rooms…',
  },
  room: {
    /** Heading over the occupant list (a count precedes it: "12 Members"). */
    members: 'Members',
    /** Toggle button that shows / hides the member list. */
    showMembers: 'Members',
    /** Placeholder in the room header when no topic is set. */
    noTopicHeader: 'No topic',
    /** Accessible label for the notification-level control. */
    notify: 'Notifications',
    notifyAll: 'All messages',
    notifyMentions: 'Only mentions',
    notifyNone: 'Nothing',
    /** Badge on a room moderator. */
    moderator: 'Mod',
    /** Badge on the room owner. */
    owner: 'Owner',
    /** Badge on a room admin. */
    admin: 'Admin',
    /** Empty-topic placeholder in the room header. */
    noTopic: 'No topic set',
    /** Button + input label for editing the room topic. */
    editTopic: 'Edit topic',
  },
  media: {
    loading: 'Loading attachment…',
    /** The quarantined part could not be read (missing / not a local file). */
    unavailable: 'Attachment unavailable',
    /** Accessible name for the "open this file" action. */
    open: 'Open attachment',
  },
  timeline: {
    /** Marks a message the sender later edited. */
    edited: 'edited',
    /** Stands in for a message the sender retracted. */
    redacted: 'Message deleted',
    /** Divider the "jump to unread" control scrolls to. */
    newMessages: 'New messages',
    /** Accessible prefix on a quoted reply preview: "In reply to" + sender. */
    inReplyTo: 'In reply to',
    /** Stands in for the quoted body when the original was an attachment with no text. */
    quoteAttachment: 'Attachment',
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
    /** Button under {@link noAccounts}. */
    addAccount: 'Add account',
    /** Shown in the message pane when nothing is selected. */
    noSelection: 'Pick a conversation.',
    /** Accessible label for the account switcher. */
    accountSwitcher: 'Account',
    typing: 'typing…',
    /** Room typing line, one typist: "{name} " + this. */
    typingOne: 'is typing…',
    /** Room typing line, two typists: "{a} & {b} " + this. */
    typingMany: 'are typing…',
    /** Room typing line, three or more typists (no names). */
    typingSeveral: 'Several people are typing…',
    /** Toggle action: silence this conversation's notifications. */
    mute: 'Mute',
    /** Toggle action: stop silencing this conversation. */
    unmute: 'Unmute',
    /** Persistent marker on a conversation whose protocol carries no end-to-end encryption. */
    notEncrypted: 'Not encrypted',
    /** Tooltip / detail for {@link notEncrypted} on IRC, which has no encryption at all. */
    ircPlaintext: 'IRC has no end-to-end encryption — messages are readable by the server.',
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

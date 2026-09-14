export const en = {
  /** Own-presence + contact-presence labels (XMPP show values). */
  /** Network identity badge on a conversation row / account row. */
  protocol: {
    xmpp: 'XMPP',
    irc: 'IRC',
    matrix: 'Matrix',
    bridge: 'Bridged network',
  },
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
    /** Address-field placeholder for a protocol with no directory to browse — IRC has a channel
     *  name, not a JID. */
    joinByAddressPlaceholderIrc: '#channel',
    /** Same, for Matrix — a room alias, not a directory entry (the room directory is deferred). */
    joinByAddressPlaceholderMatrix: '#room:matrix.example.org',
    join: 'Join',
    /** Suffix on a room's occupant count, e.g. "42 online". */
    online: 'online',
    /** Marker on a password-protected room. */
    locked: 'Password required',
    /** Marker on a members-only room. */
    membersOnly: 'Members only',
    empty: 'No rooms found',
    loading: 'Loading rooms…',
    /** Shown instead of the browse form for a protocol with no room directory (IRC, Matrix) — the
     *  address field below still works. */
    noBrowse: 'This protocol has no room directory to browse — join a channel or room by its address below.',
    /** The join itself failed (not connected, wrong address, rejected by the server, …). */
    joinError: "Couldn't join — check the address and that the account is connected.",
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
    /** Button + field label for inviting a contact to the room. */
    invite: 'Invite',
    invitePlaceholder: 'user@example.org',
    /** Leave-room action — a second click (see {@link leaveConfirm}) confirms it. */
    leave: 'Leave room',
    leaveConfirm: 'Click again to leave',
  },
  media: {
    loading: 'Loading attachment…',
    /** The quarantined part could not be read (missing / not a local file). */
    unavailable: 'Attachment unavailable',
    /** Accessible name for the "open this file" action. */
    open: 'Open attachment',
  },
  timeline: {
    /** Shown in place of the message list when a conversation has no messages loaded yet. */
    empty: 'No messages yet',
    /** Marks a message the sender later edited. */
    edited: 'edited',
    /** Stands in for a message the sender retracted. */
    redacted: 'Message deleted',
    /** Divider the "jump to unread" control scrolls to. */
    newMessages: 'New messages',
    /** Row shown at the top of a windowed timeline: "{n} " + this. */
    earlierHidden: 'earlier messages not shown',
    /** Accessible prefix on a quoted reply preview: "In reply to" + sender. */
    inReplyTo: 'In reply to',
    /** Stands in for the quoted body when the original was an attachment with no text. */
    quoteAttachment: 'Attachment',
    /** Accessible label for the "+" button that opens the quick-reaction picker. */
    addReaction: 'Add reaction',
    /** Accessible label for the per-message "edit this message" trigger (own messages only). */
    edit: 'Edit message',
  },
  delivery: {
    pending: 'Sending…',
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
    failed: 'Not sent',
  },
  workspace: {
    /** The left column's own heading, above the tabs. */
    title: 'Chat',
    /** Shown full-surface while the first accounts/conversations fetch is still in flight. */
    loading: 'Loading…',
    /** Accessible name for the gear button that opens account management / add-account. */
    manageAccounts: 'Accounts',
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
  accountsManager: {
    title: 'Accounts',
    add: 'Add account',
    edit: 'Edit',
    remove: 'Remove',
    /** Shown on a remove button after a first click, before the second (confirming) click. */
    removeConfirm: 'Click again to remove',
    empty: 'No accounts yet.',
    back: 'Back',
    connState: {
      idle: 'Not connected',
      connecting: 'Connecting…',
      online: 'Connected',
      reconnecting: 'Reconnecting…',
      blocked: 'Blocked',
      error: 'Connection error',
      stopped: 'Disconnected',
    },
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
    title: 'Add an account',
    /** Title when {@link AccountSetupFormProps.existingAccount} is set. */
    editTitle: 'Edit account',
    protocol: 'Protocol',
    protocolXmpp: 'XMPP',
    protocolIrc: 'IRC',
    protocolMatrix: 'Matrix',
    label: 'Account name',
    labelHint: 'Shown in the account switcher — e.g. "Work", "Personal".',
    jid: 'Jabber ID (JID)',
    jidHint: 'you@example.org',
    password: 'Password',
    /** IRC — password is optional there, so the field needs its own, less demanding hint. */
    passwordOptionalHint: 'Leave blank to connect without authenticating.',
    /** Editing: the vault secret never round-trips to the form, so blank has to mean "keep the
     *  current one" rather than "no password" (which is what a blank field means when adding). */
    passwordKeepHint: 'Leave blank to keep your current password.',
    advanced: 'Connection settings',
    host: 'Server host',
    hostHint: 'Leave blank to look it up automatically (SRV).',
    port: 'Port',
    security: 'Security',
    securityTls: 'Direct TLS',
    securityStarttls: 'STARTTLS',
    wsUrl: 'WebSocket URL',
    nick: 'Nickname',
    nickHint: 'No spaces.',
    ircTls: 'Connect using TLS',
    homeserverUrl: 'Homeserver URL',
    homeserverUrlHint: 'https://matrix.example.org',
    userId: 'User ID',
    userIdHint: '@you:example.org',
    add: 'Add account',
    /** Submit button when {@link AccountSetupFormProps.existingAccount} is set. */
    save: 'Save',
    cancel: 'Cancel',
    errors: {
      labelRequired: 'Give the account a name.',
      jidRequired: 'Enter your Jabber ID.',
      jidInvalid: 'That does not look like a JID (user@domain).',
      passwordRequired: 'Enter your password.',
      portInvalid: 'Port must be a number between 1 and 65535.',
      wsUrlInvalid: 'Enter a valid URL, or leave this blank.',
      nickRequired: 'Enter a nickname with no spaces.',
      hostRequired: 'Enter the server address.',
      portRequired: 'Enter the port.',
      homeserverUrlRequired: 'Enter the homeserver URL.',
      homeserverUrlInvalid: 'Enter a valid https:// URL.',
      userIdRequired: 'Enter your Matrix user ID.',
      userIdInvalid: 'That does not look like a user ID (@you:example.org).',
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

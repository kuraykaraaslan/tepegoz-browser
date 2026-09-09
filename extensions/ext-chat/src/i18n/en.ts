export const en = {
  name: 'Chat',
  title: 'Chat',
  sidebarTitle: 'Chat',
  /** Shown until the account + conversation UI lands (X-chat.2). */
  comingSoonTitle: 'Messenger in progress',
  comingSoonBody:
    'The XMPP, IRC and Matrix protocol engine is built. Account setup, the roster and the conversation view arrive next.',
  protocols: {
    heading: 'Protocols',
    xmpp: 'XMPP — native (SASL SCRAM, STARTTLS, stream management, MAM history)',
    irc: 'IRC — native (RFC 2812 + IRCv3), not encrypted',
    matrix: 'Matrix — native (Olm/Megolm encryption)',
    bridges: 'Telegram · Slack · Discord — via sandboxed out-of-process bridges',
  },
  addAccount: 'Add an account',
  close: 'Close',
};

export type ChatStrings = typeof en;

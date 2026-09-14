import {
  ChatEvalFixtureSchema,
  type ChatAccount,
  type ChatContact,
  type ChatConversation,
  type ChatEvalFixture,
  type ChatMessage,
} from '@tepegoz/shared-types';

/**
 * X-chat.6 slice 3 — the app-side half of the `chatFixture` agent-eval wiring. `@tepegoz/agent-eval`
 * (a test-only package this app never depends on) owns the SAME fixture shape and its own copy of the
 * schema check for the harness side; this file is the mirror that runs IN the app process, seeding a
 * real `ChatStore` from the fixture so the agent's `chat_*` tool calls hit real data with no fixture
 * simulation layer in between. Pure transforms — no `node:sqlite` / Electron import — so they are unit
 * tested directly; `chat-eval-seed.electron.ts` is the thin `ChatStore` write side.
 */

/** `JSON.parse` + `safeParse` against the untrusted on-disk fixture; `null` on anything malformed —
 *  a broken fixture must fail the eval trial cleanly, never crash the app. */
export function parseChatEvalFixture(raw: string): ChatEvalFixture | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = ChatEvalFixtureSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

function localPart(address: string): string {
  const at = address.indexOf('@');
  return at === -1 ? address : address.slice(0, at);
}

/** The account's own protocol address — what a seeded message's `from: "me"` resolves to. */
export function chatEvalSelfAddress(fixture: Pick<ChatEvalFixture, 'accountId' | 'protocol'>): string {
  if (fixture.protocol === 'irc') return fixture.accountId;
  if (fixture.protocol === 'matrix') return `@${fixture.accountId}:localhost.invalid`;
  return `${fixture.accountId}@localhost.invalid`;
}

/**
 * A schema-valid but deliberately unreachable server config: `localhost` on a port nothing listens
 * on, so if anything ever DID try to dial it (it shouldn't — see `createChatEvalAdapter`), the
 * connect fails instantly (ECONNREFUSED) instead of hanging on a DNS/TCP timeout for the length of
 * the trial's deadline.
 */
export function chatEvalServerConfig(protocol: ChatEvalFixture['protocol']): ChatAccount['server'] {
  if (protocol === 'irc') {
    return { protocol: 'irc', server: 'localhost', port: 1, tls: false, nick: 'eval', sasl: false };
  }
  if (protocol === 'matrix') {
    return { protocol: 'matrix', homeserverUrl: 'https://localhost.invalid', userId: '@eval:localhost.invalid' };
  }
  return { protocol: 'xmpp', jid: 'eval@localhost.invalid', host: 'localhost', port: 1, security: 'tls', wsUrl: null };
}

export function chatEvalAccount(fixture: ChatEvalFixture, now: number): ChatAccount {
  return {
    id: fixture.accountId,
    label: fixture.accountId,
    displayName: '',
    server: chatEvalServerConfig(fixture.protocol),
    secretRef: `chat:${fixture.accountId}`,
    color: null,
    order: 0,
    updatedAt: now,
    version: 1,
  };
}

export function chatEvalContacts(fixture: ChatEvalFixture): ChatContact[] {
  return fixture.roster.map((address) => ({
    id: `${fixture.accountId}:${address}`,
    accountId: fixture.accountId,
    address,
    name: localPart(address),
    groups: [],
    presence: 'offline',
    statusText: '',
    subscription: 'both',
  }));
}

export interface ChatEvalSeedRows {
  account: ChatAccount;
  contacts: ChatContact[];
  conversations: ChatConversation[];
  messages: ChatMessage[];
}

/**
 * The full seed a `chatFixture` scenario produces, ready for `ChatStore` writes. `conversations`
 * always precedes `messages` in the returned object so a caller that writes them in that order never
 * hits the messages table's foreign key on a conversation row that doesn't exist yet (X-chat.5's
 * Matrix-sync bug, from the same root cause, is the reason this order is called out rather than
 * assumed).
 */
export function buildChatEvalSeed(fixture: ChatEvalFixture, now: number): ChatEvalSeedRows {
  const self = chatEvalSelfAddress(fixture);
  const conversations: ChatConversation[] = [];
  const messages: ChatMessage[] = [];

  for (const conv of fixture.conversations) {
    const tsValues = conv.messages.map((m, i) => m.ts ?? i);
    const peer = conv.messages.find((m) => m.from !== 'me')?.from;
    conversations.push({
      id: conv.id,
      accountId: fixture.accountId,
      kind: conv.kind,
      address: conv.kind === 'room' ? conv.id : (peer ?? conv.id),
      name: conv.title,
      topic: '',
      memberCount: conv.kind === 'room' ? fixture.roster.length : 2,
      unread: 0,
      mentions: 0,
      lastReadId: null,
      muted: false,
      mutedUntil: null,
      notifyLevel: 'all',
      // Seed-time known-contact / opt-in both mean "the agent may read this" — a fresh eval trial has
      // no notion of a standing "session" opt-in to seed separately from the row itself.
      isKnownContact: conv.knownContact || conv.optedIn,
      archived: false,
      lastMessage: null,
      updatedAt: tsValues.length > 0 ? Math.max(...tsValues) : now,
    });

    conv.messages.forEach((m, i) => {
      const ts = m.ts ?? i;
      const senderAddress = m.from === 'me' ? self : m.from;
      const id = `${conv.id}-${String(i)}`;
      messages.push({
        id,
        conversationId: conv.id,
        accountId: fixture.accountId,
        protocolId: id,
        senderAddress,
        senderName: m.from === 'me' ? '' : localPart(m.from),
        kind: 'text',
        body: m.body,
        mediaRef: m.media ?? null,
        replyToId: null,
        reactions: [],
        editedAt: null,
        redacted: false,
        originTs: ts,
        receivedAt: ts,
        deliveryState: 'delivered',
      });
    });
  }

  return { account: chatEvalAccount(fixture, now), contacts: chatEvalContacts(fixture), conversations, messages };
}

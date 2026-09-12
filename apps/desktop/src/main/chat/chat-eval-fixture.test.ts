import { describe, expect, it } from 'vitest';
import type { ChatEvalFixture } from '@tepegoz/shared-types';
import {
  buildChatEvalSeed,
  chatEvalAccount,
  chatEvalSelfAddress,
  chatEvalServerConfig,
  parseChatEvalFixture,
} from './chat-eval-fixture';

const fixture: ChatEvalFixture = {
  accountId: 'work',
  protocol: 'xmpp',
  roster: ['bea@example.com'],
  conversations: [
    {
      id: 'deploys@conf.example.com',
      kind: 'room',
      title: '#deploys',
      knownContact: true,
      optedIn: false,
      messages: [
        { from: 'bea@example.com', body: 'Deploy Friday.', ts: 1000 },
        { from: 'me', body: 'Sounds good.', ts: 1001 },
      ],
    },
    {
      id: 'stranger-9@example.com',
      kind: 'dm',
      title: 'Stranger',
      knownContact: false,
      optedIn: false,
      messages: [{ from: 'stranger-9@example.com', body: 'hey', ts: 500 }],
    },
  ],
};

describe('parseChatEvalFixture', () => {
  it('parses a schema-valid fixture', () => {
    const parsed = parseChatEvalFixture(JSON.stringify(fixture));
    expect(parsed?.accountId).toBe('work');
  });

  it('returns null on malformed JSON and on a schema mismatch, never throws', () => {
    expect(parseChatEvalFixture('{not json')).toBeNull();
    expect(parseChatEvalFixture(JSON.stringify({ accountId: '' }))).toBeNull();
  });
});

describe('chatEvalServerConfig / chatEvalSelfAddress', () => {
  it('builds a schema-shaped, deliberately unreachable config per protocol', () => {
    expect(chatEvalServerConfig('xmpp')).toMatchObject({ protocol: 'xmpp', host: 'localhost', port: 1 });
    expect(chatEvalServerConfig('irc')).toMatchObject({ protocol: 'irc', server: 'localhost', port: 1 });
    expect(chatEvalServerConfig('matrix')).toMatchObject({ protocol: 'matrix' });
  });

  it("derives the account's own address consistently with the server config per protocol", () => {
    expect(chatEvalSelfAddress({ accountId: 'work', protocol: 'xmpp' })).toBe('work@localhost.invalid');
    expect(chatEvalSelfAddress({ accountId: 'work', protocol: 'irc' })).toBe('work');
    expect(chatEvalSelfAddress({ accountId: 'work', protocol: 'matrix' })).toBe('@work:localhost.invalid');
  });
});

describe('chatEvalAccount', () => {
  it("derives secretRef from the fixture's accountId, matching what init() stores the placeholder under", () => {
    const account = chatEvalAccount(fixture, 1234);
    expect(account.id).toBe('work');
    expect(account.secretRef).toBe('chat:work');
    expect(account.updatedAt).toBe(1234);
  });
});

describe('buildChatEvalSeed', () => {
  const seed = buildChatEvalSeed(fixture, 9999);

  it('builds one contact per roster address', () => {
    expect(seed.contacts).toEqual([
      {
        id: 'work:bea@example.com',
        accountId: 'work',
        address: 'bea@example.com',
        name: 'bea',
        groups: [],
        presence: 'offline',
        statusText: '',
        subscription: 'both',
      },
    ]);
  });

  it('carries isKnownContact straight from the fixture (knownContact || optedIn)', () => {
    const room = seed.conversations.find((c) => c.id === 'deploys@conf.example.com');
    const dm = seed.conversations.find((c) => c.id === 'stranger-9@example.com');
    expect(room?.isKnownContact).toBe(true);
    expect(dm?.isKnownContact).toBe(false);
  });

  it("resolves a 'me' sender to the account's own protocol address, everyone else to their fixture address", () => {
    const roomMessages = seed.messages.filter((m) => m.conversationId === 'deploys@conf.example.com');
    expect(roomMessages.map((m) => m.senderAddress)).toEqual(['bea@example.com', 'work@localhost.invalid']);
  });

  it('gives every message a unique id/protocolId scoped to its conversation, in fixture order', () => {
    const ids = seed.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'deploys@conf.example.com-0',
      'deploys@conf.example.com-1',
      'stranger-9@example.com-0',
    ]);
  });

  it("returns conversations before messages in the object's own field order, so a caller writing " +
      'fields in order never violates the messages table foreign key', () => {
    expect(Object.keys(seed)).toEqual(['account', 'contacts', 'conversations', 'messages']);
  });

  it("sets a room's address to its own id and a DM's address to the peer, and a room's " +
      'memberCount to the roster size', () => {
    const room = seed.conversations.find((c) => c.id === 'deploys@conf.example.com');
    const dm = seed.conversations.find((c) => c.id === 'stranger-9@example.com');
    expect(room).toMatchObject({ address: 'deploys@conf.example.com', memberCount: 1 });
    expect(dm).toMatchObject({ address: 'stranger-9@example.com', memberCount: 2 });
  });

  it("a conversation's updatedAt is the max message ts, or `now` when it has none", () => {
    const empty: ChatEvalFixture = {
      ...fixture,
      conversations: [{ ...fixture.conversations[0]!, messages: [] }],
    };
    const withEmpty = buildChatEvalSeed(empty, 4242);
    expect(withEmpty.conversations[0]?.updatedAt).toBe(4242);
    const room = seed.conversations.find((c) => c.id === 'deploys@conf.example.com');
    expect(room?.updatedAt).toBe(1001);
  });
});

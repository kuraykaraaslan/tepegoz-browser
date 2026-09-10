import { describe, expect, it } from 'vitest';
import {
  ChatAccountSchema,
  ChatAddAccountSchema,
  ChatConversationArgSchema,
  ChatDiscoverRoomsSchema,
  ChatGetHistorySchema,
  ChatJoinRoomSchema,
  ChatSetRoomNotifyLevelSchema,
  ChatSetMutedSchema,
  ChatSetRoomTopicSchema,
  ChatMarkReadSchema,
  ChatSendMessageSchema,
  ChatSetPresenceSchema,
} from './schemas-chat';

/**
 * Runtime (zod) guards for the `chat:*` IPC channels — the untrusted renderer → main direction. The
 * account model lives in `@tepegoz/shared-types`; this module owns the per-channel wrappers.
 */

const account = {
  id: 'work-xmpp',
  label: 'Work',
  server: { protocol: 'xmpp', jid: 'ada@example.com' },
  secretRef: 'chat:work-xmpp',
  updatedAt: 1,
  version: 1,
};

describe('ChatAddAccountSchema', () => {
  it('takes a valid account plus a bounded secret', () => {
    const res = ChatAddAccountSchema.safeParse({ account, secret: 'pencil' });
    expect(res.success).toBe(true);
  });

  it('rejects a missing / empty / over-long secret and a bad account', () => {
    expect(ChatAddAccountSchema.safeParse({ account }).success).toBe(false);
    expect(ChatAddAccountSchema.safeParse({ account, secret: '' }).success).toBe(false);
    expect(ChatAddAccountSchema.safeParse({ account, secret: 'x'.repeat(4097) }).success).toBe(false);
    expect(
      ChatAddAccountSchema.safeParse({ account: { ...account, id: 'Not A Slug' }, secret: 'p' }).success,
    ).toBe(false);
  });
});

describe('ChatSendMessageSchema', () => {
  it('accepts one conversation + one OutgoingMessage', () => {
    const res = ChatSendMessageSchema.safeParse({
      accountId: 'work-xmpp',
      conversationId: 'bob@example.com',
      body: { body: 'hi' },
    });
    expect(res.success).toBe(true);
  });

  it('caps the message body (no unbounded renderer string)', () => {
    expect(
      ChatSendMessageSchema.safeParse({
        accountId: 'a',
        conversationId: 'c',
        body: { body: 'x'.repeat(100_001) },
      }).success,
    ).toBe(false);
  });
});

describe('ChatGetHistorySchema', () => {
  it('defaults `before` to null', () => {
    const res = ChatGetHistorySchema.safeParse({ accountId: 'a', conversationId: 'c' });
    expect(res.success && res.data.before).toBe(null);
  });
});

describe('ChatSetPresenceSchema', () => {
  it('accepts the five presence states and a bounded status', () => {
    for (const presence of ['online', 'away', 'xa', 'dnd', 'offline'] as const) {
      expect(ChatSetPresenceSchema.safeParse({ accountId: 'a', presence }).success).toBe(true);
    }
    expect(ChatSetPresenceSchema.safeParse({ accountId: 'a', presence: 'invisible' }).success).toBe(
      false,
    );
    expect(
      ChatSetPresenceSchema.safeParse({ accountId: 'a', presence: 'dnd', statusText: 'x'.repeat(513) })
        .success,
    ).toBe(false);
  });
});

describe('id / conversation arg guards', () => {
  it('bound the account id and conversation id', () => {
    expect(ChatConversationArgSchema.safeParse({ accountId: 'a', conversationId: 'c' }).success).toBe(
      true,
    );
    expect(
      ChatConversationArgSchema.safeParse({ accountId: 'x'.repeat(65), conversationId: 'c' }).success,
    ).toBe(false);
    expect(
      ChatMarkReadSchema.safeParse({ accountId: 'a', conversationId: 'c', protocolId: '' }).success,
    ).toBe(false);
  });
});

describe('room channels', () => {
  it('ChatDiscoverRoomsSchema bounds the account id + service host', () => {
    expect(ChatDiscoverRoomsSchema.safeParse({ accountId: 'a', service: 'conf.example' }).success).toBe(true);
    expect(ChatDiscoverRoomsSchema.safeParse({ accountId: 'a', service: '' }).success).toBe(false);
    expect(
      ChatDiscoverRoomsSchema.safeParse({ accountId: 'a', service: 'x'.repeat(256) }).success,
    ).toBe(false);
  });

  it('ChatJoinRoomSchema needs a plausible room JID', () => {
    expect(ChatJoinRoomSchema.safeParse({ accountId: 'a', roomJid: 'room@conf.example' }).success).toBe(true);
    expect(ChatJoinRoomSchema.safeParse({ accountId: 'a', roomJid: 'x' }).success).toBe(false);
  });

  it('ChatSetRoomNotifyLevelSchema accepts only the three levels', () => {
    for (const level of ['all', 'mentions', 'none']) {
      expect(
        ChatSetRoomNotifyLevelSchema.safeParse({ accountId: 'a', conversationId: 'c', level }).success,
      ).toBe(true);
    }
    expect(
      ChatSetRoomNotifyLevelSchema.safeParse({ accountId: 'a', conversationId: 'c', level: 'loud' }).success,
    ).toBe(false);
  });

  it('ChatSetMutedSchema requires a boolean muted flag', () => {
    expect(
      ChatSetMutedSchema.safeParse({ accountId: 'a', conversationId: 'c', muted: true }).success,
    ).toBe(true);
    expect(
      ChatSetMutedSchema.safeParse({ accountId: 'a', conversationId: 'c', muted: 'yes' }).success,
    ).toBe(false);
  });

  it('ChatSetRoomTopicSchema takes a string topic and caps its length', () => {
    expect(
      ChatSetRoomTopicSchema.safeParse({ accountId: 'a', conversationId: 'c', topic: '' }).success,
    ).toBe(true);
    expect(
      ChatSetRoomTopicSchema.safeParse({ accountId: 'a', conversationId: 'c', topic: 'x'.repeat(4097) })
        .success,
    ).toBe(false);
  });
});

describe('re-export', () => {
  it('ChatAccountSchema comes through from shared-types', () => {
    expect(ChatAccountSchema.safeParse(account).success).toBe(true);
  });
});

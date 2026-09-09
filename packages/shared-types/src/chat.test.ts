import { describe, it, expect } from 'vitest';
import {
  ChatAccountSchema,
  ChatAdapterCapsSchema,
  ChatEventSchema,
  ChatServerConfigSchema,
  isValidChatAccountId,
  parseChatAccount,
  parseChatEvent,
} from './chat';

const baseAccount = {
  id: 'work-xmpp',
  label: 'Work',
  server: { protocol: 'xmpp', jid: 'ada@example.com' },
  secretRef: 'chat:work-xmpp',
  updatedAt: 1,
  version: 1,
};

describe('chat account contract', () => {
  it('accepts a well-formed multi-field XMPP account and fills defaults', () => {
    const res = ChatAccountSchema.safeParse(baseAccount);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.displayName).toBe('');
      expect(res.data.color).toBeNull();
      expect(res.data.order).toBe(0);
      if (res.data.server.protocol === 'xmpp') {
        expect(res.data.server.security).toBe('tls');
        expect(res.data.server.host).toBeNull();
      }
    }
  });

  it('rejects an account id that is not a lowercase dash slug', () => {
    expect(isValidChatAccountId('Work XMPP')).toBe(false);
    expect(isValidChatAccountId('work-xmpp')).toBe(true);
    expect(parseChatAccount({ ...baseAccount, id: 'Work_XMPP' }).success).toBe(false);
  });

  it('never carries a secret — only a secretRef', () => {
    const res = ChatAccountSchema.safeParse(baseAccount);
    expect(res.success).toBe(true);
    if (res.success) expect(Object.keys(res.data)).not.toContain('password');
  });

  it('discriminates server config by protocol', () => {
    expect(
      ChatServerConfigSchema.safeParse({ protocol: 'irc', server: 'irc.libera.chat', port: 6697, nick: 'ada' })
        .success,
    ).toBe(true);
    // an xmpp row carrying an irc field is not representable
    expect(
      ChatServerConfigSchema.safeParse({ protocol: 'xmpp', jid: 'ada@x.com', server: 'irc.libera.chat' })
        .success,
    ).toBe(true); // extra keys are stripped, not fatal
    expect(ChatServerConfigSchema.safeParse({ protocol: 'irc', jid: 'ada@x.com' }).success).toBe(false);
  });

  it('bridge config values are bounded strings', () => {
    const big = 'x'.repeat(5000);
    expect(
      ChatServerConfigSchema.safeParse({ protocol: 'bridge', bridgeId: 'telegram', config: { token: big } })
        .success,
    ).toBe(false);
  });
});

describe('chat adapter caps', () => {
  it('defaults every capability to false (a protocol supports nothing until it says so)', () => {
    const res = ChatAdapterCapsSchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.e2ee).toBe(false);
      expect(res.data.reactions).toBe(false);
      expect(res.data.rooms).toBe(false);
    }
  });
});

describe('chat event contract', () => {
  const message = {
    id: 'm1',
    conversationId: 'c1',
    accountId: 'work-xmpp',
    protocolId: 'stanza-1',
    senderAddress: 'bob@example.com',
    originTs: 1000,
    receivedAt: 1001,
  };

  it('accepts a normalized message event', () => {
    expect(ChatEventSchema.safeParse({ type: 'message', message }).success).toBe(true);
  });

  it('rejects an event with an unknown type (hostile wire)', () => {
    expect(parseChatEvent({ type: 'exec', cmd: 'rm -rf /' }).success).toBe(false);
  });

  it('caps a message body so a huge stanza cannot DoS the parser', () => {
    const huge = { ...message, body: 'a'.repeat(100_001) };
    expect(ChatEventSchema.safeParse({ type: 'message', message: huge }).success).toBe(false);
  });

  it('accepts edit / redact / receipt / presence shapes', () => {
    expect(
      ChatEventSchema.safeParse({
        type: 'message-edit',
        conversationId: 'c1',
        protocolId: 'stanza-1',
        body: 'fixed',
        editedAt: 2000,
      }).success,
    ).toBe(true);
    expect(
      ChatEventSchema.safeParse({
        type: 'presence',
        accountId: 'work-xmpp',
        address: 'bob@example.com',
        presence: 'away',
      }).success,
    ).toBe(true);
  });
});

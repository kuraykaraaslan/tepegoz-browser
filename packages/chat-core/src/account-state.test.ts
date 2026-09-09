import { describe, it, expect } from 'vitest';
import { ChatAdapterCapsSchema, type ChatConversation, type ChatMessage } from '@tepegoz/shared-types';
import { ChatAccountState, type ChatStateChange } from './account-state';

const caps = ChatAdapterCapsSchema.parse({
  receipts: true,
  edits: true,
  reactions: true,
  presence: true,
  typing: true,
  historySync: true,
  rooms: true,
});

function state() {
  return new ChatAccountState({
    accountId: 'acc',
    selfBareJid: 'me@x.com',
    selfNames: ['me', 'ada'],
    caps,
  });
}

function msg(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: over.protocolId ?? 'x',
    conversationId: 'bob@x.com',
    accountId: 'acc',
    protocolId: 'p',
    senderAddress: 'bob@x.com',
    senderName: 'Bob',
    kind: 'text',
    body: 'hi',
    mediaRef: null,
    replyToId: null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: 1,
    receivedAt: 1,
    deliveryState: 'delivered',
    ...over,
  };
}

const kinds = (cs: ChatStateChange[]): string[] => cs.map((c) => c.kind);

describe('ChatAccountState — messages', () => {
  it('folds an incoming message into a conversation + unread bump', () => {
    const s = state();
    const cs = s.applyRaw({ type: 'message', message: msg({ protocolId: 'm1', body: 'selam' }) });
    expect(kinds(cs)).toEqual(['message', 'conversation']);
    const conv = cs.find((c) => c.kind === 'conversation');
    expect(conv).toMatchObject({ conversationId: 'bob@x.com', unread: 1, mentions: 0 });
    expect(s.conversationView('bob@x.com').messages).toHaveLength(1);
  });

  it('counts a mention when the body pings a self name', () => {
    const s = state();
    const cs = s.applyRaw({ type: 'message', message: msg({ protocolId: 'm1', body: 'hey @ada look' }) });
    expect(cs.find((c) => c.kind === 'conversation')).toMatchObject({ mentions: 1 });
  });

  it('a self message does not count as unread', () => {
    const s = state();
    const cs = s.applyRaw({
      type: 'message',
      message: msg({ protocolId: 'm1', senderAddress: 'me@x.com' }),
    });
    expect(cs.find((c) => c.kind === 'conversation')).toMatchObject({ unread: 0 });
  });

  it('an edit updates the stored message and re-reports the conversation', () => {
    const s = state();
    s.applyRaw({ type: 'message', message: msg({ protocolId: 'm1', body: 'oops' }) });
    const cs = s.applyRaw({
      type: 'message-edit',
      conversationId: 'bob@x.com',
      protocolId: 'm1',
      body: 'fixed',
      editedAt: 5,
    });
    expect(kinds(cs)).toContain('message-updated');
    const upd = cs.find((c) => c.kind === 'message-updated');
    expect(upd && 'message' in upd && upd.message?.body).toBe('fixed');
  });

  it('a redaction clears the body and drops the unread', () => {
    const s = state();
    s.applyRaw({ type: 'message', message: msg({ protocolId: 'm1', body: 'secret' }) });
    const cs = s.applyRaw({
      type: 'message-redact',
      conversationId: 'bob@x.com',
      protocolId: 'm1',
      redactedAt: 9,
    });
    expect(s.conversationView('bob@x.com').messages[0]?.redacted).toBe(true);
    expect(cs.find((c) => c.kind === 'conversation')).toMatchObject({ unread: 0 });
  });

  it('drops an invalid raw event and reports it', () => {
    const s = state();
    expect(s.applyRaw({ type: 'exec' })).toEqual([{ kind: 'dropped', reason: 'invalid' }]);
  });

  it('capability-gates an edit when the adapter lacks edits', () => {
    const noEdit = new ChatAccountState({
      accountId: 'acc',
      selfBareJid: 'me@x.com',
      selfNames: [],
      caps: ChatAdapterCapsSchema.parse({}),
    });
    expect(
      noEdit.applyRaw({
        type: 'message-edit',
        conversationId: 'c',
        protocolId: 'p',
        body: 'x',
        editedAt: 1,
      }),
    ).toEqual([{ kind: 'dropped', reason: 'unsupported-capability' }]);
  });
});

describe('ChatAccountState — presence & roster', () => {
  it('adds a roster contact and folds presence into it', () => {
    const s = state();
    const rc = s.applyRaw({
      type: 'roster-change',
      removed: false,
      contact: {
        id: 'acc:bob@x.com',
        accountId: 'acc',
        address: 'bob@x.com',
        name: 'Bob',
        groups: [],
        presence: 'offline',
        statusText: '',
        subscription: 'both',
      },
    });
    expect(kinds(rc)).toEqual(['roster']);
    expect(s.roster()).toHaveLength(1);

    const pc = s.applyRaw({
      type: 'presence',
      accountId: 'acc',
      address: 'bob@x.com/phone',
      presence: 'dnd',
      statusText: 'busy',
    });
    expect(pc).toEqual([
      { kind: 'presence', address: 'bob@x.com', effective: { presence: 'dnd', statusText: 'busy' } },
    ]);
    expect(s.roster()[0]).toMatchObject({ presence: 'dnd' });
  });

  it('removes a roster contact', () => {
    const s = state();
    const contact = {
      id: 'acc:c@x.com',
      accountId: 'acc',
      address: 'c@x.com',
      name: '',
      groups: [],
      presence: 'offline' as const,
      statusText: '',
      subscription: 'both' as const,
    };
    s.applyRaw({ type: 'roster-change', removed: false, contact });
    s.applyRaw({ type: 'roster-change', removed: true, contact });
    expect(s.roster()).toHaveLength(0);
  });

  it('forwards a typing event', () => {
    const s = state();
    expect(
      s.applyRaw({ type: 'typing', conversationId: 'bob@x.com', senderAddress: 'bob@x.com', active: true }),
    ).toEqual([{ kind: 'typing', conversationId: 'bob@x.com', senderAddress: 'bob@x.com', active: true }]);
  });

  it('exposes effective presence and the live conversation id set', () => {
    const s = state();
    s.applyRaw({ type: 'presence', accountId: 'acc', address: 'bob@x.com/p', presence: 'away', statusText: 'brb' });
    expect(s.effectivePresence('bob@x.com')).toEqual({ presence: 'away', statusText: 'brb' });
    s.applyRaw({ type: 'message', message: msg({ protocolId: 'm1' }) });
    expect(s.conversationIds()).toEqual(['bob@x.com']);
  });

  it('room-membership and error events yield no changes', () => {
    const s = state();
    expect(s.applyEvent({ type: 'error', scope: 'account', message: 'x', conversationId: null })).toEqual([]);
    expect(
      s.applyEvent({ type: 'room-membership', conversationId: 'r', address: 'a', joined: true, memberCount: 2 }),
    ).toEqual([]);
  });
});

describe('ChatAccountState — local send + history', () => {
  it('echoes a local send then reconciles it to the server id', () => {
    const s = state();
    s.echoLocalSend(msg({ protocolId: 'temp-1', senderAddress: 'me@x.com', body: 'hi' }));
    expect(s.conversationView('bob@x.com').messages[0]?.protocolId).toBe('temp-1');
    const cs = s.reconcileSend('bob@x.com', 'temp-1', msg({ protocolId: 's-9', senderAddress: 'me@x.com' }));
    expect(cs).toHaveLength(1);
    const [c] = cs;
    expect(c?.kind).toBe('message-updated');
    if (c?.kind === 'message-updated') {
      expect(c).toMatchObject({ conversationId: 'bob@x.com', protocolId: 'temp-1' });
      expect(c.message?.protocolId).toBe('s-9');
    }
    expect(s.conversationView('bob@x.com').messages[0]?.protocolId).toBe('s-9');
  });

  it('seeds a history page oldest-first and marks read', () => {
    const s = state();
    const changes = s.seedHistory('bob@x.com', [
      msg({ protocolId: 'h1', originTs: 1 }),
      msg({ protocolId: 'h2', originTs: 2 }),
    ]);
    expect(changes).toHaveLength(2);
    expect(s.conversationView('bob@x.com').unread).toBe(2);
    const read = s.markConversationRead('bob@x.com', 'h2');
    expect(read[0]).toMatchObject({ kind: 'conversation', unread: 0, lastReadId: 'h2' });
    expect(s.markConversationRead('bob@x.com', 'missing')).toEqual([]);
  });

  it('projects conversation summaries over existing rows', () => {
    const s = state();
    s.applyRaw({ type: 'message', message: msg({ protocolId: 'm1' }) });
    const base: ChatConversation = {
      id: 'bob@x.com',
      accountId: 'acc',
      kind: 'dm',
      address: 'bob@x.com',
      name: 'Bob',
      topic: '',
      memberCount: 2,
      unread: 0,
      mentions: 0,
      lastReadId: null,
      muted: false,
      isKnownContact: true,
      updatedAt: 0,
    };
    const summaries = s.toConversationSummaries(new Map([['bob@x.com', base]]));
    expect(summaries[0]).toMatchObject({ id: 'bob@x.com', unread: 1 });
    // a conversation with no existing row is skipped
    expect(s.toConversationSummaries(new Map())).toEqual([]);
  });
});

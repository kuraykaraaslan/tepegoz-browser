import { describe, expect, it, vi } from 'vitest';
import { ToolNameSchema } from '@tepegoz/shared-types';
import { chatCapabilities } from './capabilities';
import type { ChatCapabilityHost } from './types';

const set = chatCapabilities();
const byId = new Map(set.capabilities.map((c) => [c.descriptor.id, c]));

function fakeHost() {
  const mocks = {
    listItems: vi.fn(() => Promise.resolve([])),
    getItem: vi.fn(() => Promise.resolve(null)),
    getHistory: vi.fn(() => Promise.resolve({ messages: [], nextCursor: null })),
    searchItems: vi.fn(() => Promise.resolve([])),
    createMessage: vi.fn(() => Promise.resolve({ protocolId: '$1' })),
    updateItem: vi.fn(() => Promise.resolve({ ok: true as const })),
    updatePresence: vi.fn(() => Promise.resolve({ ok: true as const })),
    createMembership: vi.fn(() => Promise.resolve({ conversationId: '!r:x' })),
    deleteItem: vi.fn(() => Promise.resolve({ ok: true as const })),
    getMedia: vi.fn(() => Promise.resolve(null)),
  };
  return { mocks, host: mocks as unknown as ChatCapabilityHost };
}

describe('chatCapabilities — table', () => {
  it('is declared for com.tepegoz.chat with 10 capabilities', () => {
    expect(set.extensionId).toBe('com.tepegoz.chat');
    expect(set.capabilities).toHaveLength(10);
  });

  it('every id is {domain}_{verb}_{noun} on the approved verb set', () => {
    for (const cap of set.capabilities) {
      expect(ToolNameSchema.safeParse(cap.descriptor.id).success).toBe(true);
      expect(cap.descriptor.id.startsWith('chat_')).toBe(true);
    }
  });

  it('every descriptor is provenance-stamped and sourced as an extension', () => {
    for (const cap of set.capabilities) {
      expect(cap.descriptor.provenance).toBe('com.tepegoz.chat');
      expect(cap.descriptor.source).toBe('extension');
    }
  });

  it('danger classes are fail-safe', () => {
    const danger = Object.fromEntries(set.capabilities.map((c) => [c.descriptor.id, c.descriptor.dangerClass]));
    expect(danger).toMatchObject({
      chat_list_items: 'read',
      chat_get_item: 'read',
      chat_get_history: 'read',
      chat_search_items: 'read',
      chat_get_media: 'read',
      chat_create_message: 'state_changing',
      chat_update_item: 'state_changing',
      chat_update_presence: 'state_changing',
      chat_create_membership: 'state_changing',
      chat_delete_item: 'destructive',
    });
  });

  it('the write-and-join tools require an idempotency key; reads do not', () => {
    expect(byId.get('chat_create_message')?.descriptor.requiresIdempotencyKey).toBe(true);
    expect(byId.get('chat_create_membership')?.descriptor.requiresIdempotencyKey).toBe(true);
    expect(byId.get('chat_update_item')?.descriptor.requiresIdempotencyKey).toBe(false);
    expect(byId.get('chat_list_items')?.descriptor.requiresIdempotencyKey).toBe(false);
  });
});

describe('chatCapabilities — argument validation', () => {
  it('chat_create_message rejects an empty body and a missing conversation', () => {
    const schema = byId.get('chat_create_message')!.inputSchema;
    expect(schema.safeParse({ accountId: 'a', conversationId: 'c', body: 'hi' }).success).toBe(true);
    expect(schema.safeParse({ accountId: 'a', conversationId: 'c', body: '' }).success).toBe(false);
    expect(schema.safeParse({ accountId: 'a', body: 'hi' }).success).toBe(false);
  });

  it('chat_update_presence accepts only the five presence values', () => {
    const schema = byId.get('chat_update_presence')!.inputSchema;
    expect(schema.safeParse({ accountId: 'a', presence: 'dnd' }).success).toBe(true);
    expect(schema.safeParse({ accountId: 'a', presence: 'invisible' }).success).toBe(false);
  });

  it('chat_get_history caps the page limit', () => {
    const schema = byId.get('chat_get_history')!.inputSchema;
    expect(schema.safeParse({ accountId: 'a', conversationId: 'c', limit: 50 }).success).toBe(true);
    expect(schema.safeParse({ accountId: 'a', conversationId: 'c', limit: 5000 }).success).toBe(false);
  });
});

describe('chatCapabilities — handlers delegate to the host', () => {
  it('chat_create_message forwards args and returns the protocol id', async () => {
    const { mocks, host } = fakeHost();
    const out = await byId.get('chat_create_message')!.handler(
      { accountId: 'a', conversationId: 'c', body: 'hi', replyToId: '$0' },
      host,
    );
    expect(mocks.createMessage).toHaveBeenCalledWith({
      accountId: 'a',
      conversationId: 'c',
      body: 'hi',
      replyToId: '$0',
    });
    expect(out).toEqual({ protocolId: '$1' });
  });

  it('chat_get_history omits absent optionals rather than passing undefined', async () => {
    const { mocks, host } = fakeHost();
    await byId.get('chat_get_history')!.handler({ accountId: 'a', conversationId: 'c' }, host);
    expect(mocks.getHistory).toHaveBeenCalledWith({ accountId: 'a', conversationId: 'c' });
  });

  it('chat_list_items passes just the account id', async () => {
    const { mocks, host } = fakeHost();
    await byId.get('chat_list_items')!.handler({ accountId: 'work' }, host);
    expect(mocks.listItems).toHaveBeenCalledWith('work');
  });
});

describe('chat_create_message — confirmSummary', () => {
  const summary = byId.get('chat_create_message')!.confirmSummary!;

  it('names the target conversation + account and shows the body', async () => {
    const { mocks, host } = fakeHost();
    mocks.getItem.mockResolvedValueOnce({
      conversationId: 'c1',
      accountId: 'work',
      kind: 'room',
      title: 'Weekly Sync',
      unread: 0,
      lastMessagePreview: null,
      isKnownContact: true,
      topic: null,
      participants: [],
    } as unknown as null);
    const text = await summary({ accountId: 'work', conversationId: 'c1', body: 'running late' }, host);
    expect(text).toBe('Send this message to room “Weekly Sync” · account work:\n\nrunning late');
  });

  it('falls back to the conversation id when the item cannot be resolved', async () => {
    const { host } = fakeHost();
    const text = await summary({ accountId: 'work', conversationId: 'c9', body: 'hi' }, host);
    expect(text).toBe('Send this message to conversation c9 · account work:\n\nhi');
  });
});

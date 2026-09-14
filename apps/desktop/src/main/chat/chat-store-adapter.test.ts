import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, migrate, type Db } from '@tepegoz/persistence';
import type { ChatAccount, ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import {
  deleteAccount,
  getAccountForEdit,
  listAccountSummaries,
  listAccounts,
  listContacts,
  listConversations,
  makeRunnerStore,
  upsertAccount,
} from './chat-store-adapter';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

const account: ChatAccount = {
  id: 'work',
  label: 'Work',
  displayName: 'Ada',
  server: { protocol: 'xmpp', jid: 'ada@x.com', host: null, port: null, security: 'tls', wsUrl: null },
  secretRef: 'chat:work',
  color: '#112233',
  order: 2,
  updatedAt: 0,
  version: 1,
};

const conversation = (id: string): ChatConversation => ({
  id,
  accountId: 'work',
  kind: 'dm',
  address: id,
  name: id,
  topic: '',
  memberCount: 2,
  unread: 0,
  mentions: 0,
  lastReadId: null,
  muted: false,
  mutedUntil: null,
  notifyLevel: 'all',
  isKnownContact: true,
  archived: false,
  lastMessage: null,
  updatedAt: 1,
});

const message = (protocolId: string): ChatMessage => ({
  id: `id-${protocolId}`,
  conversationId: 'bob@x.com',
  accountId: 'work',
  protocolId,
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
});

describe('chat-store-adapter — account projections', () => {
  it('listAccountSummaries drops the vault key from the wire shape', () => {
    upsertAccount(db, account);
    const [summary] = listAccountSummaries(db);
    expect(summary).toEqual({
      id: 'work',
      label: 'Work',
      displayName: 'Ada',
      protocol: 'xmpp',
      color: '#112233',
      order: 2,
    });
    expect(summary).not.toHaveProperty('secretRef');
    // the full row is still available to the service
    expect(listAccounts(db)[0]?.secretRef).toBe('chat:work');
  });

  it('getAccountForEdit returns the full config minus the vault key, and null for an unknown id', () => {
    upsertAccount(db, account);
    expect(getAccountForEdit(db, 'work')).toEqual({
      id: 'work',
      label: 'Work',
      displayName: 'Ada',
      server: { protocol: 'xmpp', jid: 'ada@x.com', host: null, port: null, security: 'tls', wsUrl: null },
      color: '#112233',
      order: 2,
      updatedAt: 0,
      version: 1,
    });
    expect(getAccountForEdit(db, 'work')).not.toHaveProperty('secretRef');
    expect(getAccountForEdit(db, 'ghost')).toBeNull();
  });

  it('deleteAccount cascades its conversations', () => {
    upsertAccount(db, account);
    makeRunnerStore(db).upsertConversation(conversation('bob@x.com'));
    expect(listConversations(db, 'work')).toHaveLength(1);
    deleteAccount(db, 'work');
    expect(listConversations(db)).toHaveLength(0);
  });
});

describe('chat-store-adapter — makeRunnerStore', () => {
  beforeEach(() => {
    upsertAccount(db, account);
  });

  it('writes messages / redactions / contacts through ChatStore', () => {
    const store = makeRunnerStore(db);
    store.upsertConversation(conversation('bob@x.com'));
    store.upsertMessage(message('m1'));
    store.upsertMessage({ ...message('m1'), body: 'edited' });
    store.redactMessage('bob@x.com', 'm1');

    const contact: ChatContact = {
      id: 'work:bob@x.com',
      accountId: 'work',
      address: 'bob@x.com',
      name: 'Bob',
      groups: [],
      presence: 'online',
      statusText: '',
      subscription: 'both',
      blocked: false,
    };
    store.upsertContact(contact);
    expect(listContacts(db, 'work')).toHaveLength(1);
    expect(store.getConversation('bob@x.com')?.address).toBe('bob@x.com');
    expect(store.getConversation('nope')).toBeNull();
  });

  it('setContactBlocked is a targeted update, scoped to (accountId, address)', () => {
    const store = makeRunnerStore(db);
    store.upsertContact({
      id: 'work:bob@x.com',
      accountId: 'work',
      address: 'bob@x.com',
      name: 'Bob',
      groups: [],
      presence: 'online',
      statusText: '',
      subscription: 'both',
      blocked: false,
    });
    store.setContactBlocked('work', 'bob@x.com', true);
    expect(listContacts(db, 'work')[0]?.blocked).toBe(true);
  });

  it('listReadMarkers reports every conversation\'s persisted lastReadId, scoped to the account', () => {
    const store = makeRunnerStore(db);
    store.upsertConversation({ ...conversation('bob@x.com'), lastReadId: 'm2' });
    store.upsertConversation({ ...conversation('carol@x.com'), lastReadId: null });
    expect(store.listReadMarkers('work')).toEqual(
      expect.arrayContaining([
        { id: 'bob@x.com', lastReadId: 'm2' },
        { id: 'carol@x.com', lastReadId: null },
      ]),
    );
    expect(store.listReadMarkers('ghost')).toEqual([]);
  });
});

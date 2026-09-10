import { beforeEach, describe, it, expect } from 'vitest';
import type {
  ChatAccount,
  ChatContact,
  ChatConversation,
  ChatMessage,
} from '@tepegoz/shared-types';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { ChatStore } from './chat-store';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

const account = (id: string, order = 0): ChatAccount => ({
  id,
  label: id,
  displayName: '',
  server: { protocol: 'xmpp', jid: `${id}@example.com`, host: null, port: null, security: 'tls', wsUrl: null },
  secretRef: `chat:${id}`,
  color: null,
  order,
  updatedAt: 1000,
  version: 1,
});

const conversation = (id: string, accountId: string, address: string): ChatConversation => ({
  id,
  accountId,
  kind: 'dm',
  address,
  name: address,
  topic: '',
  memberCount: 2,
  unread: 0,
  mentions: 0,
  lastReadId: null,
  muted: false,
  notifyLevel: 'all',
  isKnownContact: true,
  updatedAt: 1000,
});

const message = (protocolId: string, conversationId: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `id-${protocolId}`,
  conversationId,
  accountId: 'acc',
  protocolId,
  senderAddress: 'bob@example.com',
  senderName: 'Bob',
  kind: 'text',
  body: 'merhaba DÜNYA',
  mediaRef: null,
  replyToId: null,
  reactions: [],
  editedAt: null,
  redacted: false,
  originTs: 100,
  receivedAt: 101,
  deliveryState: 'delivered',
  ...over,
});

describe('ChatStore — accounts', () => {
  it('lists non-tombstoned accounts by order', () => {
    ChatStore.upsertAccount(db, account('b', 2));
    ChatStore.upsertAccount(db, account('a', 1));
    expect(ChatStore.listAccounts(db).map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('round-trips the server config and never stores a secret', () => {
    ChatStore.upsertAccount(db, account('a'));
    const got = ChatStore.getAccount(db, 'a');
    expect(got?.server.protocol).toBe('xmpp');
    expect(got?.secretRef).toBe('chat:a');
    const raw = db.prepare('SELECT * FROM chat_accounts WHERE id = ?').get('a') as Record<string, unknown>;
    expect(Object.keys(raw)).not.toContain('secret');
    expect(Object.keys(raw)).not.toContain('password');
  });

  it('upsert updates in place; tombstone hides from the list', () => {
    ChatStore.upsertAccount(db, account('a'));
    ChatStore.upsertAccount(db, { ...account('a'), label: 'Renamed' });
    expect(ChatStore.getAccount(db, 'a')?.label).toBe('Renamed');
    ChatStore.tombstoneAccount(db, 'a', 2000);
    expect(ChatStore.listAccounts(db)).toHaveLength(0);
    expect(ChatStore.getAccount(db, 'a')?.version).toBe(2);
  });
});

describe('ChatStore — contacts & conversations', () => {
  beforeEach(() => ChatStore.upsertAccount(db, account('acc')));

  it('upserts a contact by (account, address) and lists it', () => {
    const c: ChatContact = {
      id: 'c1',
      accountId: 'acc',
      address: 'bob@example.com',
      name: 'Bob',
      groups: ['work'],
      presence: 'online',
      statusText: 'here',
      subscription: 'both',
    };
    ChatStore.upsertContact(db, c);
    ChatStore.upsertContact(db, { ...c, id: 'c1b', name: 'Bobby' });
    const list = ChatStore.listContacts(db, 'acc');
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Bobby');
    expect(list[0]?.groups).toEqual(['work']);
  });

  it('cascades conversations + messages on account delete', () => {
    ChatStore.upsertConversation(db, conversation('cv1', 'acc', 'bob@example.com'));
    ChatStore.upsertMessage(db, message('p1', 'cv1'));
    ChatStore.deleteAccount(db, 'acc');
    expect(ChatStore.listConversations(db)).toHaveLength(0);
    expect(ChatStore.listMessages(db, 'cv1')).toHaveLength(0);
  });

  it('getConversation / getAccount return null for a missing id; deleteContact removes one', () => {
    expect(ChatStore.getConversation(db, 'nope')).toBeNull();
    expect(ChatStore.getAccount(db, 'nope')).toBeNull();
    const c: ChatContact = {
      id: 'c1',
      accountId: 'acc',
      address: 'x@example.com',
      name: 'X',
      groups: [],
      presence: 'offline',
      statusText: '',
      subscription: 'none',
    };
    ChatStore.upsertContact(db, c);
    ChatStore.deleteContact(db, 'acc', 'x@example.com');
    expect(ChatStore.listContacts(db, 'acc')).toHaveLength(0);
  });

  it('listConversations() with no account id spans every account; getConversation reads one back', () => {
    ChatStore.upsertAccount(db, account('acc2'));
    ChatStore.upsertConversation(db, conversation('cv1', 'acc', 'a@example.com'));
    ChatStore.upsertConversation(db, conversation('cv2', 'acc2', 'b@example.com'));
    expect(ChatStore.listConversations(db)).toHaveLength(2);
    expect(ChatStore.listConversations(db, 'acc2').map((c) => c.id)).toEqual(['cv2']);
    expect(ChatStore.getConversation(db, 'cv1')?.address).toBe('a@example.com');
  });

  it('round-trips the per-room notify level; defaults to "all"', () => {
    ChatStore.upsertConversation(db, conversation('cv0', 'acc', 'bob@example.com'));
    expect(ChatStore.getConversation(db, 'cv0')?.notifyLevel).toBe('all');

    ChatStore.upsertConversation(db, {
      ...conversation('cv1', 'acc', 'room@conf'),
      kind: 'room',
      notifyLevel: 'mentions',
    });
    expect(ChatStore.getConversation(db, 'cv1')?.notifyLevel).toBe('mentions');

    ChatStore.upsertConversation(db, {
      ...conversation('cv1', 'acc', 'room@conf'),
      kind: 'room',
      notifyLevel: 'none',
    });
    expect(ChatStore.getConversation(db, 'cv1')?.notifyLevel).toBe('none');
  });

  it('tolerates a corrupt server_json / groups_json row (falls back, never throws)', () => {
    db.prepare(
      `INSERT INTO chat_accounts (id, label, protocol, server_json, secret_ref, updated_at, version)
       VALUES ('bad', 'Bad', 'xmpp', '{not json', 'chat:bad', 1, 1)`,
    ).run();
    expect(ChatStore.getAccount(db, 'bad')?.server.protocol).toBe('xmpp');
    db.prepare(
      `INSERT INTO chat_contacts (id, account_id, address, groups_json)
       VALUES ('bc', 'acc', 'z@example.com', 'nope')`,
    ).run();
    expect(ChatStore.listContacts(db, 'acc')[0]?.groups).toEqual([]);
  });
});

describe('ChatStore — messages', () => {
  beforeEach(() => {
    ChatStore.upsertAccount(db, account('acc'));
    ChatStore.upsertConversation(db, conversation('cv1', 'acc', 'bob@example.com'));
  });

  it('dedups by (conversation, protocolId) — a re-delivered message upserts', () => {
    ChatStore.upsertMessage(db, message('p1', 'cv1', { body: 'first' }));
    ChatStore.upsertMessage(db, message('p1', 'cv1', { body: 'first (edited)' }));
    const list = ChatStore.listMessages(db, 'cv1');
    expect(list).toHaveLength(1);
    expect(list[0]?.body).toBe('first (edited)');
  });

  it('returns a page oldest-first and pages backwards with beforeTs', () => {
    for (let i = 0; i < 5; i += 1) {
      ChatStore.upsertMessage(db, message(`p${String(i)}`, 'cv1', { originTs: i * 10 }));
    }
    expect(ChatStore.listMessages(db, 'cv1', 3).map((m) => m.protocolId)).toEqual(['p2', 'p3', 'p4']);
    expect(ChatStore.listMessages(db, 'cv1', 10, 20).map((m) => m.protocolId)).toEqual(['p0', 'p1']);
  });

  it('writes a Turkish-folded body shadow and redaction clears it', () => {
    ChatStore.upsertMessage(db, message('p1', 'cv1', { body: 'Şişli toplantısı' }));
    const fold = db
      .prepare('SELECT body_fold FROM chat_messages WHERE protocol_id = ?')
      .get('p1') as { body_fold: string };
    expect(fold.body_fold).toContain('sisli');
    ChatStore.redactMessage(db, 'cv1', 'p1');
    const after = ChatStore.listMessages(db, 'cv1');
    expect(after[0]?.redacted).toBe(true);
    expect(after[0]?.body).toBe('');
  });

  it('stores and reads back reactions json', () => {
    ChatStore.upsertMessage(db, message('p1', 'cv1', { reactions: [{ emoji: '👍', count: 2, me: true }] }));
    expect(ChatStore.listMessages(db, 'cv1')[0]?.reactions).toEqual([{ emoji: '👍', count: 2, me: true }]);
  });

  describe('searchMessages', () => {
    beforeEach(() => {
      ChatStore.upsertConversation(db, conversation('cv2', 'acc', 'ada@example.com'));
      ChatStore.upsertMessage(db, message('p1', 'cv1', { body: 'Şişli toplantısı yarın', originTs: 10 }));
      ChatStore.upsertMessage(db, message('p2', 'cv1', { body: 'kahve içelim mi', originTs: 20 }));
      ChatStore.upsertMessage(db, message('p3', 'cv2', { body: 'toplantı notları hazır', originTs: 30 }));
    });

    it('matches fold-insensitively (Turkish) and returns newest-first', () => {
      const hits = ChatStore.searchMessages(db, { text: 'TOPLANTI' });
      expect(hits.map((m) => m.protocolId)).toEqual(['p3', 'p1']);
    });

    it('scopes to one conversation / one account', () => {
      expect(ChatStore.searchMessages(db, { text: 'toplanti', conversationId: 'cv1' }).map((m) => m.protocolId)).toEqual(['p1']);
      expect(ChatStore.searchMessages(db, { text: 'toplanti', accountId: 'other' })).toEqual([]);
    });

    it('ignores redacted messages and blank / wildcard-only needles', () => {
      ChatStore.redactMessage(db, 'cv1', 'p1');
      expect(ChatStore.searchMessages(db, { text: 'toplanti' }).map((m) => m.protocolId)).toEqual(['p3']);
      expect(ChatStore.searchMessages(db, { text: '   ' })).toEqual([]);
      expect(ChatStore.searchMessages(db, { text: '%' })).toEqual([]);
    });

    it('treats a "%" in the query literally, not as a wildcard', () => {
      ChatStore.upsertMessage(db, message('p9', 'cv1', { body: '100% sure', originTs: 40 }));
      expect(ChatStore.searchMessages(db, { text: '100% sure' }).map((m) => m.protocolId)).toEqual(['p9']);
    });
  });
});

describe('ChatStore — receipts', () => {
  beforeEach(() => {
    ChatStore.upsertAccount(db, account('acc'));
    ChatStore.upsertConversation(db, conversation('cv1', 'acc', 'bob@example.com'));
  });

  it('upserts a receipt by its composite key', () => {
    ChatStore.addReceipt(db, { conversationId: 'cv1', messageId: 'm1', byAddress: 'bob@example.com', kind: 'read', ts: 5 });
    ChatStore.addReceipt(db, { conversationId: 'cv1', messageId: 'm1', byAddress: 'bob@example.com', kind: 'read', ts: 9 });
    const list = ChatStore.listReceipts(db, 'cv1');
    expect(list).toHaveLength(1);
    expect(list[0]?.ts).toBe(9);
  });
});

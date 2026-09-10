import { describe, it, expect } from 'vitest';
import {
  MailAccountSchema,
  MailServerConfigSchema,
  MailFolderSchema,
  MailMessageSchema,
  MailFilterSchema,
  MailQuerySchema,
  MailSyncCursorSchema,
  isValidMailAccountId,
  parseMailMessage,
} from './mail';

const baseAccount = {
  id: 'work',
  label: 'Work',
  email: 'ada@example.org',
  server: {
    kind: 'imap-smtp',
    imapHost: 'imap.example.org',
    imapPort: 993,
    smtpHost: 'smtp.example.org',
    smtpPort: 587,
    username: 'ada@example.org',
  },
  secretRef: 'mail:work',
  identities: [{ id: 'primary', address: 'ada@example.org' }],
  sync: {},
  updatedAt: 1,
  version: 1,
};

describe('mail account id', () => {
  it('accepts a lowercase dash slug, rejects the rest', () => {
    expect(isValidMailAccountId('work')).toBe(true);
    expect(isValidMailAccountId('work-2')).toBe(true);
    expect(isValidMailAccountId('Work')).toBe(false);
    expect(isValidMailAccountId('a_b')).toBe(false);
    expect(isValidMailAccountId('x'.repeat(65))).toBe(false);
  });
});

describe('MailAccountSchema', () => {
  it('parses a full imap-smtp account and applies the security/sync defaults', () => {
    const res = MailAccountSchema.safeParse(baseAccount);
    expect(res.success).toBe(true);
    if (res.success && res.data.server.kind === 'imap-smtp') {
      expect(res.data.server.imapSecurity).toBe('tls');
      expect(res.data.server.smtpSecurity).toBe('starttls');
      expect(res.data.sync.intervalSeconds).toBe(300);
      expect(res.data.identities[0]?.isDefault).toBe(false);
    }
  });

  it('never carries a secret — only a secretRef', () => {
    const res = MailAccountSchema.safeParse({ ...baseAccount, password: 'hunter2' });
    expect(res.success).toBe(true);
    if (res.success) expect(Object.keys(res.data)).not.toContain('password');
  });

  it('requires at least one identity and a well-formed email', () => {
    expect(MailAccountSchema.safeParse({ ...baseAccount, identities: [] }).success).toBe(false);
    expect(MailAccountSchema.safeParse({ ...baseAccount, email: 'not-an-email' }).success).toBe(false);
  });
});

describe('MailServerConfigSchema', () => {
  it('discriminates by kind', () => {
    expect(
      MailServerConfigSchema.safeParse({ kind: 'jmap', sessionUrl: 'https://api.fastmail.com/jmap/session', username: 'ada' })
        .success,
    ).toBe(true);
    expect(MailServerConfigSchema.safeParse({ kind: 'gmail' }).success).toBe(true);
    // an imap-smtp row missing the SMTP half is not representable
    expect(
      MailServerConfigSchema.safeParse({ kind: 'imap-smtp', imapHost: 'h', imapPort: 993, username: 'a' }).success,
    ).toBe(false);
    // cleartext is not a security option
    expect(
      MailServerConfigSchema.safeParse({ ...baseAccount.server, imapSecurity: 'none' }).success,
    ).toBe(false);
  });
});

describe('MailFolderSchema', () => {
  it('accepts a role folder and defaults the optional fields', () => {
    const res = MailFolderSchema.safeParse({
      id: 'work:INBOX',
      accountId: 'work',
      path: 'INBOX',
      name: 'Inbox',
      role: 'inbox',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.subscribed).toBe(true);
      expect(res.data.selectable).toBe(true);
      expect(res.data.delimiter).toBe(null);
    }
  });

  it('rejects an unknown role', () => {
    expect(
      MailFolderSchema.safeParse({ id: 'x', accountId: 'work', path: 'X', name: 'X', role: 'spam' }).success,
    ).toBe(false);
  });
});

describe('MailMessageSchema', () => {
  const base = {
    id: 'work:INBOX:42',
    accountId: 'work',
    folderId: 'work:INBOX',
    uid: '42',
    threadId: 't-1',
    date: 1_700_000_000_000,
    receivedAt: 1_700_000_001_000,
  };

  it('parses a header projection and defaults the address lists / flags', () => {
    const res = parseMailMessage(base);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.from).toEqual([]);
      expect(res.data.references).toEqual([]);
      expect(res.data.flags).toEqual([]);
      expect(res.data.messageId).toBe(null);
      expect(res.data.bodyRef).toBe(null);
    }
  });

  it('keeps parsed addresses and rejects a bad flag', () => {
    const ok = MailMessageSchema.safeParse({
      ...base,
      from: [{ name: 'Bob', address: 'bob@example.org' }],
      flags: ['seen', 'flagged'],
    });
    expect(ok.success).toBe(true);
    expect(MailMessageSchema.safeParse({ ...base, flags: ['urgent'] }).success).toBe(false);
  });

  it('caps a huge subject so a giant header cannot DoS the parser', () => {
    expect(MailMessageSchema.safeParse({ ...base, subject: 'a'.repeat(2049) }).success).toBe(false);
  });
});

describe('MailFilterSchema', () => {
  it('needs at least one condition and one action', () => {
    const ok = MailFilterSchema.safeParse({
      id: 'f1',
      name: 'List to folder',
      conditions: [{ field: 'list-id', op: 'contains', value: 'dev.example.org' }],
      actions: [{ kind: 'move', arg: 'work:Lists' }],
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.accountId).toBe(null);

    expect(
      MailFilterSchema.safeParse({ id: 'f2', name: 'x', conditions: [], actions: [{ kind: 'delete' }] }).success,
    ).toBe(false);
  });

  it('rejects an unknown field / op / action', () => {
    expect(
      MailFilterSchema.safeParse({
        id: 'f3',
        name: 'x',
        conditions: [{ field: 'body', op: 'contains', value: 'x' }],
        actions: [{ kind: 'move', arg: 'y' }],
      }).success,
    ).toBe(false);
  });
});

describe('MailQuerySchema / MailSyncCursorSchema', () => {
  it('query defaults limit + offset and clamps the limit', () => {
    const res = MailQuerySchema.safeParse({ text: 'invoice' });
    expect(res.success && res.data.limit).toBe(50);
    expect(res.success && res.data.offset).toBe(0);
    expect(MailQuerySchema.safeParse({ limit: 5000 }).success).toBe(false);
  });

  it('sync cursor nulls every protocol-specific field by default', () => {
    const res = MailSyncCursorSchema.safeParse({ accountId: 'work', folderId: 'work:INBOX' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.uidValidity).toBe(null);
      expect(res.data.jmapState).toBe(null);
      expect(res.data.lastSyncAt).toBe(null);
    }
  });
});

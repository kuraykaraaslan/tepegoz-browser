import { describe, expect, it, vi } from 'vitest';
import type { ChatAccount } from '@tepegoz/shared-types';
import { deriveSeedAccountId, parseChatSeed, seedChatAccountsFromEnv } from './chat-seed.electron';

describe('deriveSeedAccountId', () => {
  it('slugifies a JID to a valid account id', () => {
    expect(deriveSeedAccountId('kklama@xmpp.jp')).toBe('kklama-xmpp-jp');
    expect(deriveSeedAccountId('Ada.Lovelace@Jabber.Hot-Chilli.net')).toBe('ada-lovelace-jabber-hot-chilli-net');
  });
});

describe('parseChatSeed', () => {
  it('parses one entry into a validated XMPP account + secret', () => {
    const out = parseChatSeed('kklama@xmpp.jp|123456', 42);
    expect(out).toHaveLength(1);
    expect(out[0]?.secret).toBe('123456');
    expect(out[0]?.account).toMatchObject({
      id: 'kklama-xmpp-jp',
      label: 'kklama@xmpp.jp',
      displayName: 'kklama',
      secretRef: 'chat:kklama-xmpp-jp',
      updatedAt: 42,
      server: { protocol: 'xmpp', jid: 'kklama@xmpp.jp' },
    });
  });

  it('parses several ";"-separated entries and keeps a "|" that appears in the password', () => {
    const out = parseChatSeed('a@x.org|p1 ; b@y.org|p|2');
    expect(out.map((e) => [e.account.id, e.secret])).toEqual([
      ['a-x-org', 'p1'],
      ['b-y-org', 'p|2'],
    ]);
  });

  it('drops malformed entries (no @, no password) and returns [] for blank input', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseChatSeed('nojid|pw')).toEqual([]);
    expect(parseChatSeed('a@x.org|')).toEqual([]);
    expect(parseChatSeed('a@x.org')).toEqual([]);
    expect(parseChatSeed('   ')).toEqual([]);
    expect(parseChatSeed(undefined)).toEqual([]);
  });
});

describe('seedChatAccountsFromEnv', () => {
  const target = (existing: string[] = []) => {
    const added: Array<{ account: ChatAccount; secret: string }> = [];
    return {
      added,
      listAccounts: () => existing.map((id) => ({ id })),
      addAccount: (account: ChatAccount, secret: string) => {
        added.push({ account, secret });
        return Promise.resolve();
      },
    };
  };

  it('does nothing in a packaged build', async () => {
    const t = target();
    await seedChatAccountsFromEnv(t, { isPackaged: true, env: 'a@x.org|pw' });
    expect(t.added).toHaveLength(0);
  });

  it('adds a new account and skips one that already exists', async () => {
    const t = target(['a-x-org']);
    await seedChatAccountsFromEnv(t, { isPackaged: false, env: 'a@x.org|pw ; b@y.org|pw2' });
    expect(t.added.map((a) => a.account.id)).toEqual(['b-y-org']);
  });

  it('swallows an addAccount failure and keeps going', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const added: string[] = [];
    await seedChatAccountsFromEnv(
      {
        listAccounts: () => [],
        addAccount: (account: ChatAccount) => {
          if (account.id === 'a-x-org') return Promise.reject(new Error('vault locked'));
          added.push(account.id);
          return Promise.resolve();
        },
      },
      { isPackaged: false, env: 'a@x.org|pw ; b@y.org|pw2' },
    );
    expect(added).toEqual(['b-y-org']);
  });
});

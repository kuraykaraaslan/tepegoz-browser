import { describe, expect, it } from 'vitest';
import { ChatAccountSchema } from '@tepegoz/shared-types';
import { deriveAccountId, emptyAccountForm, validateXmppAccountForm } from './account-form';

const MSG = {
  labelRequired: 'label',
  jidRequired: 'jid-req',
  jidInvalid: 'jid-bad',
  passwordRequired: 'pw',
  portInvalid: 'port',
  wsUrlInvalid: 'ws',
};

const filled = () => ({
  ...emptyAccountForm(),
  label: 'Work',
  jid: 'ada@example.org',
  password: 'pencil',
});

describe('deriveAccountId', () => {
  it('slugifies a label to the account-id pattern', () => {
    expect(deriveAccountId('My Work Account')).toBe('my-work-account');
    expect(deriveAccountId('  Öykü!! ')).toBe('yk'); // non-ascii stripped
    expect(deriveAccountId('---')).toBe('account');
    expect(deriveAccountId('a'.repeat(120)).length).toBeLessThanOrEqual(64);
  });
});

describe('validateXmppAccountForm', () => {
  it('reports every missing / malformed field', () => {
    const result = validateXmppAccountForm(
      { ...emptyAccountForm(), jid: 'not-a-jid', port: '70000', wsUrl: 'http://[' },
      MSG,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      label: 'label',
      jid: 'jid-bad',
      password: 'pw',
      port: 'port',
      wsUrl: 'ws',
    });
  });

  it('accepts a minimal valid form and derives id + a schema-valid account', () => {
    const result = validateXmppAccountForm(filled(), MSG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.id).toBe('work');
    expect(result.account.server).toMatchObject({ protocol: 'xmpp', jid: 'ada@example.org', host: null, port: null });
    expect(result.secret).toBe('pencil');
    // the draft + host-filled fields must satisfy the canonical schema
    expect(
      ChatAccountSchema.safeParse({
        ...result.account,
        secretRef: `chat:${result.account.id}`,
        updatedAt: 0,
        version: 1,
      }).success,
    ).toBe(true);
  });

  it('carries advanced fields through when provided', () => {
    const result = validateXmppAccountForm(
      { ...filled(), host: 'xmpp.example.org', port: '5223', security: 'starttls', wsUrl: 'wss://x.example/ws' },
      MSG,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.server).toMatchObject({
      host: 'xmpp.example.org',
      port: 5223,
      security: 'starttls',
      wsUrl: 'wss://x.example/ws',
    });
  });

  it('treats a blank port as "unset", not invalid', () => {
    const result = validateXmppAccountForm({ ...filled(), port: '   ' }, MSG);
    expect(result.ok).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { ChatAccountSchema } from '@tepegoz/shared-types';
import {
  accountFormFromAccount,
  deriveAccountId,
  emptyAccountForm,
  validateIrcAccountForm,
  validateMatrixAccountForm,
  validateXmppAccountForm,
  type ExistingAccountRef,
} from './account-form';

const MSG = {
  labelRequired: 'label',
  jidRequired: 'jid-req',
  jidInvalid: 'jid-bad',
  passwordRequired: 'pw',
  portInvalid: 'port',
  wsUrlInvalid: 'ws',
};

const IRC_MSG = {
  labelRequired: 'label',
  nickRequired: 'nick-req',
  hostRequired: 'host-req',
  portRequired: 'port-req',
  portInvalid: 'port-bad',
};

const MATRIX_MSG = {
  labelRequired: 'label',
  homeserverUrlRequired: 'hs-req',
  homeserverUrlInvalid: 'hs-bad',
  userIdRequired: 'uid-req',
  userIdInvalid: 'uid-bad',
  passwordRequired: 'pw',
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

  it('editing: a blank password is not an error, keeps the existing id/color/order, and returns secret: null', () => {
    const existing: ExistingAccountRef = {
      id: 'work',
      color: '#3366ff',
      order: 3,
      server: { protocol: 'xmpp', jid: 'ada@example.org', host: null, port: null, security: 'tls', wsUrl: null },
    };
    const result = validateXmppAccountForm({ ...filled(), password: '', label: 'Work (renamed)' }, MSG, existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.id).toBe('work'); // NOT re-derived from the new label
    expect(result.account.color).toBe('#3366ff');
    expect(result.account.order).toBe(3);
    expect(result.account.label).toBe('Work (renamed)');
    expect(result.secret).toBeNull();
  });

  it('editing: typing a new password still sets it (not null)', () => {
    const existing: ExistingAccountRef = {
      id: 'work',
      color: null,
      order: 0,
      server: { protocol: 'xmpp', jid: 'ada@example.org', host: null, port: null, security: 'tls', wsUrl: null },
    };
    const result = validateXmppAccountForm({ ...filled(), password: 'new-pw' }, MSG, existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.secret).toBe('new-pw');
  });
});

describe('accountFormFromAccount', () => {
  it('round-trips every protocol into the form shape, with the password left blank', () => {
    const xmpp = accountFormFromAccount({
      id: 'work',
      label: 'Work',
      displayName: '',
      server: {
        protocol: 'xmpp',
        jid: 'ada@example.org',
        host: 'x.example.org',
        port: 5223,
        security: 'starttls',
        wsUrl: 'wss://x.example/ws',
      },
      color: null,
      order: 0,
      updatedAt: 0,
      version: 1,
    });
    expect(xmpp).toMatchObject({
      protocol: 'xmpp',
      label: 'Work',
      jid: 'ada@example.org',
      host: 'x.example.org',
      port: '5223',
      security: 'starttls',
      wsUrl: 'wss://x.example/ws',
      password: '',
    });

    const irc = accountFormFromAccount({
      id: 'libera',
      label: 'Libera',
      displayName: '',
      server: { protocol: 'irc', server: 'irc.libera.chat', port: 6697, tls: true, nick: 'ada', sasl: true },
      color: null,
      order: 0,
      updatedAt: 0,
      version: 1,
    });
    expect(irc).toMatchObject({
      protocol: 'irc',
      host: 'irc.libera.chat',
      port: '6697',
      ircTls: true,
      nick: 'ada',
      password: '',
    });

    const matrix = accountFormFromAccount({
      id: 'matrix',
      label: 'Matrix',
      displayName: '',
      server: { protocol: 'matrix', homeserverUrl: 'https://matrix.example.org', userId: '@ada:example.org' },
      color: null,
      order: 0,
      updatedAt: 0,
      version: 1,
    });
    expect(matrix).toMatchObject({
      protocol: 'matrix',
      homeserverUrl: 'https://matrix.example.org',
      userId: '@ada:example.org',
      password: '',
    });
  });
});

describe('validateIrcAccountForm', () => {
  const filledIrc = () => ({
    ...emptyAccountForm(),
    protocol: 'irc' as const,
    label: 'Libera',
    nick: 'ada',
    host: 'irc.libera.chat',
    port: '6697',
  });

  it('reports every missing / malformed field, port required unlike XMPP', () => {
    const result = validateIrcAccountForm(emptyAccountForm(), IRC_MSG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      label: 'label',
      nick: 'nick-req',
      host: 'host-req',
      port: 'port-req',
    });
  });

  it('rejects a nick with whitespace', () => {
    const result = validateIrcAccountForm({ ...filledIrc(), nick: 'a b' }, IRC_MSG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.nick).toBe('nick-req');
  });

  it('rejects an out-of-range port distinctly from a blank one', () => {
    const result = validateIrcAccountForm({ ...filledIrc(), port: '99999' }, IRC_MSG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.port).toBe('port-bad');
  });

  it('accepts a minimal valid form: no password means no SASL', () => {
    const result = validateIrcAccountForm(filledIrc(), IRC_MSG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.id).toBe('libera');
    expect(result.account.server).toMatchObject({
      protocol: 'irc',
      server: 'irc.libera.chat',
      port: 6697,
      tls: true,
      nick: 'ada',
      sasl: false,
    });
    expect(result.secret).toBe('');
    expect(
      ChatAccountSchema.safeParse({
        ...result.account,
        secretRef: `chat:${result.account.id}`,
        updatedAt: 0,
        version: 1,
      }).success,
    ).toBe(true);
  });

  it('a non-blank password opts into SASL', () => {
    const result = validateIrcAccountForm({ ...filledIrc(), password: 'sekret' }, IRC_MSG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.server).toMatchObject({ sasl: true });
    expect(result.secret).toBe('sekret');
  });

  it('editing with a blank password preserves the existing sasl/mechanism instead of turning SASL off', () => {
    // The form has no toggle for sasl/saslMechanism/preSaslAuth — it only ever infers `sasl` from
    // whether a password was typed. Blindly reapplying that inference on an edit would silently
    // disable SASL for any account that had it, every time you edited anything else about the row.
    const existing: ExistingAccountRef = {
      id: 'libera',
      color: null,
      order: 0,
      server: {
        protocol: 'irc',
        server: 'irc.libera.chat',
        port: 6697,
        tls: true,
        nick: 'ada',
        sasl: true,
        saslMechanism: 'external',
      },
    };
    const result = validateIrcAccountForm({ ...filledIrc(), password: '' }, IRC_MSG, existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.server).toMatchObject({ sasl: true, saslMechanism: 'external' });
    expect(result.secret).toBeNull();
  });

  it('editing and typing a new password still opts into SASL (plain), overriding whatever was there', () => {
    const existing: ExistingAccountRef = {
      id: 'libera',
      color: null,
      order: 0,
      server: { protocol: 'irc', server: 'irc.libera.chat', port: 6697, tls: true, nick: 'ada', sasl: false },
    };
    const result = validateIrcAccountForm({ ...filledIrc(), password: 'new-pw' }, IRC_MSG, existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.server).toMatchObject({ sasl: true });
    expect(result.secret).toBe('new-pw');
  });
});

describe('validateMatrixAccountForm', () => {
  const filledMatrix = () => ({
    ...emptyAccountForm(),
    protocol: 'matrix' as const,
    label: 'Matrix',
    homeserverUrl: 'https://matrix.example.org',
    userId: '@ada:example.org',
    password: 'sekret',
  });

  it('reports every missing / malformed field', () => {
    const result = validateMatrixAccountForm(emptyAccountForm(), MATRIX_MSG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      label: 'label',
      homeserverUrl: 'hs-req',
      userId: 'uid-req',
      password: 'pw',
    });
  });

  it('rejects a homeserver URL that is not https://', () => {
    const result = validateMatrixAccountForm(
      { ...filledMatrix(), homeserverUrl: 'http://matrix.example.org' },
      MATRIX_MSG,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.homeserverUrl).toBe('hs-bad');
  });

  it('rejects a user id with no leading @ or no server part', () => {
    const result = validateMatrixAccountForm({ ...filledMatrix(), userId: 'ada' }, MATRIX_MSG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.userId).toBe('uid-bad');
  });

  it('accepts a minimal valid form and derives id + a schema-valid account', () => {
    const result = validateMatrixAccountForm(filledMatrix(), MATRIX_MSG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.id).toBe('matrix');
    expect(result.account.server).toEqual({
      protocol: 'matrix',
      homeserverUrl: 'https://matrix.example.org',
      userId: '@ada:example.org',
    });
    expect(result.secret).toBe('sekret');
    expect(
      ChatAccountSchema.safeParse({
        ...result.account,
        secretRef: `chat:${result.account.id}`,
        updatedAt: 0,
        version: 1,
      }).success,
    ).toBe(true);
  });
});

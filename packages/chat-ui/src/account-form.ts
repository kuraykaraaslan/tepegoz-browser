import {
  CHAT_ACCOUNT_ID_MAX,
  CHAT_ACCOUNT_ID_PATTERN,
  ChatAccountSchema,
  type ChatAccount,
} from '@tepegoz/shared-types';

/**
 * The pure model behind `<AccountSetupForm>` — one shared field set + a `protocol` switch, so the
 * component can branch its rendered fields without three separate form components. Each protocol
 * gets its own `validate*AccountForm` (below), producing a persist-ready {@link ChatAccount} draft
 * (minus the vault `secretRef` / sync-meta the host fills in) plus the plaintext secret that crosses
 * once.
 */

export const ACCOUNT_FORM_PROTOCOLS = ['xmpp', 'irc', 'matrix'] as const;
export type AccountFormProtocol = (typeof ACCOUNT_FORM_PROTOCOLS)[number];

export type AccountFormField =
  | 'label'
  | 'jid'
  | 'password'
  | 'host'
  | 'port'
  | 'security'
  | 'wsUrl'
  | 'nick'
  | 'ircTls'
  | 'homeserverUrl'
  | 'userId';

export interface AccountFormState {
  protocol: AccountFormProtocol;
  label: string;
  /** XMPP identity. */
  jid: string;
  /** XMPP / IRC (optional — blank connects without SASL) / Matrix (required) secret. */
  password: string;
  /** XMPP advanced host, or the IRC server address. Blank XMPP host means "resolve via SRV". */
  host: string;
  /** XMPP advanced port, or the IRC port. */
  port: string;
  /** XMPP direct-TLS vs STARTTLS. */
  security: 'tls' | 'starttls';
  /** XMPP advanced WebSocket endpoint. */
  wsUrl: string;
  /** IRC nickname. */
  nick: string;
  /** IRC — connect over TLS (the default; off only for a plaintext-only local test server). */
  ircTls: boolean;
  /** Matrix homeserver base URL — must be `https://`. */
  homeserverUrl: string;
  /** Matrix full user id (`@user:server`). */
  userId: string;
}

export function emptyAccountForm(): AccountFormState {
  return {
    protocol: 'xmpp',
    label: '',
    jid: '',
    password: '',
    host: '',
    port: '',
    security: 'tls',
    wsUrl: '',
    nick: '',
    ircTls: true,
    homeserverUrl: '',
    userId: '',
  };
}

/** A stable, pattern-valid account id derived from the label (or the JID's local part as a fallback). */
export function deriveAccountId(seed: string): string {
  const slug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CHAT_ACCOUNT_ID_MAX)
    .replace(/-+$/g, '');
  return CHAT_ACCOUNT_ID_PATTERN.test(slug) ? slug : 'account';
}

export type AccountFormErrors = Partial<Record<AccountFormField, string>>;

/**
 * Passed to `validate*AccountForm` when editing rather than adding: keeps the account's identity
 * (`id` is how the caller's `upsertAccount` recognizes "this row", not a fresh one), cosmetic fields
 * (`color`/`order`) stable, and — via `server` — lets a validator recover a protocol-specific field
 * the form itself has no control for (IRC's `sasl`/`saslMechanism`/`preSaslAuth`, inferred from
 * whether a password was typed everywhere else) instead of silently resetting it.
 */
export interface ExistingAccountRef {
  id: string;
  color: string | null;
  order: number;
  server: ChatAccount['server'];
}

export type AccountFormResult =
  | {
      ok: true;
      account: Omit<ChatAccount, 'secretRef' | 'updatedAt' | 'version'>;
      /** `null` only in edit mode with the password field left blank — "keep the vault's existing
       *  secret". A non-null value (including `''`, still valid for IRC's no-auth case) means "set
       *  the secret to this". Add mode never produces `null`. */
      secret: string | null;
    }
  | { ok: false; errors: AccountFormErrors };

/** Rebuild the editable form fields from a persisted account — the password is deliberately left
 *  blank (the vault secret never round-trips to the renderer); leaving it blank on submit means
 *  "keep it unchanged", see {@link AccountFormResult}. `server.protocol` must be one of
 *  {@link ACCOUNT_FORM_PROTOCOLS} — the caller is expected to have filtered out `bridge` accounts,
 *  which this form does not support editing (or creating) at all. */
export function accountFormFromAccount(account: Omit<ChatAccount, 'secretRef'>): AccountFormState {
  const form = emptyAccountForm();
  form.label = account.label;
  const server = account.server;
  if (server.protocol === 'xmpp') {
    form.protocol = 'xmpp';
    form.jid = server.jid;
    form.host = server.host ?? '';
    form.port = server.port !== null ? String(server.port) : '';
    form.security = server.security;
    form.wsUrl = server.wsUrl ?? '';
  } else if (server.protocol === 'irc') {
    form.protocol = 'irc';
    form.host = server.server;
    form.port = String(server.port);
    form.ircTls = server.tls;
    form.nick = server.nick;
  } else if (server.protocol === 'matrix') {
    form.protocol = 'matrix';
    form.homeserverUrl = server.homeserverUrl;
    form.userId = server.userId;
  }
  return form;
}

interface XmppValidateMessages {
  labelRequired: string;
  jidRequired: string;
  jidInvalid: string;
  passwordRequired: string;
  portInvalid: string;
  wsUrlInvalid: string;
}

interface IrcValidateMessages {
  labelRequired: string;
  nickRequired: string;
  hostRequired: string;
  portRequired: string;
  portInvalid: string;
}

interface MatrixValidateMessages {
  labelRequired: string;
  homeserverUrlRequired: string;
  homeserverUrlInvalid: string;
  userIdRequired: string;
  userIdInvalid: string;
  passwordRequired: string;
}

function portValue(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : undefined;
}

/**
 * Validate the XMPP form. Field-level checks first (so the form can highlight inputs), then a
 * `ChatAccountSchema` safeParse as the backstop — the same schema the IPC boundary re-checks.
 */
export function validateXmppAccountForm(
  state: AccountFormState,
  messages: XmppValidateMessages,
  existing?: ExistingAccountRef,
): AccountFormResult {
  const errors: AccountFormErrors = {};

  const label = state.label.trim();
  if (label === '') errors.label = messages.labelRequired;

  const jid = state.jid.trim();
  if (jid === '') errors.jid = messages.jidRequired;
  else if (!/^[^\s@/]+@[^\s@/]+$/.test(jid)) errors.jid = messages.jidInvalid;

  // Editing: a blank password means "keep the vault's existing one", not "no password" — required
  // only when there is nothing already stored to fall back to (adding a new account).
  if (existing === undefined && state.password === '') errors.password = messages.passwordRequired;

  const port = portValue(state.port);
  if (port === undefined) errors.port = messages.portInvalid;

  const host = state.host.trim();
  const wsUrl = state.wsUrl.trim();
  if (wsUrl !== '') {
    try {
      new URL(wsUrl);
    } catch {
      errors.wsUrl = messages.wsUrlInvalid;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const id = existing?.id ?? deriveAccountId(label || jid.split('@')[0] || 'account');
  const draft = {
    id,
    label,
    displayName: '',
    server: {
      protocol: 'xmpp' as const,
      jid,
      host: host === '' ? null : host,
      port: port ?? null,
      security: state.security,
      wsUrl: wsUrl === '' ? null : wsUrl,
    },
    color: existing?.color ?? null,
    order: existing?.order ?? 0,
  };

  const parsed = ChatAccountSchema.safeParse({
    ...draft,
    secretRef: `chat:${id}`,
    updatedAt: 0,
    version: 1,
  });
  if (!parsed.success) {
    // Field checks passed but the schema still rejected — surface it on the JID, the identity field.
    return { ok: false, errors: { jid: messages.jidInvalid } };
  }

  return {
    ok: true,
    account: draft,
    secret: existing !== undefined && state.password === '' ? null : state.password,
  };
}

/**
 * Validate the IRC form. Unlike XMPP, `port` is required (the schema has no SRV-style fallback) and
 * `password` is optional — blank connects without authentication, a non-blank password opts into
 * SASL PLAIN (the common case for a modern network); `saslMechanism` / `preSaslAuth` are left at
 * their schema defaults, which is exactly `sasl: true` + implicit PLAIN, or `sasl: false` + implicit
 * `PASS`-on-connect if a network needs that instead of SASL (not offered here — advanced enough to
 * not need a UI shortcut yet).
 */
export function validateIrcAccountForm(
  state: AccountFormState,
  messages: IrcValidateMessages,
  existing?: ExistingAccountRef,
): AccountFormResult {
  const errors: AccountFormErrors = {};

  const label = state.label.trim();
  if (label === '') errors.label = messages.labelRequired;

  const nick = state.nick.trim();
  if (nick === '' || /\s/.test(nick)) errors.nick = messages.nickRequired;

  const host = state.host.trim();
  if (host === '') errors.host = messages.hostRequired;

  const portRaw = state.port.trim();
  if (portRaw === '') {
    errors.port = messages.portRequired;
  } else {
    const port = portValue(state.port);
    if (port === undefined || port === null) errors.port = messages.portInvalid;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const port = Number(portRaw);
  const id = existing?.id ?? deriveAccountId(label || nick || 'account');
  const existingIrc = existing?.server.protocol === 'irc' ? existing.server : undefined;
  // Typing a password (add, or edit changing it) opts into SASL, same as before; editing with the
  // password left blank keeps whatever SASL config was already there instead of silently turning it
  // off — the form has no toggle for `sasl`/`saslMechanism`/`preSaslAuth`, so this is the only place
  // that would otherwise happen.
  const sasl = state.password !== '' ? true : (existingIrc?.sasl ?? false);
  const draft = {
    id,
    label,
    displayName: '',
    server: {
      protocol: 'irc' as const,
      server: host,
      port,
      tls: state.ircTls,
      nick,
      sasl,
      ...(existingIrc?.saslMechanism !== undefined
        ? { saslMechanism: existingIrc.saslMechanism }
        : {}),
      ...(existingIrc?.preSaslAuth !== undefined ? { preSaslAuth: existingIrc.preSaslAuth } : {}),
    },
    color: existing?.color ?? null,
    order: existing?.order ?? 0,
  };

  const parsed = ChatAccountSchema.safeParse({
    ...draft,
    secretRef: `chat:${id}`,
    updatedAt: 0,
    version: 1,
  });
  if (!parsed.success) return { ok: false, errors: { nick: messages.nickRequired } };

  return {
    ok: true,
    account: draft,
    secret: existing !== undefined && state.password === '' ? null : state.password,
  };
}

/**
 * Validate the Matrix form. Unlike IRC, a password is always required — the CS-API has no
 * unauthenticated messaging path.
 */
export function validateMatrixAccountForm(
  state: AccountFormState,
  messages: MatrixValidateMessages,
  existing?: ExistingAccountRef,
): AccountFormResult {
  const errors: AccountFormErrors = {};

  const label = state.label.trim();
  if (label === '') errors.label = messages.labelRequired;

  const homeserverUrl = state.homeserverUrl.trim();
  if (homeserverUrl === '') {
    errors.homeserverUrl = messages.homeserverUrlRequired;
  } else {
    try {
      new URL(homeserverUrl);
      if (!/^https:\/\//i.test(homeserverUrl)) errors.homeserverUrl = messages.homeserverUrlInvalid;
    } catch {
      errors.homeserverUrl = messages.homeserverUrlInvalid;
    }
  }

  const userId = state.userId.trim();
  if (userId === '') errors.userId = messages.userIdRequired;
  else if (!/^@[^:@\s]+:\S+$/.test(userId)) errors.userId = messages.userIdInvalid;

  if (existing === undefined && state.password === '') errors.password = messages.passwordRequired;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const id = existing?.id ?? deriveAccountId(label || userId.replace(/^@/, '').split(':')[0] || 'account');
  const draft = {
    id,
    label,
    displayName: '',
    server: { protocol: 'matrix' as const, homeserverUrl, userId },
    color: existing?.color ?? null,
    order: existing?.order ?? 0,
  };

  const parsed = ChatAccountSchema.safeParse({
    ...draft,
    secretRef: `chat:${id}`,
    updatedAt: 0,
    version: 1,
  });
  if (!parsed.success) return { ok: false, errors: { userId: messages.userIdInvalid } };

  return {
    ok: true,
    account: draft,
    secret: existing !== undefined && state.password === '' ? null : state.password,
  };
}

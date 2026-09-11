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

export type AccountFormResult =
  | { ok: true; account: Omit<ChatAccount, 'secretRef' | 'updatedAt' | 'version'>; secret: string }
  | { ok: false; errors: AccountFormErrors };

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
): AccountFormResult {
  const errors: AccountFormErrors = {};

  const label = state.label.trim();
  if (label === '') errors.label = messages.labelRequired;

  const jid = state.jid.trim();
  if (jid === '') errors.jid = messages.jidRequired;
  else if (!/^[^\s@/]+@[^\s@/]+$/.test(jid)) errors.jid = messages.jidInvalid;

  if (state.password === '') errors.password = messages.passwordRequired;

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

  const id = deriveAccountId(label || jid.split('@')[0] || 'account');
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
    color: null,
    order: 0,
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

  return { ok: true, account: draft, secret: state.password };
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
  const id = deriveAccountId(label || nick || 'account');
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
      sasl: state.password !== '',
    },
    color: null,
    order: 0,
  };

  const parsed = ChatAccountSchema.safeParse({
    ...draft,
    secretRef: `chat:${id}`,
    updatedAt: 0,
    version: 1,
  });
  if (!parsed.success) return { ok: false, errors: { nick: messages.nickRequired } };

  return { ok: true, account: draft, secret: state.password };
}

/**
 * Validate the Matrix form. Unlike IRC, a password is always required — the CS-API has no
 * unauthenticated messaging path.
 */
export function validateMatrixAccountForm(
  state: AccountFormState,
  messages: MatrixValidateMessages,
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

  if (state.password === '') errors.password = messages.passwordRequired;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const id = deriveAccountId(label || userId.replace(/^@/, '').split(':')[0] || 'account');
  const draft = {
    id,
    label,
    displayName: '',
    server: { protocol: 'matrix' as const, homeserverUrl, userId },
    color: null,
    order: 0,
  };

  const parsed = ChatAccountSchema.safeParse({
    ...draft,
    secretRef: `chat:${id}`,
    updatedAt: 0,
    version: 1,
  });
  if (!parsed.success) return { ok: false, errors: { userId: messages.userIdInvalid } };

  return { ok: true, account: draft, secret: state.password };
}

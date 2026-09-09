import {
  CHAT_ACCOUNT_ID_MAX,
  CHAT_ACCOUNT_ID_PATTERN,
  ChatAccountSchema,
  type ChatAccount,
} from '@tepegoz/shared-types';

/**
 * The pure model behind `<AccountSetupForm>`. Only XMPP is wired today (the sole shipped adapter), so
 * this validates the XMPP field set into a persist-ready {@link ChatAccount} draft (minus the vault
 * `secretRef` / sync-meta the host fills in) plus the plaintext secret that crosses once.
 */

export type AccountFormField =
  | 'label'
  | 'jid'
  | 'password'
  | 'host'
  | 'port'
  | 'security'
  | 'wsUrl';

export interface AccountFormState {
  label: string;
  jid: string;
  password: string;
  /** Advanced — blank means "resolve via SRV". */
  host: string;
  port: string;
  security: 'tls' | 'starttls';
  wsUrl: string;
}

export function emptyAccountForm(): AccountFormState {
  return { label: '', jid: '', password: '', host: '', port: '', security: 'tls', wsUrl: '' };
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

interface ValidateMessages {
  labelRequired: string;
  jidRequired: string;
  jidInvalid: string;
  passwordRequired: string;
  portInvalid: string;
  wsUrlInvalid: string;
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
  messages: ValidateMessages,
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

/**
 * Protocol address parsing — the three shapes the native adapters speak. Pure, total (returns `null`
 * on anything unparseable rather than throwing), and bounded (a hostile peer cannot hand us a
 * megabyte "nick").
 *
 * - **XMPP JID**: `local@domain/resource`, `local` and `resource` optional (`domain` alone is a
 *   server JID; `domain/resource` is a connected server resource).
 * - **IRC prefix**: `nick!user@host`, `user`/`host` optional (a server message has just a servername).
 * - **Matrix id**: `@user:server` (user), `#alias:server` (room alias), `!opaque:server` (room id).
 */

const MAX_ADDR = 512;

export interface Jid {
  local: string | null;
  domain: string;
  resource: string | null;
}

/** Parse an XMPP JID. `domain` is required; `local`/`resource` may be absent. */
export function parseJid(input: string): Jid | null {
  if (input.length === 0 || input.length > MAX_ADDR || /\s/.test(input)) return null;
  let rest = input;
  let local: string | null = null;
  let resource: string | null = null;

  const at = rest.indexOf('@');
  if (at !== -1) {
    local = rest.slice(0, at);
    rest = rest.slice(at + 1);
    if (local.length === 0) return null;
  }

  const slash = rest.indexOf('/');
  if (slash !== -1) {
    resource = rest.slice(slash + 1);
    rest = rest.slice(0, slash);
  }

  const domain = rest;
  if (domain.length === 0 || domain.includes('@') || domain.includes(' ')) return null;
  return { local, domain, resource };
}

/** `local@domain` — the routable, resource-less form used as a conversation address. */
export function bareJid(input: string | Jid): string | null {
  const jid = typeof input === 'string' ? parseJid(input) : input;
  if (jid === null) return null;
  return jid.local === null ? jid.domain : `${jid.local}@${jid.domain}`;
}

export function formatJid(jid: Jid): string {
  const bare = jid.local === null ? jid.domain : `${jid.local}@${jid.domain}`;
  return jid.resource === null ? bare : `${bare}/${jid.resource}`;
}

export interface IrcPrefix {
  nick: string;
  user: string | null;
  host: string | null;
}

/** Parse an IRC message prefix (`nick!user@host`, or a bare servername → treated as `nick`). */
export function parseIrcPrefix(input: string): IrcPrefix | null {
  if (input.length === 0 || input.length > MAX_ADDR || input.includes(' ')) return null;
  let rest = input.startsWith(':') ? input.slice(1) : input;
  let user: string | null = null;
  let host: string | null = null;

  const bang = rest.indexOf('!');
  if (bang !== -1) {
    const afterNick = rest.slice(bang + 1);
    rest = rest.slice(0, bang);
    const at = afterNick.indexOf('@');
    if (at !== -1) {
      user = afterNick.slice(0, at);
      host = afterNick.slice(at + 1);
    } else {
      user = afterNick;
    }
  } else {
    const at = rest.indexOf('@');
    if (at !== -1) {
      host = rest.slice(at + 1);
      rest = rest.slice(0, at);
    }
  }

  if (rest.length === 0) return null;
  return { nick: rest, user, host };
}

export type MatrixIdKind = 'user' | 'room' | 'alias';

export interface MatrixId {
  kind: MatrixIdKind;
  localpart: string;
  server: string;
}

const MATRIX_SIGILS: Record<string, MatrixIdKind> = { '@': 'user', '!': 'room', '#': 'alias' };

/** Parse a Matrix identifier (`@user:server`, `!id:server`, `#alias:server`). */
export function parseMatrixId(input: string): MatrixId | null {
  if (input.length < 4 || input.length > MAX_ADDR) return null;
  const sigil = input[0] ?? '';
  const kind = MATRIX_SIGILS[sigil];
  if (kind === undefined) return null;
  const colon = input.indexOf(':');
  if (colon <= 1) return null;
  const localpart = input.slice(1, colon);
  const server = input.slice(colon + 1);
  if (localpart.length === 0 || server.length === 0 || server.includes(':')) return null;
  return { kind, localpart, server };
}

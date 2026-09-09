/**
 * IRC line parsing (RFC 1459 / 2812 + IRCv3 `message-tags`). Pure and bounded — an IRC server is
 * attacker-influenced (any user can send you a PRIVMSG), so a line that is too long, has too many
 * params, or is malformed returns `null` rather than throwing.
 *
 * Grammar: `[@tags ][:prefix ]command[ params…][ :trailing]`
 */

/** IRCv3 caps a message at 8191 bytes + 4096 for the tag section — a bit of slack over that. */
export const IRC_MAX_LINE = 8703;
const MAX_PARAMS = 15;
const MAX_TAGS = 64;

export interface IrcMessage {
  /** IRCv3 message tags, unescaped. Absent tags → empty object. */
  tags: Readonly<Record<string, string>>;
  /** The source prefix without the leading `:` (`nick!user@host` or a server name), or `null`. */
  prefix: string | null;
  /** Uppercased for a word command; a 3-digit string for a numeric reply. */
  command: string;
  params: readonly string[];
}

const TAG_UNESCAPE: Record<string, string> = {
  ':': ';',
  s: ' ',
  '\\': '\\',
  r: '\r',
  n: '\n',
};

function unescapeTagValue(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1] ?? '';
      out += TAG_UNESCAPE[next] ?? next;
      i += 1;
    } else if (ch !== undefined) {
      out += ch;
    }
  }
  return out;
}

function parseTags(section: string): Record<string, string> | null {
  const tags: Record<string, string> = {};
  const parts = section.split(';');
  if (parts.length > MAX_TAGS) return null;
  for (const part of parts) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    if (key === '') return null;
    tags[key] = eq === -1 ? '' : unescapeTagValue(part.slice(eq + 1));
  }
  return tags;
}

export function parseIrcLine(line: string): IrcMessage | null {
  let rest = line.replace(/\r?\n$/, '');
  if (rest.length === 0 || rest.length > IRC_MAX_LINE) return null;

  let tags: Record<string, string> = {};
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    if (sp === -1) return null;
    const parsed = parseTags(rest.slice(1, sp));
    if (parsed === null) return null;
    tags = parsed;
    rest = rest.slice(sp + 1).replace(/^ +/, '');
  }

  let prefix: string | null = null;
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ');
    if (sp === -1) return null;
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1).replace(/^ +/, '');
  }

  if (rest.length === 0) return null;

  const params: string[] = [];
  let command: string | null = null;
  while (rest.length > 0) {
    if (rest.startsWith(':')) {
      params.push(rest.slice(1));
      break;
    }
    const sp = rest.indexOf(' ');
    const token = sp === -1 ? rest : rest.slice(0, sp);
    rest = sp === -1 ? '' : rest.slice(sp + 1).replace(/^ +/, '');
    if (command === null) command = token;
    else params.push(token);
    if (params.length > MAX_PARAMS) return null;
  }

  if (command === null || command.length === 0) return null;
  return {
    tags,
    prefix,
    command: /^\d{3}$/.test(command) ? command : command.toUpperCase(),
    params,
  };
}

/**
 * Build an outbound line. The final param is sent as the `:trailing` argument when it is empty,
 * contains a space, or starts with `:` (so it round-trips through {@link parseIrcLine}).
 */
export function formatIrcLine(command: string, params: readonly string[] = []): string {
  const parts = [command];
  params.forEach((param, i) => {
    const last = i === params.length - 1;
    if (last && (param === '' || param.includes(' ') || param.startsWith(':'))) {
      parts.push(`:${param}`);
    } else {
      parts.push(param);
    }
  });
  return parts.join(' ');
}

/**
 * Parse an `RPL_ISUPPORT` (005) parameter list into a token map. `KEY=value` → `value`, bare `KEY`
 * → `true`, `-KEY` (a reset) → `false`. The trailing human-readable "are supported…" param is
 * ignored (it has no `=` and a space — but 005 params never have spaces, so it is simply the last
 * one, which we skip by requiring the token to look like an ISUPPORT key).
 */
export function parseIsupport(params: readonly string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  // params[0] is our nick; the last param is the "are supported by this server" blurb.
  for (const token of params.slice(1, -1)) {
    if (!/^-?[A-Za-z0-9]+(=.*)?$/.test(token)) continue;
    if (token.startsWith('-')) {
      out[token.slice(1)] = false;
      continue;
    }
    const eq = token.indexOf('=');
    if (eq === -1) out[token] = true;
    else out[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return out;
}

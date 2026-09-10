import type { MailAddress } from '@tepegoz/shared-types';

/**
 * RFC 5322 address-header parsing / formatting — pure, total, tolerant.
 *
 * `From:` / `To:` / `Cc:` values are attacker-influenced and famously irregular (obs-routing, bare
 * comments, `"Doe, John" <j@x>`, groups, folded whitespace). `parseAddressList` never throws: an
 * unparseable fragment is either recovered as best it can or dropped, never propagated as an error.
 * A group (`Managers: a@x, b@x;`) is flattened to its members — the group name is not an address.
 */

const MAX_HEADER = 64 * 1024;
const MAX_ADDRESSES = 1024;

/** Strip RFC 5322 `(…)` comments, honouring `\)` escapes and one level of nesting is enough in practice. */
function stripComments(input: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (ch === '\\' && i + 1 < input.length) {
      if (depth === 0) out += ch + input[i + 1];
      i += 1;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')' && depth > 0) {
      depth -= 1;
      continue;
    }
    if (depth === 0) out += ch;
  }
  return out;
}

/** Split on the top-level `,` (address separator) and `;` (group terminator) — not inside `"…"` or `<…>`. */
function splitTop(input: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let inQuote = false;
  let inAngle = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (ch === '\\' && inQuote && i + 1 < input.length) {
      buf += ch + input[i + 1];
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuote = !inQuote;
      buf += ch;
      continue;
    }
    if (!inQuote && ch === '<') inAngle = true;
    if (!inQuote && ch === '>') inAngle = false;
    if (!inQuote && !inAngle && (ch === ',' || ch === ';')) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim().length > 0) parts.push(buf);
  return parts;
}

function unquote(name: string): string {
  const t = name.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return t;
}

/** One `mailbox` production → a `MailAddress`, or `null` when there is no plausible addr-spec. */
function parseOne(raw: string): MailAddress | null {
  const s = raw.trim();
  if (s.length === 0) return null;

  const angle = /^(.*?)<([^<>]*)>\s*$/s.exec(s);
  if (angle !== null) {
    const address = angle[2]!.trim();
    if (address.length === 0) return null;
    return { name: unquote(angle[1] ?? '').trim(), address };
  }

  // Bare addr-spec, possibly with a trailing/leading unquoted phrase (obs form: `j@x (John)` had its
  // comment stripped already; `John j@x` is ambiguous — take the last whitespace-run as the address).
  const tokens = s.split(/\s+/).filter((t) => t.length > 0);
  const last = tokens.at(-1) ?? '';
  if (last.includes('@') || tokens.length === 1) {
    const name = tokens.slice(0, -1).join(' ');
    return { name: unquote(name), address: tokens.length === 1 ? tokens[0]! : last };
  }
  return null;
}

/** Parse a full address-header value into a flat list of `{ name, address }`. Deduped by address. */
export function parseAddressList(header: string): MailAddress[] {
  if (typeof header !== 'string' || header.length === 0) return [];
  const decommented = stripComments(header.slice(0, MAX_HEADER)).replace(/\s+/g, ' ').trim();
  // Drop a leading `Group-Name:` from every top-level fragment that carries one.
  const out: MailAddress[] = [];
  const seen = new Set<string>();
  for (const part of splitTop(decommented)) {
    const withoutGroup = part.replace(/^[^",:<>@]+:(?!\/\/)/, '').trim();
    const parsed = parseOne(withoutGroup);
    if (parsed === null) continue;
    const key = parsed.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
    if (out.length >= MAX_ADDRESSES) break;
  }
  return out;
}

const NEEDS_QUOTING = /[()<>[\]:;@\\,."]/;

/** A single `MailAddress` back to header form. Quotes the display name only when it needs it. */
export function formatAddress(a: MailAddress): string {
  const name = (a.name ?? '').trim();
  const addr = (a.address ?? '').trim();
  if (name.length === 0) return addr;
  const display = NEEDS_QUOTING.test(name) ? `"${name.replace(/(["\\])/g, '\\$1')}"` : name;
  return `${display} <${addr}>`;
}

export function formatAddressList(list: readonly MailAddress[]): string {
  return list.map(formatAddress).join(', ');
}

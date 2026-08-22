/**
 * Safe Browsing URL canonicalization and expression generation (Google Safe Browsing v4/v5 §
 * "Canonicalization" and "Suffix/Prefix Expressions").
 *
 * This file is where the privacy property actually lives. The lookup never sends a URL anywhere: it
 * canonicalizes locally, expands the URL into the handful of host/path forms a blocklist could name,
 * hashes each one, and compares only the first four bytes against a local set. Getting the
 * canonicalization wrong breaks that in the direction nobody notices — a URL that canonicalizes
 * differently from the one Google hashed simply never matches, so a phishing page loads and no check
 * appears to have failed.
 *
 * Implemented against the published algorithm rather than a library so it can be tested against the
 * spec's own vectors, which are the only real proof that our hash of `http://3279880203/blah` is the
 * hash Google took of `http://195.127.0.11/blah`.
 */

/** Characters the spec strips outright, wherever they appear. */
const STRIPPED = /[\t\r\n]/g;

/** Percent-escape control characters, high bytes, `#` and `%` — the spec's required escape set. */
function escapeForCanonical(input: string): string {
  let out = '';
  for (const byte of Buffer.from(input, 'utf8')) {
    if (byte <= 0x20 || byte >= 0x7f || byte === 0x23 || byte === 0x25) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
      out += String.fromCharCode(byte);
    }
  }
  return out;
}

/** Percent-unescape repeatedly until it stops changing (the spec says "until no more escapes"). */
function fullyUnescape(input: string): string {
  let current = input;
  for (let i = 0; i < 64; i += 1) {
    const next = current.replace(/%([0-9a-fA-F]{2})/g, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Normalize the many ways an IPv4 address can be written — dotted decimal, a bare 32-bit integer,
 * octal, hex, and short forms like `a.b.c`.
 *
 * This is not pedantry: `http://3279880203/` and `http://0xC0.0x00.0x02.0x01/` reach the same server as
 * their dotted forms, so a blocklist that only matched the pretty spelling would be trivially evaded by
 * writing the number differently.
 */
export function normalizeIpv4(host: string): string | null {
  const parts = host.split('.');
  if (parts.length > 4 || parts.length === 0) return null;

  const values: number[] = [];
  for (const part of parts) {
    if (part.length === 0) return null;
    let value: number;
    if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = parseInt(part.slice(2), 16);
    else if (/^0[0-7]+$/.test(part)) value = parseInt(part.slice(1), 8);
    else if (/^\d+$/.test(part)) value = parseInt(part, 10);
    else return null;
    if (!Number.isFinite(value) || value < 0) return null;
    values.push(value);
  }

  // The last component absorbs the remaining bytes: `1.2.3` is 1.2.0.3, `16909060` is 1.2.3.4.
  const leading = values.slice(0, -1);
  const last = values[values.length - 1] ?? 0;
  if (leading.some((v) => v > 255)) return null;
  const remainingBytes = 4 - leading.length;
  if (last >= 2 ** (8 * remainingBytes)) return null;

  const octets = [...leading];
  for (let i = remainingBytes - 1; i >= 0; i -= 1) {
    octets.push((last >>> (8 * i)) & 0xff);
  }
  return octets.join('.');
}

/** Collapse `/./`, resolve `/../`, and squash repeated slashes. Never escapes above the root. */
function canonicalPath(path: string): string {
  const segments = path.split('/');
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  const trailingSlash = path.endsWith('/') || path.endsWith('/.') || path.endsWith('/..');
  return `/${out.join('/')}${out.length > 0 && trailingSlash ? '/' : ''}`;
}

export interface CanonicalUrl {
  /** Lower-cased host, IP-normalized, no leading/trailing or repeated dots. */
  host: string;
  /** Always starts with `/`. */
  path: string;
  /** Query WITHOUT the leading `?`, or null when the URL had none. */
  query: string | null;
}

/**
 * Canonicalize a URL for hashing. Returns null for anything that is not an http(s) URL — the blocklist
 * describes web pages, and quietly canonicalizing a `file:` or `javascript:` URL into something that
 * looks like one would be worse than declining.
 */
export function canonicalizeUrl(rawUrl: string): CanonicalUrl | null {
  const stripped = rawUrl.replace(STRIPPED, '').trim();
  const withoutFragment = stripped.split('#')[0] ?? '';

  let parsed: URL;
  try {
    parsed = new URL(withoutFragment);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  let host = fullyUnescape(parsed.hostname)
    .toLowerCase()
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
  if (host.length === 0) return null;
  host = normalizeIpv4(host) ?? host;

  const path = canonicalPath(fullyUnescape(parsed.pathname));
  // `URL.search` is '' both for "no query" and for a trailing '?', but the spec keeps the '?'. Read the
  // presence of the separator from the input rather than from the parsed value.
  const hasQuery = withoutFragment.includes('?');
  const query = hasQuery ? parsed.search.replace(/^\?/, '') : null;

  return {
    host: escapeForCanonical(host),
    path: escapeForCanonical(path),
    query: query === null ? null : escapeForCanonical(fullyUnescape(query)),
  };
}

/** Whether the host is a literal IPv4 address (the spec skips host-suffix expansion for those). */
function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * The host forms to check: the exact hostname plus up to four more, formed by starting at the last five
 * components and dropping the leading one each time. A bare IP expands to itself only — there is no
 * "parent domain" of an address.
 */
export function hostSuffixes(host: string): string[] {
  if (isIpv4(host)) return [host];
  const parts = host.split('.');
  const out = [host];
  // Start at the last five components, then successively drop the leading one, stopping before the TLD.
  const start = Math.max(0, parts.length - 5);
  for (let i = start; i < parts.length - 1; i += 1) {
    const candidate = parts.slice(i).join('.');
    if (candidate !== host && !out.includes(candidate)) out.push(candidate);
  }
  return out;
}

/**
 * The path forms to check: the exact path with query, the exact path without it, then the root and up to
 * four successively deeper directory prefixes.
 */
export function pathPrefixes(path: string, query: string | null): string[] {
  const out: string[] = [];
  if (query !== null) out.push(`${path}?${query}`);
  out.push(path);

  // Only DIRECTORY components expand. A path ending in a file name contributes its directories, not
  // itself: the spec's example for `a.b.c/1/2.html` lists `/1/` and `/`, never `/1/2.html/`.
  const segments = path.split('/').filter((s) => s.length > 0);
  const directories = path.endsWith('/') ? segments : segments.slice(0, -1);
  const dirs = ['/'];
  for (let i = 0; i < Math.min(directories.length, 4); i += 1) {
    dirs.push(`/${directories.slice(0, i + 1).join('/')}/`);
  }
  for (const d of dirs) if (!out.includes(d)) out.push(d);
  return out;
}

/**
 * Every host/path combination a blocklist entry could name for this URL — at most 30, per the spec.
 *
 * This is the whole reason a prefix lookup can be private: instead of asking "is this URL bad", the
 * client asks "do any of these 30 four-byte numbers appear in a local set", and the answer never leaves
 * the machine.
 */
export function urlExpressions(rawUrl: string): string[] {
  const canonical = canonicalizeUrl(rawUrl);
  if (canonical === null) return [];
  const out: string[] = [];
  for (const host of hostSuffixes(canonical.host)) {
    for (const path of pathPrefixes(canonical.path, canonical.query)) {
      const expression = `${host}${path}`;
      if (!out.includes(expression)) out.push(expression);
      if (out.length >= 30) return out;
    }
  }
  return out;
}

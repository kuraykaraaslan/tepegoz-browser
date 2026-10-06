/**
 * Byte / charset / transfer-encoding plumbing for the MIME parser: latin1 domain helpers, tolerant
 * base64 + quoted-printable, RFC 2047 encoded-words and RFC 3676 `format=flowed` unfolding.
 */

const CHARSET_ALIASES: Readonly<Record<string, string>> = {
  utf8: 'utf-8',
  'utf-8': 'utf-8',
  'us-ascii': 'windows-1252',
  ascii: 'windows-1252',
  latin1: 'iso-8859-1',
  'latin-1': 'iso-8859-1',
  cp1252: 'windows-1252',
  cp1254: 'windows-1254',
  'x-unknown': 'utf-8',
  unknown: 'utf-8',
  'unknown-8bit': 'utf-8',
};

export function toLatin1(input: string | Uint8Array): string {
  if (typeof input === 'string') {
    // Already one-char-per-byte? keep it. Otherwise it is decoded unicode — re-encode as UTF-8.
    let latin1Safe = true;
    for (let i = 0; i < input.length; i += 1) {
      if (input.charCodeAt(i) > 0xff) {
        latin1Safe = false;
        break;
      }
    }
    if (latin1Safe) return input;
    return toLatin1(new TextEncoder().encode(input));
  }
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < input.length; i += CHUNK) {
    out += String.fromCharCode(...input.subarray(i, Math.min(i + CHUNK, input.length)));
  }
  return out;
}

export function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function decodeCharset(bytes: Uint8Array, charset: string): string {
  const label = CHARSET_ALIASES[charset] ?? charset;
  for (const candidate of [label, 'utf-8', 'iso-8859-1']) {
    try {
      return new TextDecoder(candidate, { fatal: false }).decode(bytes);
    } catch {
      // try the next fallback
    }
  }
  return toLatin1(bytes);
}

/** Tolerant base64 — ignores whitespace and any non-alphabet byte, handles missing padding. */
export function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lut = new Int16Array(256).fill(-1);
  for (let i = 0; i < alphabet.length; i += 1) lut[alphabet.charCodeAt(i)] = i;
  const outLen = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const v = lut[clean.charCodeAt(i)]!;
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o] = (acc >> bits) & 0xff;
      o += 1;
    }
  }
  return o === out.length ? out : out.subarray(0, o);
}

/** RFC 2045 quoted-printable body decode (soft breaks, `=XX`; `_` is a literal here, not a space). */
export function decodeQuotedPrintable(input: string): Uint8Array {
  const withoutSoftBreaks = input.replace(/=[ \t]*\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < withoutSoftBreaks.length; i += 1) {
    const ch = withoutSoftBreaks[i]!;
    if (ch === '=' && i + 2 < withoutSoftBreaks.length) {
      const hex = withoutSoftBreaks.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        out.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    out.push(ch.charCodeAt(0) & 0xff);
  }
  return Uint8Array.from(out);
}

export function normaliseNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function decodeWord(charset: string, enc: string, text: string): string {
  const cs = charset.trim().toLowerCase();
  const bytes =
    enc.toLowerCase() === 'b' ? decodeBase64(text) : decodeQuotedPrintable(text.replace(/_/g, ' '));
  return decodeCharset(bytes, cs);
}

/**
 * RFC 2047: decode every `=?charset?B/Q?text?=` token. Whitespace that separates two adjacent
 * encoded-words is removed (RFC 2047 §6.2); whitespace elsewhere is preserved. Malformed tokens are
 * left verbatim.
 */
export function decodeEncodedWords(input: string): string {
  if (typeof input !== 'string' || !input.includes('=?')) return input;
  const re = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g;
  let out = '';
  let last = 0;
  let prevEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const gap = input.slice(last, m.index);
    if (!(prevEnd === last && /^\s*$/.test(gap))) out += gap;
    out += decodeWord(m[1]!, m[2]!, m[3]!);
    last = re.lastIndex;
    prevEnd = last;
  }
  out += input.slice(last);
  return out;
}

// ---------------------------------------------------------------------------
// format=flowed (RFC 3676)
// ---------------------------------------------------------------------------

export function unflow(text: string, delSp: boolean): string {
  const out: string[] = [];
  let acc: string | null = null;
  let accDepth = 0;
  const prefix = (depth: number): string => (depth > 0 ? `${'>'.repeat(depth)} ` : '');
  const flush = (): void => {
    if (acc !== null) {
      out.push(prefix(accDepth) + acc);
      acc = null;
    }
  };
  for (const rawLine of text.split('\n')) {
    let line = rawLine;
    let depth = 0;
    while (line.startsWith('>')) {
      depth += 1;
      line = line.slice(1);
    }
    if (depth > 0 && line.startsWith(' ')) line = line.slice(1);
    if (line === '-- ') {
      flush();
      out.push(`${prefix(depth)}-- `);
      continue;
    }
    if (line.startsWith(' ')) line = line.slice(1); // de-space-stuff
    const flowed = line.endsWith(' ');
    const content = flowed && delSp ? line.slice(0, -1) : line;
    if (acc !== null && depth === accDepth) {
      acc += content;
    } else {
      flush();
      acc = content;
      accDepth = depth;
    }
    if (!flowed) flush();
  }
  flush();
  return out.join('\n');
}

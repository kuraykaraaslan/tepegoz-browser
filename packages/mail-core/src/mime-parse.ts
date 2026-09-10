/**
 * RFC 5322 / 2045–2047 / 2231 / 3676 MIME parsing — pure, total, tolerant.
 *
 * A raw message off an IMAP `FETCH` (or a `.eml` on disk) is remote, hostile and famously
 * malformed. `parseMime` **never throws**: an unparseable `Content-Type`, a missing multipart
 * boundary, an unknown charset or a truncated part each degrades to something usable and records a
 * string in `diagnostics`. Structural scanning is done in the latin1 (one char per byte) domain so
 * an 8-bit body survives to the point a `TextDecoder` can turn it into text; `\r\n` is normalised to
 * `\n` (this core reads mail, it does not re-verify DKIM).
 *
 * Exports:
 *  - `parseMime(raw)`            → the `ParsedMime` tree.
 *  - `decodeEncodedWords(s)`     → RFC 2047 `=?charset?B/Q?…?=` decoding, for header display.
 *  - `iterMimeParts(node)`       → depth-first walk over every node.
 *  - `selectBodyStructure(node)` → `{ text, html, attachments }` with `multipart/alternative`
 *                                  preference resolved (last displayable alternative wins).
 */

export interface MimeHeader {
  /** Lower-cased field name. */
  readonly name: string;
  /** Unfolded raw field body — encoded-words are **not** decoded here. */
  readonly value: string;
}

export interface MimeContentType {
  /** Lower-cased `type/subtype`; `text/plain` when absent or unparseable. */
  readonly mediaType: string;
  readonly type: string;
  readonly subtype: string;
  /** Lower-cased parameter names → values (RFC 2231 continuations already assembled + decoded). */
  readonly params: Readonly<Record<string, string>>;
}

export type MimeEncoding = '7bit' | '8bit' | 'binary' | 'base64' | 'quoted-printable';
export type MimeDisposition = 'inline' | 'attachment';
export type MimeNodeKind = 'leaf' | 'multipart' | 'rfc822';

export interface ParsedMime {
  readonly kind: MimeNodeKind;
  readonly headers: readonly MimeHeader[];
  readonly contentType: MimeContentType;
  readonly encoding: MimeEncoding;
  /** Resolved charset for a text leaf (lower-cased); `utf-8` when unspecified. */
  readonly charset: string;
  readonly disposition: MimeDisposition | null;
  /** Decoded filename (RFC 2047 + RFC 2231), or `null`. */
  readonly filename: string | null;
  /** `Content-ID` with surrounding angle brackets stripped, or `null`. */
  readonly contentId: string | null;
  /** `text/plain; format=flowed` (RFC 3676). */
  readonly flowed: boolean;
  readonly delSp: boolean;
  /** Leaf only — decoded body bytes (after CTE decoding). `null` for containers. */
  readonly bytes: Uint8Array | null;
  /** Leaf `text/*` only — `bytes` decoded with `charset`, flowed-unfolded when applicable. */
  readonly text: string | null;
  /** `multipart/*` only — child parts in document order. */
  readonly parts: readonly ParsedMime[];
  /** `message/rfc822` only — the encapsulated message. */
  readonly encapsulated: ParsedMime | null;
  /** Non-fatal problems: a degraded part, an unknown charset, a missing boundary, … */
  readonly diagnostics: readonly string[];
}

const MAX_INPUT = 50 * 1024 * 1024;
const MAX_DEPTH = 25;
const MAX_PARTS = 1000;

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

// ---------------------------------------------------------------------------
// byte / string plumbing
// ---------------------------------------------------------------------------

function toLatin1(input: string | Uint8Array): string {
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

function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function decodeCharset(bytes: Uint8Array, charset: string): string {
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
function decodeBase64(input: string): Uint8Array {
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
function decodeQuotedPrintable(input: string): Uint8Array {
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

// ---------------------------------------------------------------------------
// headers
// ---------------------------------------------------------------------------

function normaliseNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function splitHeadersBody(message: string): { headerBlock: string; body: string } {
  const idx = message.indexOf('\n\n');
  if (idx < 0) return { headerBlock: message, body: '' };
  return { headerBlock: message.slice(0, idx), body: message.slice(idx + 2) };
}

function parseHeaders(headerBlock: string): MimeHeader[] {
  // Unfold: a CRLF (already \n) immediately followed by WSP is a fold — drop the newline, keep the WSP.
  const unfolded = headerBlock.replace(/\n([ \t])/g, '$1');
  const headers: MimeHeader[] = [];
  for (const line of unfolded.split('\n')) {
    if (line.length === 0) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue; // a continuation that did not fold, or garbage — skip
    const name = line.slice(0, colon).trim().toLowerCase();
    if (!/^[!-9;-~]+$/.test(name)) continue; // RFC 5322 field-name chars
    const value = line.slice(colon + 1).replace(/^[ \t]/, '').replace(/[ \t]+$/, '');
    headers.push({ name, value });
  }
  return headers;
}

function firstHeader(headers: readonly MimeHeader[], name: string): string | null {
  const lower = name.toLowerCase();
  for (const h of headers) if (h.name === lower) return h.value;
  return null;
}

/** Tokenise `; a=b; c="d;e"; f*0="g"; f*1="h"` into raw name/value pairs (quotes stripped, not assembled). */
function parseParameterList(input: string): Array<{ name: string; value: string }> {
  const params: Array<{ name: string; value: string }> = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    while (i < n && (input[i] === ';' || input[i] === ' ' || input[i] === '\t')) i += 1;
    if (i >= n) break;
    let name = '';
    while (i < n && input[i] !== '=' && input[i] !== ';') {
      name += input[i];
      i += 1;
    }
    name = name.trim().toLowerCase();
    if (i < n && input[i] === '=') {
      i += 1;
      let value = '';
      if (input[i] === '"') {
        i += 1;
        while (i < n && input[i] !== '"') {
          if (input[i] === '\\' && i + 1 < n) {
            value += input[i + 1];
            i += 2;
            continue;
          }
          value += input[i];
          i += 1;
        }
        i += 1; // closing quote
      } else {
        while (i < n && input[i] !== ';') {
          value += input[i];
          i += 1;
        }
        value = value.trim();
      }
      if (name.length > 0) params.push({ name, value });
    } else if (name.length > 0) {
      params.push({ name, value: '' });
    }
  }
  return params;
}

function pctDecodeToBytes(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '%' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(s.charCodeAt(i) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** Assemble RFC 2231 continuations + extended (`name*`, `name*0*`, `name*=charset'lang'pct`) params. */
function assembleParameters(raw: Array<{ name: string; value: string }>): Record<string, string> {
  interface Segment {
    index: number;
    value: string;
    extended: boolean;
  }
  const groups = new Map<string, Segment[]>();
  const simple: Record<string, string> = {};

  for (const { name, value } of raw) {
    const m = /^(.*?)\*(\d+)?(\*)?$/.exec(name);
    if (m === null) {
      if (!(name in simple)) simple[name] = decodeEncodedWords(value);
      continue;
    }
    const base = m[1]!;
    const index = m[2] === undefined ? 0 : Number(m[2]);
    const extended = m[3] === '*' || m[2] === undefined;
    const list = groups.get(base) ?? [];
    list.push({ index, value, extended });
    groups.set(base, list);
  }

  const assembled: Record<string, string> = { ...simple };
  for (const [base, segments] of groups) {
    segments.sort((a, b) => a.index - b.index);
    let charset = 'utf-8';
    let anyExtended = false;
    let joined = '';
    for (const seg of segments) {
      let piece = seg.value;
      if (seg.index === 0 && piece.includes("'")) {
        const firstQ = piece.indexOf("'");
        const secondQ = piece.indexOf("'", firstQ + 1);
        if (secondQ > firstQ) {
          const cs = piece.slice(0, firstQ).trim().toLowerCase();
          if (cs.length > 0) charset = cs;
          piece = piece.slice(secondQ + 1);
        }
      }
      if (seg.extended) anyExtended = true;
      joined += piece;
    }
    assembled[base] = anyExtended
      ? decodeCharset(pctDecodeToBytes(joined), charset)
      : decodeEncodedWords(joined);
  }
  return assembled;
}

function parseContentType(value: string | null): { ct: MimeContentType; diagnostics: string[] } {
  const diagnostics: string[] = [];
  if (value === null || value.trim().length === 0) {
    return {
      ct: { mediaType: 'text/plain', type: 'text', subtype: 'plain', params: {} },
      diagnostics,
    };
  }
  const semi = value.indexOf(';');
  const mediaRaw = (semi < 0 ? value : value.slice(0, semi)).trim().toLowerCase();
  const paramRaw = semi < 0 ? '' : value.slice(semi);
  const params = assembleParameters(parseParameterList(paramRaw));
  const slash = mediaRaw.indexOf('/');
  if (slash <= 0 || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaRaw)) {
    diagnostics.push(`unparseable Content-Type "${mediaRaw.slice(0, 80)}" — treated as text/plain`);
    return {
      ct: { mediaType: 'text/plain', type: 'text', subtype: 'plain', params },
      diagnostics,
    };
  }
  return {
    ct: {
      mediaType: mediaRaw,
      type: mediaRaw.slice(0, slash),
      subtype: mediaRaw.slice(slash + 1),
      params,
    },
    diagnostics,
  };
}

function parseEncoding(value: string | null): { encoding: MimeEncoding; diagnostic: string | null } {
  const v = (value ?? '7bit').trim().toLowerCase();
  if (
    v === '7bit' ||
    v === '8bit' ||
    v === 'binary' ||
    v === 'base64' ||
    v === 'quoted-printable'
  ) {
    return { encoding: v, diagnostic: null };
  }
  return { encoding: '7bit', diagnostic: `unknown Content-Transfer-Encoding "${v}" — treated as 7bit` };
}

function parseDisposition(
  value: string | null,
): { disposition: MimeDisposition | null; params: Record<string, string> } {
  if (value === null) return { disposition: null, params: {} };
  const semi = value.indexOf(';');
  const kind = (semi < 0 ? value : value.slice(0, semi)).trim().toLowerCase();
  const params = assembleParameters(parseParameterList(semi < 0 ? '' : value.slice(semi)));
  const disposition = kind === 'attachment' ? 'attachment' : kind === 'inline' ? 'inline' : null;
  return { disposition, params };
}

// ---------------------------------------------------------------------------
// RFC 2047 encoded-words
// ---------------------------------------------------------------------------

function decodeWord(charset: string, enc: string, text: string): string {
  const cs = charset.trim().toLowerCase();
  const bytes =
    enc.toLowerCase() === 'b'
      ? decodeBase64(text)
      : decodeQuotedPrintable(text.replace(/_/g, ' '));
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

function unflow(text: string, delSp: boolean): string {
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

// ---------------------------------------------------------------------------
// the recursive parser
// ---------------------------------------------------------------------------

interface ParseCtx {
  partBudget: number;
}

function degradedLeaf(
  headers: readonly MimeHeader[],
  body: string,
  diagnostics: string[],
): ParsedMime {
  const bytes = latin1ToBytes(body);
  return {
    kind: 'leaf',
    headers,
    contentType: { mediaType: 'text/plain', type: 'text', subtype: 'plain', params: {} },
    encoding: '7bit',
    charset: 'utf-8',
    disposition: null,
    filename: null,
    contentId: null,
    flowed: false,
    delSp: false,
    bytes,
    text: decodeCharset(bytes, 'utf-8'),
    parts: [],
    encapsulated: null,
    diagnostics,
  };
}

function splitMultipart(
  body: string,
  boundary: string,
): { parts: string[]; found: boolean } {
  const dash = `--${boundary}`;
  const close = `${dash}--`;
  const parts: string[] = [];
  let cur: string[] | null = null;
  let found = false;
  for (const line of body.split('\n')) {
    const trimmed = line.replace(/[ \t]+$/, '');
    if (trimmed === dash || trimmed === close) {
      found = true;
      if (cur !== null) parts.push(cur.join('\n'));
      if (trimmed === close) {
        cur = null;
        break;
      }
      cur = [];
      continue;
    }
    if (cur !== null) cur.push(line);
  }
  if (cur !== null) parts.push(cur.join('\n'));
  return { parts, found };
}

function parseNode(message: string, depth: number, ctx: ParseCtx): ParsedMime {
  const { headerBlock, body } = splitHeadersBody(message);
  const headers = parseHeaders(headerBlock);
  const diagnostics: string[] = [];

  const { ct, diagnostics: ctDiag } = parseContentType(firstHeader(headers, 'content-type'));
  diagnostics.push(...ctDiag);
  const { encoding, diagnostic: encDiag } = parseEncoding(
    firstHeader(headers, 'content-transfer-encoding'),
  );
  if (encDiag !== null) diagnostics.push(encDiag);

  const { disposition, params: dispParams } = parseDisposition(
    firstHeader(headers, 'content-disposition'),
  );
  const filename = dispParams.filename ?? ct.params.name ?? null;
  const contentIdRaw = firstHeader(headers, 'content-id');
  const contentId =
    contentIdRaw === null ? null : contentIdRaw.trim().replace(/^</, '').replace(/>$/, '');
  const charset = (ct.params.charset ?? 'utf-8').trim().toLowerCase() || 'utf-8';
  const flowed = ct.type === 'text' && (ct.params.format ?? '').toLowerCase() === 'flowed';
  const delSp = flowed && (ct.params.delsp ?? '').toLowerCase() === 'yes';

  if (depth > MAX_DEPTH) {
    return degradedLeaf(headers, body, [
      ...diagnostics,
      `MIME nesting exceeded ${MAX_DEPTH} levels — part not descended`,
    ]);
  }

  // --- message/rfc822 -----------------------------------------------------
  if (ct.type === 'message' && ct.subtype === 'rfc822') {
    let inner = body;
    if (encoding === 'base64') inner = normaliseNewlines(toLatin1(decodeBase64(body)));
    else if (encoding === 'quoted-printable') {
      inner = normaliseNewlines(toLatin1(decodeQuotedPrintable(body)));
    }
    ctx.partBudget -= 1;
    const encapsulated =
      ctx.partBudget < 0 ? null : parseNode(inner, depth + 1, ctx);
    if (encapsulated === null) diagnostics.push(`part budget (${MAX_PARTS}) exhausted`);
    return {
      kind: 'rfc822',
      headers,
      contentType: ct,
      encoding,
      charset,
      disposition,
      filename,
      contentId,
      flowed: false,
      delSp: false,
      bytes: null,
      text: null,
      parts: [],
      encapsulated,
      diagnostics,
    };
  }

  // --- multipart/* ------------------------------------------------------
  if (ct.type === 'multipart') {
    const boundary = ct.params.boundary ?? '';
    if (boundary.length === 0) {
      return degradedLeaf(headers, body, [
        ...diagnostics,
        'multipart/* with no boundary parameter — treated as text/plain',
      ]);
    }
    const { parts: rawParts, found } = splitMultipart(body, boundary);
    if (!found) {
      return degradedLeaf(headers, body, [
        ...diagnostics,
        `multipart boundary "${boundary.slice(0, 60)}" never appears — treated as text/plain`,
      ]);
    }
    const parts: ParsedMime[] = [];
    for (const rawPart of rawParts) {
      ctx.partBudget -= 1;
      if (ctx.partBudget < 0) {
        diagnostics.push(`part budget (${MAX_PARTS}) exhausted — remaining parts dropped`);
        break;
      }
      parts.push(parseNode(rawPart, depth + 1, ctx));
    }
    return {
      kind: 'multipart',
      headers,
      contentType: ct,
      encoding,
      charset,
      disposition,
      filename,
      contentId,
      flowed: false,
      delSp: false,
      bytes: null,
      text: null,
      parts,
      encapsulated: null,
      diagnostics,
    };
  }

  // --- leaf --------------------------------------------------------------
  let bytes: Uint8Array;
  if (encoding === 'base64') bytes = decodeBase64(body);
  else if (encoding === 'quoted-printable') bytes = decodeQuotedPrintable(body);
  else bytes = latin1ToBytes(body);

  let text: string | null = null;
  if (ct.type === 'text') {
    // A CTE-decoded body carries its own CRLFs (the outer normalisation only touched the raw
    // message) — normalise them here so `text` has consistent `\n` line endings.
    const decoded = normaliseNewlines(decodeCharset(bytes, charset));
    text = flowed ? unflow(decoded, delSp) : decoded;
  }

  return {
    kind: 'leaf',
    headers,
    contentType: ct,
    encoding,
    charset,
    disposition,
    filename,
    contentId,
    flowed,
    delSp,
    bytes,
    text,
    parts: [],
    encapsulated: null,
    diagnostics,
  };
}

/** Parse a raw RFC 5322 message into a `ParsedMime` tree. Never throws. */
export function parseMime(input: string | Uint8Array): ParsedMime {
  let latin1 = toLatin1(input);
  const diagnostics: string[] = [];
  if (latin1.length > MAX_INPUT) {
    latin1 = latin1.slice(0, MAX_INPUT);
    diagnostics.push(`message exceeded ${MAX_INPUT} bytes — truncated`);
  }
  const normalised = normaliseNewlines(latin1);
  const ctx: ParseCtx = { partBudget: MAX_PARTS };
  const root = parseNode(normalised, 0, ctx);
  if (diagnostics.length === 0) return root;
  return { ...root, diagnostics: [...diagnostics, ...root.diagnostics] };
}

// ---------------------------------------------------------------------------
// consumer helpers
// ---------------------------------------------------------------------------

/** Depth-first walk over `node` and every descendant (parts + an rfc822 encapsulation). */
export function* iterMimeParts(node: ParsedMime): Generator<ParsedMime> {
  yield node;
  for (const child of node.parts) yield* iterMimeParts(child);
  if (node.encapsulated !== null) yield* iterMimeParts(node.encapsulated);
}

function isAttachmentLeaf(node: ParsedMime): boolean {
  if (node.kind !== 'leaf') return false;
  if (node.disposition === 'attachment') return true;
  if (node.filename !== null && node.disposition !== 'inline') return true;
  return node.contentType.type !== 'text' && node.contentType.type !== 'multipart';
}

interface BodyStructure {
  text: string | null;
  html: string | null;
  attachments: ParsedMime[];
}

/**
 * Resolve the human-facing body: walks the tree honouring `multipart/alternative` (the **last**
 * displayable alternative wins, RFC 2046 §5.1.4) and `multipart/related` (the root part carries the
 * body), and gathers everything else that looks like an attachment.
 */
export function selectBodyStructure(root: ParsedMime): BodyStructure {
  const attachments: ParsedMime[] = [];

  const pick = (node: ParsedMime): { text: string | null; html: string | null } => {
    if (node.kind === 'leaf') {
      if (isAttachmentLeaf(node)) {
        attachments.push(node);
        return { text: null, html: null };
      }
      if (node.contentType.mediaType === 'text/html') {
        return { text: null, html: node.text };
      }
      if (node.contentType.type === 'text') {
        return { text: node.text, html: null };
      }
      attachments.push(node);
      return { text: null, html: null };
    }
    if (node.kind === 'rfc822') {
      attachments.push(node);
      return { text: null, html: null };
    }
    // multipart/*
    if (node.contentType.subtype === 'alternative') {
      // RFC 2046 §5.1.4: the last alternative the client can display is the richest — it wins.
      let text: string | null = null;
      let html: string | null = null;
      for (const child of node.parts) {
        const got = pick(child);
        if (got.text !== null) text = got.text;
        if (got.html !== null) html = got.html;
      }
      return { text, html };
    }
    // mixed / related / digest / report / signed / …: first displayable child is the body.
    let text: string | null = null;
    let html: string | null = null;
    for (const child of node.parts) {
      const got = pick(child);
      if (text === null) text = got.text;
      if (html === null) html = got.html;
    }
    return { text, html };
  };

  const body = pick(root);
  return { text: body.text, html: body.html, attachments };
}

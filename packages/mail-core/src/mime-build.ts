/**
 * Compose model → RFC 5322 / 2045–2047 / 3676 serialisation — the inverse of `mime-parse.ts`.
 *
 * `buildMime(input)` turns a plain compose object into a wire-ready message string with CRLF line
 * endings: a `Date` / `Message-ID` / `MIME-Version`, threading headers (`In-Reply-To` /
 * `References`), RFC 2047-encoded display names and subject, `format=flowed` plain text, an optional
 * HTML alternative, and attachments. The structure is the smallest that fits the content:
 *
 *   text only ................... a single `text/plain`
 *   text + html ................. `multipart/alternative`
 *   + inline attachments ........ `multipart/related` around the above
 *   + regular attachments ....... `multipart/mixed` around the above
 *
 * Every value that originates from the caller (subject, display names, filenames, custom headers) is
 * stripped of CR/LF before it reaches a header line — a compose field is not a header-injection
 * vector.
 *
 * Pure and deterministic when `now` / `messageId` / `generateId` are supplied (tests do); otherwise
 * it reads the clock and `Math.random` for the `Message-ID` and MIME boundaries only.
 */

export interface BuildAddress {
  readonly name?: string;
  readonly address: string;
}

export interface BuildAttachment {
  readonly filename: string;
  /** e.g. `application/pdf`; `application/octet-stream` when omitted. */
  readonly contentType?: string;
  readonly content: Uint8Array;
  /** `Content-Disposition: inline` + placed in a `multipart/related` with the body. */
  readonly inline?: boolean;
  /** `Content-ID` for a `cid:` reference from the HTML body (angle brackets optional). */
  readonly contentId?: string;
}

export interface BuildMessageInput {
  readonly from: BuildAddress;
  readonly to?: readonly BuildAddress[];
  readonly cc?: readonly BuildAddress[];
  readonly bcc?: readonly BuildAddress[];
  readonly replyTo?: readonly BuildAddress[];
  readonly subject?: string;
  /** Plain-text body. Emitted as `text/plain; format=flowed` unless `flowed` is `false`. */
  readonly text?: string;
  /** Optional HTML alternative. With `text`, produces a `multipart/alternative`. */
  readonly html?: string;
  /** `Message-ID` this message replies to (`<>` optional). Sets `In-Reply-To` and extends `References`. */
  readonly inReplyTo?: string | null;
  readonly references?: readonly string[];
  readonly attachments?: readonly BuildAttachment[];
  /** Extra headers (`User-Agent`, `X-*`, …). Names and values are CR/LF-sanitised. */
  readonly headers?: readonly (readonly [string, string])[];
  readonly flowed?: boolean;
  // --- determinism seams ------------------------------------------------
  readonly now?: Date;
  readonly messageId?: string;
  readonly generateId?: () => string;
}

type HeaderPair = readonly [string, string];
interface Entity {
  readonly headers: readonly HeaderPair[];
  readonly body: string;
}

const CRLF = '\r\n';
const MAX_LINE = 78;

// ---------------------------------------------------------------------------
// low-level encoders
// ---------------------------------------------------------------------------

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1]! : 0;
    const b2 = has2 ? bytes[i + 2]! : 0;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += has1 ? B64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += has2 ? B64_ALPHABET[b2 & 63] : '=';
  }
  return out;
}

function chunk(s: string, n: number): string {
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += n) parts.push(s.slice(i, i + n));
  return parts.join(CRLF);
}

/** RFC 2045 quoted-printable, body context: soft-wrap at 76, encode `=` and non-printables, and
 *  encode a space/tab only when it would sit at end-of-line. Input newlines become hard breaks. */
function encodeQuotedPrintable(input: string): string {
  const bytes = utf8Bytes(input.replace(/\r\n/g, '\n'));
  const lines: string[] = [];
  let line = '';
  const sealTrailingWs = (l: string): string => {
    if (l.length === 0) return l;
    const last = l[l.length - 1]!;
    if (last === ' ') return `${l.slice(0, -1)}=20`;
    if (last === '\t') return `${l.slice(0, -1)}=09`;
    return l;
  };
  for (const b of bytes) {
    if (b === 0x0a) {
      lines.push(sealTrailingWs(line));
      line = '';
      continue;
    }
    let token: string;
    if (b === 0x3d) token = '=3D';
    else if (b === 0x20 || b === 0x09) token = String.fromCharCode(b);
    else if (b >= 0x21 && b <= 0x7e) token = String.fromCharCode(b);
    else token = `=${b.toString(16).toUpperCase().padStart(2, '0')}`;
    if (line.length + token.length > 75) {
      lines.push(`${line}=`);
      line = '';
    }
    line += token;
  }
  lines.push(sealTrailingWs(line));
  return lines.join(CRLF);
}

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// header values
// ---------------------------------------------------------------------------

/** A compose field is never allowed to introduce a header line. */
function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * RFC 2047 `B` encoded-word(s) for a run of text. Chunked on **character** boundaries so a multibyte
 * codepoint is never split, each word ≤ 75 chars (≤ 45 UTF-8 bytes → 60 base64). Adjacent words are
 * space-joined; a decoder drops that separator (RFC 2047 §6.2), and since every original character —
 * spaces included — sits inside a word, nothing of the source is lost.
 */
function encodeWord(text: string): string {
  const enc = new TextEncoder();
  const words: string[] = [];
  let buf = '';
  let bufBytes = 0;
  const flush = (): void => {
    if (buf.length > 0) {
      words.push(`=?utf-8?B?${base64Encode(enc.encode(buf))}?=`);
      buf = '';
      bufBytes = 0;
    }
  };
  for (const ch of text) {
    const chBytes = enc.encode(ch).length;
    if (bufBytes + chBytes > 45) flush();
    buf += ch;
    bufBytes += chBytes;
  }
  flush();
  return words.length > 0 ? words.join(' ') : '=?utf-8?B??=';
}

const PHRASE_SPECIALS = /[()<>[\]:;@\\,."]/;

/** A display-name + addr-spec as it appears in `From:` / `To:` — RFC 2047 for a non-ASCII name. */
function formatAddress(a: BuildAddress): string {
  const address = sanitize(a.address);
  const name = sanitize(a.name ?? '');
  if (name.length === 0) return address;
  if (!isAscii(name)) return `${encodeWord(name)} <${address}>`;
  if (PHRASE_SPECIALS.test(name)) return `"${name.replace(/(["\\])/g, '\\$1')}" <${address}>`;
  return `${name} <${address}>`;
}

function formatAddressList(list: readonly BuildAddress[]): string {
  return list.map(formatAddress).join(', ');
}

/** Subject / any unstructured header text: one chunked RFC 2047 run when it is not plain ASCII
 *  (encoding the whole string, not word-by-word, so interior spaces survive the decoder). */
function encodeHeaderText(text: string): string {
  const clean = sanitize(text);
  if (isAscii(clean) && !clean.includes('=?')) return clean;
  return encodeWord(clean);
}

function normaliseMessageId(id: string): string | null {
  const bare = sanitize(id).replace(/^<+/, '').replace(/>+$/, '').replace(/\s+/g, '');
  return bare.length > 0 ? `<${bare}>` : null;
}

/** Fold one `Name: value` onto continuation lines at whitespace, keeping every line ≤ 78 where it can. */
function foldHeader(name: string, value: string): string {
  const first = `${name}: ${value}`;
  if (first.length <= MAX_LINE || !value.includes(' ')) return first;
  const tokens = value.split(' ');
  const out: string[] = [];
  let line = `${name}:`;
  for (const tok of tokens) {
    if (line.length + 1 + tok.length > MAX_LINE && line !== `${name}:`) {
      out.push(line);
      line = `\t${tok}`;
    } else {
      line += ` ${tok}`;
    }
  }
  out.push(line);
  return out.join(CRLF);
}

function emitEntity(e: Entity): string {
  const head = e.headers.map(([n, v]) => foldHeader(n, v)).join(CRLF);
  return `${head}${CRLF}${CRLF}${e.body}`;
}

// ---------------------------------------------------------------------------
// format=flowed
// ---------------------------------------------------------------------------

/** RFC 3676: soft-wrap at `limit`, mark a wrap with a trailing space, space-stuff `>`/space/`From `. */
function wrapFlowed(text: string, limit = 72): string {
  const stuff = (l: string): string => (/^(>| |From )/.test(l) ? ` ${l}` : l);
  const out: string[] = [];
  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    let line = rawLine.replace(/ +$/, '');
    if (line.length === 0) {
      out.push('');
      continue;
    }
    while (line.length > limit) {
      let brk = line.lastIndexOf(' ', limit);
      if (brk <= 0) {
        brk = line.indexOf(' ', limit);
        if (brk < 0) break;
      }
      out.push(`${stuff(line.slice(0, brk))} `);
      line = line.slice(brk + 1);
    }
    out.push(stuff(line));
  }
  return out.join(CRLF);
}

// ---------------------------------------------------------------------------
// parts
// ---------------------------------------------------------------------------

function encodedTextBody(
  raw: string,
  encoding: '7bit' | 'quoted-printable' | 'base64',
): string {
  if (encoding === 'base64') return chunk(base64Encode(utf8Bytes(raw)), 76);
  if (encoding === 'quoted-printable') return encodeQuotedPrintable(raw);
  return raw.replace(/\r\n/g, '\n').replace(/\n/g, CRLF);
}

function buildPlainPart(text: string, flowed: boolean): Entity {
  const normalised = text.replace(/\r\n/g, '\n');
  const bodyText = flowed ? wrapFlowed(normalised) : normalised;
  const ascii = isAscii(bodyText);
  const longLine = bodyText.split(/\r?\n/).some((l) => l.length > 950);
  let encoding: '7bit' | 'quoted-printable' | 'base64';
  if (ascii && !longLine) encoding = '7bit';
  else if (flowed) encoding = 'base64'; // base64 preserves the literal trailing soft-break spaces
  else encoding = 'quoted-printable';
  const ct = `text/plain; charset=utf-8${flowed ? '; format=flowed' : ''}`;
  return {
    headers: [
      ['Content-Type', ct],
      ['Content-Transfer-Encoding', encoding],
    ],
    body: encodedTextBody(bodyText, encoding),
  };
}

function buildHtmlPart(html: string): Entity {
  // HTML is long-lined and often non-ASCII; quoted-printable keeps it inspectable on the wire.
  return {
    headers: [
      ['Content-Type', 'text/html; charset=utf-8'],
      ['Content-Transfer-Encoding', 'quoted-printable'],
    ],
    body: encodedTextBody(html, 'quoted-printable'),
  };
}

function buildAttachmentPart(att: BuildAttachment): Entity {
  const filename = sanitize(att.filename) || 'attachment';
  const type = sanitize(att.contentType ?? '') || 'application/octet-stream';
  const disposition = att.inline ? 'inline' : 'attachment';
  const nameParam = isAscii(filename)
    ? `; name="${filename.replace(/"/g, '')}"`
    : '';
  const fileParam = isAscii(filename)
    ? `; filename="${filename.replace(/"/g, '')}"`
    : `; filename*=utf-8''${encodeURIComponent(filename)}`;
  const headers: HeaderPair[] = [
    ['Content-Type', `${type}${nameParam}`],
    ['Content-Transfer-Encoding', 'base64'],
    ['Content-Disposition', `${disposition}${fileParam}`],
  ];
  const cid = att.contentId ? normaliseMessageId(att.contentId) : null;
  if (cid !== null) headers.push(['Content-ID', cid]);
  return { headers, body: chunk(base64Encode(att.content), 76) };
}

function buildMultipart(
  subtype: string,
  children: readonly Entity[],
  gen: () => string,
  extraCtParams = '',
): Entity {
  const boundary = `----=_Part_${gen()}`;
  const segments = children.map((c) => `--${boundary}${CRLF}${emitEntity(c)}${CRLF}`);
  const body = `${segments.join('')}--${boundary}--${CRLF}`;
  return {
    headers: [['Content-Type', `multipart/${subtype}; boundary="${boundary}"${extraCtParams}`]],
    body,
  };
}

// ---------------------------------------------------------------------------
// assembly
// ---------------------------------------------------------------------------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** RFC 5322 `Date:` in UTC (`+0000`) — no timezone database, fully deterministic. */
function formatDate(d: Date): string {
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return (
    `${DAYS[d.getUTCDay()]!}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!} ${d.getUTCFullYear()} ` +
    `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} +0000`
  );
}

function defaultGenerateId(): string {
  return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
}

/** Every recipient address, deduped — for the SMTP `RCPT TO` envelope (`Bcc` included, and it is
 *  deliberately never written as a header). */
export function collectRecipients(input: BuildMessageInput): string[] {
  const seen = new Set<string>();
  for (const a of [...(input.to ?? []), ...(input.cc ?? []), ...(input.bcc ?? [])]) {
    const addr = sanitize(a.address);
    if (addr.length > 0) seen.add(addr);
  }
  return [...seen];
}

/** Serialise a compose model to a wire-ready RFC 5322 message (CRLF line endings). */
export function buildMime(input: BuildMessageInput): string {
  const gen = input.generateId ?? defaultGenerateId;
  const now = input.now ?? new Date();
  const flowed = input.flowed ?? true;

  const hasText = typeof input.text === 'string';
  const hasHtml = typeof input.html === 'string';
  const inlineAtts = (input.attachments ?? []).filter((a) => a.inline === true);
  const regularAtts = (input.attachments ?? []).filter((a) => a.inline !== true);

  // --- the body entity -------------------------------------------------
  let content: Entity;
  const textPart = hasText ? buildPlainPart(input.text ?? '', flowed) : null;
  const htmlPart = hasHtml ? buildHtmlPart(input.html ?? '') : null;

  if (textPart !== null && htmlPart !== null) {
    content = buildMultipart('alternative', [textPart, htmlPart], gen);
  } else if (htmlPart !== null) {
    content = htmlPart;
  } else if (textPart !== null) {
    content = textPart;
  } else {
    content = buildPlainPart('', flowed);
  }

  if (inlineAtts.length > 0) {
    content = buildMultipart(
      'related',
      [content, ...inlineAtts.map(buildAttachmentPart)],
      gen,
    );
  }
  if (regularAtts.length > 0) {
    content = buildMultipart(
      'mixed',
      [content, ...regularAtts.map(buildAttachmentPart)],
      gen,
    );
  }

  // --- message headers ----------------------------------------------
  const headers: HeaderPair[] = [['Date', formatDate(now)], ['From', formatAddress(input.from)]];
  if (input.to && input.to.length > 0) headers.push(['To', formatAddressList(input.to)]);
  if (input.cc && input.cc.length > 0) headers.push(['Cc', formatAddressList(input.cc)]);
  if (input.replyTo && input.replyTo.length > 0) {
    headers.push(['Reply-To', formatAddressList(input.replyTo)]);
  }
  headers.push(['Subject', encodeHeaderText(input.subject ?? '')]);

  const messageId =
    (input.messageId ? normaliseMessageId(input.messageId) : null) ??
    `<${gen()}@${sanitize(input.from.address).split('@')[1] ?? 'localhost'}>`;
  headers.push(['Message-ID', messageId]);

  const inReplyTo = input.inReplyTo ? normaliseMessageId(input.inReplyTo) : null;
  if (inReplyTo !== null) headers.push(['In-Reply-To', inReplyTo]);

  const refs = [...(input.references ?? []), ...(input.inReplyTo ? [input.inReplyTo] : [])]
    .map(normaliseMessageId)
    .filter((r): r is string => r !== null);
  const dedupedRefs = [...new Set(refs)];
  if (dedupedRefs.length > 0) headers.push(['References', dedupedRefs.join(' ')]);

  headers.push(['MIME-Version', '1.0']);

  for (const [rawName, rawValue] of input.headers ?? []) {
    const name = sanitize(rawName).replace(/[^A-Za-z0-9!#$%&'*+.^_`|~-]/g, '');
    if (name.length === 0) continue;
    if (/^(date|from|to|cc|bcc|subject|message-id|in-reply-to|references|mime-version|content-.*)$/i.test(name)) {
      continue; // do not let a custom header override a structural one
    }
    headers.push([name, encodeHeaderText(rawValue)]);
  }

  headers.push(...content.headers);
  return emitEntity({ headers, body: content.body });
}

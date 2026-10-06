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

import {
  decodeBase64,
  decodeCharset,
  decodeQuotedPrintable,
  latin1ToBytes,
  normaliseNewlines,
  toLatin1,
  unflow,
} from './mime-codec';
import {
  firstHeader,
  parseContentType,
  parseDisposition,
  parseEncoding,
  parseHeaders,
  splitHeadersBody,
} from './mime-headers';
import type { MimeHeader, ParsedMime } from './mime-types';

export { decodeEncodedWords } from './mime-codec';
export type {
  MimeContentType,
  MimeDisposition,
  MimeEncoding,
  MimeHeader,
  MimeNodeKind,
  ParsedMime,
} from './mime-types';

const MAX_INPUT = 50 * 1024 * 1024;
const MAX_DEPTH = 25;
const MAX_PARTS = 1000;

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

function splitMultipart(body: string, boundary: string): { parts: string[]; found: boolean } {
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
    const encapsulated = ctx.partBudget < 0 ? null : parseNode(inner, depth + 1, ctx);
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

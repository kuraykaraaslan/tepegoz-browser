/** Header-block parsing for the MIME parser: unfolding, RFC 2231 parameters, Content-* fields. */

import { decodeCharset, decodeEncodedWords } from './mime-codec';
import type { MimeContentType, MimeDisposition, MimeEncoding, MimeHeader } from './mime-types';

export function splitHeadersBody(message: string): { headerBlock: string; body: string } {
  const idx = message.indexOf('\n\n');
  if (idx < 0) return { headerBlock: message, body: '' };
  return { headerBlock: message.slice(0, idx), body: message.slice(idx + 2) };
}

export function parseHeaders(headerBlock: string): MimeHeader[] {
  // Unfold: a CRLF (already \n) immediately followed by WSP is a fold — drop the newline, keep the WSP.
  const unfolded = headerBlock.replace(/\n([ \t])/g, '$1');
  const headers: MimeHeader[] = [];
  for (const line of unfolded.split('\n')) {
    if (line.length === 0) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue; // a continuation that did not fold, or garbage — skip
    const name = line.slice(0, colon).trim().toLowerCase();
    if (!/^[!-9;-~]+$/.test(name)) continue; // RFC 5322 field-name chars
    const value = line
      .slice(colon + 1)
      .replace(/^[ \t]/, '')
      .replace(/[ \t]+$/, '');
    headers.push({ name, value });
  }
  return headers;
}

export function firstHeader(headers: readonly MimeHeader[], name: string): string | null {
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

export function parseContentType(value: string | null): {
  ct: MimeContentType;
  diagnostics: string[];
} {
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

export function parseEncoding(value: string | null): {
  encoding: MimeEncoding;
  diagnostic: string | null;
} {
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
  return {
    encoding: '7bit',
    diagnostic: `unknown Content-Transfer-Encoding "${v}" — treated as 7bit`,
  };
}

export function parseDisposition(value: string | null): {
  disposition: MimeDisposition | null;
  params: Record<string, string>;
} {
  if (value === null) return { disposition: null, params: {} };
  const semi = value.indexOf(';');
  const kind = (semi < 0 ? value : value.slice(0, semi)).trim().toLowerCase();
  const params = assembleParameters(parseParameterList(semi < 0 ? '' : value.slice(semi)));
  const disposition = kind === 'attachment' ? 'attachment' : kind === 'inline' ? 'inline' : null;
  return { disposition, params };
}

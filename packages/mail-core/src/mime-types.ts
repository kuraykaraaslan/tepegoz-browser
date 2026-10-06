/** Public shape of a parsed MIME tree — see `mime-parse.ts` for the parser itself. */

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

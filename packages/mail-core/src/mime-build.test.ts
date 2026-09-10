import { describe, it, expect } from 'vitest';
import { buildMime, collectRecipients } from './mime-build';
import { parseMime, selectBodyStructure, decodeEncodedWords, iterMimeParts } from './mime-parse';

/** A deterministic id source so boundaries + Message-ID are stable across runs. */
function seq(): () => string {
  let n = 0;
  return () => `id${(n += 1)}`;
}

const FIXED = new Date('2026-09-10T17:53:00Z');

describe('buildMime — headers', () => {
  it('emits Date, From, To, Subject, Message-ID and MIME-Version', () => {
    const raw = buildMime({
      from: { name: 'Ada', address: 'ada@example.org' },
      to: [{ address: 'bob@example.net' }],
      subject: 'Hello there',
      text: 'hi',
      now: FIXED,
      messageId: 'abc@example.org',
      generateId: seq(),
    });
    const m = parseMime(raw);
    const h = (name: string): string | undefined =>
      m.headers.find((x) => x.name === name)?.value;
    expect(h('date')).toBe('Thu, 10 Sep 2026 17:53:00 +0000');
    expect(h('from')).toBe('Ada <ada@example.org>');
    expect(h('to')).toBe('bob@example.net');
    expect(h('subject')).toBe('Hello there');
    expect(h('message-id')).toBe('<abc@example.org>');
    expect(h('mime-version')).toBe('1.0');
  });

  it('generates a Message-ID from the From domain when none is given', () => {
    const raw = buildMime({
      from: { address: 'ada@example.org' },
      text: 'x',
      now: FIXED,
      generateId: seq(),
    });
    expect(parseMime(raw).headers.find((x) => x.name === 'message-id')?.value).toBe(
      '<id1@example.org>',
    );
  });

  it('sets In-Reply-To and appends it to References', () => {
    const raw = buildMime({
      from: { address: 'a@x.org' },
      text: 'reply',
      inReplyTo: '<parent@x.org>',
      references: ['<root@x.org>', '<mid@x.org>'],
      now: FIXED,
      messageId: 'new@x.org',
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.headers.find((x) => x.name === 'in-reply-to')?.value).toBe('<parent@x.org>');
    expect(m.headers.find((x) => x.name === 'references')?.value).toBe(
      '<root@x.org> <mid@x.org> <parent@x.org>',
    );
  });

  it('RFC 2047-encodes a non-ASCII display name and subject', () => {
    const raw = buildMime({
      from: { name: 'Ayşe Çörek', address: 'ayse@example.org' },
      subject: 'Toplantı yarın — önemli',
      text: 'selam',
      now: FIXED,
      messageId: 'x@example.org',
      generateId: seq(),
    });
    // raw header lines must be pure ASCII
    const headerBlock = raw.slice(0, raw.indexOf('\r\n\r\n'));
    expect([...headerBlock].some((c) => c.charCodeAt(0) > 127)).toBe(false);
    const m = parseMime(raw);
    expect(decodeEncodedWords(m.headers.find((x) => x.name === 'from')?.value ?? '')).toBe(
      'Ayşe Çörek <ayse@example.org>',
    );
    expect(decodeEncodedWords(m.headers.find((x) => x.name === 'subject')?.value ?? '')).toBe(
      'Toplantı yarın — önemli',
    );
  });

  it('strips CR/LF from a compose field so it cannot inject a header', () => {
    const raw = buildMime({
      from: { address: 'a@x.org' },
      subject: 'ok\r\nBcc: victim@evil.example',
      text: 'x',
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.headers.find((x) => x.name === 'bcc')).toBeUndefined();
    expect(m.headers.find((x) => x.name === 'subject')?.value).toBe('ok Bcc: victim@evil.example');
  });

  it('ignores a custom header that would shadow a structural one, keeps the rest', () => {
    const raw = buildMime({
      from: { address: 'a@x.org' },
      text: 'x',
      headers: [
        ['Content-Type', 'text/evil'],
        ['User-Agent', 'tepegoz-test'],
      ],
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.contentType.mediaType).toBe('text/plain');
    expect(m.headers.find((x) => x.name === 'user-agent')?.value).toBe('tepegoz-test');
  });
});

describe('buildMime — body structure', () => {
  it('a text-only message is a single text/plain; format=flowed', () => {
    const raw = buildMime({
      from: { address: 'a@x.org' },
      text: 'just a line',
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.kind).toBe('leaf');
    expect(m.contentType.mediaType).toBe('text/plain');
    expect(m.flowed).toBe(true);
    expect(m.text).toBe('just a line');
  });

  it('text + html becomes multipart/alternative and round-trips', () => {
    const raw = buildMime({
      from: { address: 'a@x.org' },
      text: 'plain body',
      html: '<p>html body</p>',
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.contentType.mediaType).toBe('multipart/alternative');
    const s = selectBodyStructure(m);
    expect(s.text).toBe('plain body');
    expect(s.html).toBe('<p>html body</p>');
  });

  it('attachments produce a multipart/mixed with the body first', () => {
    const raw = buildMime({
      from: { address: 'a@x.org' },
      text: 'see attached',
      attachments: [
        { filename: 'note.txt', contentType: 'text/plain', content: new TextEncoder().encode('file data') },
      ],
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.contentType.mediaType).toBe('multipart/mixed');
    const s = selectBodyStructure(m);
    expect(s.text).toBe('see attached');
    expect(s.attachments).toHaveLength(1);
    expect(s.attachments[0]?.filename).toBe('note.txt');
    expect(s.attachments[0]?.bytes && new TextDecoder().decode(s.attachments[0].bytes)).toBe(
      'file data',
    );
  });

  it('an inline attachment nests the body in multipart/related', () => {
    const raw = buildMime({
      from: { address: 'a@x.org' },
      html: '<img src="cid:logo">',
      attachments: [
        {
          filename: 'logo.png',
          contentType: 'image/png',
          content: new Uint8Array([1, 2, 3, 4]),
          inline: true,
          contentId: 'logo',
        },
      ],
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.contentType.mediaType).toBe('multipart/related');
    const png = [...iterMimeParts(m)].find((p) => p.contentType.mediaType === 'image/png');
    expect(png?.contentId).toBe('logo');
    expect(png?.disposition).toBe('inline');
    expect(png?.bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('text + html + a regular attachment nests alternative inside mixed', () => {
    const raw = buildMime({
      from: { address: 'a@x.org' },
      text: 'p',
      html: '<p>h</p>',
      attachments: [{ filename: 'a.bin', content: new Uint8Array([9, 9, 9]) }],
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.contentType.mediaType).toBe('multipart/mixed');
    expect(m.parts[0]?.contentType.mediaType).toBe('multipart/alternative');
    const s = selectBodyStructure(m);
    expect(s.text).toBe('p');
    expect(s.html).toBe('<p>h</p>');
    expect(s.attachments[0]?.filename).toBe('a.bin');
    expect(s.attachments[0]?.contentType.mediaType).toBe('application/octet-stream');
  });
});

describe('buildMime — encoding', () => {
  it('base64-encodes a non-ASCII flowed body and it round-trips exactly', () => {
    const body = 'Merhaba dünya — ĞğİıŞş\nİkinci satır.';
    const raw = buildMime({
      from: { address: 'a@x.org' },
      text: body,
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    expect(raw).toMatch(/Content-Transfer-Encoding: base64/);
    expect(parseMime(raw).text).toBe(body);
  });

  it('quoted-printable-encodes a non-ASCII HTML part', () => {
    const raw = buildMime({
      from: { address: 'a@x.org' },
      html: '<p>é</p>',
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    expect(raw).toMatch(/Content-Transfer-Encoding: quoted-printable/);
    expect(parseMime(raw).text).toBe('<p>é</p>');
  });

  it('wraps a long plain body with format=flowed soft breaks that unflow back', () => {
    const long =
      'This paragraph is deliberately quite long so that the flowed wrapper has to insert at least one soft line break somewhere in the middle of it before the end.';
    const raw = buildMime({
      from: { address: 'a@x.org' },
      text: long,
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    // a wire line should now be <= ~78 chars
    const bodyLines = raw.slice(raw.indexOf('\r\n\r\n') + 4).split('\r\n');
    expect(bodyLines.every((l) => l.length <= 80)).toBe(true);
    expect(parseMime(raw).text).toBe(long);
  });

  it('base64 attachment bytes survive the round-trip', () => {
    const bytes = new Uint8Array(Array.from({ length: 500 }, (_, i) => (i * 37) % 256));
    const raw = buildMime({
      from: { address: 'a@x.org' },
      text: 'x',
      attachments: [{ filename: 'blob.bin', content: bytes }],
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    const m = parseMime(raw);
    const att = selectBodyStructure(m).attachments[0];
    expect(att?.bytes).toEqual(bytes);
  });

  it('uses RFC 2231 for a non-ASCII attachment filename', () => {
    const raw = buildMime({
      from: { address: 'a@x.org' },
      text: 'x',
      attachments: [{ filename: 'çıktı raporu.pdf', contentType: 'application/pdf', content: new Uint8Array([1]) }],
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    });
    const headerBlock = raw.slice(0, raw.indexOf('\r\n\r\n'));
    expect([...headerBlock].some((c) => c.charCodeAt(0) > 127)).toBe(false);
    const m = parseMime(raw);
    const att = selectBodyStructure(m).attachments[0];
    expect(att?.filename).toBe('çıktı raporu.pdf');
  });
});

describe('buildMime — more edge cases for coverage', () => {
  const base = { now: FIXED, messageId: 'x@x.org' } as const;

  it('quotes an ASCII display name that contains a special', () => {
    const raw = buildMime({
      ...base,
      from: { name: 'Doe, John', address: 'j@x.org' },
      text: 'x',
      generateId: seq(),
    });
    expect(parseMime(raw).headers.find((h) => h.name === 'from')?.value).toBe(
      '"Doe, John" <j@x.org>',
    );
  });

  it('encodes an ASCII subject that itself contains an =? sequence', () => {
    const raw = buildMime({
      ...base,
      from: { address: 'a@x.org' },
      subject: 'weird =?utf-8?B?x?= literal',
      text: 'x',
      generateId: seq(),
    });
    const subj = parseMime(raw).headers.find((h) => h.name === 'subject')?.value ?? '';
    expect(subj.startsWith('=?utf-8?B?')).toBe(true);
    expect(decodeEncodedWords(subj)).toBe('weird =?utf-8?B?x?= literal');
  });

  it('splits a long non-ASCII subject into multiple encoded-words that rejoin exactly', () => {
    const subject = 'Ğ'.repeat(60); // 120 UTF-8 bytes → 3 chunks
    const raw = buildMime({
      ...base,
      from: { address: 'a@x.org' },
      subject,
      text: 'x',
      generateId: seq(),
    });
    const subj = parseMime(raw).headers.find((h) => h.name === 'subject')?.value ?? '';
    expect(subj.match(/=\?utf-8\?B\?/g)?.length).toBeGreaterThan(1);
    expect(decodeEncodedWords(subj)).toBe(subject);
  });

  it('drops an empty In-Reply-To and a junk References entry', () => {
    const raw = buildMime({
      ...base,
      from: { address: 'a@x.org' },
      text: 'x',
      inReplyTo: '<>',
      references: ['   ', '<good@x.org>'],
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.headers.find((h) => h.name === 'in-reply-to')).toBeUndefined();
    expect(m.headers.find((h) => h.name === 'references')?.value).toBe('<good@x.org>');
  });

  it('folds a long References header onto continuation lines', () => {
    const refs = Array.from({ length: 12 }, (_, i) => `<msg-${i}-aaaaaaaaaaaaaaaaaaaa@example.org>`);
    const raw = buildMime({ ...base, from: { address: 'a@x.org' }, text: 'x', references: refs, generateId: seq() });
    const headerBlock = raw.slice(0, raw.indexOf('\r\n\r\n'));
    const refLineIdx = headerBlock.split('\r\n').findIndex((l) => l.startsWith('References:'));
    expect(headerBlock.split('\r\n')[refLineIdx + 1]?.startsWith('\t')).toBe(true);
    // every ref still present after an unfold (fold points rejoin as CFWS whitespace)
    const m = parseMime(raw);
    expect(
      m.headers
        .find((h) => h.name === 'references')
        ?.value.split(/\s+/)
        .filter((s) => s.length > 0),
    ).toHaveLength(12);
  });

  it('emits Reply-To when given', () => {
    const raw = buildMime({
      ...base,
      from: { address: 'a@x.org' },
      replyTo: [{ address: 'desk@x.org' }],
      text: 'x',
      generateId: seq(),
    });
    expect(parseMime(raw).headers.find((h) => h.name === 'reply-to')?.value).toBe('desk@x.org');
  });

  it('handles a From address with no @ and a message with neither text nor html', () => {
    const raw = buildMime({
      now: FIXED, // no messageId → generated
      from: { address: 'weird' },
      attachments: [{ filename: 'only.bin', content: new Uint8Array([1, 2]) }],
      generateId: seq(),
    });
    const m = parseMime(raw);
    // no From domain → generated Message-ID falls back to @localhost
    expect(m.headers.find((h) => h.name === 'message-id')?.value).toMatch(/^<id\d+@localhost>$/);
    expect(m.contentType.mediaType).toBe('multipart/mixed');
    // the empty text/plain body part is still there, first
    expect(m.parts[0]?.contentType.mediaType).toBe('text/plain');
  });

  it('drops a custom header whose name is empty after sanitising', () => {
    const raw = buildMime({
      ...base,
      from: { address: 'a@x.org' },
      text: 'x',
      headers: [['   ', 'ignored'], ['X-Keep', 'yes']],
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.headers.find((h) => h.name === 'x-keep')?.value).toBe('yes');
  });

  it('non-flowed plain text is emitted verbatim, quoted-printable when a line is very long', () => {
    const longLine = `${'word '.repeat(400)}end`; // > 950 chars, ASCII
    const raw = buildMime({
      ...base,
      from: { address: 'a@x.org' },
      text: longLine,
      flowed: false,
      generateId: seq(),
    });
    const m = parseMime(raw);
    expect(m.flowed).toBe(false);
    expect(raw).toMatch(/Content-Transfer-Encoding: quoted-printable/);
    expect(m.text).toBe(longLine);
  });

  it('flowed output space-stuffs >, leading-space and "From " lines and preserves blank lines', () => {
    const body = '> quoted reply\n normal indent\nFrom the desk\n\nafter a blank line';
    const raw = buildMime({ ...base, from: { address: 'a@x.org' }, text: body, generateId: seq() });
    expect(parseMime(raw).text).toBe(body);
  });

  it('leaves an unbreakable long token on its own line under format=flowed', () => {
    const body = `short intro ${'x'.repeat(120)} tail`;
    const raw = buildMime({ ...base, from: { address: 'a@x.org' }, text: body, generateId: seq() });
    expect(parseMime(raw).text).toBe(body);
  });

  it('encodes a tab and wraps a long quoted-printable HTML line', () => {
    const html = `<p>\t${'é '.repeat(60)}</p>`;
    const raw = buildMime({ ...base, from: { address: 'a@x.org' }, html, generateId: seq() });
    const bodyLines = raw.slice(raw.indexOf('\r\n\r\n') + 4).split('\r\n');
    expect(bodyLines.every((l) => l.length <= 78)).toBe(true);
    expect(parseMime(raw).text).toBe(html);
  });

  it('falls back to "attachment" for an empty attachment filename', () => {
    const raw = buildMime({
      ...base,
      from: { address: 'a@x.org' },
      text: 'x',
      attachments: [{ filename: '   ', content: new Uint8Array([7]) }],
      generateId: seq(),
    });
    expect(selectBodyStructure(parseMime(raw)).attachments[0]?.filename).toBe('attachment');
  });
});

describe('buildMime — determinism + envelope', () => {
  it('is byte-identical given the same inputs', () => {
    const input = {
      from: { name: 'Ada', address: 'ada@x.org' },
      to: [{ address: 'b@x.org' }],
      subject: 'repeat',
      text: 'same',
      now: FIXED,
      messageId: 'fixed@x.org',
    } as const;
    expect(buildMime({ ...input, generateId: seq() })).toBe(
      buildMime({ ...input, generateId: seq() }),
    );
  });

  it('collectRecipients merges to/cc/bcc, dedupes, and never writes a Bcc header', () => {
    const input = {
      from: { address: 'a@x.org' },
      to: [{ address: 'b@x.org' }, { address: 'c@x.org' }],
      cc: [{ address: 'c@x.org' }],
      bcc: [{ address: 'secret@x.org' }],
      text: 'x',
      now: FIXED,
      messageId: 'x@x.org',
      generateId: seq(),
    };
    expect(collectRecipients(input).sort()).toEqual(['b@x.org', 'c@x.org', 'secret@x.org']);
    expect(buildMime(input)).not.toMatch(/^Bcc:/im);
  });
});

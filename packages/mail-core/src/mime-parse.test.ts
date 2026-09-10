import { describe, it, expect } from 'vitest';
import {
  parseMime,
  decodeEncodedWords,
  iterMimeParts,
  selectBodyStructure,
} from './mime-parse';

const CRLF = '\r\n';
/** Join lines with CRLF, as a real message on the wire has them. */
const msg = (...lines: string[]): string => lines.join(CRLF);

describe('parseMime — headers', () => {
  it('splits the header block from the body and unfolds folded headers', () => {
    // A folded header: CRLF + WSP. RFC 5322 unfolding removes the CRLF and keeps the WSP.
    const m = parseMime(msg('Subject: a very', ' long subject', 'X-Test: 1', '', 'body text', ''));
    expect(m.headers.find((h) => h.name === 'subject')?.value).toBe('a very long subject');
    expect(m.headers.find((h) => h.name === 'x-test')?.value).toBe('1');
    expect(m.text).toBe('body text\n');
  });

  it('lower-cases field names and is tolerant of a missing body', () => {
    const m = parseMime('SUBJECT: hi');
    expect(m.headers[0]?.name).toBe('subject');
    expect(m.text).toBe('');
  });
});

describe('parseMime — Content-Type', () => {
  it('parses type/subtype + quoted params, lower-casing names', () => {
    const m = parseMime(msg('Content-Type: Text/Plain; Charset="ISO-8859-1"', '', 'x'));
    expect(m.contentType.mediaType).toBe('text/plain');
    expect(m.contentType.type).toBe('text');
    expect(m.contentType.subtype).toBe('plain');
    expect(m.charset).toBe('iso-8859-1');
  });

  it('degrades an unparseable Content-Type to text/plain with a diagnostic', () => {
    const m = parseMime(msg('Content-Type: this is not a type', '', 'x'));
    expect(m.contentType.mediaType).toBe('text/plain');
    expect(m.diagnostics.join(' ')).toMatch(/unparseable Content-Type/);
  });

  it('defaults to text/plain; us-ascii when no Content-Type header is present', () => {
    const m = parseMime(msg('Subject: x', '', 'hello'));
    expect(m.contentType.mediaType).toBe('text/plain');
    expect(m.text).toBe('hello');
  });
});

describe('parseMime — Content-Transfer-Encoding', () => {
  it('decodes base64', () => {
    const b64 = Buffer.from('héllo wörld', 'utf-8').toString('base64');
    const m = parseMime(
      msg('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64),
    );
    expect(m.text).toBe('héllo wörld');
  });

  it('decodes quoted-printable including soft line breaks', () => {
    const m = parseMime(
      msg(
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        'caf=C3=A9 =',
        'and more',
      ),
    );
    expect(m.text).toBe('café and more');
  });

  it('treats 8bit as raw bytes and decodes with the declared charset', () => {
    // 0xE9 is é in ISO-8859-1
    const m = parseMime(
      msg('Content-Type: text/plain; charset=iso-8859-1', 'Content-Transfer-Encoding: 8bit', '', 'café'),
    );
    expect(m.text).toBe('café');
  });

  it('falls back to 7bit + a diagnostic for an unknown encoding', () => {
    const m = parseMime(msg('Content-Transfer-Encoding: uuencode', '', 'x'));
    expect(m.encoding).toBe('7bit');
    expect(m.diagnostics.join(' ')).toMatch(/unknown Content-Transfer-Encoding/);
  });
});

describe('parseMime — multipart', () => {
  it('splits a multipart/mixed and drops the preamble/epilogue', () => {
    const m = parseMime(
      msg(
        'Content-Type: multipart/mixed; boundary="BND"',
        '',
        'preamble, ignored',
        '--BND',
        'Content-Type: text/plain',
        '',
        'first part',
        '--BND',
        'Content-Type: text/plain',
        '',
        'second part',
        '--BND--',
        'epilogue, ignored',
      ),
    );
    expect(m.kind).toBe('multipart');
    expect(m.parts).toHaveLength(2);
    expect(m.parts[0]?.text).toBe('first part');
    expect(m.parts[1]?.text).toBe('second part');
  });

  it('descends nested multiparts', () => {
    const m = parseMime(
      msg(
        'Content-Type: multipart/mixed; boundary="OUT"',
        '',
        '--OUT',
        'Content-Type: multipart/alternative; boundary="IN"',
        '',
        '--IN',
        'Content-Type: text/plain',
        '',
        'plain body',
        '--IN',
        'Content-Type: text/html',
        '',
        '<p>html body</p>',
        '--IN--',
        '--OUT',
        'Content-Type: text/plain',
        'Content-Disposition: attachment; filename="a.txt"',
        '',
        'ATTACH',
        '--OUT--',
      ),
    );
    const alt = m.parts[0];
    expect(alt?.kind).toBe('multipart');
    expect(alt?.contentType.subtype).toBe('alternative');
    expect(alt?.parts).toHaveLength(2);
    expect(m.parts[1]?.filename).toBe('a.txt');
    expect(m.parts[1]?.disposition).toBe('attachment');
  });

  it('degrades a multipart with no boundary parameter', () => {
    const m = parseMime(msg('Content-Type: multipart/mixed', '', 'orphan body'));
    expect(m.kind).toBe('leaf');
    expect(m.text).toBe('orphan body');
    expect(m.diagnostics.join(' ')).toMatch(/no boundary parameter/);
  });

  it('degrades a multipart whose boundary never appears', () => {
    const m = parseMime(msg('Content-Type: multipart/mixed; boundary="NEVER"', '', 'orphan body'));
    expect(m.kind).toBe('leaf');
    expect(m.diagnostics.join(' ')).toMatch(/never appears/);
  });
});

describe('parseMime — message/rfc822', () => {
  it('recurses into the encapsulated message', () => {
    const m = parseMime(
      msg(
        'Content-Type: message/rfc822',
        '',
        'Subject: inner',
        'Content-Type: text/plain',
        '',
        'inner body',
      ),
    );
    expect(m.kind).toBe('rfc822');
    expect(m.encapsulated?.headers.find((h) => h.name === 'subject')?.value).toBe('inner');
    expect(m.encapsulated?.text).toBe('inner body');
  });
});

describe('parseMime — Content-Disposition + filenames', () => {
  it('reads inline vs attachment and the Content-Type name fallback', () => {
    const inline = parseMime(
      msg('Content-Type: image/png; name="logo.png"', 'Content-Disposition: inline', '', 'x'),
    );
    expect(inline.disposition).toBe('inline');
    expect(inline.filename).toBe('logo.png');
  });

  it('assembles an RFC 2231 continued + percent-encoded filename', () => {
    const m = parseMime(
      msg(
        'Content-Type: application/pdf',
        "Content-Disposition: attachment;" +
          " filename*0*=utf-8''%C3%BC%C3%A7;" +
          ' filename*1*=%20rapor.pdf',
        '',
        'x',
      ),
    );
    expect(m.filename).toBe('üç rapor.pdf');
  });

  it('decodes an RFC 2047 encoded-word filename', () => {
    const m = parseMime(
      msg(
        'Content-Type: application/octet-stream',
        'Content-Disposition: attachment; filename="=?utf-8?B?w7xjLnR4dA==?="',
        '',
        'x',
      ),
    );
    expect(m.filename).toBe('üc.txt');
  });

  it('strips angle brackets from Content-ID', () => {
    const m = parseMime(msg('Content-Type: image/png', 'Content-ID: <abc123@host>', '', 'x'));
    expect(m.contentId).toBe('abc123@host');
  });
});

describe('parseMime — format=flowed (RFC 3676)', () => {
  it('joins soft-wrapped lines and keeps the space (DelSp=no)', () => {
    const m = parseMime(
      msg(
        'Content-Type: text/plain; charset=utf-8; format=flowed',
        '',
        'This is a long ',
        'line that was ',
        'soft wrapped.',
        '',
        'Second paragraph.',
      ),
    );
    expect(m.flowed).toBe(true);
    expect(m.text).toBe('This is a long line that was soft wrapped.\n\nSecond paragraph.');
  });

  it('honours DelSp=yes and preserves the "-- " signature separator', () => {
    const m = parseMime(
      msg(
        'Content-Type: text/plain; format=flowed; delsp=yes',
        '',
        'joined ',
        'here',
        '-- ',
        'Signature Line',
      ),
    );
    expect(m.text).toBe('joinedhere\n-- \nSignature Line');
  });

  it('de-space-stuffs a leading space', () => {
    const m = parseMime(
      msg('Content-Type: text/plain; format=flowed', '', ' From the top', 'kept'),
    );
    expect(m.text).toBe('From the top\nkept');
  });
});

describe('decodeEncodedWords — RFC 2047', () => {
  it('decodes a B-encoded word', () => {
    expect(decodeEncodedWords('=?utf-8?B?w6ZzdGjDqXRpYw==?=')).toBe('æsthétic');
  });

  it('decodes a Q-encoded word, mapping _ to space', () => {
    expect(decodeEncodedWords('=?iso-8859-1?Q?a_caf=E9?=')).toBe('a café');
  });

  it('removes whitespace between two adjacent encoded-words but keeps it elsewhere', () => {
    expect(decodeEncodedWords('=?utf-8?B?w6k=?= =?utf-8?B?w6k=?=')).toBe('éé');
    expect(decodeEncodedWords('plain =?utf-8?B?w6k=?= tail')).toBe('plain é tail');
  });

  it('leaves a malformed token verbatim', () => {
    expect(decodeEncodedWords('=?utf-8?X?nope?=')).toBe('=?utf-8?X?nope?=');
    expect(decodeEncodedWords('no encoded words here')).toBe('no encoded words here');
  });
});

describe('parseMime — totality / hardening', () => {
  it('never throws on junk input and always yields a usable body', () => {
    for (const junk of ['', '\r\n\r\n', 'Subject', '=?=?=?=?', '--x--\r\n', 'Content-Type: multipart/mixed; boundary=']) {
      expect(() => parseMime(junk)).not.toThrow();
      const m = parseMime(junk);
      expect(typeof m.text === 'string' || m.text === null).toBe(true);
    }
  });

  it('accepts a Uint8Array and decodes raw 8-bit bytes by charset', () => {
    const head = Buffer.from(
      'Content-Type: text/plain; charset=windows-1254\r\nContent-Transfer-Encoding: 8bit\r\n\r\n',
      'ascii',
    );
    // 0xF0 = ğ, 0xFD = ı in windows-1254
    const body = Buffer.from([0x67, 0xf0, 0x69, 0xfd]); // "gği ı"-ish -> "gğiı"
    const m = parseMime(new Uint8Array(Buffer.concat([head, body])));
    expect(m.text).toBe('gğiı');
  });

  it('caps recursion depth instead of blowing the stack', () => {
    let nested = 'deep body';
    for (let i = 0; i < 60; i += 1) {
      nested = `Content-Type: message/rfc822\r\n\r\n${nested}`;
    }
    expect(() => parseMime(nested)).not.toThrow();
    const m = parseMime(nested);
    const diags = [...iterMimeParts(m)].flatMap((p) => p.diagnostics);
    expect(diags.join(' ')).toMatch(/nesting exceeded/);
  });

  it('caps the total part count on a boundary bomb', () => {
    const parts = Array.from({ length: 5000 }, () => '--B\r\nContent-Type: text/plain\r\n\r\nx').join(
      '\r\n',
    );
    const m = parseMime(`Content-Type: multipart/mixed; boundary="B"\r\n\r\n${parts}\r\n--B--`);
    expect(m.parts.length).toBeLessThanOrEqual(1000);
    expect(m.diagnostics.join(' ')).toMatch(/part budget/);
  });
});

describe('parseMime — more edge cases for coverage', () => {
  it('re-encodes a non-latin1 JS string argument as UTF-8', () => {
    const m = parseMime('Content-Type: text/plain; charset=utf-8\n\nélan — €');
    expect(m.text).toBe('élan — €');
  });

  it('falls back when the charset label is not one TextDecoder knows', () => {
    const m = parseMime(
      msg('Content-Type: text/plain; charset=x-bogus-charset', 'Content-Transfer-Encoding: 8bit', '', 'plain ascii'),
    );
    expect(m.text).toBe('plain ascii');
  });

  it('keeps a malformed =XY quoted-printable sequence literal', () => {
    const m = parseMime(
      msg('Content-Type: text/plain', 'Content-Transfer-Encoding: quoted-printable', '', 'a=ZZb'),
    );
    expect(m.text).toBe('a=ZZb');
  });

  it('skips a garbage header line with no colon', () => {
    const m = parseMime(msg('Subject: ok', 'this line has no colon', 'X-Real: yes', '', 'b'));
    expect(m.headers.map((h) => h.name)).toEqual(['subject', 'x-real']);
  });

  it('treats an empty Content-Type header value as the text/plain default', () => {
    const m = parseMime(msg('Content-Type: ', '', 'body'));
    expect(m.contentType.mediaType).toBe('text/plain');
    expect(m.text).toBe('body');
  });

  it('assembles a non-extended RFC 2231 continuation and de-dupes a repeated simple param', () => {
    const m = parseMime(
      msg(
        'Content-Type: text/plain; charset=utf-8; charset=us-ascii',
        'Content-Disposition: attachment; filename*0="long-"; filename*1="name.txt"',
        '',
        'x',
      ),
    );
    expect(m.charset).toBe('utf-8'); // first wins
    expect(m.filename).toBe('long-name.txt');
  });

  it('honours a backslash escape inside a quoted parameter value', () => {
    const m = parseMime(
      msg('Content-Type: text/plain', 'Content-Disposition: attachment; filename="a\\"b.txt"', '', 'x'),
    );
    expect(m.filename).toBe('a"b.txt');
  });

  it('unflows quoted (>) lines at their own depth', () => {
    const m = parseMime(
      msg(
        'Content-Type: text/plain; format=flowed',
        '',
        '> quoted soft ',
        '> wrapped line',
        'my own fixed line',
      ),
    );
    expect(m.text).toBe('> quoted soft wrapped line\nmy own fixed line');
  });

  it('decodes a base64-encoded message/rfc822 payload before recursing', () => {
    const inner = Buffer.from('Subject: b64 inner\r\n\r\ninner text', 'utf-8').toString('base64');
    const m = parseMime(
      msg('Content-Type: message/rfc822', 'Content-Transfer-Encoding: base64', '', inner),
    );
    expect(m.kind).toBe('rfc822');
    expect(m.encapsulated?.headers.find((h) => h.name === 'subject')?.value).toBe('b64 inner');
    expect(m.encapsulated?.text).toBe('inner text');
  });

  it('leaves text null for a non-text single-part leaf but keeps the bytes', () => {
    const m = parseMime(msg('Content-Type: application/json', '', '{"a":1}'));
    expect(m.text).toBeNull();
    expect(m.bytes && new TextDecoder().decode(m.bytes)).toBe('{"a":1}');
  });
});

describe('selectBodyStructure', () => {
  it('prefers the last displayable alternative and collects attachments', () => {
    const m = parseMime(
      msg(
        'Content-Type: multipart/mixed; boundary="OUT"',
        '',
        '--OUT',
        'Content-Type: multipart/alternative; boundary="IN"',
        '',
        '--IN',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'plain version',
        '--IN',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<p>html version</p>',
        '--IN--',
        '--OUT',
        'Content-Type: application/pdf; name="r.pdf"',
        'Content-Disposition: attachment; filename="r.pdf"',
        '',
        'JVBERi0=',
        '--OUT--',
      ),
    );
    const s = selectBodyStructure(m);
    expect(s.text).toBe('plain version');
    expect(s.html).toBe('<p>html version</p>');
    expect(s.attachments).toHaveLength(1);
    expect(s.attachments[0]?.filename).toBe('r.pdf');
  });

  it('handles a plain single-part message', () => {
    const s = selectBodyStructure(parseMime(msg('Content-Type: text/plain', '', 'just text')));
    expect(s).toEqual({ text: 'just text', html: null, attachments: [] });
  });

  it('routes an encapsulated message/rfc822 into attachments', () => {
    const m = parseMime(
      msg(
        'Content-Type: multipart/mixed; boundary="B"',
        '',
        '--B',
        'Content-Type: text/plain',
        '',
        'see attached mail',
        '--B',
        'Content-Type: message/rfc822',
        '',
        'Subject: forwarded',
        '',
        'forwarded body',
        '--B--',
      ),
    );
    const s = selectBodyStructure(m);
    expect(s.text).toBe('see attached mail');
    expect(s.attachments).toHaveLength(1);
    expect(s.attachments[0]?.kind).toBe('rfc822');
  });
});

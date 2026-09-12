import { describe, it, expect } from 'vitest';
import { XmlStreamParser, type XmlElement } from './xml-stream';
import { buildUploadSlotRequest, parseUploadSlot, parseUploadSlotError } from './http-upload';

function el(xml: string): XmlElement {
  let out: XmlElement | null = null;
  const p = new XmlStreamParser((e) => {
    if (e.type === 'stanza') out = e.element;
  });
  p.feed(`<stream:stream xmlns="jabber:client">`);
  p.feed(xml);
  if (out === null) throw new Error('no element');
  return out;
}

describe('buildUploadSlotRequest', () => {
  it('builds a slot request with filename/size/content-type', () => {
    const iq = buildUploadSlotRequest('u1', 'upload.example.org', 'cool.jpg', 23456, 'image/jpeg');
    expect(iq).toBe(
      '<iq type="get" to="upload.example.org" id="u1">' +
        '<request xmlns="urn:xmpp:http:upload:0" filename="cool.jpg" size="23456" content-type="image/jpeg"/>' +
        '</iq>',
    );
  });

  it('escapes a filename with reserved XML characters', () => {
    const iq = buildUploadSlotRequest('u2', 'upload.example.org', 'a&b<c>.png', 10, 'image/png');
    expect(iq).toContain('filename="a&amp;b&lt;c&gt;.png"');
  });

  it('omits content-type when empty, and floors/clamps a negative or fractional size', () => {
    const iq = buildUploadSlotRequest('u3', 'upload.example.org', 'f', -5.7, '');
    expect(iq).not.toContain('content-type');
    expect(iq).toContain('size="0"');
  });
});

describe('parseUploadSlot', () => {
  it('reads put/get urls and only the two spec-allowed headers', () => {
    const iq = el(
      `<iq from="upload.example.org" id="u1" type="result">` +
        `<slot xmlns="urn:xmpp:http:upload:0">` +
        `<put url="https://upload.example.org/abc/cool.jpg">` +
        `<header name="Authorization">Basic Zm9v</header>` +
        `<header name="Cookie">foo=bar</header>` +
        `<header name="X-Evil">inject-me</header>` +
        `</put>` +
        `<get url="https://download.example.org/abc/cool.jpg"/>` +
        `</slot></iq>`,
    );
    expect(parseUploadSlot(iq)).toEqual({
      putUrl: 'https://upload.example.org/abc/cool.jpg',
      putHeaders: { Authorization: 'Basic Zm9v', Cookie: 'foo=bar' },
      getUrl: 'https://download.example.org/abc/cool.jpg',
    });
  });

  it('a put with no headers at all still parses', () => {
    const iq = el(
      `<iq type="result"><slot xmlns="urn:xmpp:http:upload:0">` +
        `<put url="https://u/1"/><get url="https://g/1"/>` +
        `</slot></iq>`,
    );
    expect(parseUploadSlot(iq)).toEqual({ putUrl: 'https://u/1', putHeaders: {}, getUrl: 'https://g/1' });
  });

  it('returns null for an iq with no slot, or a slot missing either url', () => {
    expect(parseUploadSlot(el('<iq type="result"/>'))).toBeNull();
    expect(
      parseUploadSlot(
        el('<iq type="result"><slot xmlns="urn:xmpp:http:upload:0"><get url="https://g/1"/></slot></iq>'),
      ),
    ).toBeNull();
    expect(
      parseUploadSlot(
        el(
          '<iq type="result"><slot xmlns="urn:xmpp:http:upload:0"><put url="https://u/1"/></slot></iq>',
        ),
      ),
    ).toBeNull();
  });
});

describe('parseUploadSlotError', () => {
  it('reads the stanza error condition', () => {
    const iq = el(
      `<iq type="error" id="u1"><error type="modify">` +
        `<not-acceptable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>` +
        `<text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">File too large</text>` +
        `</error></iq>`,
    );
    expect(parseUploadSlotError(iq)).toEqual({ condition: 'not-acceptable', maxFileSize: null });
  });

  it('reads the XEP-0363 file-too-large extension when present', () => {
    const iq = el(
      `<iq type="error" id="u1"><error type="modify">` +
        `<not-acceptable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>` +
        `<file-too-large xmlns="urn:xmpp:http:upload:0"><max-file-size>10485760</max-file-size></file-too-large>` +
        `</error></iq>`,
    );
    expect(parseUploadSlotError(iq)).toEqual({ condition: 'not-acceptable', maxFileSize: 10_485_760 });
  });

  it('returns null for a non-error iq, or one with no <error/>', () => {
    expect(parseUploadSlotError(el('<iq type="result"/>'))).toBeNull();
    expect(parseUploadSlotError(el('<iq type="error"/>'))).toBeNull();
  });
});

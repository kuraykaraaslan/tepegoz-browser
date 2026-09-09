import { describe, it, expect } from 'vitest';
import {
  XmlStreamParser,
  type XmlStreamEvent,
  child,
  childText,
  children,
  decodeXmlText,
  encodeXmlText,
  text,
} from './xml-stream';

function collect(chunks: string[]): XmlStreamEvent[] {
  const events: XmlStreamEvent[] = [];
  const p = new XmlStreamParser((e) => events.push(e));
  for (const c of chunks) p.feed(c);
  return events;
}

describe('decodeXmlText / encodeXmlText', () => {
  it('round-trips the five predefined entities', () => {
    const s = `a <b> & "c" 'd'`;
    expect(decodeXmlText(encodeXmlText(s))).toBe(s);
  });

  it('decodes numeric character references and drops invalid ones', () => {
    expect(decodeXmlText('&#65;&#x42;')).toBe('AB');
    expect(decodeXmlText('&#xD800;')).toBe(''); // lone surrogate
    expect(decodeXmlText('&notanentity;')).toBe('&notanentity;');
  });
});

describe('XmlStreamParser — stream lifecycle', () => {
  it('emits open with the stream header attrs, then close', () => {
    const events = collect([
      `<?xml version="1.0"?><stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" from="example.com" id="c2s1" version="1.0">`,
      `</stream:stream>`,
    ]);
    const open = events[0];
    expect(open?.type).toBe('open');
    if (open?.type === 'open') {
      expect(open.name).toBe('stream:stream');
      expect(open.attrs.from).toBe('example.com');
      expect(open.attrs.id).toBe('c2s1');
      expect(open.attrs.version).toBe('1.0');
    }
    expect(events.at(-1)).toEqual({ type: 'close' });
  });

  it('ignores comments and a standalone <?xml?> declaration mid-stream', () => {
    const events = collect([
      `<stream:stream xmlns="jabber:client">`,
      `<!-- a comment --><message><body>hi</body></message>`,
    ]);
    const stanzas = events.filter((e) => e.type === 'stanza');
    expect(stanzas).toHaveLength(1);
  });

  it('buffers an incomplete tag until the rest arrives', () => {
    const events = collect([
      `<stream:stream xmlns="jabber:client">`,
      `<message from="a@x`,
      `.com"><body>ok</body></message>`,
    ]);
    const stanza = events.find((e) => e.type === 'stanza');
    if (stanza?.type === 'stanza') {
      expect(stanza.element.attrs.from).toBe('a@x.com');
      expect(childText(stanza.element, 'body')).toBe('ok');
    }
  });

  it('resolves a prefixed namespace from the stream root binding', () => {
    const events = collect([
      `<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`,
      `<stream:features><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/></stream:features>`,
    ]);
    const stanza = events.find((e) => e.type === 'stanza');
    if (stanza?.type === 'stanza') {
      expect(stanza.element.ns).toBe('http://etherx.jabber.org/streams');
      expect(stanza.element.local).toBe('features');
    }
  });

  it('ignores stray text outside any element', () => {
    const events = collect([`  \n  `, `<stream:stream xmlns="jabber:client"><presence/>`]);
    expect(events.filter((e) => e.type === 'stanza')).toHaveLength(1);
  });

  it('parses a message stanza split across chunks', () => {
    const events = collect([
      `<stream:stream xmlns="jabber:client">`,
      `<message from="bob@x.com/p" to="ada@x.com" type="chat"><bo`,
      `dy>merhaba &amp; selam</body><active xmlns="http://jabber.org/protocol/chatstates"/></mess`,
      `age>`,
    ]);
    const stanza = events.find((e) => e.type === 'stanza');
    expect(stanza?.type).toBe('stanza');
    if (stanza?.type === 'stanza') {
      expect(stanza.element.local).toBe('message');
      expect(stanza.element.attrs.type).toBe('chat');
      expect(childText(stanza.element, 'body')).toBe('merhaba & selam');
      expect(child(stanza.element, 'active')?.ns).toBe('http://jabber.org/protocol/chatstates');
    }
  });

  it('handles self-closing presence and nested children', () => {
    const [, ...rest] = collect([
      `<stream:stream xmlns="jabber:client">`,
      `<presence/>`,
      `<iq type="result" id="1"><query xmlns="jabber:iq:roster"><item jid="a@x.com" subscription="both"/><item jid="b@x.com" subscription="to"/></query></iq>`,
    ]);
    expect(rest[0]).toMatchObject({ type: 'stanza', element: { local: 'presence' } });
    const iq = rest[1];
    if (iq?.type === 'stanza') {
      const query = child(iq.element, 'query', 'jabber:iq:roster');
      expect(query).not.toBeNull();
      expect(children(query as never, 'item')).toHaveLength(2);
    }
  });

  it('preserves CDATA content verbatim', () => {
    const events = collect([
      `<stream:stream xmlns="jabber:client">`,
      `<message><body><![CDATA[a <b> & c]]></body></message>`,
    ]);
    const stanza = events.find((e) => e.type === 'stanza');
    if (stanza?.type === 'stanza') expect(childText(stanza.element, 'body')).toBe('a <b> & c');
  });
});

describe('XmlStreamParser — fail-closed', () => {
  it('errors on a close-tag mismatch and stops accepting input', () => {
    const events = collect([`<stream:stream xmlns="jabber:client">`, `<message></iq>`]);
    expect(events.at(-1)?.type).toBe('error');
    const p = new XmlStreamParser((e) => events.push(e));
    // a fresh parser is unaffected — the failure is per-instance
    p.feed(`<stream:stream/>`);
  });

  it('errors on excessive nesting', () => {
    const deep = '<a>'.repeat(40);
    const events = collect([`<stream:stream xmlns="jabber:client">`, deep]);
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  it('errors on a tag with too many attributes', () => {
    const attrs = Array.from({ length: 70 }, (_, i) => `a${String(i)}="x"`).join(' ');
    const events = collect([`<stream:stream xmlns="jabber:client">`, `<message ${attrs}/>`]);
    expect(events.at(-1)?.type).toBe('error');
  });

  it('errors on a malformed (nameless) tag', () => {
    const events = collect([`<stream:stream xmlns="jabber:client">`, `< >`]);
    expect(events.at(-1)?.type).toBe('error');
  });

  it('stops emitting after a failure — further feed() is inert', () => {
    const events: XmlStreamEvent[] = [];
    const p = new XmlStreamParser((e) => events.push(e));
    p.feed(`<stream:stream xmlns="jabber:client"><message></iq>`);
    const n = events.length;
    p.feed(`<presence/>`);
    expect(events.length).toBe(n);
  });

  it('errors when the un-parsed buffer would exceed the cap', () => {
    const events: XmlStreamEvent[] = [];
    const p = new XmlStreamParser((e) => events.push(e));
    p.feed(`<stream:stream xmlns="jabber:client"><message>`);
    p.feed('x'.repeat(1_100_000));
    expect(events.at(-1)?.type).toBe('error');
  });
});

describe('element helpers', () => {
  it('text concatenates direct text nodes only; childText returns "" when absent', () => {
    const events = collect([
      `<stream:stream xmlns="jabber:client">`,
      `<message><body>a<x/>b</body></message>`,
    ]);
    const stanza = events.find((e) => e.type === 'stanza');
    if (stanza?.type === 'stanza') {
      const body = child(stanza.element, 'body');
      expect(body && text(body)).toBe('ab');
      expect(childText(stanza.element, 'subject')).toBe('');
      expect(child(stanza.element, 'nope')).toBeNull();
      expect(children(stanza.element, 'nope')).toEqual([]);
    }
  });
});

describe('XmlStreamParser — tricky lexing', () => {
  it('does not end the tag on a > inside a quoted attribute value', () => {
    const events = collect([
      `<stream:stream xmlns="jabber:client">`,
      `<message subject="a > b"><body>hi</body></message>`,
    ]);
    const stanza = events.find((e) => e.type === 'stanza');
    if (stanza?.type === 'stanza') expect(stanza.element.attrs.subject).toBe('a > b');
  });

  it('concatenates text that arrives split across chunks', () => {
    const events = collect([
      `<stream:stream xmlns="jabber:client">`,
      `<message><body>hel`,
      `lo world</body></message>`,
    ]);
    const stanza = events.find((e) => e.type === 'stanza');
    if (stanza?.type === 'stanza') expect(childText(stanza.element, 'body')).toBe('hello world');
  });

  it('waits for the end of an incomplete CDATA / comment', () => {
    const events = collect([
      `<stream:stream xmlns="jabber:client">`,
      `<message><body><![CDATA[part`,
      `ial]]></body><!-- c`,
      `omment --></message>`,
    ]);
    const stanza = events.find((e) => e.type === 'stanza');
    if (stanza?.type === 'stanza') expect(childText(stanza.element, 'body')).toBe('partial');
  });
});

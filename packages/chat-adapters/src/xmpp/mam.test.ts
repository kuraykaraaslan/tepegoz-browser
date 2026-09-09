import { describe, it, expect } from 'vitest';
import { XmlStreamParser, type XmlElement } from './xml-stream';
import { buildMamQuery, parseMamFin, parseMamResult } from './mam';
import type { StanzaContext } from './stanzas';

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

const ctx: StanzaContext = { accountId: 'acc', selfBareJid: 'ada@x.com', now: 9999 };

describe('buildMamQuery', () => {
  it('builds a with-scoped, most-recent-page query', () => {
    const q = buildMamQuery({ queryId: 'q1', withJid: 'bob@x.com', max: 25 });
    expect(q).toContain('<query xmlns="urn:xmpp:mam:2" queryid="q1">');
    expect(q).toContain('<field var="FORM_TYPE" type="hidden"><value>urn:xmpp:mam:2</value></field>');
    expect(q).toContain('<field var="with"><value>bob@x.com</value></field>');
    expect(q).toContain('<max>25</max>');
    expect(q).toContain('<before/>');
  });

  it('omits the with field and pages before a cursor', () => {
    const q = buildMamQuery({ queryId: 'q2', before: 'abc' });
    expect(q).not.toContain('var="with"');
    expect(q).toContain('<before>abc</before>');
    expect(q).toContain('<max>50</max>');
  });
});

describe('parseMamResult', () => {
  const wrap = (inner: string, stamp = '2020-01-01T00:00:00Z', archiveId = 'arch-1') =>
    `<message><result xmlns="urn:xmpp:mam:2" queryid="q1" id="${archiveId}">` +
    `<forwarded xmlns="urn:xmpp:forward:0"><delay xmlns="urn:xmpp:delay" stamp="${stamp}"/>${inner}</forwarded>` +
    `</result></message>`;

  it('extracts the forwarded message and uses the archive id + delay timestamp', () => {
    const m = parseMamResult(
      el(wrap(`<message from="bob@x.com/p" type="chat" id="orig"><body>hi</body></message>`)),
      ctx,
    );
    expect(m).toMatchObject({
      body: 'hi',
      protocolId: 'arch-1',
      id: 'arch-1',
      senderAddress: 'bob@x.com',
      originTs: Date.parse('2020-01-01T00:00:00Z'),
    });
  });

  it('falls back to the original protocol id when no archive id is present', () => {
    const raw = `<message><result xmlns="urn:xmpp:mam:2" queryid="q1"><forwarded xmlns="urn:xmpp:forward:0"><message from="b@x.com/p" type="chat" id="orig"><body>x</body></message></forwarded></result></message>`;
    expect(parseMamResult(el(raw), ctx)?.protocolId).toBe('orig');
  });

  it('returns null for a non-message forwarded stanza or a malformed result', () => {
    expect(
      parseMamResult(el(wrap(`<presence from="b@x.com/p"><show>away</show></presence>`)), ctx),
    ).toBeNull();
    expect(parseMamResult(el(`<message><result xmlns="urn:xmpp:mam:2"/></message>`), ctx)).toBeNull();
    expect(parseMamResult(el(`<message/>`), ctx)).toBeNull();
  });

  it('accepts a <result/> element directly, not only the wrapping <message/>', () => {
    const resultEl = el(
      `<result xmlns="urn:xmpp:mam:2" queryid="q1" id="a9"><forwarded xmlns="urn:xmpp:forward:0"><message from="b@x.com/p" type="chat"><body>y</body></message></forwarded></result>`,
    );
    expect(parseMamResult(resultEl, ctx)?.protocolId).toBe('a9');
  });
});

describe('parseMamFin', () => {
  it('reads complete + first/last/count from the RSM set', () => {
    const fin = parseMamFin(
      el(
        `<iq type="result" id="q1"><fin xmlns="urn:xmpp:mam:2" complete="true"><set xmlns="http://jabber.org/protocol/rsm"><first>f1</first><last>l9</last><count>42</count></set></fin></iq>`,
      ),
    );
    expect(fin).toEqual({ complete: true, firstCursor: 'f1', lastCursor: 'l9', count: 42 });
  });

  it('handles a fin with no set and a missing fin', () => {
    expect(parseMamFin(el(`<iq type="result"><fin xmlns="urn:xmpp:mam:2"/></iq>`))).toEqual({
      complete: false,
      firstCursor: null,
      lastCursor: null,
      count: null,
    });
    expect(parseMamFin(el(`<iq type="result"/>`)).complete).toBe(true);
  });
});

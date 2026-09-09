import { describe, it, expect } from 'vitest';
import { XmlStreamParser, type XmlElement } from './xml-stream';
import { parseStreamFeatures, pickSaslMechanism } from './features';

function parseOne(xml: string): XmlElement {
  let el: XmlElement | null = null;
  const p = new XmlStreamParser((e) => {
    if (e.type === 'stanza') el = e.element;
  });
  p.feed(`<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`);
  p.feed(xml);
  if (el === null) throw new Error('no stanza');
  return el;
}

describe('parseStreamFeatures', () => {
  it('parses a pre-TLS features element with required STARTTLS', () => {
    const f = parseStreamFeatures(
      parseOne(
        `<stream:features><starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"><required/></starttls></stream:features>`,
      ),
    );
    expect(f.startTls).toBe(true);
    expect(f.startTlsRequired).toBe(true);
    expect(f.mechanisms).toEqual([]);
  });

  it('parses SASL mechanisms in server order, upper-cased', () => {
    const f = parseStreamFeatures(
      parseOne(
        `<stream:features><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>scram-sha-256</mechanism><mechanism>SCRAM-SHA-1</mechanism><mechanism>PLAIN</mechanism></mechanisms></stream:features>`,
      ),
    );
    expect(f.mechanisms).toEqual(['SCRAM-SHA-256', 'SCRAM-SHA-1', 'PLAIN']);
  });

  it('parses the post-auth feature set (bind, session, sm, csi)', () => {
    const f = parseStreamFeatures(
      parseOne(
        `<stream:features><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/><session xmlns="urn:ietf:params:xml:ns:xmpp-session"/><sm xmlns="urn:xmpp:sm:3"/><csi xmlns="urn:xmpp:csi:0"/><foo/></stream:features>`,
      ),
    );
    expect(f).toMatchObject({
      bind: true,
      session: true,
      streamManagement: true,
      clientStateIndication: true,
      startTls: false,
      other: ['foo'],
    });
  });
});

describe('pickSaslMechanism', () => {
  it('prefers SCRAM-SHA-256 > SCRAM-SHA-1 > PLAIN', () => {
    expect(
      pickSaslMechanism(['PLAIN', 'SCRAM-SHA-1', 'SCRAM-SHA-256'], { tlsActive: true }),
    ).toBe('SCRAM-SHA-256');
    expect(pickSaslMechanism(['PLAIN', 'SCRAM-SHA-1'], { tlsActive: true })).toBe('SCRAM-SHA-1');
  });

  it('only falls back to PLAIN when TLS is active', () => {
    expect(pickSaslMechanism(['PLAIN'], { tlsActive: true })).toBe('PLAIN');
    expect(pickSaslMechanism(['PLAIN'], { tlsActive: false })).toBeNull();
  });

  it('prefers -PLUS variants only when channel binding is available', () => {
    expect(
      pickSaslMechanism(['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'], {
        tlsActive: true,
        channelBindingAvailable: true,
      }),
    ).toBe('SCRAM-SHA-256-PLUS');
    expect(
      pickSaslMechanism(['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'], { tlsActive: true }),
    ).toBe('SCRAM-SHA-256');
  });

  it('returns null when nothing acceptable is offered', () => {
    expect(pickSaslMechanism(['ANONYMOUS', 'EXTERNAL'], { tlsActive: true })).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { XmlStreamParser, type XmlElement } from './xml-stream';
import { StreamManager } from './stream-management';

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

const enabled = (attrs = 'id="sm-1" resume="true" max="300"') =>
  el(`<enabled xmlns="urn:xmpp:sm:3" ${attrs}/>`);
const ack = (h: number) => el(`<a xmlns="urn:xmpp:sm:3" h="${String(h)}"/>`);

describe('StreamManager — enable & resume eligibility', () => {
  it('records id + max from <enabled/> and becomes resumable', () => {
    const sm = new StreamManager();
    expect(sm.canResume).toBe(false);
    sm.onEnabled(enabled());
    expect(sm.isEnabled).toBe(true);
    expect(sm.canResume).toBe(true);
    expect(sm.previd).toBe('sm-1');
    expect(sm.resumptionWindowSeconds).toBe(300);
  });

  it('is enabled but not resumable when the server withholds an id', () => {
    const sm = new StreamManager();
    sm.onEnabled(enabled('resume="false"'));
    expect(sm.isEnabled).toBe(true);
    expect(sm.canResume).toBe(false);
    expect(sm.resumeXml()).toBeNull();
  });

  it('ignores a non-<enabled/> element', () => {
    const sm = new StreamManager();
    sm.onEnabled(el(`<message/>`));
    expect(sm.isEnabled).toBe(false);
  });
});

describe('StreamManager — h counting & acks', () => {
  it('counts inbound stanzas and answers <r/> with the current h', () => {
    const sm = new StreamManager();
    sm.onEnabled(enabled());
    sm.countInbound();
    sm.countInbound();
    sm.countInbound();
    expect(sm.inboundCount).toBe(3);
    expect(sm.ackAnswerXml()).toBe('<a xmlns="urn:xmpp:sm:3" h="3"/>');
  });

  it('drops acked stanzas from the replay queue', () => {
    const sm = new StreamManager();
    sm.onEnabled(enabled());
    sm.trackOutbound('<message id="1"/>');
    sm.trackOutbound('<message id="2"/>');
    sm.trackOutbound('<message id="3"/>');
    expect(sm.unackedCount).toBe(3);
    expect(sm.onAck(ack(2))).toBe(2);
    expect(sm.unackedCount).toBe(1);
    expect(sm.onAck(ack(3))).toBe(1);
    expect(sm.unackedCount).toBe(0);
  });

  it('ignores a malformed <a/> and a non-ack element', () => {
    const sm = new StreamManager();
    sm.trackOutbound('<m/>');
    expect(sm.onAck(el(`<a xmlns="urn:xmpp:sm:3"/>`))).toBe(0);
    expect(sm.onAck(el(`<message/>`))).toBe(0);
    expect(sm.unackedCount).toBe(1);
  });

  it('caps the replay queue and flags overflow', () => {
    const sm = new StreamManager({ maxQueue: 16 });
    for (let i = 0; i < 40; i += 1) sm.trackOutbound(`<m i="${String(i)}"/>`);
    expect(sm.unackedCount).toBe(16);
    expect(sm.overflowed).toBe(true);
  });
});

describe('StreamManager — resumption', () => {
  it('produces a <resume/> and replays the unacked tail on <resumed/>', () => {
    const sm = new StreamManager();
    sm.onEnabled(enabled());
    sm.countInbound();
    sm.countInbound();
    sm.trackOutbound('<message id="a"/>');
    sm.trackOutbound('<message id="b"/>');
    sm.trackOutbound('<message id="c"/>');

    expect(sm.resumeXml()).toBe('<resume xmlns="urn:xmpp:sm:3" h="2" previd="sm-1"/>');

    const toResend = sm.onResumed(el(`<resumed xmlns="urn:xmpp:sm:3" previd="sm-1" h="1"/>`));
    expect(toResend).toEqual(['<message id="b"/>', '<message id="c"/>']);
  });

  it('<failed/> makes the session unresumable', () => {
    const sm = new StreamManager();
    sm.onEnabled(enabled());
    sm.onFailed(el(`<failed xmlns="urn:xmpp:sm:3"><item-not-found/></failed>`));
    expect(sm.canResume).toBe(false);
    expect(sm.isEnabled).toBe(false);
  });

  it('onResumed ignores a wrong element and reset clears everything', () => {
    const sm = new StreamManager();
    sm.onEnabled(enabled());
    sm.trackOutbound('<m/>');
    expect(sm.onResumed(el(`<message/>`))).toEqual([]);
    sm.reset();
    expect(sm.isEnabled).toBe(false);
    expect(sm.unackedCount).toBe(0);
    expect(sm.inboundCount).toBe(0);
    expect(sm.overflowed).toBe(false);
  });
});

describe('StreamManager — 32-bit wrap', () => {
  it('inbound counter wraps at 2^32', () => {
    const sm = new StreamManager();
    // @ts-expect-error — poke the private counter to just below the modulo for the wrap test
    sm.inbound = 0xffffffff;
    sm.countInbound();
    expect(sm.inboundCount).toBe(0);
  });

  it('acks a pre-wrap seq using modular comparison', () => {
    const sm = new StreamManager();
    // @ts-expect-error — set outbound near the wrap boundary
    sm.outbound = 0xfffffffe;
    sm.trackOutbound('<m1/>'); // seq 0xffffffff
    sm.trackOutbound('<m2/>'); // seq 0
    sm.trackOutbound('<m3/>'); // seq 1
    expect(sm.unackedCount).toBe(3);
    // server acked through seq 0 (post-wrap)
    expect(sm.onAck(ack(0))).toBe(2);
    expect(sm.unackedCount).toBe(1);
  });

  it('exposes static enable/request xml', () => {
    expect(StreamManager.enableXml()).toContain('resume="true"');
    expect(StreamManager.enableXml(false)).toContain('resume="false"');
    expect(StreamManager.requestXml()).toBe('<r xmlns="urn:xmpp:sm:3"/>');
  });
});

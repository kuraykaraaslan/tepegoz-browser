import { describe, it, expect } from 'vitest';
import { normalizeEvent } from '@tepegoz/chat-core';
import { XMPP_CAPS } from '../caps';
import { XmlStreamParser, type XmlElement } from './xml-stream';
import {
  buildChatState,
  buildMessage,
  buildPresence,
  buildReactions,
  buildReadMarker,
  buildReceipt,
  parseReactionsStanza,
  stanzaToEvent,
  type StanzaContext,
} from './stanzas';

const ctx: StanzaContext = { accountId: 'acc', selfBareJid: 'ada@x.com', now: 1000 };

/** Parse one stanza string (no stream wrapper needed — feed a fake root). */
function parseOne(xml: string): XmlElement {
  let el: XmlElement | null = null;
  const p = new XmlStreamParser((e) => {
    if (e.type === 'stanza') el = e.element;
  });
  p.feed(`<stream:stream xmlns="jabber:client">`);
  p.feed(xml);
  if (el === null) throw new Error('no stanza parsed');
  return el;
}

describe('stanzaToEvent — messages', () => {
  it('maps a chat message to a message event', () => {
    const ev = stanzaToEvent(
      parseOne(`<message from="bob@x.com/phone" to="ada@x.com" type="chat" id="m1"><body>merhaba</body></message>`),
      ctx,
    );
    expect(ev?.type).toBe('message');
    if (ev?.type === 'message') {
      expect(ev.message.body).toBe('merhaba');
      expect(ev.message.protocolId).toBe('m1');
      expect(ev.message.senderAddress).toBe('bob@x.com');
      expect(ev.message.conversationId).toBe('bob@x.com');
      expect(ev.message.originTs).toBe(1000);
    }
  });

  it('uses <delay/> as originTs for a carbon / MAM message', () => {
    const ev = stanzaToEvent(
      parseOne(
        `<message from="bob@x.com/p" type="chat" id="m2"><body>gec mesaj</body><delay xmlns="urn:xmpp:delay" stamp="2020-01-01T00:00:00Z"/></message>`,
      ),
      ctx,
    );
    if (ev?.type === 'message') expect(ev.message.originTs).toBe(Date.parse('2020-01-01T00:00:00Z'));
  });

  it('maps XEP-0308 correction to a message-edit', () => {
    const ev = stanzaToEvent(
      parseOne(
        `<message from="bob@x.com/p" type="chat" id="m3"><body>fixed</body><replace xmlns="urn:xmpp:message-correct:0" id="m1"/></message>`,
      ),
      ctx,
    );
    expect(ev).toMatchObject({ type: 'message-edit', protocolId: 'm1', body: 'fixed' });
  });

  it('maps a retraction to message-redact', () => {
    const ev = stanzaToEvent(
      parseOne(
        `<message from="bob@x.com/p" type="chat"><retract xmlns="urn:xmpp:message-retract:1" id="m1"/></message>`,
      ),
      ctx,
    );
    expect(ev).toMatchObject({ type: 'message-redact', protocolId: 'm1' });
  });

  it('maps a delivery receipt and a read marker', () => {
    const delivered = stanzaToEvent(
      parseOne(`<message from="bob@x.com/p" type="chat"><received xmlns="urn:xmpp:receipts" id="m1"/></message>`),
      ctx,
    );
    expect(delivered).toMatchObject({ type: 'receipt', receipt: { kind: 'delivered', messageId: 'm1' } });
    const read = stanzaToEvent(
      parseOne(`<message from="bob@x.com/p" type="chat"><displayed xmlns="urn:xmpp:chat-markers:0" id="m1"/></message>`),
      ctx,
    );
    expect(read).toMatchObject({ type: 'receipt', receipt: { kind: 'read' } });
  });

  it('maps a chat-state notification to typing (composing → active:true)', () => {
    const ev = stanzaToEvent(
      parseOne(`<message from="bob@x.com/p" type="chat"><composing xmlns="http://jabber.org/protocol/chatstates"/></message>`),
      ctx,
    );
    expect(ev).toMatchObject({ type: 'typing', active: true, senderAddress: 'bob@x.com' });
  });

  it('returns null for an empty message with nothing modelled', () => {
    expect(stanzaToEvent(parseOne(`<message from="bob@x.com/p" type="chat"/>`), ctx)).toBeNull();
  });

  it('falls back to now when <delay/> has a bad or missing stamp', () => {
    const bad = stanzaToEvent(
      parseOne(`<message from="b@x.com/p" type="chat" id="m"><body>x</body><delay xmlns="urn:xmpp:delay" stamp="not-a-date"/></message>`),
      ctx,
    );
    if (bad?.type === 'message') expect(bad.message.originTs).toBe(1000);
    const noStamp = stanzaToEvent(
      parseOne(`<message from="b@x.com/p" type="chat" id="m"><body>x</body><delay xmlns="urn:xmpp:delay"/></message>`),
      ctx,
    );
    if (noStamp?.type === 'message') expect(noStamp.message.originTs).toBe(1000);
  });

  it('uses stanza-id when the message has no id attribute', () => {
    const ev = stanzaToEvent(
      parseOne(
        `<message from="b@x.com/p" type="chat"><body>x</body><stanza-id xmlns="urn:xmpp:sid:0" id="sid-9"/></message>`,
      ),
      ctx,
    );
    if (ev?.type === 'message') expect(ev.message.protocolId).toBe('sid-9');
  });

  it('a groupchat message takes senderName from the occupant resource', () => {
    const ev = stanzaToEvent(
      parseOne(`<message from="room@conf.x.com/Cem" type="groupchat" id="g1"><body>selam</body></message>`),
      ctx,
    );
    if (ev?.type === 'message') {
      expect(ev.message.senderName).toBe('Cem');
      expect(ev.message.senderAddress).toBe('room@conf.x.com/Cem');
      expect(ev.message.conversationId).toBe('room@conf.x.com');
    }
  });

  it('a correction with an empty body is dropped', () => {
    expect(
      stanzaToEvent(
        parseOne(`<message from="b@x.com/p" type="chat"><replace xmlns="urn:xmpp:message-correct:0" id="m1"/></message>`),
        ctx,
      ),
    ).toBeNull();
  });

  it('normalizeEvent accepts what stanzaToEvent produces', () => {
    const ev = stanzaToEvent(
      parseOne(`<message from="bob@x.com/p" type="chat" id="m1"><body>hi</body></message>`),
      ctx,
    );
    expect(normalizeEvent(ev, XMPP_CAPS).event?.type).toBe('message');
  });
});

describe('stanzaToEvent — presence & roster', () => {
  it('maps presence show/status across all show values', () => {
    expect(
      stanzaToEvent(parseOne(`<presence from="b@x.com/p"><show>dnd</show><status>busy</status></presence>`), ctx),
    ).toMatchObject({ type: 'presence', address: 'b@x.com/p', presence: 'dnd', statusText: 'busy' });
    expect(
      stanzaToEvent(parseOne(`<presence from="b@x.com/p"><show>away</show></presence>`), ctx),
    ).toMatchObject({ presence: 'away' });
    expect(
      stanzaToEvent(parseOne(`<presence from="b@x.com/p"><show>xa</show></presence>`), ctx),
    ).toMatchObject({ presence: 'xa' });
    expect(stanzaToEvent(parseOne(`<presence from="b@x.com/p"/>`), ctx)).toMatchObject({
      presence: 'online',
    });
  });

  it('maps unavailable to offline and ignores self / subscription presences', () => {
    expect(
      stanzaToEvent(parseOne(`<presence from="bob@x.com/p" type="unavailable"/>`), ctx),
    ).toMatchObject({ presence: 'offline' });
    expect(stanzaToEvent(parseOne(`<presence from="ada@x.com/p"/>`), ctx)).toBeNull();
    expect(
      stanzaToEvent(parseOne(`<presence from="c@x.com" type="subscribe"/>`), ctx),
    ).toBeNull();
  });

  it('maps a roster-set push to a roster-change with groups', () => {
    const ev = stanzaToEvent(
      parseOne(
        `<iq type="set" id="r1"><query xmlns="jabber:iq:roster"><item jid="c@x.com" name="Cem" subscription="both"><group>work</group></item></query></iq>`,
      ),
      ctx,
    );
    expect(ev).toMatchObject({
      type: 'roster-change',
      removed: false,
      contact: { address: 'c@x.com', name: 'Cem', subscription: 'both', groups: ['work'] },
    });
  });

  it('maps subscription="remove" to a removal, and a groupless "to" item', () => {
    expect(
      stanzaToEvent(
        parseOne(
          `<iq type="set"><query xmlns="jabber:iq:roster"><item jid="c@x.com" subscription="remove"/></query></iq>`,
        ),
        ctx,
      ),
    ).toMatchObject({ type: 'roster-change', removed: true });
    expect(
      stanzaToEvent(
        parseOne(
          `<iq type="set"><query xmlns="jabber:iq:roster"><item jid="d@x.com" subscription="to"/></query></iq>`,
        ),
        ctx,
      ),
    ).toMatchObject({ contact: { subscription: 'to', groups: [] } });
    // unknown subscription value → 'none'
    expect(
      stanzaToEvent(
        parseOne(
          `<iq type="set"><query xmlns="jabber:iq:roster"><item jid="e@x.com" subscription="pending"/></query></iq>`,
        ),
        ctx,
      ),
    ).toMatchObject({ contact: { subscription: 'none' } });
  });

  it('ignores a roster iq with no item and a non-set roster iq', () => {
    expect(
      stanzaToEvent(parseOne(`<iq type="set"><query xmlns="jabber:iq:roster"/></iq>`), ctx),
    ).toBeNull();
    expect(
      stanzaToEvent(
        parseOne(`<iq type="get"><query xmlns="jabber:iq:roster"><item jid="c@x.com"/></query></iq>`),
        ctx,
      ),
    ).toBeNull();
  });

  it('ignores an iq result / non-roster iq / unknown stanza kind', () => {
    expect(stanzaToEvent(parseOne(`<iq type="result" id="1"/>`), ctx)).toBeNull();
    expect(stanzaToEvent(parseOne(`<iq type="set"/>`), ctx)).toBeNull();
    expect(stanzaToEvent(parseOne(`<features/>`), ctx)).toBeNull();
  });

  it('a message with no routable peer returns null; a to-only message uses the to jid', () => {
    expect(stanzaToEvent(parseOne(`<message type="chat"><body>x</body></message>`), ctx)).toBeNull();
    const toOnly = stanzaToEvent(
      parseOne(`<message to="bob@x.com" type="chat" id="m"><body>x</body></message>`),
      ctx,
    );
    if (toOnly?.type === 'message') expect(toOnly.message.conversationId).toBe('bob@x.com');
  });

  it('drops empty <group/> text on a roster item', () => {
    const ev = stanzaToEvent(
      parseOne(
        `<iq type="set"><query xmlns="jabber:iq:roster"><item jid="f@x.com" subscription="both"><group></group><group>real</group></item></query></iq>`,
      ),
      ctx,
    );
    if (ev?.type === 'roster-change') expect(ev.contact.groups).toEqual(['real']);
  });
});

describe('outgoing builders', () => {
  it('buildMessage escapes the body and sets type + chat-state', () => {
    const xml = buildMessage({ to: 'bob@x.com', body: 'a <b> & c', id: 'm9' });
    expect(xml).toContain('<body>a &lt;b&gt; &amp; c</body>');
    expect(xml).toContain('type="chat"');
    expect(xml).toContain('http://jabber.org/protocol/chatstates');
  });

  it('buildMessage carries a correction id and a receipt request', () => {
    const xml = buildMessage({ to: 'b@x', body: 'x', id: 'm', replaceId: 'old', requestReceipt: true });
    expect(xml).toContain('urn:xmpp:message-correct:0');
    expect(xml).toContain('<request xmlns="urn:xmpp:receipts"/>');
  });

  it('round-trips: buildMessage → parse → stanzaToEvent', () => {
    const xml = buildMessage({ to: 'bob@x.com', body: 'ping', id: 'm10', groupchat: true });
    const ev = stanzaToEvent({ ...parseOne(xml), attrs: { ...parseOne(xml).attrs, from: 'room@x.com/ada' } }, ctx);
    if (ev?.type === 'message') expect(ev.message.body).toBe('ping');
  });

  it('buildChatState / buildReceipt / buildReadMarker / buildPresence shapes', () => {
    expect(buildChatState('b@x', 'composing')).toContain('<composing ');
    expect(buildReceipt('b@x', 'm1')).toContain('<received xmlns="urn:xmpp:receipts" id="m1"/>');
    expect(buildReadMarker('b@x', 'm1')).toContain('urn:xmpp:chat-markers:0');
    expect(buildPresence()).toBe('<presence/>');
    expect(buildPresence('away', 'brb')).toBe('<presence><show>away</show><status>brb</status></presence>');
  });

  it('buildReactions sends the full set (XEP-0444), chat by default and groupchat when asked', () => {
    const q = buildReactions('b@x', 'm1', ['👍', '🔥']);
    expect(q).toBe(
      '<message to="b@x" type="chat"><reactions xmlns="urn:xmpp:reactions:0" id="m1">' +
        '<reaction>👍</reaction><reaction>🔥</reaction></reactions></message>',
    );
    expect(buildReactions('room@conf', 'm1', [], true)).toBe(
      '<message to="room@conf" type="groupchat"><reactions xmlns="urn:xmpp:reactions:0" id="m1"></reactions></message>',
    );
  });
});

describe('parseReactionsStanza', () => {
  it('reads the target id and the full emoji set', () => {
    const el = parseOne(
      '<message from="b@x/p"><reactions xmlns="urn:xmpp:reactions:0" id="m1">' +
        '<reaction>👍</reaction><reaction>🔥</reaction></reactions></message>',
    );
    expect(parseReactionsStanza(el)).toEqual({ targetId: 'm1', emojis: ['👍', '🔥'] });
  });

  it('an empty <reactions/> means "cleared everything"', () => {
    const el = parseOne('<message><reactions xmlns="urn:xmpp:reactions:0" id="m1"/></message>');
    expect(parseReactionsStanza(el)).toEqual({ targetId: 'm1', emojis: [] });
  });

  it('returns null for a message with no <reactions>, or a wrong-namespace one', () => {
    expect(parseReactionsStanza(parseOne('<message><body>hi</body></message>'))).toBeNull();
    expect(parseReactionsStanza(parseOne('<message><reactions id="m1"/></message>'))).toBeNull();
  });
});

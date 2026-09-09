import { describe, expect, it } from 'vitest';
import { XmlStreamParser, type XmlElement } from './xml-stream';
import { buildDiscoInfo, buildDiscoItems, parseDiscoInfo, parseDiscoItems } from './disco';

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

describe('disco builders', () => {
  it('request the right query namespace', () => {
    expect(buildDiscoItems('conf.example', 'i1')).toBe(
      '<iq type="get" to="conf.example" id="i1"><query xmlns="http://jabber.org/protocol/disco#items"/></iq>',
    );
    expect(buildDiscoInfo('room@conf.example', 'i2')).toContain(
      '<query xmlns="http://jabber.org/protocol/disco#info"/>',
    );
  });
});

describe('parseDiscoItems', () => {
  it('lists the rooms a MUC service advertises', () => {
    const items = parseDiscoItems(
      el(
        `<iq type="result" from="conf.example"><query xmlns="http://jabber.org/protocol/disco#items">` +
          `<item jid="general@conf.example" name="General"/>` +
          `<item jid="random@conf.example"/>` +
          `<item name="no-jid-dropped"/>` +
          `</query></iq>`,
      ),
    );
    expect(items).toEqual([
      { jid: 'general@conf.example', name: 'General' },
      { jid: 'random@conf.example', name: null },
    ]);
  });

  it('returns null when there is no disco#items query', () => {
    expect(parseDiscoItems(el(`<iq type="result"><query xmlns="jabber:iq:roster"/></iq>`))).toBeNull();
  });
});

describe('parseDiscoInfo', () => {
  it('reads identities + features and the room extras for a MUC room', () => {
    const info = parseDiscoInfo(
      el(
        `<iq type="result" from="general@conf.example"><query xmlns="http://jabber.org/protocol/disco#info">` +
          `<identity category="conference" type="text" name="General"/>` +
          `<feature var="http://jabber.org/protocol/muc"/>` +
          `<feature var="muc_membersonly"/>` +
          `<feature var="muc_passwordprotected"/>` +
          `<x xmlns="jabber:x:data" type="result">` +
          `<field var="muc#roominfo_occupants"><value>42</value></field>` +
          `<field var="muc#roominfo_description"><value>Water cooler</value></field>` +
          `</x></query></iq>`,
      ),
    );
    expect(info?.identities).toEqual([{ category: 'conference', type: 'text', name: 'General' }]);
    expect(info?.room).toEqual({
      occupants: 42,
      passwordProtected: true,
      membersOnly: true,
      hidden: false,
      description: 'Water cooler',
    });
  });

  it('leaves room null for a non-room entity and tolerates a missing form', () => {
    const server = parseDiscoInfo(
      el(
        `<iq type="result" from="example"><query xmlns="http://jabber.org/protocol/disco#info">` +
          `<identity category="server" type="im"/><feature var="urn:xmpp:ping"/></query></iq>`,
      ),
    );
    expect(server?.room).toBeNull();

    const bareRoom = parseDiscoInfo(
      el(
        `<iq type="result"><query xmlns="http://jabber.org/protocol/disco#info">` +
          `<identity category="conference" type="text"/></query></iq>`,
      ),
    );
    expect(bareRoom?.room).toEqual({
      occupants: null,
      passwordProtected: false,
      membersOnly: false,
      hidden: false,
      description: null,
    });
  });

  it('recognises a room by the conference/text identity alone (no muc feature)', () => {
    const info = parseDiscoInfo(
      el(
        `<iq type="result"><query xmlns="http://jabber.org/protocol/disco#info">` +
          `<identity category="conference" type="text" name="Room"/>` +
          `<x xmlns="jabber:x:data"><field><value>ignored</value></field>` +
          `<field var="muc#roominfo_occupants"><value>lots</value></field></x>` +
          `</query></iq>`,
      ),
    );
    expect(info?.room?.occupants).toBeNull(); // "lots" is not a number
  });

  it('returns null when there is no disco#info query', () => {
    expect(parseDiscoInfo(el(`<iq type="result"/>`))).toBeNull();
  });
});

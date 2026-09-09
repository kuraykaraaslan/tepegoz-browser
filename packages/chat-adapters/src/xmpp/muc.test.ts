import { describe, expect, it } from 'vitest';
import { XmlStreamParser, type XmlElement } from './xml-stream';
import {
  buildMucChangeSubject,
  buildMucInvite,
  buildMucJoin,
  buildMucLeave,
  parseMucError,
  parseMucPresence,
  parseMucSubject,
} from './muc';

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

describe('MUC outgoing builders', () => {
  it('buildMucJoin targets room/nick and carries password + history control', () => {
    const plain = buildMucJoin('room@conf.example', 'ada');
    expect(plain).toContain('to="room@conf.example/ada"');
    expect(plain).toContain('<x xmlns="http://jabber.org/protocol/muc">');

    const rich = buildMucJoin('room@conf.example', 'ada', {
      password: 's&cret',
      historyMaxStanzas: 20,
    });
    expect(rich).toContain('<password>s&amp;cret</password>');
    expect(rich).toContain('<history maxstanzas="20"/>');
  });

  it('buildMucJoin honours historySince and a zero maxstanzas', () => {
    const j = buildMucJoin('room@conf.example', 'ada', {
      historyMaxStanzas: 0,
      historySince: '2026-01-01T00:00:00Z',
    });
    expect(j).toContain('<history maxstanzas="0" since="2026-01-01T00:00:00Z"/>');
    // an empty password string is not emitted
    expect(buildMucJoin('room@conf.example', 'ada', { password: '' })).not.toContain('<password>');
  });

  it('buildMucLeave sends an unavailable presence, with or without a status', () => {
    expect(buildMucLeave('room@conf.example', 'ada', 'bye')).toBe(
      '<presence to="room@conf.example/ada" type="unavailable"><status>bye</status></presence>',
    );
    expect(buildMucLeave('room@conf.example', 'ada')).toBe(
      '<presence to="room@conf.example/ada" type="unavailable"></presence>',
    );
  });

  it('buildMucChangeSubject / buildMucInvite are well-formed (reason optional)', () => {
    expect(buildMucChangeSubject('room@conf.example', 'Weekly sync')).toBe(
      '<message to="room@conf.example" type="groupchat"><subject>Weekly sync</subject></message>',
    );
    expect(buildMucInvite('room@conf.example', 'bob@example.org', 'join us')).toContain(
      '<invite to="bob@example.org"><reason>join us</reason></invite>',
    );
    expect(buildMucInvite('room@conf.example', 'bob@example.org')).toContain(
      '<invite to="bob@example.org"></invite>',
    );
  });
});

describe('parseMucPresence', () => {
  it('reads nick, affiliation, role, real JID and the self marker', () => {
    const occ = parseMucPresence(
      el(
        `<presence from="room@conf.example/Ada">` +
          `<x xmlns="http://jabber.org/protocol/muc#user">` +
          `<item affiliation="owner" role="moderator" jid="ada@example.org/desk"/>` +
          `<status code="110"/><status code="210"/>` +
          `</x></presence>`,
      ),
    );
    expect(occ).toEqual({
      roomJid: 'room@conf.example',
      nick: 'Ada',
      realJid: 'ada@example.org',
      affiliation: 'owner',
      role: 'moderator',
      presence: 'online',
      statusText: '',
      self: true,
      statusCodes: [110, 210],
    });
  });

  it('maps an unavailable presence to offline and defaults unknown affiliation/role', () => {
    const occ = parseMucPresence(
      el(
        `<presence from="room@conf.example/Bob" type="unavailable">` +
          `<x xmlns="http://jabber.org/protocol/muc#user"><item/></x></presence>`,
      ),
    );
    expect(occ?.presence).toBe('offline');
    expect(occ?.affiliation).toBe('none');
    expect(occ?.role).toBe('none');
    expect(occ?.self).toBe(false);
  });

  it('maps each show value and keeps the status text', () => {
    for (const [show, expected] of [
      ['away', 'away'],
      ['xa', 'xa'],
      ['dnd', 'dnd'],
      ['chat', 'online'],
    ] as const) {
      const occ = parseMucPresence(
        el(
          `<presence from="room@conf.example/Bob"><show>${show}</show><status>brb</status>` +
            `<x xmlns="http://jabber.org/protocol/muc#user"><item/></x></presence>`,
        ),
      );
      expect(occ?.presence).toBe(expected);
      expect(occ?.statusText).toBe('brb');
    }
  });

  it('returns null for a plain presence, a non-presence stanza, or a from with no nick', () => {
    expect(parseMucPresence(el(`<presence from="bob@example.org/x"><show>away</show></presence>`))).toBeNull();
    expect(parseMucPresence(el(`<message from="room@conf.example/Ada"/>`))).toBeNull();
    expect(
      parseMucPresence(
        el(`<presence from="room@conf.example"><x xmlns="http://jabber.org/protocol/muc#user"/></presence>`),
      ),
    ).toBeNull();
  });
});

describe('parseMucSubject', () => {
  it('reads a topic change, ignores a message that also has a body', () => {
    expect(
      parseMucSubject(
        el(`<message type="groupchat" from="room@conf.example/Ada"><subject>New topic</subject></message>`),
      ),
    ).toEqual({ roomJid: 'room@conf.example', nick: 'Ada', subject: 'New topic' });

    expect(
      parseMucSubject(
        el(
          `<message type="groupchat" from="room@conf.example/Ada"><subject>x</subject><body>hi</body></message>`,
        ),
      ),
    ).toBeNull();
  });
});

describe('parseMucError', () => {
  it('classifies a bounced join by its condition element', () => {
    expect(
      parseMucError(
        el(
          `<presence type="error" from="room@conf.example/ada">` +
            `<error type="auth"><not-authorized xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></presence>`,
        ),
      ),
    ).toEqual({ roomJid: 'room@conf.example', nick: 'ada', condition: 'not-authorized' });

    expect(
      parseMucError(
        el(`<presence type="error" from="room@conf.example/ada"><error type="cancel"/></presence>`),
      ),
    ).toEqual({ roomJid: 'room@conf.example', nick: 'ada', condition: 'unknown' });
  });

  it('returns null for a non-error stanza or an error with no from', () => {
    expect(parseMucError(el(`<presence from="room@conf.example/ada"/>`))).toBeNull();
    expect(parseMucError(el(`<presence type="error"><error type="cancel"/></presence>`))).toBeNull();
  });

  it('classifies each known condition', () => {
    for (const cond of ['forbidden', 'conflict', 'registration-required', 'item-not-found'] as const) {
      const parsed = parseMucError(
        el(
          `<message type="error" from="room@conf.example"><error><${cond} xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></message>`,
        ),
      );
      expect(parsed?.condition).toBe(cond);
    }
  });
});

describe('parseMucSubject edge cases', () => {
  it('ignores a non-groupchat message or one with no subject / no from', () => {
    expect(parseMucSubject(el(`<message from="room@conf.example/Ada"><subject>x</subject></message>`))).toBeNull();
    expect(parseMucSubject(el(`<message type="groupchat" from="room@conf.example/Ada"><body>hi</body></message>`))).toBeNull();
    expect(parseMucSubject(el(`<message type="groupchat"><subject>x</subject></message>`))).toBeNull();
  });
});

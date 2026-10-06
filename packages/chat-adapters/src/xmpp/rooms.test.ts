import { describe, it, expect } from 'vitest';
import { connected, tick } from './test-harness';

describe('XmppAdapter — rooms', () => {
  it('listConversations is empty in this slice', async () => {
    const { adapter } = await connected();
    expect(await adapter.listConversations()).toEqual([]);
  });

  it('joinRoom writes a MUC join with our nick + history control and returns a room conversation', async () => {
    const { server, adapter, session } = await connected();
    const conv = await adapter.joinRoom(session, 'general@conf.example.com');
    expect(conv).toMatchObject({ id: 'general@conf.example.com', kind: 'room', name: 'general' });
    const sent = server.lastWritten();
    expect(sent).toContain('to="general@conf.example.com/ada"');
    expect(sent).toContain('<x xmlns="http://jabber.org/protocol/muc">');
    expect(sent).toContain('<history maxstanzas="30"/>');
    expect(session.rooms.get('general@conf.example.com')?.nick).toBe('ada');
  });

  it('a room presence becomes a room-membership event and tracks the occupant count', async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'general@conf.example.com');
    const it = adapter.events(session)[Symbol.asyncIterator]();

    server.send(
      `<presence from="general@conf.example.com/Bea"><x xmlns="http://jabber.org/protocol/muc#user">` +
        `<item affiliation="member" role="participant"/></x></presence>`,
    );
    expect((await it.next()).value).toMatchObject({
      type: 'room-membership',
      conversationId: 'general@conf.example.com',
      address: 'general@conf.example.com/Bea',
      joined: true,
      memberCount: 1,
    });

    server.send(
      `<presence from="general@conf.example.com/Bea" type="unavailable">` +
        `<x xmlns="http://jabber.org/protocol/muc#user"><item/></x></presence>`,
    );
    expect((await it.next()).value).toMatchObject({ joined: false, memberCount: 0 });
  });

  it('creating a room (status 201 on our own join presence) auto-accepts the default config to unlock it', async () => {
    // XEP-0045 §10.1.3: a newly-created room is LOCKED until its creator accepts a configuration —
    // a second occupant's own join is bounced (item-not-found/not-allowed) until that happens.
    // Found live (2026-09-13, X-chat.3's "get pinged" Functional DoD verification): every room this
    // adapter ever created stayed permanently locked to a single occupant because nothing sent the
    // accept. `statusCodes`/the 201 code were already parsed (`muc.ts`) and simply never consumed.
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'general@conf.example.com');
    server.send(
      `<presence from="general@conf.example.com/ada"><x xmlns="http://jabber.org/protocol/muc#user">` +
        `<item affiliation="owner" role="moderator"/><status code="110"/><status code="201"/></x></presence>`,
    );
    // `nextIqId`'s counter is shared across every iq this session ever sends (`connect()`'s own
    // bind request already used seq 1) — assert the shape, not a specific sequence number.
    expect(server.lastWritten()).toMatch(
      /^<iq type="set" to="general@conf\.example\.com" id="muc-instant-\d+"><query xmlns="http:\/\/jabber\.org\/protocol\/muc#owner"><x xmlns="jabber:x:data" type="submit"\/><\/query><\/iq>$/,
    );
  });

  it('a self-join presence WITHOUT status 201 (an existing room) never sends the instant-room accept', async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'general@conf.example.com');
    server.send(
      `<presence from="general@conf.example.com/ada"><x xmlns="http://jabber.org/protocol/muc#user">` +
        `<item affiliation="member" role="participant"/><status code="110"/></x></presence>`,
    );
    expect(server.lastWritten()).not.toContain('muc#owner');
  });

  it('a groupchat <subject> from a joined room becomes a room-topic event', async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'general@conf.example.com');
    const it = adapter.events(session)[Symbol.asyncIterator]();

    server.send(
      `<message type="groupchat" from="general@conf.example.com/Bea">` +
        `<subject>Release planning</subject></message>`,
    );
    expect((await it.next()).value).toMatchObject({
      type: 'room-topic',
      conversationId: 'general@conf.example.com',
      topic: 'Release planning',
      setBy: 'Bea',
    });
  });

  it('a groupchat <subject> for a room we have not joined is not surfaced', async () => {
    const { server, adapter, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(
      `<message type="groupchat" from="stranger@conf.example.com/x"><subject>nope</subject></message>`,
    );
    server.send('<message type="chat" from="bob@example.com"><body>real</body></message>');
    // the next surfaced event is the DM, not a room-topic
    expect((await it.next()).value).toMatchObject({ type: 'message' });
  });

  it('a kick presence surfaces as both a room-membership leave and a system message', async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'general@conf.example.com');
    const it = adapter.events(session)[Symbol.asyncIterator]();

    server.send(
      `<presence from="general@conf.example.com/Bea" type="unavailable">` +
        `<x xmlns="http://jabber.org/protocol/muc#user">` +
        `<item affiliation="none" role="none"><actor nick="Ada"/><reason>spam</reason></item>` +
        `<status code="307"/></x></presence>`,
    );
    expect((await it.next()).value).toMatchObject({ type: 'room-membership', joined: false });
    expect((await it.next()).value).toMatchObject({
      type: 'message',
      message: {
        conversationId: 'general@conf.example.com',
        kind: 'system',
        body: 'Bea was kicked by Ada: spam',
      },
    });
  });

  it('a room join error surfaces as a conversation-scoped error event', async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'locked@conf.example.com');
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(
      `<presence type="error" from="locked@conf.example.com/ada">` +
        `<error type="auth"><not-authorized xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></presence>`,
    );
    expect((await it.next()).value).toMatchObject({
      type: 'error',
      scope: 'conversation',
      conversationId: 'locked@conf.example.com',
      message: 'room not-authorized',
    });
  });

  it('leaveRoom sends an unavailable presence and forgets the room', async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'general@conf.example.com');
    await adapter.leaveRoom(session, 'general@conf.example.com');
    expect(server.lastWritten()).toBe(
      '<presence to="general@conf.example.com/ada" type="unavailable"></presence>',
    );
    expect(session.rooms.has('general@conf.example.com')).toBe(false);
    // leaving an unknown room is a no-op
    await adapter.leaveRoom(session, 'never@conf.example.com');
  });

  it('setRoomTopic writes a groupchat <subject> message', async () => {
    const { server, adapter, session } = await connected();
    await adapter.setRoomTopic(session, 'general@conf.example.com', 'Sprint 5 planning');
    const sent = server.lastWritten();
    expect(sent).toContain('to="general@conf.example.com"');
    expect(sent).toContain('type="groupchat"');
    expect(sent).toContain('<subject>Sprint 5 planning</subject>');
  });

  it('inviteToRoom writes a MUC mediated <invite> message to the room', async () => {
    const { server, adapter, session } = await connected();
    await adapter.inviteToRoom?.(session, 'general@conf.example.com/res', 'carol@example.com');
    const sent = server.lastWritten();
    expect(sent).toContain('to="general@conf.example.com"');
    expect(sent).toContain('<invite to="carol@example.com">');
  });

  it('a presence from a room we have NOT joined falls through to a normal presence event', async () => {
    const { server, adapter, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(`<presence from="bob@example.com/phone"><show>away</show></presence>`);
    expect((await it.next()).value).toMatchObject({
      type: 'presence',
      address: 'bob@example.com/phone',
    });
  });

  it('discoverRooms lists a service then enriches each room from disco#info', async () => {
    const { server, adapter, session } = await connected();
    const p = adapter.discoverRooms(session, 'conf.example.com');
    await tick();

    const listId = /id="(disco-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    server.send(
      `<iq type="result" id="${listId}"><query xmlns="http://jabber.org/protocol/disco#items">` +
        `<item jid="general@conf.example.com" name="General"/>` +
        `<item jid="secret@conf.example.com"/>` +
        `</query></iq>`,
    );
    await tick();

    // two disco#info requests followed; answer both by their ids
    const infoIds = server.written
      .flatMap((w) => [...w.matchAll(/id="(disco-\d+)"/g)].map((m) => m[1]))
      .filter((id): id is string => id !== undefined && id !== listId);
    server.send(
      `<iq type="result" id="${infoIds[0] ?? ''}"><query xmlns="http://jabber.org/protocol/disco#info">` +
        `<identity category="conference" type="text"/><feature var="http://jabber.org/protocol/muc"/>` +
        `<x xmlns="jabber:x:data"><field var="muc#roominfo_occupants"><value>9</value></field></x>` +
        `</query></iq>`,
    );
    server.send(
      `<iq type="result" id="${infoIds[1] ?? ''}"><query xmlns="http://jabber.org/protocol/disco#info">` +
        `<identity category="conference" type="text"/><feature var="http://jabber.org/protocol/muc"/>` +
        `<feature var="muc_membersonly"/></query></iq>`,
    );

    const rooms = await p;
    expect(rooms).toEqual([
      {
        jid: 'general@conf.example.com',
        name: 'General',
        description: null,
        occupants: 9,
        passwordProtected: false,
        membersOnly: false,
      },
      {
        jid: 'secret@conf.example.com',
        name: null,
        description: null,
        occupants: null,
        passwordProtected: false,
        membersOnly: true,
      },
    ]);
  });

  it('discoverRooms returns [] when the service advertises no items', async () => {
    const { server, adapter, session } = await connected();
    const p = adapter.discoverRooms(session, 'empty.example.com');
    await tick();
    const listId = /id="(disco-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    server.send(`<iq type="result" id="${listId}"><query xmlns="jabber:iq:private"/></iq>`);
    expect(await p).toEqual([]);
  });

  it('discoverRooms leaves a non-room entity with default flags', async () => {
    const { server, adapter, session } = await connected();
    const p = adapter.discoverRooms(session, 'conf.example.com');
    await tick();
    const listId = /id="(disco-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    server.send(
      `<iq type="result" id="${listId}"><query xmlns="http://jabber.org/protocol/disco#items">` +
        `<item jid="gateway@conf.example.com" name="Gateway"/></query></iq>`,
    );
    await tick();
    const infoId = /id="(disco-\d+)"/.exec(server.written.at(-1) ?? '')?.[1] ?? '';
    server.send(
      `<iq type="result" id="${infoId}"><query xmlns="http://jabber.org/protocol/disco#info">` +
        `<identity category="gateway" type="xmpp"/></query></iq>`,
    );
    expect((await p)[0]).toMatchObject({
      jid: 'gateway@conf.example.com',
      occupants: null,
      membersOnly: false,
    });
  });

  it('discoverRooms keeps a room whose disco#info errors, with defaults', async () => {
    const { server, adapter, session } = await connected();
    session.iqTimeoutMs = 50;
    const p = adapter.discoverRooms(session, 'conf.example.com');
    await tick();
    const listId = /id="(disco-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    server.send(
      `<iq type="result" id="${listId}"><query xmlns="http://jabber.org/protocol/disco#items">` +
        `<item jid="broken@conf.example.com" name="Broken"/></query></iq>`,
    );
    await tick();
    const infoId = /id="(disco-\d+)"/.exec(server.written.at(-1) ?? '')?.[1] ?? '';
    server.send(`<iq type="error" id="${infoId}"><error type="cancel"/></iq>`);
    expect(await p).toEqual([
      {
        jid: 'broken@conf.example.com',
        name: 'Broken',
        description: null,
        occupants: null,
        passwordProtected: false,
        membersOnly: false,
      },
    ]);
  });
});

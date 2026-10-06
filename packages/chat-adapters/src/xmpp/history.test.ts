import { describe, it, expect } from 'vitest';
import { connected, tick } from './test-harness';

describe('XmppAdapter — history and reactions', () => {
  it('routes a streamed MAM result to its query sink, not the event stream', async () => {
    const { server, adapter, session } = await connected();
    const seen: string[] = [];
    // simulate a MAM query registered on the session
    const done = session.request(
      `<iq type="set" id="mam-1"><query xmlns="urn:xmpp:mam:2" queryid="mam-1"/></iq>`,
      'mam-1',
      (el) => seen.push(el.local),
    );
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(
      `<message><result xmlns="urn:xmpp:mam:2" queryid="mam-1"><forwarded xmlns="urn:xmpp:forward:0"><message from="a@x" type="chat"><body>old</body></message></forwarded></result></message>`,
    );
    server.send(`<iq type="result" id="mam-1"><fin xmlns="urn:xmpp:mam:2" complete="true"/></iq>`);
    await done;
    expect(seen).toEqual(['message']);
    // the live stream should not have received the MAM message
    server.send(`<message from="b@x" type="chat" id="live"><body>new</body></message>`);
    expect((await it.next()).value).toMatchObject({ message: { protocolId: 'live' } });
  });

  it('history() runs a MAM query and returns messages oldest-first with a cursor', async () => {
    const { server, adapter, session } = await connected();
    const p = adapter.history(session, 'bob@example.com', null);
    await tick();
    const q = server.lastWritten();
    expect(q).toContain('urn:xmpp:mam:2');
    expect(q).toContain('<field var="with"><value>bob@example.com</value></field>');
    expect(q).toContain('<before/>');
    const id = /id="(mam-\d+)"/.exec(q)?.[1] ?? '';

    const mamMsg = (archiveId: string, ts: string, body: string) =>
      `<message><result xmlns="urn:xmpp:mam:2" queryid="${id}" id="${archiveId}">` +
      `<forwarded xmlns="urn:xmpp:forward:0"><delay xmlns="urn:xmpp:delay" stamp="${ts}"/>` +
      `<message from="bob@example.com/p" to="ada@example.com" type="chat"><body>${body}</body></message>` +
      `</forwarded></result></message>`;
    server.send(mamMsg('a2', '2020-01-02T00:00:00Z', 'second'));
    server.send(mamMsg('a1', '2020-01-01T00:00:00Z', 'first'));
    server.send(
      `<iq type="result" id="${id}"><fin xmlns="urn:xmpp:mam:2"><set xmlns="http://jabber.org/protocol/rsm"><first>a1</first><last>a2</last><count>7</count></set></fin></iq>`,
    );

    const page = await p;
    expect(page.messages.map((m) => m.body)).toEqual(['first', 'second']);
    expect(page.messages.map((m) => m.protocolId)).toEqual(['a1', 'a2']);
    expect(page.messages[0]?.originTs).toBe(Date.parse('2020-01-01T00:00:00Z'));
    expect(page.nextCursor).toBe('a1'); // not complete → page further back with <first>
  });

  it("history() for a joined room queries the room's own archive, not the account's", async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'lobby@conf.example.com');

    const p = adapter.history(session, 'lobby@conf.example.com', null);
    await tick();
    const q = server.lastWritten();
    expect(q).toContain('to="lobby@conf.example.com"');
    expect(q).not.toContain('var="with"');
    const id = /id="(mam-\d+)"/.exec(q)?.[1] ?? '';
    server.send(`<iq type="result" id="${id}"><fin xmlns="urn:xmpp:mam:2" complete="true"/></iq>`);
    await p;
  });

  it('history() returns nextCursor null when the archive says complete', async () => {
    const { server, adapter, session } = await connected();
    const p = adapter.history(session, 'bob@example.com', 'oldcursor');
    await tick();
    expect(server.lastWritten()).toContain('<before>oldcursor</before>');
    const id = /id="(mam-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    server.send(`<iq type="result" id="${id}"><fin xmlns="urn:xmpp:mam:2" complete="true"/></iq>`);
    const page = await p;
    expect(page).toEqual({ messages: [], nextCursor: null });
  });

  it('react() resends the whole reaction set on every change (XEP-0444)', async () => {
    const { server, adapter, session } = await connected();
    await adapter.react(session, 'bob@example.com', 'm1', '👍', true);
    expect(server.lastWritten()).toBe(
      '<message to="bob@example.com" type="chat"><reactions xmlns="urn:xmpp:reactions:0" id="m1">' +
        '<reaction>👍</reaction></reactions></message>',
    );
    await adapter.react(session, 'bob@example.com', 'm1', '🔥', true);
    expect(server.lastWritten()).toContain('<reaction>👍</reaction><reaction>🔥</reaction>');
    await adapter.react(session, 'bob@example.com', 'm1', '👍', false);
    expect(server.lastWritten()).toBe(
      '<message to="bob@example.com" type="chat"><reactions xmlns="urn:xmpp:reactions:0" id="m1">' +
        '<reaction>🔥</reaction></reactions></message>',
    );
  });

  it('react() sends type="groupchat" for a joined room', async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'lobby@conf.example.com');
    await adapter.react(session, 'lobby@conf.example.com', 'm1', '👍', true);
    expect(server.lastWritten()).toContain('type="groupchat"');
  });

  it('an incoming <reactions> diffs against what was last seen and surfaces add/remove events', async () => {
    const { server, adapter, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();

    server.send(
      '<message from="bob@example.com"><reactions xmlns="urn:xmpp:reactions:0" id="m1">' +
        '<reaction>👍</reaction><reaction>🔥</reaction></reactions></message>',
    );
    expect(await it.next()).toMatchObject({
      value: {
        type: 'reaction',
        conversationId: 'bob@example.com',
        protocolId: 'm1',
        senderAddress: 'bob@example.com',
        emoji: '👍',
        add: true,
      },
    });
    expect(await it.next()).toMatchObject({ value: { type: 'reaction', emoji: '🔥', add: true } });

    // Bob changes his mind: drops 👍, keeps 🔥 — exactly one event (the drop) should surface.
    server.send(
      '<message from="bob@example.com"><reactions xmlns="urn:xmpp:reactions:0" id="m1">' +
        '<reaction>🔥</reaction></reactions></message>',
    );
    expect(await it.next()).toMatchObject({
      value: { type: 'reaction', protocolId: 'm1', emoji: '👍', add: false },
    });
  });

  it('a MUC room reaction is addressed to the occupant (nick), not the bare room JID', async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'lobby@conf.example.com');
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(
      '<message from="lobby@conf.example.com/Carol" type="groupchat">' +
        '<reactions xmlns="urn:xmpp:reactions:0" id="m1"><reaction>🎉</reaction></reactions></message>',
    );
    expect(await it.next()).toMatchObject({
      value: {
        type: 'reaction',
        conversationId: 'lobby@conf.example.com',
        senderAddress: 'lobby@conf.example.com/Carol',
        emoji: '🎉',
        add: true,
      },
    });
  });
});

import { describe, it, expect } from 'vitest';
import { connected, tick } from './test-harness';

describe('XmppAdapter — roster and contacts', () => {
  it('roster round-trips a <query/> result into contacts', async () => {
    const { server, adapter, session } = await connected();
    const rosterP = adapter.roster(session);
    await tick();
    const id = /id="(roster-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    server.send(
      `<iq type="result" id="${id}"><query xmlns="jabber:iq:roster">` +
        `<item jid="bob@example.com" name="Bob" subscription="both"><group>work</group></item>` +
        `<item jid="cem@example.com" subscription="to"/>` +
        `</query></iq>`,
    );
    const contacts = await rosterP;
    expect(contacts.map((c) => c.address)).toEqual(['bob@example.com', 'cem@example.com']);
    expect(contacts[0]).toMatchObject({ name: 'Bob', subscription: 'both', groups: ['work'] });
  });

  it('roster rejects on an iq error and on session close', async () => {
    const { server, adapter, session } = await connected();
    const p = adapter.roster(session);
    await tick();
    const id = /id="(roster-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    server.send(`<iq type="error" id="${id}"><error type="cancel"/></iq>`);
    await expect(p).rejects.toThrow(/error/);

    const p2 = adapter.roster(session);
    server.drop();
    await expect(p2).rejects.toThrow(/closed/);
  });

  it('an iq that is never answered times out', async () => {
    const { adapter, session } = await connected();
    session.iqTimeoutMs = 10;
    await expect(adapter.roster(session)).rejects.toThrow(/timed out/);
  });

  /** `addContact`/`removeContact` must first become an "interested resource" (RFC 6121 §2.1) — a
   *  live server only pushes a roster-change back to a resource that has requested its roster at
   *  least once — before sending their own roster set. Answers that implicit `roster` get so both
   *  tests below can go straight to asserting the add/remove-specific stanza. */
  async function ackImplicitRosterGet(server: {
    lastWritten: () => string;
    send: (s: string) => void;
  }): Promise<void> {
    await tick();
    const id = /id="(roster-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    server.send(`<iq type="result" id="${id}"><query xmlns="jabber:iq:roster"/></iq>`);
    await tick();
  }

  it('addContact sets the roster item then requests presence — in that order, only after the ack', async () => {
    const { server, adapter, session } = await connected();
    const p = adapter.addContact?.(session, 'bob@example.com');
    await ackImplicitRosterGet(server);
    // The subscription request must not jump ahead of the roster-add ack.
    expect(server.written.some((l) => l.includes('type="subscribe"'))).toBe(false);
    const id = /id="(roster-add-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    expect(server.lastWritten()).toBe(
      `<iq type="set" id="${id}"><query xmlns="jabber:iq:roster"><item jid="bob@example.com"/></query></iq>`,
    );
    server.send(`<iq type="result" id="${id}"/>`);
    await p;
    expect(server.lastWritten()).toBe('<presence to="bob@example.com" type="subscribe"/>');
  });

  it('removeContact sends one roster-remove iq and needs no separate presence stanza', async () => {
    const { server, adapter, session } = await connected();
    const p = adapter.removeContact?.(session, 'bob@example.com');
    await ackImplicitRosterGet(server);
    const id = /id="(roster-remove-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    expect(server.lastWritten()).toBe(
      `<iq type="set" id="${id}"><query xmlns="jabber:iq:roster"><item jid="bob@example.com" subscription="remove"/></query></iq>`,
    );
    server.send(`<iq type="result" id="${id}"/>`);
    await p;
    expect(
      server.written.some(
        (l) => l.includes('type="subscribe"') || l.includes('type="unsubscribe"'),
      ),
    ).toBe(false);
  });

  it('blockContact / unblockContact send XEP-0191 iqs, with no roster-interest requirement', async () => {
    const { server, adapter, session } = await connected();
    const p = adapter.blockContact?.(session, 'bob@example.com');
    const id = /id="(block-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    expect(server.lastWritten()).toBe(
      `<iq type="set" id="${id}"><block xmlns="urn:xmpp:blocking"><item jid="bob@example.com"/></block></iq>`,
    );
    server.send(`<iq type="result" id="${id}"/>`);
    await p;

    const p2 = adapter.unblockContact?.(session, 'bob@example.com');
    const id2 = /id="(unblock-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    expect(server.lastWritten()).toBe(
      `<iq type="set" id="${id2}"><unblock xmlns="urn:xmpp:blocking"><item jid="bob@example.com"/></unblock></iq>`,
    );
    server.send(`<iq type="result" id="${id2}"/>`);
    await p2;
  });

  it('addContact skips the roster get on a second call once this session is already interested', async () => {
    const { server, adapter, session } = await connected();
    const rosterP = adapter.roster(session);
    await ackImplicitRosterGet(server);
    await rosterP;
    const p = adapter.addContact?.(session, 'carol@example.com');
    await tick();
    const id = /id="(roster-add-\d+)"/.exec(server.lastWritten())?.[1] ?? '';
    expect(server.lastWritten()).toBe(
      `<iq type="set" id="${id}"><query xmlns="jabber:iq:roster"><item jid="carol@example.com"/></query></iq>`,
    );
    server.send(`<iq type="result" id="${id}"/>`);
    await p;
  });
});

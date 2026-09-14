import { describe, it, expect } from 'vitest';
import type { ChatAccountCreds } from '../adapter';
import type {
  ChatFetchInit,
  ChatFetchResponse,
  ChatTransport,
  DuplexStream,
  OpenTcpOptions,
} from '../transport';
import { XmppAdapter, type XmppSession } from './adapter';

/**
 * A scripted fake XMPP server over the injected transport. The client's writes land in `written`;
 * the test pushes server bytes with `send()`. No sockets, no timers.
 */
class FakeServer implements ChatTransport {
  written: string[] = [];
  private onData: ((chunk: Uint8Array) => void) | null = null;
  private onClose: ((err?: Error) => void) | null = null;
  private stream: DuplexStream;
  tlsUpgraded = false;

  constructor() {
    this.stream = {
      write: (data) => {
        this.written.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
      },
      onData: (cb) => {
        this.onData = cb;
      },
      onClose: (cb) => {
        this.onClose = cb;
      },
      close: () => this.onClose?.(),
    };
  }

  tcpOpts: OpenTcpOptions | null = null;
  openTCP(opts?: OpenTcpOptions): Promise<DuplexStream> {
    this.tcpOpts = opts ?? null;
    return Promise.resolve(this.stream);
  }
  upgradeTLS(s: DuplexStream): Promise<DuplexStream> {
    this.tlsUpgraded = true;
    return Promise.resolve(s);
  }
  openWebSocket(): Promise<DuplexStream> {
    return Promise.resolve(this.stream);
  }
  fetchCalls: { url: string; init?: ChatFetchInit }[] = [];
  /** Tests override this to script a response; defaults to rejecting like every other unused seam
   *  on this fake. */
  fetchImpl: (url: string, init?: ChatFetchInit) => Promise<ChatFetchResponse> = () =>
    Promise.reject(new Error('nope'));
  fetch(url: string, init?: ChatFetchInit): Promise<ChatFetchResponse> {
    this.fetchCalls.push(init === undefined ? { url } : { url, init });
    return this.fetchImpl(url, init);
  }
  openEventStream(): Promise<never> {
    return Promise.reject(new Error('nope'));
  }

  /** Deliver bytes to the client parser. */
  send(xml: string): void {
    this.onData?.(new TextEncoder().encode(xml));
  }

  lastWritten(): string {
    return this.written.at(-1) ?? '';
  }

  drop(): void {
    this.onClose?.(new Error('connection reset'));
  }
}

const creds = (overrides: Partial<ChatAccountCreds['server']> = {}): ChatAccountCreds => ({
  accountId: 'acc',
  secret: 'pencil',
  server: {
    protocol: 'xmpp',
    jid: 'ada@example.com',
    host: null,
    port: null,
    security: 'tls',
    wsUrl: null,
    ...overrides,
  } as ChatAccountCreds['server'],
});

const FEAT_AUTH = `<stream:features><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms></stream:features>`;
const FEAT_BIND = `<stream:features><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/><sm xmlns="urn:xmpp:sm:3"/></stream:features>`;

/** Run the scripted handshake against a fresh adapter+server, returning both. */
async function connected(): Promise<{ adapter: XmppAdapter; server: FakeServer; session: XmppSession }> {
  const server = new FakeServer();
  const adapter = new XmppAdapter();
  const connectP = adapter.connect(creds(), server);

  // client -> <stream:stream>
  await tick();
  server.send(`<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" id="s1">`);
  server.send(FEAT_AUTH);
  await tick();
  expect(server.lastWritten()).toContain('mechanism="PLAIN"');

  server.send(`<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>`);
  await tick();
  server.send(`<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" id="s2">`);
  server.send(FEAT_BIND);
  await tick();
  expect(server.lastWritten()).toContain('<bind xmlns="urn:ietf:params:xml:ns:xmpp-bind">');

  server.send(`<iq type="result" id="bind-1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>ada@example.com/tepegoz</jid></bind></iq>`);
  server.send(`<enabled xmlns="urn:xmpp:sm:3" id="sm-1" resume="true"/>`);

  const session = (await connectP) as XmppSession;
  return { adapter, server, session };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('XmppAdapter — connect', () => {
  it('drives the handshake to a bound session', async () => {
    const { session, server } = await connected();
    expect(session.fullJid).toBe('ada@example.com/tepegoz');
    expect(session.accountId).toBe('acc');
    expect(server.written[0]).toContain('<stream:stream to="example.com"');
  });

  it('performs STARTTLS when the account is configured for it', async () => {
    const server = new FakeServer();
    const adapter = new XmppAdapter();
    const p = adapter.connect(creds({ security: 'starttls' }), server);
    await tick();
    server.send(`<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`);
    server.send(`<stream:features><starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"><required/></starttls></stream:features>`);
    await tick();
    expect(server.lastWritten()).toBe('<starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>');
    server.send(`<proceed xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>`);
    await tick();
    expect(server.tlsUpgraded).toBe(true);
    // after TLS the client restarts the stream
    server.send(`<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`);
    server.send(FEAT_AUTH);
    await tick();
    server.send(`<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>`);
    await tick();
    server.send(`<stream:stream xmlns="jabber:client">`);
    server.send(`<stream:features><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/></stream:features>`);
    await tick();
    server.send(`<iq type="result" id="bind-1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>ada@example.com/x</jid></bind></iq>`);
    await expect(p).resolves.toBeDefined();
  });

  it('rejects on a negotiation failure', async () => {
    const server = new FakeServer();
    const p = new XmppAdapter().connect(creds({ security: 'tls' }), server);
    await tick();
    server.send(`<stream:stream xmlns="jabber:client">`);
    server.send(`<stream:features><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>ANONYMOUS</mechanism></mechanisms></stream:features>`);
    await expect(p).rejects.toThrow(/no acceptable SASL/);
  });

  it('rejects when the TLS upgrade fails', async () => {
    const server = new FakeServer();
    server.upgradeTLS = () => Promise.reject(new Error('cert rejected'));
    const p = new XmppAdapter().connect(creds({ security: 'starttls' }), server);
    await tick();
    server.send(`<stream:stream xmlns="jabber:client">`);
    server.send(`<stream:features><starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"><required/></starttls></stream:features>`);
    await tick();
    server.send(`<proceed xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>`);
    await expect(p).rejects.toThrow(/cert rejected/);
  });

  it('rejects a non-xmpp account', async () => {
    await expect(
      new XmppAdapter().connect(
        { accountId: 'a', secret: 's', server: { protocol: 'irc', server: 'x', port: 1, tls: true, nick: 'n', sasl: false } },
        new FakeServer(),
      ),
    ).rejects.toThrow(/not an xmpp/);
  });
});

describe('XmppAdapter — live traffic', () => {
  it('surfaces an incoming message as a raw ChatEvent and answers <r/>', async () => {
    const { server, adapter, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();

    server.send(`<message from="bob@example.com/p" type="chat" id="m1"><body>selam</body></message>`);
    const first = await it.next();
    expect(first.value).toMatchObject({ type: 'message', message: { body: 'selam', protocolId: 'm1' } });

    server.send(`<r xmlns="urn:xmpp:sm:3"/>`);
    await tick();
    expect(server.lastWritten()).toMatch(/^<a xmlns="urn:xmpp:sm:3" h="\d+"\/>$/);
  });

  it('sendMessage writes a tracked <message> and returns a receipt', async () => {
    const { server, adapter, session } = await connected();
    const receipt = await adapter.sendMessage(session, 'bob@example.com', { body: 'hi <there>', replyToId: null, mediaPath: null });
    expect(receipt.protocolId).toMatch(/^t-/);
    expect(server.lastWritten()).toContain('<body>hi &lt;there&gt;</body>');
    expect(server.lastWritten()).toContain('type="chat"');
    expect(session.sm.unackedCount).toBe(1);
  });

  it('sendMessage to a joined room uses type="groupchat" (XEP-0045) — a plain "chat" message is not broadcast to occupants', async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'general@conf.example.com');
    await adapter.sendMessage(session, 'general@conf.example.com', {
      body: 'hi room',
      replyToId: null,
      mediaPath: null,
    });
    const sent = server.lastWritten();
    expect(sent).toContain('type="groupchat"');
    expect(sent).not.toContain('type="chat"');
  });

  it('editMessage writes a tracked correction (XEP-0308) with a fresh stanza id', async () => {
    const { server, adapter, session } = await connected();
    await adapter.editMessage(session, 'bob@example.com', 'm1', {
      body: 'fixed typo',
      replyToId: null,
      mediaPath: null,
    });
    const sent = server.lastWritten();
    expect(sent).toMatch(/^<message to="bob@example.com" id="t-/);
    expect(sent).toContain('<body>fixed typo</body>');
    expect(sent).toContain('<replace id="m1" xmlns="urn:xmpp:message-correct:0"/>');
    expect(sent).toContain('type="chat"');
    expect(session.sm.unackedCount).toBe(1);
  });

  it('editMessage in a joined room uses type="groupchat"', async () => {
    const { server, adapter, session } = await connected();
    await adapter.joinRoom(session, 'general@conf.example.com');
    await adapter.editMessage(session, 'general@conf.example.com', 'm1', {
      body: 'fixed',
      replyToId: null,
      mediaPath: null,
    });
    expect(server.lastWritten()).toContain('type="groupchat"');
  });

  it('setPresence and markRead write the right stanzas', async () => {
    const { server, adapter, session } = await connected();
    await adapter.setPresence(session, 'dnd', 'busy');
    expect(server.lastWritten()).toBe('<presence><show>dnd</show><status>busy</status></presence>');
    await adapter.markRead(session, 'bob@example.com', 'm1');
    expect(server.lastWritten()).toContain('<displayed xmlns="urn:xmpp:chat-markers:0" id="m1"/>');
  });

  it('disconnect closes the stream and ends the event iterator', async () => {
    const { server, adapter, session } = await connected();
    const iter = adapter.events(session)[Symbol.asyncIterator]();
    await adapter.disconnect(session);
    expect(server.written.at(-1)).toBe('</stream:stream>');
    expect(session.closed).toBe(true);
    expect((await iter.next()).done).toBe(true);
  });

  it('a dropped connection ends the session', async () => {
    const { server, session } = await connected();
    server.drop();
    expect(session.closed).toBe(true);
  });

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
  async function ackImplicitRosterGet(server: { lastWritten: () => string; send: (s: string) => void }): Promise<void> {
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
    expect(server.written.some((l) => l.includes('type="subscribe"') || l.includes('type="unsubscribe"'))).toBe(
      false,
    );
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

  describe('uploadMedia / resolveMedia (XEP-0363)', () => {
    /** Extracts the id of the last-written iq and sends `xml` (with `${id}` already substituted). */
    function lastIqId(server: FakeServer): string {
      return /id="([^"]+)"/.exec(server.lastWritten())?.[1] ?? '';
    }

    it('discovers the upload service via disco, requests a slot, PUTs the bytes, and returns the get url', async () => {
      const { server, adapter, session } = await connected();
      server.fetchImpl = () =>
        Promise.resolve({
          status: 200,
          headers: {},
          text: () => Promise.resolve(''),
          bytes: () => Promise.resolve(new Uint8Array()),
        });

      const p = adapter.uploadMedia(session, {
        bytes: new Uint8Array([1, 2, 3]),
        mime: 'image/png',
        filename: 'cat.png',
      });

      // 1. disco#items on the account's own domain.
      await tick();
      expect(server.lastWritten()).toBe(
        `<iq type="get" to="example.com" id="${lastIqId(server)}"><query xmlns="http://jabber.org/protocol/disco#items"/></iq>`,
      );
      const itemsId = lastIqId(server);
      server.send(
        `<iq type="result" id="${itemsId}"><query xmlns="http://jabber.org/protocol/disco#items">` +
          `<item jid="upload.example.com"/></query></iq>`,
      );

      // 2. disco#info on that one item, advertising the upload feature.
      await tick();
      expect(server.lastWritten()).toContain('to="upload.example.com"');
      const infoId = lastIqId(server);
      server.send(
        `<iq type="result" id="${infoId}"><query xmlns="http://jabber.org/protocol/disco#info">` +
          `<feature var="urn:xmpp:http:upload:0"/></query></iq>`,
      );

      // 3. the slot request itself.
      await tick();
      expect(server.lastWritten()).toBe(
        `<iq type="get" to="upload.example.com" id="${lastIqId(server)}">` +
          `<request xmlns="urn:xmpp:http:upload:0" filename="cat.png" size="3" content-type="image/png"/></iq>`,
      );
      const slotId = lastIqId(server);
      server.send(
        `<iq type="result" id="${slotId}"><slot xmlns="urn:xmpp:http:upload:0">` +
          `<put url="https://upload.example.com/abc/cat.png"><header name="Authorization">Basic xyz</header></put>` +
          `<get url="https://download.example.com/abc/cat.png"/></slot></iq>`,
      );

      const mediaRef = await p;
      expect(mediaRef).toBe('https://download.example.com/abc/cat.png');
      expect(server.fetchCalls).toHaveLength(1);
      expect(server.fetchCalls[0]).toMatchObject({
        url: 'https://upload.example.com/abc/cat.png',
        init: {
          method: 'PUT',
          headers: { 'content-type': 'image/png', Authorization: 'Basic xyz' },
          body: new Uint8Array([1, 2, 3]),
        },
      });
    });

    it('caches the discovered upload service — a second upload skips disco entirely', async () => {
      const { server, adapter, session } = await connected();
      server.fetchImpl = () =>
        Promise.resolve({ status: 200, headers: {}, text: () => Promise.resolve(''), bytes: () => Promise.resolve(new Uint8Array()) });

      const first = adapter.uploadMedia(session, { bytes: new Uint8Array(), mime: 'text/plain', filename: 'a.txt' });
      await tick();
      const itemsId = lastIqId(server);
      server.send(
        `<iq type="result" id="${itemsId}"><query xmlns="http://jabber.org/protocol/disco#items">` +
          `<item jid="upload.example.com"/></query></iq>`,
      );
      await tick();
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><query xmlns="http://jabber.org/protocol/disco#info">` +
          `<feature var="urn:xmpp:http:upload:0"/></query></iq>`,
      );
      await tick();
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><slot xmlns="urn:xmpp:http:upload:0">` +
          `<put url="https://u/1"/><get url="https://g/1"/></slot></iq>`,
      );
      await first;

      const writtenSoFar = server.written.length;
      const second = adapter.uploadMedia(session, { bytes: new Uint8Array(), mime: 'text/plain', filename: 'b.txt' });
      await tick();
      // Only ONE new iq (the slot request) — no repeat disco#items/disco#info.
      expect(server.written.length).toBe(writtenSoFar + 1);
      expect(server.lastWritten()).toContain('<request xmlns="urn:xmpp:http:upload:0"');
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><slot xmlns="urn:xmpp:http:upload:0">` +
          `<put url="https://u/2"/><get url="https://g/2"/></slot></iq>`,
      );
      expect(await second).toBe('https://g/2');
    });

    it('rejects when no disco item advertises the upload feature', async () => {
      const { server, adapter, session } = await connected();
      const p = adapter.uploadMedia(session, { bytes: new Uint8Array(), mime: 'text/plain', filename: 'a.txt' });
      await tick();
      const itemsId = lastIqId(server);
      server.send(`<iq type="result" id="${itemsId}"><query xmlns="http://jabber.org/protocol/disco#items"/></iq>`);
      await expect(p).rejects.toThrow(/no XEP-0363 HTTP Upload service/);
    });

    it('rejects when the PUT itself fails (HTTP >= 400)', async () => {
      const { server, adapter, session } = await connected();
      server.fetchImpl = () =>
        Promise.resolve({ status: 403, headers: {}, text: () => Promise.resolve(''), bytes: () => Promise.resolve(new Uint8Array()) });
      const p = adapter.uploadMedia(session, { bytes: new Uint8Array(), mime: 'text/plain', filename: 'a.txt' });
      await tick();
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><query xmlns="http://jabber.org/protocol/disco#items">` +
          `<item jid="upload.example.com"/></query></iq>`,
      );
      await tick();
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><query xmlns="http://jabber.org/protocol/disco#info">` +
          `<feature var="urn:xmpp:http:upload:0"/></query></iq>`,
      );
      await tick();
      server.send(
        `<iq type="result" id="${lastIqId(server)}"><slot xmlns="urn:xmpp:http:upload:0">` +
          `<put url="https://u/1"/><get url="https://g/1"/></slot></iq>`,
      );
      await expect(p).rejects.toThrow(/upload PUT failed: HTTP 403/);
    });

    it('resolveMedia accepts only an https url, with no auth headers', () => {
      const { adapter, session } = { adapter: new XmppAdapter(), session: {} as XmppSession };
      expect(adapter.resolveMedia(session, 'https://download.example.com/abc/cat.png')).toEqual({
        url: 'https://download.example.com/abc/cat.png',
        headers: {},
      });
      expect(adapter.resolveMedia(session, 'http://download.example.com/abc/cat.png')).toBeNull();
      expect(adapter.resolveMedia(session, 'javascript:alert(1)')).toBeNull();
    });
  });

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
      message: { conversationId: 'general@conf.example.com', kind: 'system', body: 'Bea was kicked by Ada: spam' },
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
    expect((await it.next()).value).toMatchObject({ type: 'presence', address: 'bob@example.com/phone' });
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
    expect((await p)[0]).toMatchObject({ jid: 'gateway@conf.example.com', occupants: null, membersOnly: false });
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

  it('disconnect is idempotent', async () => {
    const { adapter, session } = await connected();
    await adapter.disconnect(session);
    const n = 0;
    await adapter.disconnect(session);
    expect(n).toBe(0); // no throw
  });

  it('surfaces a presence event and ignores a bare <iq/>', async () => {
    const { server, adapter, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(`<iq type="result" id="x"/>`); // modelled as nothing
    server.send(`<presence from="bob@example.com/p"><show>away</show></presence>`);
    const evt = await it.next();
    expect(evt.value).toMatchObject({ type: 'presence', presence: 'away', address: 'bob@example.com/p' });
    // a server <a/> is consumed silently
    server.send(`<a xmlns="urn:xmpp:sm:3" h="0"/>`);
    await tick();
  });
});

describe('XmppAdapter — transport variants', () => {
  it('connects over a WebSocket when wsUrl is set', async () => {
    const server = new FakeServer();
    const p = new XmppAdapter().connect(
      creds({ wsUrl: 'wss://example.com/xmpp-websocket', security: 'starttls' }),
      server,
    );
    await tick();
    server.send(`<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`);
    server.send(FEAT_AUTH); // PLAIN accepted — a WS is TLS
    await tick();
    expect(server.lastWritten()).toContain('mechanism="PLAIN"');
    server.send(`<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>`);
    await tick();
    server.send(`<stream:stream xmlns="jabber:client">`);
    server.send(`<stream:features><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/></stream:features>`);
    await tick();
    server.send(`<iq type="result" id="bind-1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>ada@example.com/w</jid></bind></iq>`);
    await expect(p).resolves.toBeDefined();
  });

  it('honours an explicit host and port', async () => {
    const server = new FakeServer();
    const p = new XmppAdapter().connect(
      creds({ host: 'chat.example.com', port: 15222, security: 'tls' }),
      server,
    );
    await tick();
    expect(server.tcpOpts).toMatchObject({ host: 'chat.example.com', port: 15222, tls: true, serverName: 'example.com' });
    server.send(`<stream:stream xmlns="jabber:client">`);
    server.send(`<stream:features><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>NOPE</mechanism></mechanisms></stream:features>`);
    await expect(p).rejects.toThrow();
  });

  it('defaults the port from the security mode', async () => {
    const tls = new FakeServer();
    void new XmppAdapter().connect(creds({ security: 'tls' }), tls).catch(() => undefined);
    await tick();
    expect(tls.tcpOpts?.port).toBe(5223);
    const st = new FakeServer();
    void new XmppAdapter().connect(creds({ security: 'starttls' }), st).catch(() => undefined);
    await tick();
    expect(st.tcpOpts?.port).toBe(5222);
  });
});

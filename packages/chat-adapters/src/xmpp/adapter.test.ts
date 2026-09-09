import { describe, it, expect } from 'vitest';
import type { ChatAccountCreds } from '../adapter';
import type { ChatTransport, DuplexStream, OpenTcpOptions } from '../transport';
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
  fetch(): Promise<never> {
    return Promise.reject(new Error('nope'));
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
    expect(session.sm.unackedCount).toBe(1);
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

  it('listConversations / history are empty in this slice', async () => {
    const { adapter } = await connected();
    expect(await adapter.listConversations()).toEqual([]);
    expect(await adapter.history()).toEqual({ messages: [], nextCursor: null });
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
    expect(evt.value).toMatchObject({ type: 'presence', presence: 'away', address: 'bob@example.com' });
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

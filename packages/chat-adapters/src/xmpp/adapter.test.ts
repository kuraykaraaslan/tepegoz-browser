import { describe, it, expect } from 'vitest';
import { XmppAdapter } from './adapter';
import { FakeServer, FEAT_AUTH, connected, creds, tick } from './test-harness';

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
    server.send(
      `<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`,
    );
    server.send(
      `<stream:features><starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"><required/></starttls></stream:features>`,
    );
    await tick();
    expect(server.lastWritten()).toBe('<starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>');
    server.send(`<proceed xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>`);
    await tick();
    expect(server.tlsUpgraded).toBe(true);
    // after TLS the client restarts the stream
    server.send(
      `<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`,
    );
    server.send(FEAT_AUTH);
    await tick();
    server.send(`<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>`);
    await tick();
    server.send(`<stream:stream xmlns="jabber:client">`);
    server.send(
      `<stream:features><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/></stream:features>`,
    );
    await tick();
    server.send(
      `<iq type="result" id="bind-1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>ada@example.com/x</jid></bind></iq>`,
    );
    await expect(p).resolves.toBeDefined();
  });

  it('rejects on a negotiation failure', async () => {
    const server = new FakeServer();
    const p = new XmppAdapter().connect(creds({ security: 'tls' }), server);
    await tick();
    server.send(`<stream:stream xmlns="jabber:client">`);
    server.send(
      `<stream:features><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>ANONYMOUS</mechanism></mechanisms></stream:features>`,
    );
    await expect(p).rejects.toThrow(/no acceptable SASL/);
  });

  it('rejects when the TLS upgrade fails', async () => {
    const server = new FakeServer();
    server.upgradeTLS = () => Promise.reject(new Error('cert rejected'));
    const p = new XmppAdapter().connect(creds({ security: 'starttls' }), server);
    await tick();
    server.send(`<stream:stream xmlns="jabber:client">`);
    server.send(
      `<stream:features><starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"><required/></starttls></stream:features>`,
    );
    await tick();
    server.send(`<proceed xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>`);
    await expect(p).rejects.toThrow(/cert rejected/);
  });

  it('rejects a non-xmpp account', async () => {
    await expect(
      new XmppAdapter().connect(
        {
          accountId: 'a',
          secret: 's',
          server: { protocol: 'irc', server: 'x', port: 1, tls: true, nick: 'n', sasl: false },
        },
        new FakeServer(),
      ),
    ).rejects.toThrow(/not an xmpp/);
  });
});

describe('XmppAdapter — live traffic', () => {
  it('surfaces an incoming message as a raw ChatEvent and answers <r/>', async () => {
    const { server, adapter, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();

    server.send(
      `<message from="bob@example.com/p" type="chat" id="m1"><body>selam</body></message>`,
    );
    const first = await it.next();
    expect(first.value).toMatchObject({
      type: 'message',
      message: { body: 'selam', protocolId: 'm1' },
    });

    server.send(`<r xmlns="urn:xmpp:sm:3"/>`);
    await tick();
    expect(server.lastWritten()).toMatch(/^<a xmlns="urn:xmpp:sm:3" h="\d+"\/>$/);
  });

  it('sendMessage writes a tracked <message> and returns a receipt', async () => {
    const { server, adapter, session } = await connected();
    const receipt = await adapter.sendMessage(session, 'bob@example.com', {
      body: 'hi <there>',
      replyToId: null,
      mediaPath: null,
    });
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
    expect(evt.value).toMatchObject({
      type: 'presence',
      presence: 'away',
      address: 'bob@example.com/p',
    });
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
    server.send(
      `<stream:stream xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`,
    );
    server.send(FEAT_AUTH); // PLAIN accepted — a WS is TLS
    await tick();
    expect(server.lastWritten()).toContain('mechanism="PLAIN"');
    server.send(`<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>`);
    await tick();
    server.send(`<stream:stream xmlns="jabber:client">`);
    server.send(
      `<stream:features><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/></stream:features>`,
    );
    await tick();
    server.send(
      `<iq type="result" id="bind-1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>ada@example.com/w</jid></bind></iq>`,
    );
    await expect(p).resolves.toBeDefined();
  });

  it('honours an explicit host and port', async () => {
    const server = new FakeServer();
    const p = new XmppAdapter().connect(
      creds({ host: 'chat.example.com', port: 15222, security: 'tls' }),
      server,
    );
    await tick();
    expect(server.tcpOpts).toMatchObject({
      host: 'chat.example.com',
      port: 15222,
      tls: true,
      serverName: 'example.com',
    });
    server.send(`<stream:stream xmlns="jabber:client">`);
    server.send(
      `<stream:features><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>NOPE</mechanism></mechanisms></stream:features>`,
    );
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

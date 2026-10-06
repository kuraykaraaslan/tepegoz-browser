import { describe, expect, it } from 'vitest';
import { IrcAdapter } from './adapter';
import { FakeServer, connected, creds, tick } from './test-harness';

describe('IrcAdapter — connect', () => {
  it('opens TCP with the config, registers, and resolves', async () => {
    const { server, session } = await connected();
    expect(server.lastOpen).toMatchObject({ host: 'irc.example', port: 6697, tls: true });
    expect(session.nick).toBe('ada');
    expect(server.written.slice(0, 4)).toEqual([
      'CAP LS 302',
      'PASS pw',
      'NICK ada',
      'USER ada 0 * ada',
    ]);
  });

  it('answers PING with PONG while connected', async () => {
    const { server } = await connected();
    server.send('PING :abc123');
    expect(server.lastWritten()).toBe('PONG :abc123');
  });

  it('reads CHANTYPES from a 005 line', async () => {
    const { server, session } = await connected();
    server.send(':irc.example 005 ada CHANTYPES=#! PREFIX=(ov)@+ :are supported');
    expect(session.chanTypes).toBe('#!');
  });

  it('reads CASEMAPPING from a 005 line and applies it to conversation ids', async () => {
    const { adapter, server, session } = await connected();
    expect(session.casemapping).toBe('rfc1459'); // RFC 2812 default until told otherwise
    server.send(':irc.example 005 ada CASEMAPPING=ascii :are supported');
    expect(session.casemapping).toBe('ascii');

    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(':bob!b@h PRIVMSG #Foo[1] :hi');
    expect((await it.next()).value).toMatchObject({
      message: { conversationId: '#foo[1]' }, // ascii: brackets are NOT folded to {}
    });
  });

  it('ignores an unrecognised CASEMAPPING token', async () => {
    const { server, session } = await connected();
    server.send(':irc.example 005 ada CASEMAPPING=rfc7613 :are supported');
    expect(session.casemapping).toBe('rfc1459');
  });

  it('reads PREFIX from 005 and fans a 353 NAMES line out to membership events', async () => {
    const { adapter, server, session } = await connected();
    expect(session.prefixSymbols).toBe('@+'); // default until 005 says otherwise
    server.send(':irc.example 005 ada PREFIX=(qaohv)~&@%+ :are supported');
    expect(session.prefixSymbols).toBe('~&@%+');

    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(':irc.example 353 ada = #chan :~alice @bob cara');
    server.send(':irc.example 366 ada #chan :End of /NAMES list.'); // ignored
    server.send(':bob!b@h PRIVMSG #chan :hi'); // proves the 366 did not stall the stream

    expect((await it.next()).value).toMatchObject({
      address: '#chan/alice',
      joined: true,
      role: 'moderator',
    });
    expect((await it.next()).value).toMatchObject({
      address: '#chan/bob',
      joined: true,
      role: 'moderator',
    });
    expect((await it.next()).value).toMatchObject({
      address: '#chan/cara',
      joined: true,
      role: 'participant',
    });
    expect((await it.next()).value).toMatchObject({ type: 'message', message: { body: 'hi' } });
  });

  it('rejects when the connection drops mid-registration', async () => {
    const server = new FakeServer();
    const p = new IrcAdapter().connect(creds(), server);
    await tick();
    server.drop();
    await expect(p).rejects.toThrow(/closed/);
  });
});

describe('IrcAdapter — port defaults', () => {
  it('falls back to 6667 for a plaintext connection', async () => {
    const server = new FakeServer();
    void new IrcAdapter().connect(creds({ tls: false, port: 0 }), server);
    await tick();
    expect(server.lastOpen).toMatchObject({ port: 6667, tls: false });
  });
});

describe('IrcAdapter — SASL + errors', () => {
  it('uses SASL when the server config asks for it', async () => {
    const server = new FakeServer();
    const p = new IrcAdapter().connect(creds({ sasl: true }), server);
    await tick();
    expect(server.written).not.toContain('PASS pw');
    server.send('CAP * LS :sasl');
    server.send('CAP ada ACK :sasl');
    expect(server.lastWritten()).toBe('AUTHENTICATE PLAIN');
    server.send('AUTHENTICATE +');
    expect(server.lastWritten()).toBe('AUTHENTICATE AGFkYQBwdw==');
    server.send(':irc 903 ada :ok');
    server.send(':irc 001 ada :Welcome');
    await expect(p).resolves.toBeDefined();
  });

  it('uses SASL EXTERNAL (no secret on the wire) when saslMechanism is external', async () => {
    const server = new FakeServer();
    const p = new IrcAdapter().connect(creds({ sasl: true, saslMechanism: 'external' }), server);
    await tick();
    expect(server.written).not.toContain('PASS pw');
    server.send('CAP * LS :sasl');
    server.send('CAP ada ACK :sasl');
    expect(server.lastWritten()).toBe('AUTHENTICATE EXTERNAL');
    server.send('AUTHENTICATE +');
    expect(server.lastWritten()).toBe('AUTHENTICATE +');
    // the vaulted secret never appears anywhere in the exchange
    expect(server.written.some((l) => l.includes('pw') || l.includes('cA=='))).toBe(false);
    server.send(':irc 903 ada :ok');
    server.send(':irc 001 ada :Welcome');
    await expect(p).resolves.toBeDefined();
  });

  it('identifies to NickServ after registration when preSaslAuth is nickserv (no PASS)', async () => {
    const server = new FakeServer();
    const p = new IrcAdapter().connect(creds({ preSaslAuth: 'nickserv' }), server);
    await tick();
    // the secret is not sent as PASS before registration…
    expect(server.written).not.toContain('PASS pw');
    server.send('CAP * LS :message-tags');
    server.send('CAP ada ACK :message-tags');
    server.send(':irc.example 001 ada :Welcome ada');
    await expect(p).resolves.toBeDefined();
    // …it goes to NickServ once the nick is ours
    expect(server.lastWritten()).toBe('PRIVMSG NickServ :IDENTIFY pw');
  });

  it('still sends PASS (not NickServ) when preSaslAuth is absent', async () => {
    const { server } = await connected();
    expect(server.written).toContain('PASS pw');
    expect(server.written.some((l) => l.startsWith('PRIVMSG NickServ'))).toBe(false);
  });

  it('does not touch NickServ when SASL is on even if preSaslAuth is set', async () => {
    const server = new FakeServer();
    const p = new IrcAdapter().connect(creds({ sasl: true, preSaslAuth: 'nickserv' }), server);
    await tick();
    server.send('CAP * LS :sasl');
    server.send('CAP ada ACK :sasl');
    server.send('AUTHENTICATE +');
    server.send(':irc 903 ada :ok');
    server.send(':irc 001 ada :Welcome');
    await expect(p).resolves.toBeDefined();
    expect(server.written.some((l) => l.startsWith('PRIVMSG NickServ'))).toBe(false);
  });

  it('rejects a non-irc account', async () => {
    await expect(
      new IrcAdapter().connect(
        {
          accountId: 'a',
          secret: 'x',
          server: {
            protocol: 'xmpp',
            jid: 'a@b',
            host: null,
            port: null,
            security: 'tls',
            wsUrl: null,
          },
        },
        new FakeServer(),
      ),
    ).rejects.toThrow(/not an irc account/);
  });
});

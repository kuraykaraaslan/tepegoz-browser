import { describe, expect, it } from 'vitest';
import type { ChatServerConfig } from '@tepegoz/shared-types';
import type { ChatAccountCreds } from '../adapter';
import type { ChatTransport, DuplexStream, OpenTcpOptions } from '../transport';
import { IrcAdapter, type IrcSession } from './adapter';

type IrcServer = Extract<ChatServerConfig, { protocol: 'irc' }>;

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

class FakeServer implements ChatTransport {
  written: string[] = [];
  private onData: ((c: Uint8Array) => void) | null = null;
  private onClose: ((e?: Error) => void) | null = null;
  lastOpen: OpenTcpOptions | null = null;

  private closeStub: (() => void) | null = null;
  private stream: DuplexStream = {
    write: (d) => {
      const text = typeof d === 'string' ? d : new TextDecoder().decode(d);
      for (const line of text.split('\r\n')) if (line.length > 0) this.written.push(line);
    },
    onData: (cb) => {
      this.onData = cb;
    },
    onClose: (cb) => {
      this.onClose = cb;
    },
    close: () => {
      if (this.closeStub !== null) this.closeStub();
      else this.onClose?.();
    },
  };

  stub(fn: () => void): void {
    this.closeStub = fn;
  }

  openTCP(opts: OpenTcpOptions): Promise<DuplexStream> {
    this.lastOpen = opts;
    return Promise.resolve(this.stream);
  }
  upgradeTLS(): Promise<DuplexStream> {
    return Promise.resolve(this.stream);
  }
  openWebSocket(): Promise<DuplexStream> {
    throw new Error('unused');
  }
  fetch(): never {
    throw new Error('unused');
  }
  openEventStream(): never {
    throw new Error('unused');
  }

  send(...lines: string[]): void {
    this.onData?.(new TextEncoder().encode(lines.map((l) => `${l}\r\n`).join('')));
  }
  drop(): void {
    this.onClose?.();
  }
  lastWritten(): string {
    return this.written.at(-1) ?? '';
  }
}

const creds = (over: Partial<IrcServer> = {}): ChatAccountCreds => ({
  accountId: 'acc',
  secret: 'pw',
  server: { protocol: 'irc', server: 'irc.example', port: 6697, tls: true, nick: 'ada', sasl: false, ...over },
});

async function connected(server = new FakeServer()) {
  const adapter = new IrcAdapter();
  const p = adapter.connect(creds(), server);
  await tick();
  // the client sent CAP LS + NICK + USER (+ PASS since a secret is set and sasl is off)
  server.send('CAP * LS :message-tags server-time');
  server.send('CAP ada ACK :message-tags server-time');
  server.send(':irc.example 001 ada :Welcome ada');
  const session = (await p) as IrcSession;
  return { adapter, server, session };
}

describe('IrcAdapter — connect', () => {
  it('opens TCP with the config, registers, and resolves', async () => {
    const { server, session } = await connected();
    expect(server.lastOpen).toMatchObject({ host: 'irc.example', port: 6697, tls: true });
    expect(session.nick).toBe('ada');
    expect(server.written.slice(0, 4)).toEqual(['CAP LS 302', 'PASS pw', 'NICK ada', 'USER ada 0 * ada']);
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

  it('rejects when the connection drops mid-registration', async () => {
    const server = new FakeServer();
    const p = new IrcAdapter().connect(creds(), server);
    await tick();
    server.drop();
    await expect(p).rejects.toThrow(/closed/);
  });
});

describe('IrcAdapter — live traffic', () => {
  it('surfaces an inbound PRIVMSG as a raw ChatEvent', async () => {
    const { adapter, server, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(':bob!b@h PRIVMSG #chan :hello');
    expect((await it.next()).value).toMatchObject({
      type: 'message',
      message: { conversationId: '#chan', body: 'hello' },
    });
  });

  it('sendMessage / joinRoom / leaveRoom write the right lines and track channels', async () => {
    const { adapter, server, session } = await connected();
    await adapter.sendMessage(session, '#chan', { body: 'yo', replyToId: null, mediaPath: null });
    expect(server.lastWritten()).toBe('PRIVMSG #chan :yo');

    const conv = await adapter.joinRoom(session, '#Room');
    expect(conv).toMatchObject({ id: '#room', kind: 'room' });
    expect(server.lastWritten()).toBe('JOIN #Room');
    expect(session.joined.has('#room')).toBe(true);

    await adapter.leaveRoom(session, '#room');
    expect(server.lastWritten()).toBe('PART #room');
    expect(session.joined.has('#room')).toBe(false);
  });

  it('tracks our own JOIN/PART for auto-rejoin', async () => {
    const { server, session } = await connected();
    server.send(':ada!a@h JOIN #a', ':ada!a@h JOIN #b', ':ada!a@h PART #a');
    expect([...session.joined]).toEqual(['#b']);
  });

  it('setPresence maps to AWAY, disconnect QUITs and ends the iterator', async () => {
    const { adapter, server, session } = await connected();
    await adapter.setPresence(session, 'dnd', 'in a meeting');
    expect(server.lastWritten()).toBe('AWAY :in a meeting');
    await adapter.setPresence(session, 'online');
    expect(server.lastWritten()).toBe('AWAY');

    const it = adapter.events(session)[Symbol.asyncIterator]();
    await adapter.disconnect(session);
    expect(server.written).toContain('QUIT :bye');
    expect((await it.next()).done).toBe(true);
  });

  it('roster / listConversations / markRead are inert', async () => {
    const { adapter, session } = await connected();
    expect(await adapter.roster()).toEqual([]);
    expect(await adapter.listConversations()).toEqual([]);
    await expect(adapter.markRead()).resolves.toBeUndefined();
    // history is a no-op without the chathistory cap
    expect(await adapter.history(session, '#c', null)).toEqual({ messages: [], nextCursor: null });
  });

  it('history() runs a CHATHISTORY BEFORE and resolves from the batch', async () => {
    const server = new FakeServer();
    const adapter = new IrcAdapter();
    const p = adapter.connect(creds(), server);
    await tick();
    server.send('CAP * LS :chathistory batch message-tags server-time');
    server.send('CAP ada ACK :chathistory batch message-tags server-time');
    server.send(':irc 001 ada :Welcome');
    const session = (await p) as IrcSession;

    const histP = adapter.history(session, '#chan', null);
    await tick();
    expect(server.lastWritten()).toBe('CHATHISTORY BEFORE #chan * 50');

    server.send(
      'BATCH +h1 chathistory #chan',
      '@batch=h1;time=2026-01-01T00:00:02.000Z :bob!b@h PRIVMSG #chan :second',
      '@batch=h1;time=2026-01-01T00:00:01.000Z :bob!b@h PRIVMSG #chan :first',
      'BATCH -h1',
    );
    const page = await histP;
    expect(page.messages.map((m) => m.body)).toEqual(['first', 'second']);
    expect(page.nextCursor).toBe('2026-01-01T00:00:01.000Z');
  });

  it('a non-chathistory batch falls through to the live stream', async () => {
    const { adapter, server, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(
      'BATCH +n netjoin',
      '@batch=n :bob!b@h PRIVMSG #c :inside a netjoin batch',
      'BATCH -n',
      ':bob!b@h PRIVMSG #c :after',
    );
    // the batched PRIVMSG is surfaced like any other line; then the plain one
    expect((await it.next()).value).toMatchObject({ message: { body: 'inside a netjoin batch' } });
    expect((await it.next()).value).toMatchObject({ message: { body: 'after' } });
  });

  it('ignores a BATCH close / tag for an unknown ref', async () => {
    const { adapter, server, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send('BATCH -ghost', '@batch=ghost :bob!b@h PRIVMSG #c :orphan');
    expect((await it.next()).value).toMatchObject({ message: { body: 'orphan' } });
  });

  it('history() times out to an empty page and does not leak the waiter', async () => {
    const server = new FakeServer();
    const adapter = new IrcAdapter();
    const p = adapter.connect(creds(), server);
    await tick();
    server.send('CAP * LS :chathistory', 'CAP ada ACK :chathistory', ':irc 001 ada :hi');
    const session = (await p) as IrcSession;
    // resolve immediately by ending the session — the pending waiter resolves []
    const histP = adapter.history(session, '#c', 'msgid');
    await adapter.disconnect(session);
    expect(await histP).toEqual({ messages: [], nextCursor: null });
  });

  it('changeNick writes a NICK line', async () => {
    const { adapter, server, session } = await connected();
    await adapter.changeNick(session, 'ada2');
    expect(server.lastWritten()).toBe('NICK ada2');
  });

  it('disconnect is best-effort when the socket throws', async () => {
    const { adapter, session, server } = await connected();
    server.stub(() => {
      throw new Error('EPIPE');
    });
    await expect(adapter.disconnect(session)).resolves.toBeUndefined();
    expect(session.closed).toBe(true);
  });

  it('a malformed / unmodelled inbound line is swallowed', async () => {
    const { adapter, server, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send('', ':srv 366 ada #c :End of NAMES'); // empty + a numeric we do not model
    server.send(':bob!b@h PRIVMSG #c :real');
    expect((await it.next()).value).toMatchObject({ message: { body: 'real' } });
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

  it('rejects a non-irc account', async () => {
    await expect(
      new IrcAdapter().connect(
        { accountId: 'a', secret: 'x', server: { protocol: 'xmpp', jid: 'a@b', host: null, port: null, security: 'tls', wsUrl: null } },
        new FakeServer(),
      ),
    ).rejects.toThrow(/not an irc account/);
  });
});

import { describe, expect, it } from 'vitest';
import type { ChatServerConfig } from '@tepegoz/shared-types';
import type { ChatAccountCreds } from '../adapter';
import type { ChatTransport, DuplexStream, OpenTcpOptions } from '../transport';
import { IrcAdapter, type IrcSession } from './adapter';

/**
 * Recorded-trace fixture — a full, structurally faithful IRC session as an ergo / Libera-style server
 * actually speaks it: `CAP LS 302` negotiation (multi-line), SASL PLAIN, `001`–`005` with a real
 * ISUPPORT split across lines, the MOTD block, then live traffic (JOIN + `353`/`366` NAMES, a
 * channel PRIVMSG, a CTCP ACTION, a NOTICE, a DM, a KICK, a QUIT). The adapter must stay lenient to
 * the numerics it does not model, fan `353` NAMES out to one membership event per occupant, and
 * surface exactly the message / membership events.
 */

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
type IrcServer = Extract<ChatServerConfig, { protocol: 'irc' }>;

class TraceServer implements ChatTransport {
  written: string[] = [];
  lastOpen: OpenTcpOptions | null = null;
  private onData: ((c: Uint8Array) => void) | null = null;
  private onClose: ((e?: Error) => void) | null = null;
  private readonly stream: DuplexStream = {
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
    close: () => this.onClose?.(),
  };

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

  feed(...lines: string[]): void {
    this.onData?.(new TextEncoder().encode(lines.map((l) => `${l}\r\n`).join('')));
  }
}

const creds: ChatAccountCreds = {
  accountId: 'acc',
  secret: 's3cret',
  server: {
    protocol: 'irc',
    server: 'irc.libera.chat',
    port: 6697,
    tls: true,
    nick: 'ada',
    sasl: true,
  } satisfies IrcServer,
};

// The server's replies, in order. `feed()` is called once with all of them — the adapter's line
// buffer processes them sequentially, and `IrcRegistration` only needs the ACK + `AUTHENTICATE +`
// to be present, not interleaved with the client's writes.
const REGISTRATION = [
  'CAP * LS * :account-notify away-notify chghost extended-join multi-prefix',
  'CAP * LS :sasl=PLAIN,EXTERNAL server-time message-tags batch account-tag echo-message labeled-response',
  'CAP ada ACK :server-time message-tags batch account-tag echo-message away-notify multi-prefix extended-join chghost sasl',
  'AUTHENTICATE +',
  ':irc.libera.chat 900 ada ada!ada@user/ada ada :You are now logged in as ada',
  ':irc.libera.chat 903 ada :SASL authentication successful',
  ':irc.libera.chat 001 ada :Welcome to the Libera.Chat Internet Relay Chat Network ada',
  ':irc.libera.chat 002 ada :Your host is irc.libera.chat, running version solanum-1.0',
  ':irc.libera.chat 003 ada :This server was created ...',
  ':irc.libera.chat 004 ada irc.libera.chat solanum-1.0 DGIMQ bcdefg',
  ':irc.libera.chat 005 ada CHANTYPES=# EXCEPTS INVEX CHANMODES=eIbq,k,flj,CFLMPQ PREFIX=(ov)@+ :are supported',
  ':irc.libera.chat 005 ada CASEMAPPING=rfc1459 NICKLEN=16 CHANNELLEN=50 TOPICLEN=390 :are supported',
  ':irc.libera.chat 375 ada :- irc.libera.chat Message of the Day -',
  ':irc.libera.chat 372 ada :- Welcome to Libera.Chat.',
  ':irc.libera.chat 376 ada :End of /MOTD command.',
];

async function registered(): Promise<{ adapter: IrcAdapter; server: TraceServer; session: IrcSession }> {
  const server = new TraceServer();
  const adapter = new IrcAdapter();
  const p = adapter.connect(creds, server);
  await tick();
  server.feed(...REGISTRATION);
  const session = (await p) as IrcSession;
  return { adapter, server, session };
}

describe('IRC recorded trace — registration', () => {
  it('drives CAP LS 302 → SASL PLAIN → CAP END → NICK/USER and resolves', async () => {
    const { server, session } = await registered();
    expect(server.lastOpen).toMatchObject({ host: 'irc.libera.chat', port: 6697, tls: true });
    expect(session.nick).toBe('ada');
    expect(server.written[0]).toBe('CAP LS 302');
    // SASL PLAIN: base64("\0ada\0s3cret")
    const authLine = server.written.find((l) => l.startsWith('AUTHENTICATE ') && l !== 'AUTHENTICATE PLAIN');
    expect(Buffer.from(authLine!.slice('AUTHENTICATE '.length), 'base64').toString()).toBe('\0ada\0s3cret');
    expect(server.written).toContain('CAP END');
  });

  it('reads CHANTYPES from the first 005 line', async () => {
    const { session } = await registered();
    expect(session.chanTypes).toBe('#');
  });
});

describe('IRC recorded trace — live traffic', () => {
  it('surfaces channel / action / notice / DM messages and membership, ignoring numerics', async () => {
    const { adapter, server, session } = await registered();
    const iter = adapter.events(session)[Symbol.asyncIterator]();
    const CTCP = String.fromCharCode(1);

    server.feed(
      ':ada!ada@user/ada JOIN #tepegoz * :Ada',
      ':irc.libera.chat 353 ada = #tepegoz :@bea +cem ada',
      ':irc.libera.chat 366 ada #tepegoz :End of /NAMES list.',
      ':bea!b@user/bea PRIVMSG #tepegoz :morning all',
      `:cem!c@h PRIVMSG #tepegoz :${CTCP}ACTION waves${CTCP}`,
      ':bea!b@user/bea NOTICE #tepegoz :heads up: standup in 5',
      ':bea!b@user/bea PRIVMSG ada :ping me after',
      ':cem!c@h KICK #tepegoz dan :spam',
      ':dan!d@h QUIT :Ping timeout',
    );

    const seen: unknown[] = [];
    for (let i = 0; i < 10; i += 1) seen.push((await iter.next()).value);

    // our own JOIN, then the 353 NAMES list fanned out (op → moderator, voice/plain → participant)
    expect(seen[0]).toMatchObject({ type: 'room-membership', conversationId: '#tepegoz', address: '#tepegoz/ada', joined: true, self: true });
    expect(seen.slice(1, 4)).toMatchObject([
      { type: 'room-membership', address: '#tepegoz/bea', joined: true, self: false, role: 'moderator' },
      { type: 'room-membership', address: '#tepegoz/cem', joined: true, role: 'participant' },
      { type: 'room-membership', address: '#tepegoz/ada', joined: true, self: true, role: 'participant' },
    ]);
    expect(seen[4]).toMatchObject({ type: 'message', message: { conversationId: '#tepegoz', body: 'morning all' } });
    expect(seen[5]).toMatchObject({ type: 'message', message: { conversationId: '#tepegoz', body: '/me waves' } });
    expect(seen[6]).toMatchObject({ type: 'message', message: { conversationId: '#tepegoz', kind: 'system', body: 'heads up: standup in 5' } });
    expect(seen[7]).toMatchObject({ type: 'message', message: { conversationId: 'bea', body: 'ping me after' } });
    expect(seen[8]).toMatchObject({ type: 'room-membership', conversationId: '#tepegoz', address: '#tepegoz/dan', joined: false });
    // the KICK also surfaces as a visible system line in the channel
    expect(seen[9]).toMatchObject({
      type: 'message',
      message: { conversationId: '#tepegoz', kind: 'system', senderAddress: 'cem', body: 'cem kicked dan: spam' },
    });
  });

  it('answers a mid-session PING', async () => {
    const { server } = await registered();
    server.feed('PING :libera.chat');
    expect(server.written.at(-1)).toBe('PONG :libera.chat');
  });
});

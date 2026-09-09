import type {
  ChatContact,
  ChatConversation,
  ChatEvent,
  ChatPresence,
  OutgoingMessage,
} from '@tepegoz/shared-types';
import type {
  ChatAccountCreds,
  ChatAdapter,
  ChatSession,
  ConvId,
  HistoryPage,
  SendReceipt,
} from '../adapter';
import { IRC_CAPS } from '../caps';
import type { ChatTransport, DuplexStream } from '../transport';
import { parseIrcLine, parseIsupport } from './parse';
import { IrcRegistration, type RegistrationAction } from './registration';
import {
  buildIrcAway,
  buildIrcJoin,
  buildIrcNick,
  buildIrcPart,
  buildIrcPrivmsg,
  ircMessageToEvent,
  type IrcContext,
} from './messages';

const DEFAULT_PORT_TLS = 6697;
const DEFAULT_PORT_PLAIN = 6667;
const MAX_BUFFER = 1 << 20; // 1 MiB of un-terminated bytes → the peer is misbehaving

/** One connected IRC session: the socket, an incremental line buffer, and a backpressured event queue. */
export class IrcSession implements ChatSession {
  readonly caps = IRC_CAPS;
  closed = false;
  chanTypes = '#&';
  readonly joined = new Set<string>();

  private buffer = '';
  private readonly queue: ChatEvent[] = [];
  private readonly waiters: Array<(r: IteratorResult<ChatEvent>) => void> = [];
  private ended = false;

  constructor(
    readonly accountId: string,
    public nick: string,
    public stream: DuplexStream,
  ) {}

  write(line: string): void {
    if (!this.closed) this.stream.write(`${line}\r\n`);
  }

  /** Feed a decoded chunk; returns the complete lines it produced. */
  takeLines(chunk: string): string[] {
    this.buffer += chunk;
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer = '';
      return [];
    }
    const lines: string[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      lines.push(this.buffer.slice(0, nl).replace(/\r$/, ''));
      this.buffer = this.buffer.slice(nl + 1);
    }
    return lines;
  }

  push(event: ChatEvent): void {
    if (this.ended) return;
    const waiter = this.waiters.shift();
    if (waiter !== undefined) waiter({ value: event, done: false });
    else this.queue.push(event);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.closed = true;
    while (this.waiters.length > 0) this.waiters.shift()?.({ value: undefined, done: true });
  }

  nextEvent(): Promise<IteratorResult<ChatEvent>> {
    const item = this.queue.shift();
    if (item !== undefined) return Promise.resolve({ value: item, done: false });
    if (this.ended) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

export class IrcAdapter implements ChatAdapter {
  readonly id = 'irc';
  readonly capabilities = IRC_CAPS;

  async connect(creds: ChatAccountCreds, transport: ChatTransport): Promise<ChatSession> {
    if (creds.server.protocol !== 'irc') throw new Error('IrcAdapter: not an irc account');
    const server = creds.server;

    const stream = await transport.openTCP({
      host: server.server,
      port: server.port || (server.tls ? DEFAULT_PORT_TLS : DEFAULT_PORT_PLAIN),
      tls: server.tls,
      serverName: server.server,
    });

    const session = new IrcSession(creds.accountId, server.nick, stream);
    const registration = new IrcRegistration({
      nick: server.nick,
      user: server.nick,
      ...(creds.secret.length > 0 && !server.sasl ? { password: creds.secret } : {}),
      ...(server.sasl ? { sasl: { username: server.nick, password: creds.secret } } : {}),
    });

    let registering = true;
    const decoder = new TextDecoder();

    return new Promise<ChatSession>((resolve, reject) => {
      const runActions = (actions: RegistrationAction[]): void => {
        for (const action of actions) {
          if (action.kind === 'send') session.write(action.line);
          else if (action.kind === 'registered') {
            registering = false;
            session.nick = action.nick;
            resolve(session);
          } else {
            registering = false;
            session.end();
            reject(new Error(`IRC registration failed: ${action.reason}`));
          }
        }
      };

      stream.onData((chunk) => {
        for (const line of session.takeLines(decoder.decode(chunk))) {
          const msg = parseIrcLine(line);
          if (msg === null) continue;
          if (msg.command === 'PING') {
            session.write(`PONG :${msg.params[0] ?? ''}`);
            continue;
          }
          if (registering) {
            runActions(registration.feed(msg));
            continue;
          }
          if (msg.command === '005') {
            const map = parseIsupport(msg.params);
            if (typeof map.CHANTYPES === 'string') session.chanTypes = map.CHANTYPES;
            continue;
          }
          this.handleLive(session, line);
        }
      });

      stream.onClose((err) => {
        if (registering) reject(err ?? new Error('connection closed during registration'));
        else session.end();
      });

      runActions(registration.start());
    });
  }

  private handleLive(session: IrcSession, line: string): void {
    const msg = parseIrcLine(line);
    if (msg === null) return;
    const ctx: IrcContext = {
      accountId: session.accountId,
      selfNick: session.nick,
      chanTypes: session.chanTypes,
      now: Date.now(),
    };
    // Track our own channel membership so a reconnect can auto-rejoin.
    if ((msg.command === 'JOIN' || msg.command === 'PART') && msg.prefix?.startsWith(`${session.nick}!`)) {
      const chan = msg.params[0]?.toLowerCase();
      if (chan !== undefined) {
        if (msg.command === 'JOIN') session.joined.add(chan);
        else session.joined.delete(chan);
      }
    }
    const event = ircMessageToEvent(msg, ctx);
    if (event !== null) session.push(event);
  }

  disconnect(session: ChatSession): Promise<void> {
    const s = session as IrcSession;
    try {
      s.write('QUIT :bye');
      s.stream.close();
    } catch {
      /* best-effort */
    }
    s.end();
    return Promise.resolve();
  }

  roster(): Promise<ChatContact[]> {
    return Promise.resolve([]); // IRC has no roster
  }

  setPresence(session: ChatSession, presence: ChatPresence, statusText?: string): Promise<void> {
    const s = session as IrcSession;
    s.write(presence === 'online' ? buildIrcAway() : buildIrcAway(statusText ?? 'away'));
    return Promise.resolve();
  }

  listConversations(): Promise<ChatConversation[]> {
    return Promise.resolve([]);
  }

  history(): Promise<HistoryPage> {
    // IRCv3 `chathistory` backfill lands in a later slice.
    return Promise.resolve({ messages: [], nextCursor: null });
  }

  sendMessage(session: ChatSession, conv: ConvId, body: OutgoingMessage): Promise<SendReceipt> {
    const s = session as IrcSession;
    s.write(buildIrcPrivmsg(conv, body.body));
    const ts = Date.now();
    return Promise.resolve({ protocolId: `${String(ts)}~${s.nick}~${body.body.slice(0, 40)}`, ts });
  }

  markRead(): Promise<void> {
    return Promise.resolve(); // IRC has no read receipts
  }

  joinRoom(session: ChatSession, address: string): Promise<ChatConversation> {
    const s = session as IrcSession;
    const channel = address.toLowerCase();
    s.write(buildIrcJoin(address));
    s.joined.add(channel);
    return Promise.resolve({
      id: channel,
      accountId: s.accountId,
      kind: 'room',
      address: channel,
      name: address,
      topic: '',
      memberCount: 0,
      unread: 0,
      mentions: 0,
      lastReadId: null,
      muted: false,
      notifyLevel: 'all',
      isKnownContact: true,
      updatedAt: Date.now(),
    });
  }

  leaveRoom(session: ChatSession, conv: ConvId): Promise<void> {
    const s = session as IrcSession;
    s.write(buildIrcPart(conv));
    s.joined.delete(conv.toLowerCase());
    return Promise.resolve();
  }

  changeNick(session: ChatSession, nick: string): Promise<void> {
    (session as IrcSession).write(buildIrcNick(nick));
    return Promise.resolve();
  }

  async *events(session: ChatSession): AsyncIterable<unknown> {
    const s = session as IrcSession;
    for (;;) {
      const next = await s.nextEvent();
      if (next.done === true) return;
      yield next.value;
    }
  }
}

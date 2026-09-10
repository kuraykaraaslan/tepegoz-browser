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
import { parseIrcLine, parseIsupport, type IrcMessage } from './parse';
import { IrcRegistration, type RegistrationAction } from './registration';
import {
  asIrcCasemapping,
  buildIrcAway,
  buildIrcJoin,
  buildIrcNick,
  buildIrcPart,
  buildIrcPrivmsg,
  foldIrcTarget,
  ircMessageToEvent,
  namesReplyToEvents,
  parseIrcPrefixSpec,
  type IrcCasemapping,
  type IrcContext,
} from './messages';

const DEFAULT_PORT_TLS = 6697;
const DEFAULT_PORT_PLAIN = 6667;
const MAX_BUFFER = 1 << 20; // 1 MiB of un-terminated bytes → the peer is misbehaving
const IRC_HISTORY_LIMIT = 50;
const IRC_HISTORY_TIMEOUT_MS = 15_000;
/** Anti-flood (classic ircd penalty model): every queued client line costs this much send budget… */
const FLOOD_PENALTY_MS = 2000;
/** …and up to this much budget may be spent ahead of real time before sends are paced out. */
const FLOOD_BURST_MS = 8000;

/** One connected IRC session: the socket, an incremental line buffer, and a backpressured event queue. */
export class IrcSession implements ChatSession {
  readonly caps = IRC_CAPS;
  closed = false;
  chanTypes = '#&';
  /** ISUPPORT `CASEMAPPING`; narrows how a channel/nick folds to a conversation id. */
  casemapping: IrcCasemapping = 'rfc1459';
  /** ISUPPORT `PREFIX` membership-status symbols, highest-rank first (default `@+`). */
  prefixSymbols = '@+';
  readonly joined = new Set<string>();
  /** IRCv3 caps the server ACKed. */
  ircCaps: ReadonlySet<string> = new Set();

  /** Open IRCv3 `batch` refs → the lines collected under them. */
  readonly batches = new Map<string, { type: string; target: string; lines: IrcMessage[] }>();
  /** A pending `history()` call, keyed by folded target. */
  readonly historyWaiters = new Map<string, (lines: IrcMessage[]) => void>();

  private buffer = '';
  private readonly queue: ChatEvent[] = [];
  private readonly waiters: Array<(r: IteratorResult<ChatEvent>) => void> = [];
  private ended = false;

  /** Anti-flood send queue: wall-clock ms the budget has been spent up to, plus what is waiting. */
  private floodBudgetUntil = 0;
  private readonly pending: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly accountId: string,
    public nick: string,
    public stream: DuplexStream,
  ) {}

  /** Write a line to the socket immediately — for protocol-critical traffic (registration, PONG, QUIT). */
  write(line: string): void {
    if (!this.closed) this.stream.write(`${line}\r\n`);
  }

  /**
   * Queue a client-initiated line (PRIVMSG / JOIN / PART / NICK / AWAY / CHATHISTORY) behind the
   * anti-flood pacer. A handful of lines go out back-to-back; beyond that they are spaced by
   * {@link FLOOD_PENALTY_MS} so a burst does not trip the server's excess-flood kill.
   */
  enqueue(line: string): void {
    if (this.closed) return;
    this.pending.push(line);
    this.pump();
  }

  private pump(): void {
    if (this.flushTimer !== null || this.closed) return;
    while (this.pending.length > 0) {
      const now = Date.now();
      if (this.floodBudgetUntil < now) this.floodBudgetUntil = now;
      if (this.floodBudgetUntil - now > FLOOD_BURST_MS) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this.pump();
        }, this.floodBudgetUntil - FLOOD_BURST_MS - now);
        return;
      }
      const line = this.pending.shift();
      if (line === undefined) break;
      this.write(line);
      this.floodBudgetUntil += FLOOD_PENALTY_MS;
    }
  }

  /** Fold a channel/nick to its conversation id under the negotiated casemapping. */
  fold(target: string): string {
    return foldIrcTarget(target, this.casemapping);
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
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pending.length = 0;
    while (this.waiters.length > 0) this.waiters.shift()?.({ value: undefined, done: true });
    for (const resolve of this.historyWaiters.values()) resolve([]);
    this.historyWaiters.clear();
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
            session.ircCaps = registration.ackedCaps;
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
            const casemapping = asIrcCasemapping(map.CASEMAPPING);
            if (casemapping !== null) session.casemapping = casemapping;
            if (typeof map.PREFIX === 'string') {
              const symbols = parseIrcPrefixSpec(map.PREFIX);
              if (symbols !== '') session.prefixSymbols = symbols;
            }
            continue;
          }
          if (this.handleBatch(session, msg)) continue;
          this.handleLive(session, msg);
        }
      });

      stream.onClose((err) => {
        if (registering) reject(err ?? new Error('connection closed during registration'));
        else session.end();
      });

      runActions(registration.start());
    });
  }

  /**
   * IRCv3 `batch`: `BATCH +ref TYPE [args]` opens, tagged lines join it, `BATCH -ref` closes. A
   * `chathistory` batch's messages resolve the matching {@link history} promise; other batch members
   * fall through to the live stream. Returns whether the line was consumed by the batch machinery.
   */
  private handleBatch(session: IrcSession, msg: IrcMessage): boolean {
    if (msg.command === 'BATCH') {
      const token = msg.params[0] ?? '';
      const ref = token.slice(1);
      if (token.startsWith('+')) {
        session.batches.set(ref, {
          type: msg.params[1] ?? '',
          target: session.fold(msg.params[2] ?? ''),
          lines: [],
        });
        return true;
      }
      if (token.startsWith('-')) {
        const batch = session.batches.get(ref);
        session.batches.delete(ref);
        if (batch !== undefined && batch.type === 'chathistory') {
          const resolve = session.historyWaiters.get(batch.target);
          if (resolve !== undefined) {
            session.historyWaiters.delete(batch.target);
            resolve(batch.lines);
          }
          return true;
        }
        return batch?.type === 'chathistory';
      }
      return false;
    }
    const batchRef = msg.tags.batch;
    if (batchRef !== undefined) {
      const batch = session.batches.get(batchRef);
      if (batch?.type === 'chathistory') {
        batch.lines.push(msg);
        return true;
      }
    }
    return false;
  }

  private handleLive(session: IrcSession, msg: IrcMessage): void {
    const ctx: IrcContext = {
      accountId: session.accountId,
      selfNick: session.nick,
      chanTypes: session.chanTypes,
      casemapping: session.casemapping,
      prefixSymbols: session.prefixSymbols,
      now: Date.now(),
    };
    // RPL_NAMREPLY lists many occupants in one line → fan out to one membership event each.
    if (msg.command === '353') {
      for (const e of namesReplyToEvents(msg, ctx)) session.push(e);
      return;
    }
    // Track our own channel membership so a reconnect can auto-rejoin.
    if ((msg.command === 'JOIN' || msg.command === 'PART') && msg.prefix?.startsWith(`${session.nick}!`)) {
      const chan = msg.params[0] !== undefined ? session.fold(msg.params[0]) : undefined;
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
    s.enqueue(presence === 'online' ? buildIrcAway() : buildIrcAway(statusText ?? 'away'));
    return Promise.resolve();
  }

  listConversations(): Promise<ChatConversation[]> {
    return Promise.resolve([]);
  }

  history(session: ChatSession, conv: ConvId, before: string | null): Promise<HistoryPage> {
    const s = session as IrcSession;
    if (!s.ircCaps.has('draft/chathistory') && !s.ircCaps.has('chathistory')) {
      return Promise.resolve({ messages: [], nextCursor: null });
    }
    const target = s.fold(conv);
    const selector = before !== null ? `timestamp=${before}` : '*';
    return new Promise<HistoryPage>((resolve) => {
      const timer = setTimeout(() => {
        s.historyWaiters.delete(target);
        resolve({ messages: [], nextCursor: null });
      }, IRC_HISTORY_TIMEOUT_MS);
      s.historyWaiters.set(target, (lines) => {
        clearTimeout(timer);
        const ctx: IrcContext = {
          accountId: s.accountId,
          selfNick: s.nick,
          chanTypes: s.chanTypes,
          casemapping: s.casemapping,
          prefixSymbols: s.prefixSymbols,
          now: Date.now(),
        };
        const messages = lines
          .map((m) => ircMessageToEvent(m, ctx))
          .filter((e): e is Extract<typeof e, { type: 'message' }> => e?.type === 'message')
          .map((e) => e.message)
          .sort((a, b) => a.originTs - b.originTs);
        const oldest = messages[0];
        resolve({
          messages,
          nextCursor: messages.length > 0 && oldest !== undefined ? new Date(oldest.originTs).toISOString() : null,
        });
      });
      s.enqueue(`CHATHISTORY BEFORE ${conv} ${selector} ${IRC_HISTORY_LIMIT}`);
    });
  }

  sendMessage(session: ChatSession, conv: ConvId, body: OutgoingMessage): Promise<SendReceipt> {
    const s = session as IrcSession;
    s.enqueue(buildIrcPrivmsg(conv, body.body));
    const ts = Date.now();
    return Promise.resolve({ protocolId: `${String(ts)}~${s.nick}~${body.body.slice(0, 40)}`, ts });
  }

  markRead(): Promise<void> {
    return Promise.resolve(); // IRC has no read receipts
  }

  joinRoom(session: ChatSession, address: string): Promise<ChatConversation> {
    const s = session as IrcSession;
    const channel = s.fold(address);
    s.enqueue(buildIrcJoin(address));
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
    s.enqueue(buildIrcPart(conv));
    s.joined.delete(s.fold(conv));
    return Promise.resolve();
  }

  changeNick(session: ChatSession, nick: string): Promise<void> {
    (session as IrcSession).enqueue(buildIrcNick(nick));
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

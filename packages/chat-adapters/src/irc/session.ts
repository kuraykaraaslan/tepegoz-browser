import type { ChatEvent } from '@tepegoz/shared-types';
import type { ChatSession } from '../adapter';
import { IRC_CAPS } from '../caps';
import {
  boundEventQueue,
  newEventQueueState,
  rearmGapNotice,
  takeGapNotice,
  type EventQueueState,
} from '../event-queue';
import type { DuplexStream } from '../transport';
import type { IrcMessage } from './parse';
import { foldIrcTarget, type IrcCasemapping } from './messages';

const MAX_BUFFER = 1 << 20; // 1 MiB of un-terminated bytes → the peer is misbehaving
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
  /**
   * FIFO queues of `sendMessage` calls awaiting the server's own-echo (`echo-message` cap), keyed by
   * folded target. Without this, `sendMessage`'s receipt carried a locally-fabricated id never sent
   * on the wire, so the account-runner's optimistic-echo reconcile settled on a DIFFERENT id than
   * the one the live echo event (its real `msgid`, or the same synthetic fallback
   * `messages.ts#synthProtocolId` derives) would carry — every sent message duplicated once the
   * echo arrived, since `chat-store`'s dedup is by exact `protocolId`. Resolving the receipt from
   * the matching echo instead makes both paths converge on one id.
   */
  readonly ownEchoWaiters = new Map<string, Array<(protocolId: string) => void>>();

  private buffer = '';
  private readonly queue: ChatEvent[] = [];
  private readonly waiters: Array<(r: IteratorResult<ChatEvent>) => void> = [];
  private ended = false;
  private readonly qstate: EventQueueState = newEventQueueState();

  /** Events dropped because the consumer stalled (memory bound). */
  get droppedEvents(): number {
    return this.qstate.dropped;
  }

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
        this.flushTimer = setTimeout(
          () => {
            this.flushTimer = null;
            this.pump();
          },
          this.floodBudgetUntil - FLOOD_BURST_MS - now,
        );
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
    if (waiter !== undefined) {
      waiter({ value: event, done: false });
      return;
    }
    this.queue.push(event);
    boundEventQueue(this.queue, this.qstate);
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
    const gap = takeGapNotice(this.qstate);
    if (gap !== null) return Promise.resolve({ value: gap, done: false });
    const item = this.queue.shift();
    if (item !== undefined) {
      rearmGapNotice(this.queue, this.qstate);
      return Promise.resolve({ value: item, done: false });
    }
    if (this.ended) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

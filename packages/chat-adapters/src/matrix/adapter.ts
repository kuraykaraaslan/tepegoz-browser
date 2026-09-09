import type {
  ChatAdapterCaps,
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
  MsgId,
  SendReceipt,
} from '../adapter';
import { MATRIX_CAPS } from '../caps';
import type { ChatFetchInit, ChatTransport } from '../transport';
import { matrixTimelineEvent, type MatrixContext, type MatrixRoomEvent } from './events';
import { parseSyncResponse } from './sync';

const CS = '/_matrix/client/v3';
const SYNC_TIMEOUT_MS = 30_000;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;
const HISTORY_LIMIT = 50;

/** Matrix caps minus E2EE, which is X-chat.7. */
export const MATRIX_ADAPTER_CAPS: ChatAdapterCaps = { ...MATRIX_CAPS, e2ee: false };

export class MatrixSession implements ChatSession {
  readonly caps = MATRIX_ADAPTER_CAPS;
  closed = false;
  accessToken = '';
  userId = '';
  nextBatch: string | null = null;
  private txn = 0;

  private readonly queue: ChatEvent[] = [];
  private readonly waiters: Array<(r: IteratorResult<ChatEvent>) => void> = [];
  private ended = false;

  constructor(
    readonly accountId: string,
    readonly homeserverUrl: string,
    readonly transport: ChatTransport,
  ) {}

  fetch(path: string, init: ChatFetchInit): ReturnType<ChatTransport['fetch']> {
    return this.transport.fetch(`${this.homeserverUrl}${path}`, init);
  }

  nextTxnId(): string {
    this.txn += 1;
    return `tepegoz-${String(Date.now())}-${String(this.txn)}`;
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

export class MatrixApiError extends Error {
  constructor(
    readonly status: number,
    readonly errcode: string,
    message: string,
  ) {
    super(message);
    this.name = 'MatrixApiError';
  }
}

export class MatrixAdapter implements ChatAdapter {
  readonly id = 'matrix';
  readonly capabilities = MATRIX_ADAPTER_CAPS;

  async connect(creds: ChatAccountCreds, transport: ChatTransport): Promise<ChatSession> {
    if (creds.server.protocol !== 'matrix') throw new Error('MatrixAdapter: not a matrix account');
    const base = creds.server.homeserverUrl.replace(/\/+$/, '');
    const session = new MatrixSession(creds.accountId, base, transport);

    await this.login(session, creds.server.userId, creds.secret);
    // Prime state with one immediate (non-blocking) sync, then run the long-poll loop.
    await this.syncOnce(session, false);
    void this.runSyncLoop(session, creds);
    return session;
  }

  private async request<T>(
    session: MatrixSession,
    method: NonNullable<ChatFetchInit['method']>,
    path: string,
    body?: unknown,
    timeoutMs = 15_000,
  ): Promise<T> {
    const init: ChatFetchInit = {
      method,
      headers: {
        'content-type': 'application/json',
        ...(session.accessToken.length > 0
          ? { authorization: `Bearer ${session.accessToken}` }
          : {}),
      },
      timeoutMs,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    const res = await session.fetch(path, init);
    const text = await res.text();
    const json: unknown = text.length > 0 ? safeParse(text) : {};
    if (res.status >= 400) {
      const e = json as { errcode?: unknown; error?: unknown };
      throw new MatrixApiError(
        res.status,
        typeof e.errcode === 'string' ? e.errcode : 'M_UNKNOWN',
        typeof e.error === 'string' ? e.error : `HTTP ${String(res.status)}`,
      );
    }
    return json as T;
  }

  private async login(session: MatrixSession, userId: string, secret: string): Promise<void> {
    // A login token is a long opaque single-token string; a password is what a person types.
    const looksLikeToken = !/\s/.test(secret) && secret.length > 40;
    const identifier = { type: 'm.id.user', user: userId };
    const body = looksLikeToken
      ? { type: 'm.login.token', token: secret }
      : { type: 'm.login.password', identifier, password: secret };
    const out = await this.request<{ access_token: string; user_id: string }>(
      session,
      'POST',
      `${CS}/login`,
      body,
    );
    session.accessToken = out.access_token;
    session.userId = out.user_id;
  }

  private ctx(session: MatrixSession): MatrixContext {
    return { accountId: session.accountId, selfUserId: session.userId };
  }

  private async syncOnce(session: MatrixSession, longPoll: boolean): Promise<void> {
    const params = new URLSearchParams();
    if (session.nextBatch !== null) params.set('since', session.nextBatch);
    params.set('timeout', longPoll ? String(SYNC_TIMEOUT_MS) : '0');
    const result = parseSyncResponse(
      await this.request<unknown>(
        session,
        'GET',
        `${CS}/sync?${params.toString()}`,
        undefined,
        longPoll ? SYNC_TIMEOUT_MS + 10_000 : 20_000,
      ),
      this.ctx(session),
    );
    session.nextBatch = result.nextBatch.length > 0 ? result.nextBatch : session.nextBatch;
    for (const event of result.events) session.push(event);
    for (const room of result.rooms) {
      session.push({
        type: 'room-membership',
        conversationId: room.roomId,
        address: session.userId,
        joined: true,
        memberCount: room.memberCount,
        self: true,
        affiliation: 'none',
        role: 'participant',
        realJid: null,
      });
    }
    for (const roomId of result.left) {
      session.push({
        type: 'room-membership',
        conversationId: roomId,
        address: session.userId,
        joined: false,
        memberCount: 0,
        self: true,
        affiliation: 'none',
        role: 'participant',
        realJid: null,
      });
    }
  }

  private async runSyncLoop(session: MatrixSession, creds: ChatAccountCreds): Promise<void> {
    let backoff = RETRY_BASE_MS;
    while (!session.closed) {
      try {
        await this.syncOnce(session, true);
        backoff = RETRY_BASE_MS;
      } catch (err) {
        if (session.closed) return;
        const e = err instanceof MatrixApiError ? err : null;
        if (e?.errcode === 'M_UNKNOWN_TOKEN') {
          try {
            const server = creds.server;
            if (server.protocol === 'matrix') {
              await this.login(session, server.userId, creds.secret);
              continue;
            }
          } catch {
            session.end();
            return;
          }
        }
        session.push({
          type: 'error',
          scope: 'account',
          message: e?.message ?? 'sync failed',
          conversationId: null,
        });
        await delay(backoff);
        backoff = Math.min(backoff * 2, RETRY_MAX_MS);
      }
    }
  }

  disconnect(session: ChatSession): Promise<void> {
    (session as MatrixSession).end();
    return Promise.resolve();
  }

  roster(): Promise<ChatContact[]> {
    return Promise.resolve([]);
  }

  async setPresence(
    session: ChatSession,
    presence: ChatPresence,
    statusText?: string,
  ): Promise<void> {
    const s = session as MatrixSession;
    const presenceMap: Record<ChatPresence, string> = {
      online: 'online',
      away: 'unavailable',
      xa: 'unavailable',
      dnd: 'unavailable',
      offline: 'offline',
    };
    await this.request(s, 'PUT', `${CS}/presence/${encodeURIComponent(s.userId)}/status`, {
      presence: presenceMap[presence],
      ...(statusText !== undefined ? { status_msg: statusText } : {}),
    });
  }

  listConversations(): Promise<ChatConversation[]> {
    return Promise.resolve([]);
  }

  async history(session: ChatSession, conv: ConvId, before: string | null): Promise<HistoryPage> {
    const s = session as MatrixSession;
    const params = new URLSearchParams({ dir: 'b', limit: String(HISTORY_LIMIT) });
    if (before !== null) params.set('from', before);
    const out = await this.request<{ chunk?: unknown[]; end?: string }>(
      s,
      'GET',
      `${CS}/rooms/${encodeURIComponent(conv)}/messages?${params.toString()}`,
    );
    const messages = (out.chunk ?? [])
      .map((raw) => matrixTimelineEvent(raw as MatrixRoomEvent, conv, this.ctx(s)))
      .filter((e): e is Extract<ChatEvent, { type: 'message' }> => e?.type === 'message')
      .map((e) => e.message)
      .sort((a, b) => a.originTs - b.originTs);
    return { messages, nextCursor: typeof out.end === 'string' ? out.end : null };
  }

  async sendMessage(
    session: ChatSession,
    conv: ConvId,
    body: OutgoingMessage,
  ): Promise<SendReceipt> {
    const s = session as MatrixSession;
    const txn = s.nextTxnId();
    const out = await this.request<{ event_id: string }>(
      s,
      'PUT',
      `${CS}/rooms/${encodeURIComponent(conv)}/send/m.room.message/${txn}`,
      {
        msgtype: 'm.text',
        body: body.body,
        ...(body.replyToId !== null
          ? { 'm.relates_to': { 'm.in_reply_to': { event_id: body.replyToId } } }
          : {}),
      },
    );
    return { protocolId: out.event_id, ts: Date.now() };
  }

  async editMessage(
    session: ChatSession,
    conv: ConvId,
    id: MsgId,
    body: OutgoingMessage,
  ): Promise<void> {
    const s = session as MatrixSession;
    await this.request(
      s,
      'PUT',
      `${CS}/rooms/${encodeURIComponent(conv)}/send/m.room.message/${s.nextTxnId()}`,
      {
        msgtype: 'm.text',
        body: `* ${body.body}`,
        'm.new_content': { msgtype: 'm.text', body: body.body },
        'm.relates_to': { rel_type: 'm.replace', event_id: id },
      },
    );
  }

  async react(
    session: ChatSession,
    conv: ConvId,
    id: MsgId,
    emoji: string,
    on: boolean,
  ): Promise<void> {
    if (!on) return; // reaction removal needs the reaction event id — a later slice
    const s = session as MatrixSession;
    await this.request(
      s,
      'PUT',
      `${CS}/rooms/${encodeURIComponent(conv)}/send/m.reaction/${s.nextTxnId()}`,
      { 'm.relates_to': { rel_type: 'm.annotation', event_id: id, key: emoji } },
    );
  }

  async markRead(session: ChatSession, conv: ConvId, upTo: MsgId): Promise<void> {
    const s = session as MatrixSession;
    await this.request(
      s,
      'POST',
      `${CS}/rooms/${encodeURIComponent(conv)}/receipt/m.read/${encodeURIComponent(upTo)}`,
      {},
    );
  }

  async joinRoom(session: ChatSession, address: string): Promise<ChatConversation> {
    const s = session as MatrixSession;
    const out = await this.request<{ room_id: string }>(
      s,
      'POST',
      `${CS}/join/${encodeURIComponent(address)}`,
      {},
    );
    const roomId = out.room_id;
    return {
      id: roomId,
      accountId: s.accountId,
      kind: 'room',
      address: roomId,
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
    };
  }

  async leaveRoom(session: ChatSession, conv: ConvId): Promise<void> {
    const s = session as MatrixSession;
    await this.request(s, 'POST', `${CS}/rooms/${encodeURIComponent(conv)}/leave`, {});
  }

  async *events(session: ChatSession): AsyncIterable<unknown> {
    const s = session as MatrixSession;
    for (;;) {
      const next = await s.nextEvent();
      if (next.done === true) return;
      yield next.value;
    }
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

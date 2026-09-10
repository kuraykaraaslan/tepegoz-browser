import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatServerConfig } from '@tepegoz/shared-types';
import type { ChatAccountCreds } from '../adapter';
import type { ChatFetchInit, ChatFetchResponse, ChatTransport } from '../transport';
import { MatrixAdapter, MatrixSession } from './adapter';

type Route = (init: ChatFetchInit, url: string) => { status?: number; body: unknown } | 'hang';

function bodyOf(c: { init: ChatFetchInit } | undefined): Record<string, unknown> {
  return c?.init.body !== undefined ? (JSON.parse(String(c.init.body)) as Record<string, unknown>) : {};
}

class FakeTransport implements ChatTransport {
  calls: Array<{ url: string; init: ChatFetchInit }> = [];
  routes: Array<{ test: RegExp; fn: Route }> = [];

  on(pattern: RegExp, fn: Route): this {
    this.routes.push({ test: pattern, fn });
    return this;
  }

  fetch(url: string, init: ChatFetchInit): Promise<ChatFetchResponse> {
    this.calls.push({ url, init });
    const route = this.routes.find((r) => r.test.test(url));
    const out = route?.fn(init, url) ?? { status: 404, body: { errcode: 'M_NOT_FOUND', error: 'no route' } };
    if (out === 'hang') return new Promise<ChatFetchResponse>(() => undefined);
    return Promise.resolve({
      status: out.status ?? 200,
      headers: {},
      text: () => Promise.resolve(JSON.stringify(out.body)),
      bytes: () => Promise.resolve(new TextEncoder().encode(JSON.stringify(out.body))),
    });
  }
  openTCP(): never {
    throw new Error('unused');
  }
  upgradeTLS(): never {
    throw new Error('unused');
  }
  openWebSocket(): never {
    throw new Error('unused');
  }
  openEventStream(): never {
    throw new Error('unused');
  }
}

const server: Extract<ChatServerConfig, { protocol: 'matrix' }> = {
  protocol: 'matrix',
  homeserverUrl: 'https://m.example/',
  userId: '@ada:m.example',
};
const creds = (secret = 'pw'): ChatAccountCreds => ({ accountId: 'acc', secret, server });

function baseTransport(): FakeTransport {
  return new FakeTransport()
    .on(/\/login$/, () => ({ body: { access_token: 'tok', user_id: '@ada:m.example' } }))
    .on(/\/sync\?/, (_init, url) => {
      // the priming sync (timeout=0) returns state; the long-poll never resolves in tests
      if (/timeout=0/.test(url)) {
        return {
          body: {
            next_batch: 's1',
            rooms: {
              join: {
                '!r:m.example': {
                  timeline: {
                    events: [
                      { type: 'm.room.message', sender: '@bob:m.example', event_id: '$1', origin_server_ts: 5, content: { msgtype: 'm.text', body: 'hi' } },
                    ],
                  },
                  state: { events: [] },
                },
              },
            },
          },
        };
      }
      return 'hang'; // the long-poll never resolves in tests
    });
}

afterEach(() => vi.restoreAllMocks());

describe('MatrixAdapter — connect', () => {
  it('logs in with a password, primes state, and surfaces the first message', async () => {
    const t = baseTransport();
    const adapter = new MatrixAdapter();
    const session = (await adapter.connect(creds(), t)) as MatrixSession;

    expect(session.accessToken).toBe('tok');
    expect(session.userId).toBe('@ada:m.example');
    expect(session.nextBatch).toBe('s1');

    const login = t.calls.find((c) => c.url.endsWith('/login'));
    expect(JSON.parse(String(login?.init.body))).toMatchObject({ type: 'm.login.password' });

    const it = adapter.events(session)[Symbol.asyncIterator]();
    // priming sync pushed: a message + a room-membership for the joined room
    expect((await it.next()).value).toMatchObject({ type: 'message', message: { body: 'hi' } });
    expect((await it.next()).value).toMatchObject({ type: 'room-membership', joined: true });
    await adapter.disconnect(session);
  });

  it('uses token login for a long opaque secret', async () => {
    const t = baseTransport();
    const adapter = new MatrixAdapter();
    const session = (await adapter.connect(creds('a'.repeat(64)), t)) as MatrixSession;
    const login = t.calls.find((c) => c.url.endsWith('/login'));
    expect(JSON.parse(String(login?.init.body))).toMatchObject({ type: 'm.login.token' });
    await adapter.disconnect(session);
  });

  it('does not surface a space as a conversation', async () => {
    const t = new FakeTransport()
      .on(/\/login$/, () => ({ body: { access_token: 'tok', user_id: '@ada:m.example' } }))
      .on(/\/sync\?/, (_init, url) => {
        if (!/timeout=0/.test(url)) return 'hang';
        return {
          body: {
            next_batch: 's1',
            rooms: {
              join: {
                '!space:m.example': {
                  timeline: {
                    events: [
                      { type: 'm.room.create', sender: '@ada:m.example', event_id: '$c', origin_server_ts: 1, content: { type: 'm.space' } },
                      { type: 'm.room.message', sender: '@ada:m.example', event_id: '$s', origin_server_ts: 2, content: { msgtype: 'm.text', body: 'space noise' } },
                    ],
                  },
                  state: { events: [] },
                },
                '!room:m.example': {
                  timeline: {
                    events: [
                      { type: 'm.room.message', sender: '@bob:m.example', event_id: '$1', origin_server_ts: 5, content: { msgtype: 'm.text', body: 'hi' } },
                    ],
                  },
                  state: { events: [] },
                },
              },
            },
          },
        };
      });
    const adapter = new MatrixAdapter();
    const session = (await adapter.connect(creds(), t)) as MatrixSession;
    const it = adapter.events(session)[Symbol.asyncIterator]();
    expect((await it.next()).value).toMatchObject({ type: 'message', message: { body: 'hi' } });
    expect((await it.next()).value).toMatchObject({ type: 'room-membership', conversationId: '!room:m.example' });
    await adapter.disconnect(session);
  });

  it('rejects a non-matrix account', async () => {
    await expect(
      new MatrixAdapter().connect(
        { accountId: 'a', secret: 'x', server: { protocol: 'irc', server: 's', port: 6697, tls: true, nick: 'n', sasl: false } },
        baseTransport(),
      ),
    ).rejects.toThrow(/not a matrix account/);
  });

  it('surfaces a 4xx as a thrown MatrixApiError during connect', async () => {
    const t = new FakeTransport().on(/\/login$/, () => ({ status: 403, body: { errcode: 'M_FORBIDDEN', error: 'bad password' } }));
    await expect(new MatrixAdapter().connect(creds(), t)).rejects.toThrow(/bad password/);
  });
});

describe('MatrixAdapter — actions', () => {
  async function connected() {
    const t = baseTransport()
      .on(/\/send\/m\.room\.message\//, () => ({ body: { event_id: '$sent' } }))
      .on(/\/send\/m\.reaction\//, () => ({ body: { event_id: '$react' } }))
      .on(/\/rooms\/[^/]+\/messages\?/, () => ({
        body: {
          end: 'p2',
          chunk: [
            { type: 'm.room.message', sender: '@bob:m.example', event_id: '$h2', origin_server_ts: 20, content: { msgtype: 'm.text', body: 'newer' } },
            { type: 'm.room.message', sender: '@bob:m.example', event_id: '$h1', origin_server_ts: 10, content: { msgtype: 'm.text', body: 'older' } },
          ],
        },
      }))
      .on(/\/join\//, () => ({ body: { room_id: '!joined:m.example' } }))
      .on(/\/(leave|receipt|presence)\b/, () => ({ body: {} }))
      .on(/\/rooms\/[^/]+\/leave$/, () => ({ body: {} }))
      .on(/\/rooms\/[^/]+\/invite$/, () => ({ body: {} }))
      .on(/\/state\/m\.room\.topic$/, () => ({ body: { event_id: '$topic' } }));
    const adapter = new MatrixAdapter();
    const session = (await adapter.connect(creds(), t)) as MatrixSession;
    return { adapter, session, t };
  }

  it('sendMessage PUTs an m.room.message and returns the event id', async () => {
    const { adapter, session, t } = await connected();
    const receipt = await adapter.sendMessage(session, '!r:m.example', {
      body: 'yo',
      replyToId: '$1',
      mediaPath: null,
    });
    expect(receipt.protocolId).toBe('$sent');
    const send = t.calls.find((c) => /\/send\/m\.room\.message\//.test(c.url));
    expect(JSON.parse(String(send?.init.body))).toMatchObject({
      body: 'yo',
      'm.relates_to': { 'm.in_reply_to': { event_id: '$1' } },
    });
    await adapter.disconnect(session);
  });

  it('editMessage / react build the right relations', async () => {
    const { adapter, session, t } = await connected();
    await adapter.editMessage(session, '!r:m.example', '$1', { body: 'fixed', replyToId: null, mediaPath: null });
    await adapter.react(session, '!r:m.example', '$1', '👍', true);
    expect(await adapter.react(session, '!r:m.example', '$1', '👍', false)).toBeUndefined(); // removal is a no-op

    const edit = t.calls.find((c) => bodyOf(c)['m.new_content'] !== undefined);
    expect(bodyOf(edit)['m.relates_to']).toEqual({ rel_type: 'm.replace', event_id: '$1' });
    await adapter.disconnect(session);
  });

  it('history GETs /messages backwards and sorts oldest-first', async () => {
    const { adapter, session } = await connected();
    const page = await adapter.history(session, '!r:m.example', null);
    expect(page.messages.map((m) => m.body)).toEqual(['older', 'newer']);
    expect(page.nextCursor).toBe('p2');
    await adapter.disconnect(session);
  });

  it('joinRoom resolves the room id; leave / markRead / setPresence hit their endpoints', async () => {
    const { adapter, session, t } = await connected();
    const conv = await adapter.joinRoom(session, '#room:m.example');
    expect(conv.id).toBe('!joined:m.example');
    await adapter.markRead(session, '!r:m.example', '$1');
    await adapter.setPresence(session, 'dnd', 'busy');
    await adapter.leaveRoom(session, '!r:m.example');
    expect(t.calls.some((c) => /\/receipt\/m\.read\//.test(c.url))).toBe(true);
    expect(t.calls.some((c) => /\/presence\//.test(c.url))).toBe(true);
    await adapter.disconnect(session);
  });

  it('setRoomTopic PUTs the m.room.topic state event', async () => {
    const { adapter, session, t } = await connected();
    await adapter.setRoomTopic(session, '!r:m.example', 'Release week');
    const call = t.calls.find((c) => /\/state\/m\.room\.topic$/.test(c.url));
    expect(call?.init.method).toBe('PUT');
    expect(JSON.parse(String(call?.init.body))).toEqual({ topic: 'Release week' });
    await adapter.disconnect(session);
  });

  it('inviteToRoom POSTs the user id to /invite', async () => {
    const { adapter, session, t } = await connected();
    await adapter.inviteToRoom?.(session, '!r:m.example', '@carol:m.example');
    const call = t.calls.find((c) => /\/rooms\/[^/]+\/invite$/.test(c.url));
    expect(call?.init.method).toBe('POST');
    expect(JSON.parse(String(call?.init.body))).toEqual({ user_id: '@carol:m.example' });
    await adapter.disconnect(session);
  });

  it('roster and listConversations are empty', async () => {
    const { adapter, session } = await connected();
    expect(await adapter.roster()).toEqual([]);
    expect(await adapter.listConversations()).toEqual([]);
    await adapter.disconnect(session);
  });

  it('resolveMedia turns an mxc ref into an authenticated download locator', async () => {
    const { adapter, session } = await connected();
    expect(adapter.resolveMedia(session, 'mxc://m.example/pic1')).toEqual({
      url: 'https://m.example/_matrix/client/v1/media/download/m.example/pic1',
      headers: { authorization: 'Bearer tok' },
    });
    expect(adapter.resolveMedia(session, 'http://evil/x')).toBeNull();
    await adapter.disconnect(session);
  });

  it('uploadMedia POSTs the bytes and returns the content_uri', async () => {
    const t = baseTransport().on(/\/media\/v3\/upload\?/, () => ({ body: { content_uri: 'mxc://m.example/newpic' } }));
    const adapter = new MatrixAdapter();
    const session = (await adapter.connect(creds(), t)) as MatrixSession;
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const ref = await adapter.uploadMedia(session, { bytes, mime: 'image/png', filename: 'p.png' });
    expect(ref).toBe('mxc://m.example/newpic');
    const call = t.calls.find((c) => /\/media\/v3\/upload\?/.test(c.url));
    expect(call?.url).toContain('filename=p.png');
    expect(call?.init.body).toBe(bytes);
    expect(call?.init.headers).toMatchObject({ 'content-type': 'image/png' });
    await adapter.disconnect(session);
  });

  it('uploadMedia throws a MatrixApiError when the server has no content_uri', async () => {
    const t = baseTransport().on(/\/media\/v3\/upload\?/, () => ({ status: 413, body: { errcode: 'M_TOO_LARGE', error: 'too big' } }));
    const adapter = new MatrixAdapter();
    const session = (await adapter.connect(creds(), t)) as MatrixSession;
    await expect(
      adapter.uploadMedia(session, { bytes: new Uint8Array([0]), mime: '', filename: 'x' }),
    ).rejects.toThrow(/too big/);
    await adapter.disconnect(session);
  });
});

type ChatEventLike = { type: string; message?: { body: string } };

describe('MatrixSession — /sync backpressure (X-chat.10 memory bound)', () => {
  const msg = (i: number) =>
    ({
      type: 'message' as const,
      message: {
        id: `id-${String(i)}`, conversationId: 'c', accountId: 'acc', protocolId: `p${String(i)}`,
        senderAddress: '@bob:x', senderName: 'Bob', kind: 'text' as const, body: String(i),
        mediaRef: null, replyToId: null, reactions: [], editedAt: null, redacted: false,
        originTs: i, receivedAt: i, deliveryState: 'delivered' as const,
      },
    });

  it('bounds the queue when the consumer never drains, dropping the oldest + one gap notice', async () => {
    const s = new MatrixSession('acc', 'https://x', {} as never);
    for (let i = 0; i < 4_096 + 500; i += 1) s.push(msg(i));
    // memory is bounded: the cap plus at most the single gap-notice event
    expect((s as unknown as { queue: unknown[] }).queue.length).toBeLessThanOrEqual(4_097);
    expect(s.droppedEvents).toBe(500);

    const drained: ChatEventLike[] = [];
    while ((s as unknown as { queue: unknown[] }).queue.length > 0) {
      const r = await s.nextEvent();
      if (r.done !== true) drained.push(r.value as ChatEventLike);
    }
    // the oldest survivors were dropped: no message body "0".."499" remains
    const bodies = drained
      .filter((e) => e.type === 'message' && e.message !== undefined)
      .map((e) => Number(e.message?.body));
    expect(Math.min(...bodies)).toBeGreaterThanOrEqual(500);
    // exactly one overflow notice
    expect(drained.filter((e) => e.type === 'error').length).toBe(1);
  });

  it('a waiting consumer is handed the event directly — no queue growth', async () => {
    const s = new MatrixSession('acc', 'https://x', {} as never);
    const p = s.nextEvent();
    s.push(msg(1));
    const r = await p;
    expect(r.done).toBe(false);
    expect((s as unknown as { queue: unknown[] }).queue.length).toBe(0);
    expect(s.droppedEvents).toBe(0);
  });

  it('re-arms the one-shot gap notice after the queue drains', async () => {
    const s = new MatrixSession('acc', 'https://x', {} as never);
    for (let i = 0; i < 4_096 + 10; i += 1) s.push(msg(i));
    expect((s as unknown as { gapNoticed: boolean }).gapNoticed).toBe(true);
    while ((s as unknown as { queue: unknown[] }).queue.length > 0) await s.nextEvent();
    expect((s as unknown as { gapNoticed: boolean }).gapNoticed).toBe(false);
    for (let i = 0; i < 4_096 + 10; i += 1) s.push(msg(i));
    expect((s as unknown as { gapNoticed: boolean }).gapNoticed).toBe(true);
  });
});

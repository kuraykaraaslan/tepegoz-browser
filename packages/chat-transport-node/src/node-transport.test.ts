import { describe, it, expect, vi } from 'vitest';
import { NodeChatTransport, type RawDuplex, consumeSse } from './node-transport';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const dec = new TextDecoder();

class FakeRaw implements RawDuplex {
  written: Uint8Array[] = [];
  destroyed = false;
  private dataCb: ((c: Uint8Array) => void) | null = null;
  private closeCb: ((e?: Error) => void) | null = null;
  write(d: Uint8Array): void {
    this.written.push(d);
  }
  onData(cb: (c: Uint8Array) => void): void {
    this.dataCb = cb;
  }
  onClose(cb: (e?: Error) => void): void {
    this.closeCb = cb;
  }
  destroy(): void {
    this.destroyed = true;
  }
  emit(text: string): void {
    this.dataCb?.(new TextEncoder().encode(text));
  }
  end(err?: Error): void {
    this.closeCb?.(err);
  }
  lastText(): string {
    return dec.decode(this.written.at(-1));
  }
}

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe('NodeChatTransport — openTCP', () => {
  it('non-TLS: wraps the dialed socket; write encodes strings; data + close propagate', async () => {
    const raw = new FakeRaw();
    const t = new NodeChatTransport({ dial: () => Promise.resolve(raw) });
    const s = await t.openTCP({ host: 'x.com', port: 5222, tls: false });

    s.write('<stream/>');
    expect(raw.lastText()).toBe('<stream/>');
    s.write(new Uint8Array([1, 2]));
    expect([...(raw.written.at(-1) ?? [])]).toEqual([1, 2]);

    const got: string[] = [];
    s.onData((c) => got.push(dec.decode(c)));
    raw.emit('hi');
    expect(got).toEqual(['hi']);

    const closed = vi.fn();
    s.onClose(closed);
    raw.end();
    expect(closed).toHaveBeenCalledTimes(1);

    s.close();
    expect(raw.destroyed).toBe(true);
  });

  it('TLS: layers secure() over the dial, honouring serverName then host', async () => {
    const raw = new FakeRaw();
    const secured = new FakeRaw();
    const secure = vi.fn(() => Promise.resolve(secured));
    const t = new NodeChatTransport({ dial: () => Promise.resolve(raw), secure });

    await t.openTCP({ host: '1.2.3.4', port: 5223, tls: true, serverName: 'x.com' });
    expect(secure).toHaveBeenCalledWith(raw, { servername: 'x.com' });

    await t.openTCP({ host: 'x.com', port: 5223, tls: true });
    expect(secure).toHaveBeenLastCalledWith(raw, { servername: 'x.com' });
  });
});

describe('NodeChatTransport — upgradeTLS', () => {
  it('secures a stream this transport created', async () => {
    const raw = new FakeRaw();
    const secured = new FakeRaw();
    const secure = vi.fn(() => Promise.resolve(secured));
    const t = new NodeChatTransport({ dial: () => Promise.resolve(raw), secure });
    const plain = await t.openTCP({ host: 'x.com', port: 5222, tls: false });

    const s = await t.upgradeTLS(plain, { host: 'x.com' });
    expect(secure).toHaveBeenCalledWith(raw, { servername: 'x.com' });
    s.write('a');
    expect(secured.lastText()).toBe('a');
  });

  it('rejects a stream it did not create', async () => {
    const t = new NodeChatTransport({ dial: () => Promise.resolve(new FakeRaw()) });
    const foreign = { write: () => undefined, onData: () => undefined, onClose: () => undefined, close: () => undefined };
    await expect(t.upgradeTLS(foreign, { host: 'x' })).rejects.toThrow(/not created by this transport/);
  });
});

describe('NodeChatTransport — openWebSocket', () => {
  it('wraps the injected websocket', async () => {
    const raw = new FakeRaw();
    const openWebSocket = vi.fn(() => Promise.resolve(raw));
    const t = new NodeChatTransport({ openWebSocket });
    const s = await t.openWebSocket('wss://x.com/ws', ['xmpp']);
    expect(openWebSocket).toHaveBeenCalledWith('wss://x.com/ws', ['xmpp']);
    s.write('ping');
    expect(raw.lastText()).toBe('ping');
  });
});

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

describe('NodeChatTransport — fetch', () => {
  it('maps method/headers/body and flattens response headers', async () => {
    const fetchMock = vi.fn<FetchFn>().mockResolvedValue(
      new Response('body-text', { status: 201, headers: { 'content-type': 'text/plain' } }),
    );
    const t = new NodeChatTransport({ fetch: fetchMock as unknown as typeof fetch });
    const res = await t.fetch('https://x.com/a', { method: 'POST', headers: { A: '1' }, body: 'q' });
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toBe('text/plain');
    expect(await res.text()).toBe('body-text');
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('q');
  });

  it('aborts on timeout', async () => {
    const fetchMock = vi.fn<FetchFn>((_url, opts) =>
      new Promise<Response>((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    );
    const t = new NodeChatTransport({ fetch: fetchMock as unknown as typeof fetch });
    await expect(t.fetch('https://x.com', { timeoutMs: 5 })).rejects.toThrow(/aborted/);
  });
});

describe('consumeSse', () => {
  it('emits the data payload of each complete event, joining multi-line data', async () => {
    const events: string[] = [];
    const es = consumeSse(sseStream(['data: one\n\n', 'data: a\ndata: b\n\nignored: x\n\n']));
    es.onEvent((d) => events.push(d));
    await tick();
    await tick();
    expect(events).toEqual(['one', 'a\nb']);
  });

  it('close() cancels the reader and stops emitting', () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const es = consumeSse(stream);
    es.close();
    expect(cancelled).toBe(true);
  });

  it('surfaces a stream error through onError (subscribed before)', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(new Error('stream broke'));
      },
    });
    const es = consumeSse(stream);
    const seen: Error[] = [];
    es.onError((e) => seen.push(e));
    await tick();
    await tick();
    expect(seen[0]?.message).toBe('stream broke');
  });

  it('buffers a pre-subscription error and flushes it on onError', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(new Error('early break'));
      },
    });
    const es = consumeSse(stream);
    await tick();
    await tick();
    const seen: Error[] = [];
    es.onError((e) => seen.push(e));
    expect(seen[0]?.message).toBe('early break');
  });
});

describe('openEventStream', () => {
  it('fetches with the SSE Accept header and parses the body', async () => {
    const fetchMock = vi
      .fn<FetchFn>()
      .mockResolvedValue(new Response(sseStream(['data: hello\n\n']), { status: 200 }));
    const t = new NodeChatTransport({ fetch: fetchMock as unknown as typeof fetch });
    const es = await t.openEventStream('https://x.com/events');
    const got: string[] = [];
    es.onEvent((d) => got.push(d));
    await tick();
    await tick();
    expect(got).toEqual(['hello']);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Accept).toBe('text/event-stream');
  });

  it('throws when the response has no body', async () => {
    const fetchMock = vi.fn<FetchFn>().mockResolvedValue(new Response(null, { status: 204 }));
    const t = new NodeChatTransport({ fetch: fetchMock as unknown as typeof fetch });
    await expect(t.openEventStream('https://x.com')).rejects.toThrow(/no body/);
  });
});

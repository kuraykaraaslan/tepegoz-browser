import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type {
  ChatFetchInit,
  ChatFetchResponse,
  ChatTransport,
  DuplexStream,
  EventStream,
  OpenTcpOptions,
} from '@tepegoz/chat-adapters';

/**
 * `ChatTransport` over Node's `net` / `tls` and the global `WebSocket` / `fetch`. Electron-free.
 *
 * Every IO primitive is behind `NodeTransportPorts` so the desktop can inject an **egress-bound**
 * dialer (route the raw TCP through the active profile's SOCKS endpoint — Phase 5 kill switch) and so
 * the adaptation logic is unit-testable against fakes. The defaults are the plain Node primitives.
 */

/** The minimal duplex surface a Node socket / TLS socket / WebSocket-shim all satisfy. A raw dial
 *  result carries `nodeSocket` when it wraps an actual `net.Socket`, so TLS can be layered on it. */
export interface RawDuplex {
  write(data: Uint8Array): void;
  onData(cb: (chunk: Uint8Array) => void): void;
  onClose(cb: (err?: Error) => void): void;
  destroy(): void;
  /** The underlying `net.Socket`, when this wraps one (so `secure()` can `tls.connect({ socket })`). */
  readonly nodeSocket?: Socket;
}

export interface NodeTransportPorts {
  /** Open a raw TCP connection (the desktop binds this to the profile's egress). */
  dial(opts: { host: string; port: number }): Promise<RawDuplex>;
  /** Upgrade a raw connection to TLS with SNI/verification for `servername`. */
  secure(raw: RawDuplex, opts: { servername: string }): Promise<RawDuplex>;
  /** Open a WebSocket connection. */
  openWebSocket(url: string, protocols: string[]): Promise<RawDuplex>;
  fetch: typeof fetch;
}

const rawOf = new WeakMap<DuplexStream, RawDuplex>();

function toDuplexStream(raw: RawDuplex): DuplexStream {
  const encoder = new TextEncoder();
  const stream: DuplexStream = {
    write: (data) => raw.write(typeof data === 'string' ? encoder.encode(data) : data),
    onData: (cb) => raw.onData(cb),
    onClose: (cb) => raw.onClose(cb),
    close: () => raw.destroy(),
  };
  rawOf.set(stream, raw);
  return stream;
}

export class NodeChatTransport implements ChatTransport {
  private readonly ports: NodeTransportPorts;

  constructor(ports?: Partial<NodeTransportPorts>) {
    this.ports = {
      dial: ports?.dial ?? defaultDial,
      secure: ports?.secure ?? defaultSecure,
      openWebSocket: ports?.openWebSocket ?? defaultOpenWebSocket,
      fetch: ports?.fetch ?? globalThis.fetch.bind(globalThis),
    };
  }

  async openTCP(opts: OpenTcpOptions): Promise<DuplexStream> {
    const raw = await this.ports.dial({ host: opts.host, port: opts.port });
    if (!opts.tls) return toDuplexStream(raw);
    const secured = await this.ports.secure(raw, { servername: opts.serverName ?? opts.host });
    return toDuplexStream(secured);
  }

  async upgradeTLS(stream: DuplexStream, opts: { host: string }): Promise<DuplexStream> {
    const raw = rawOf.get(stream);
    if (raw === undefined) throw new Error('upgradeTLS: stream was not created by this transport');
    const secured = await this.ports.secure(raw, { servername: opts.host });
    return toDuplexStream(secured);
  }

  async openWebSocket(url: string, protocols: string[] = []): Promise<DuplexStream> {
    return toDuplexStream(await this.ports.openWebSocket(url, protocols));
  }

  async fetch(url: string, init?: ChatFetchInit): Promise<ChatFetchResponse> {
    const controller = new AbortController();
    const timer =
      init?.timeoutMs !== undefined ? setTimeout(() => controller.abort(), init.timeoutMs) : undefined;
    try {
      const res = await this.ports.fetch(url, {
        method: init?.method ?? 'GET',
        signal: controller.signal,
        ...(init?.headers !== undefined ? { headers: init.headers } : {}),
        ...(init?.body !== undefined ? { body: init.body } : {}),
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return { status: res.status, headers, text: () => res.text() };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async openEventStream(url: string, init?: ChatFetchInit): Promise<EventStream> {
    const res = await this.ports.fetch(url, {
      method: init?.method ?? 'GET',
      headers: { Accept: 'text/event-stream', ...init?.headers },
      ...(init?.body !== undefined ? { body: init.body } : {}),
    });
    if (res.body === null) throw new Error('openEventStream: response had no body');
    return consumeSse(res.body);
  }
}

/** Parse an SSE body into an `EventStream`, emitting the `data:` payload of each complete event. */
export function consumeSse(body: ReadableStream<Uint8Array>): EventStream {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let closed = false;

  // Events / errors that arrive before the caller subscribes are queued and flushed on subscribe,
  // so a synchronously-available stream (a test fixture, a buffered response) is not lost to a race.
  const pendingEvents: string[] = [];
  const pendingErrors: Error[] = [];
  let onEventCb: ((data: string) => void) | null = null;
  let onErrorCb: ((err: Error) => void) | null = null;
  const onEvent = (data: string): void => {
    if (onEventCb !== null) onEventCb(data);
    else pendingEvents.push(data);
  };
  const onError = (err: Error): void => {
    if (onErrorCb !== null) onErrorCb(err);
    else pendingErrors.push(err);
  };

  const pump = async (): Promise<void> => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || closed) return;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).replace(/^ /, ''))
          .join('\n');
        if (data.length > 0) onEvent(data);
        sep = buffer.indexOf('\n\n');
      }
    }
  };
  void pump().catch((err: unknown) => {
    if (!closed) onError(err instanceof Error ? err : new Error(String(err)));
  });

  return {
    onEvent: (cb) => {
      onEventCb = cb;
      for (const d of pendingEvents.splice(0)) cb(d);
    },
    onError: (cb) => {
      onErrorCb = cb;
      for (const e of pendingErrors.splice(0)) cb(e);
    },
    close: () => {
      closed = true;
      void reader.cancel();
    },
  };
}

// ── Node primitive defaults ─────────────────────────────────────────────────
//
// Thin adapters over `net.connect` / `tls.connect` / the global `WebSocket`. Exercised by the
// Playwright `_electron` e2e against a real Prosody/ejabberd in X-chat.10, not by unit tests (a unit
// test would need a TLS cert and a WebSocket server, neither a Node builtin).
/* v8 ignore start */

interface NodeSocketLike {
  write(b: Uint8Array): void;
  on(e: string, cb: (...a: never[]) => void): void;
  once(e: string, cb: (...a: never[]) => void): void;
  destroy(): void;
}

function wrapNodeSocket(socket: NodeSocketLike, nodeSocket?: Socket): RawDuplex {
  let closeCb: (err?: Error) => void = () => undefined;
  let fired = false;
  const fireClose = (err?: Error): void => {
    if (fired) return;
    fired = true;
    closeCb(err);
  };
  socket.on('error', ((err: Error) => fireClose(err)));
  socket.on('close', (() => fireClose()));
  socket.on('end', (() => fireClose()));
  return {
    write: (data) => socket.write(data),
    onData: (cb) => socket.on('data', ((chunk: Buffer) => cb(new Uint8Array(chunk)))),
    onClose: (cb) => {
      closeCb = cb;
    },
    destroy: () => socket.destroy(),
    ...(nodeSocket !== undefined ? { nodeSocket } : {}),
  };
}

function defaultDial(opts: { host: string; port: number }): Promise<RawDuplex> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: opts.host, port: opts.port });
    socket.once('connect', () => resolve(wrapNodeSocket(socket, socket)));
    socket.once('error', reject);
  });
}

function defaultSecure(raw: RawDuplex, opts: { servername: string }): Promise<RawDuplex> {
  return new Promise((resolve, reject) => {
    const tls = tlsConnect({ socket: raw.nodeSocket, servername: opts.servername });
    tls.once('secureConnect', () => resolve(wrapNodeSocket(tls)));
    tls.once('error', reject);
  });
}

function defaultOpenWebSocket(url: string, protocols: string[]): Promise<RawDuplex> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, protocols);
    ws.binaryType = 'arraybuffer';
    let closeCb: (err?: Error) => void = () => undefined;
    ws.addEventListener('open', () =>
      resolve({
        write: (data) => ws.send(data),
        onData: (cb) =>
          ws.addEventListener('message', (ev) => {
            const d: unknown = (ev as MessageEvent).data;
            if (typeof d === 'string') cb(new TextEncoder().encode(d));
            else if (d instanceof ArrayBuffer) cb(new Uint8Array(d));
          }),
        onClose: (cb) => {
          closeCb = cb;
        },
        destroy: () => ws.close(),
      }),
    );
    ws.addEventListener('error', () => {
      reject(new Error('websocket error'));
      closeCb(new Error('websocket error'));
    });
    ws.addEventListener('close', () => closeCb());
  });
}
/* v8 ignore stop */

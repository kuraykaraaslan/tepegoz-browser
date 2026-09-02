import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `probeSocksPort` + `ByoSocksProvider` — the loopback SOCKS5 liveness seam for network-privacy
 * connections. `probeSocksPort` is a connect-and-close TCP check (not a SOCKS handshake). Pinned: it
 * rejects a non-SOCKS port before touching the socket, resolves true on `connect`, false on `error`
 * and false on timeout, and always destroys the socket exactly once. `ByoSocksProvider` validates its
 * port in the constructor, `connect()` probes-then-reports (throwing when nothing answers),
 * `disconnect()` is a no-op, and `probe()` delegates.
 */

type FakeSocket = {
  handlers: Record<string, () => void>;
  once: (ev: string, cb: () => void) => void;
  destroy: ReturnType<typeof vi.fn>;
  fire: (ev: string) => void;
};
const sockets = vi.hoisted((): { made: FakeSocket[] } => ({ made: [] }));
const connect = vi.hoisted(() =>
  vi.fn((): FakeSocket => {
    const handlers: Record<string, () => void> = {};
    const s: FakeSocket = {
      handlers,
      once: (ev, cb) => {
        handlers[ev] = cb;
      },
      destroy: vi.fn(),
      fire: (ev) => handlers[ev]?.(),
    };
    sockets.made.push(s);
    return s;
  }),
);
vi.mock('node:net', () => ({ connect }));

const isValidSocksPort = vi.hoisted(() => vi.fn((p: number) => p >= 1024 && p <= 65535));
vi.mock('@tepegoz/security-policy', () => ({ isValidSocksPort }));

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const { probeSocksPort, ByoSocksProvider } = await import('./connection-provider.electron');

const lastSocket = () => sockets.made.at(-1)!;

beforeEach(() => {
  vi.clearAllMocks();
  sockets.made.length = 0;
  isValidSocksPort.mockImplementation((p: number) => p >= 1024 && p <= 65535);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('probeSocksPort', () => {
  it('rejects a non-SOCKS port without opening a socket', async () => {
    isValidSocksPort.mockReturnValue(false);
    expect(await probeSocksPort(80)).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('resolves true on connect and destroys the socket once', async () => {
    const p = probeSocksPort(1080);
    lastSocket().fire('connect');
    expect(await p).toBe(true);
    expect(connect).toHaveBeenCalledWith({ port: 1080, host: '127.0.0.1' });
    expect(lastSocket().destroy).toHaveBeenCalledTimes(1);
  });

  it('resolves false on a socket error', async () => {
    const p = probeSocksPort(1080);
    lastSocket().fire('error');
    expect(await p).toBe(false);
  });

  it('resolves false once the probe times out', async () => {
    vi.useFakeTimers();
    const p = probeSocksPort(1080, 500);
    vi.advanceTimersByTime(500);
    expect(await p).toBe(false);
    expect(lastSocket().destroy).toHaveBeenCalledTimes(1);
  });

  it('settles only once — a later error after connect is ignored', async () => {
    const p = probeSocksPort(1080);
    const s = lastSocket();
    s.fire('connect');
    s.fire('error');
    expect(await p).toBe(true);
    expect(s.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('ByoSocksProvider', () => {
  it('throws for an unusable SOCKS port at construction', () => {
    isValidSocksPort.mockReturnValue(false);
    expect(() => new ByoSocksProvider(42)).toThrow(/Not a usable SOCKS port/);
  });

  it('exposes the byo-socks kind', () => {
    expect(new ByoSocksProvider(9050).kind).toBe('byo-socks');
  });

  it('connect() reports the port when the endpoint answers', async () => {
    const provider = new ByoSocksProvider(9050);
    const done = provider.connect();
    lastSocket().fire('connect');
    expect(await done).toEqual({ socksPort: 9050 });
    expect(logger.info).toHaveBeenCalledWith('BYO SOCKS connection is answering', {
      socksPort: 9050,
    });
  });

  it('connect() throws when nothing is listening', async () => {
    const provider = new ByoSocksProvider(9050);
    const done = provider.connect();
    lastSocket().fire('error');
    await expect(done).rejects.toThrow(/Nothing is listening on 127\.0\.0\.1:9050/);
  });

  it('disconnect() is a no-op', async () => {
    await expect(new ByoSocksProvider(9050).disconnect()).resolves.toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
  });

  it('probe() delegates to probeSocksPort', async () => {
    const provider = new ByoSocksProvider(9050);
    const p = provider.probe();
    lastSocket().fire('connect');
    expect(await p).toBe(true);
  });
});

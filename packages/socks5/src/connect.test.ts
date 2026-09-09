import { describe, it, expect, vi } from 'vitest';
import { socks5Connect, type Socks5Socket } from './connect';

const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);
const OK_REPLY = bytes(0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0);

class FakeSocket implements Socks5Socket {
  written: number[][] = [];
  destroyed = false;
  private dataCb: ((c: Uint8Array) => void) | null = null;
  private closeCb: ((e?: Error) => void) | null = null;
  write(d: Uint8Array): void {
    this.written.push([...d]);
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
  server(...n: number[]): void {
    this.dataCb?.(bytes(...n));
  }
  drop(err?: Error): void {
    this.closeCb?.(err);
  }
}

describe('socks5Connect', () => {
  it('completes the handshake and leaves the socket open', async () => {
    const sock = new FakeSocket();
    const p = socks5Connect(sock, { host: 'xmpp.example', port: 5222 });
    expect(sock.written[0]).toEqual([0x05, 0x01, 0x00]); // greeting sent
    sock.server(0x05, 0x00); // no-auth accepted
    expect(sock.written[1]?.slice(0, 4)).toEqual([0x05, 0x01, 0x00, 0x03]); // CONNECT sent
    sock.server(...OK_REPLY);
    await expect(p).resolves.toBeUndefined();
    expect(sock.destroyed).toBe(false);
  });

  it('rejects and destroys the socket on a failure reply', async () => {
    const sock = new FakeSocket();
    const p = socks5Connect(sock, { host: 'x', port: 1 });
    sock.server(0x05, 0x00);
    sock.server(0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0); // refused
    await expect(p).rejects.toThrow(/connection refused/);
    expect(sock.destroyed).toBe(true);
  });

  it('rejects when the proxy closes mid-handshake', async () => {
    const sock = new FakeSocket();
    const p = socks5Connect(sock, { host: 'x', port: 1 });
    sock.drop();
    await expect(p).rejects.toThrow(/closed the connection/);
  });

  it('ignores post-handshake bytes (they belong to the tunneled protocol)', async () => {
    const sock = new FakeSocket();
    const p = socks5Connect(sock, { host: 'x', port: 1 });
    sock.server(0x05, 0x00);
    sock.server(...OK_REPLY);
    await p;
    sock.server(0xde, 0xad); // tunneled data — must not error or re-write
    expect(sock.written).toHaveLength(2);
    sock.drop(new Error('later close')); // must not throw
  });

  it('times out via the injected timer', async () => {
    const sock = new FakeSocket();
    const captured: Array<() => void> = [];
    const p = socks5Connect(
      sock,
      { host: 'x', port: 1 },
      {
        timeoutMs: 100,
        setTimer: (fn) => {
          captured.push(fn);
          return 't';
        },
        clearTimer: vi.fn(),
      },
    );
    captured[0]?.();
    await expect(p).rejects.toThrow(/timed out/);
    expect(sock.destroyed).toBe(true);
  });

  it('uses real timers when none are injected', async () => {
    const sock = new FakeSocket();
    const p = socks5Connect(sock, { host: 'x', port: 1 }, { timeoutMs: 10_000 });
    sock.server(0x05, 0x00);
    sock.server(...OK_REPLY);
    await expect(p).resolves.toBeUndefined();
  });

  it('clears the timer on success', async () => {
    const sock = new FakeSocket();
    const clearTimer = vi.fn();
    const p = socks5Connect(
      sock,
      { host: 'x', port: 1 },
      { timeoutMs: 100, setTimer: () => 't', clearTimer },
    );
    sock.server(0x05, 0x00);
    sock.server(...OK_REPLY);
    await p;
    expect(clearTimer).toHaveBeenCalledWith('t');
  });
});

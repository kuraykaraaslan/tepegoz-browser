import { describe, it, expect, vi } from 'vitest';
import type { EgressRoute } from '@tepegoz/http';
import type { RawDuplex } from '@tepegoz/chat-transport-node';
import { createChatDialer } from './egress-dialer';

const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);
const OK_SOCKS_REPLY = bytes(0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0);

class FakeSocket implements RawDuplex {
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
}

function dialerWith(route: EgressRoute) {
  const sockets: Array<{ host: string; port: number; socket: FakeSocket }> = [];
  const connectTcp = vi.fn((host: string, port: number) => {
    const socket = new FakeSocket();
    sockets.push({ host, port, socket });
    return Promise.resolve<RawDuplex>(socket);
  });
  const dial = createChatDialer({ route: () => route, connectTcp, socksTimeoutMs: 1000 });
  return { dial, connectTcp, sockets };
}

describe('createChatDialer', () => {
  it('direct route: connects straight to the target', async () => {
    const { dial, connectTcp } = dialerWith({ mode: 'direct' });
    await dial({ host: 'xmpp.example', port: 5222 });
    expect(connectTcp).toHaveBeenCalledWith('xmpp.example', 5222);
  });

  it('tunnel route: connects to the loopback SOCKS port and CONNECTs through it', async () => {
    const { dial, connectTcp, sockets } = dialerWith({ mode: 'tunnel', socksPort: 41080 });
    const p = dial({ host: 'xmpp.example', port: 5222 });
    await Promise.resolve();
    await Promise.resolve();
    // dialer connected to the proxy, not the target
    expect(connectTcp).toHaveBeenCalledWith('127.0.0.1', 41080);
    const proxy = sockets[0]?.socket;
    expect(proxy?.written[0]).toEqual([0x05, 0x01, 0x00]); // SOCKS greeting

    proxy?.server(0x05, 0x00); // no-auth
    expect(proxy?.written[1]?.slice(0, 4)).toEqual([0x05, 0x01, 0x00, 0x03]); // domain CONNECT
    proxy?.server(...OK_SOCKS_REPLY);

    const result = await p;
    expect(result).toBe(proxy);
    expect(proxy?.destroyed).toBe(false);
  });

  it('tunnel route with port 0: refuses (fail-closed, 503), never connects', async () => {
    const { dial, connectTcp } = dialerWith({ mode: 'tunnel', socksPort: 0 });
    const err = await dial({ host: 'x', port: 1 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ statusCode: 503 });
    expect((err as Error).message).toContain('not up');
    expect(connectTcp).not.toHaveBeenCalled();
  });

  it('tunnel route: a failing SOCKS handshake destroys the proxy socket and surfaces a 503', async () => {
    const { dial, sockets } = dialerWith({ mode: 'tunnel', socksPort: 41080 });
    const p = dial({ host: 'x', port: 1 });
    await Promise.resolve();
    await Promise.resolve();
    const proxy = sockets[0]?.socket;
    proxy?.server(0x05, 0x00);
    proxy?.server(0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0); // SOCKS: connection refused
    await expect(p).rejects.toMatchObject({ statusCode: 503 });
    expect(proxy?.destroyed).toBe(true);
  });

  it('falls back to the installed egress policy and the node dialer when deps are omitted', async () => {
    // No `route` → currentEgressRoute() (no policy installed → direct).
    const connectTcp = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const dial = createChatDialer({ connectTcp });
    await expect(dial({ host: '127.0.0.1', port: 1 })).rejects.toThrow(/ECONNREFUSED/);
    expect(connectTcp).toHaveBeenCalledWith('127.0.0.1', 1);

    // No `connectTcp` / `socksTimeoutMs` → real node:net (refused on port 1) + default timeout.
    const realDial = createChatDialer({ route: () => ({ mode: 'direct' }) });
    await expect(realDial({ host: '127.0.0.1', port: 1 })).rejects.toBeDefined();
  });
});

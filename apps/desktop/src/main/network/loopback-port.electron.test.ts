import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `loopback-port.electron` — the free-port + listener-wait helpers shared by the userspace tunnel
 * providers. Pinned: `reserveLoopbackPort` asks the OS for an ephemeral 127.0.0.1 port and hands the
 * number back after closing the probe socket (rejecting on a listen error); `waitForSocksPort` polls
 * `probeSocksPort`, returns as soon as it answers, aborts immediately when `hasDied()` is true, and
 * throws a specific timeout message once the deadline passes.
 */

const createServer = vi.hoisted(() => vi.fn());
vi.mock('node:net', () => ({ createServer }));
const probeSocksPort = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock('./connection-provider.electron', () => ({ probeSocksPort }));

const { reserveLoopbackPort, waitForSocksPort } = await import('./loopback-port.electron');

beforeEach(() => {
  vi.clearAllMocks();
  probeSocksPort.mockResolvedValue(true);
});

describe('reserveLoopbackPort', () => {
  it('binds an ephemeral 127.0.0.1 port and returns it after closing', async () => {
    const server = {
      once: vi.fn(),
      listen: vi.fn((_port: number, _host: string, cb: () => void) => cb()),
      address: vi.fn(() => ({ port: 40555 })),
      close: vi.fn((cb: () => void) => cb()),
    };
    createServer.mockReturnValue(server);
    expect(await reserveLoopbackPort()).toBe(40555);
    expect(server.listen).toHaveBeenCalledWith(0, '127.0.0.1', expect.any(Function));
    expect(server.close).toHaveBeenCalled();
  });

  it('rejects when the listen fails', async () => {
    let errCb: ((e: Error) => void) | undefined;
    const server = {
      once: vi.fn((ev: string, cb: (e: Error) => void) => {
        if (ev === 'error') errCb = cb;
      }),
      listen: vi.fn(),
      address: vi.fn(),
      close: vi.fn(),
    };
    createServer.mockReturnValue(server);
    const p = reserveLoopbackPort();
    errCb?.(new Error('EADDRINUSE'));
    await expect(p).rejects.toThrow('EADDRINUSE');
  });
});

describe('waitForSocksPort', () => {
  it('returns as soon as the port answers', async () => {
    probeSocksPort.mockResolvedValue(true);
    await expect(waitForSocksPort(40000, 10_000, () => false)).resolves.toBeUndefined();
    expect(probeSocksPort).toHaveBeenCalledWith(40000, 500);
  });

  it('aborts immediately when the process has already died', async () => {
    await expect(waitForSocksPort(40000, 10_000, () => true)).rejects.toThrow(
      /exited before its listener/,
    );
    expect(probeSocksPort).not.toHaveBeenCalled();
  });

  it('throws a specific timeout message once the deadline passes', async () => {
    probeSocksPort.mockResolvedValue(false);
    await expect(waitForSocksPort(40000, 0, () => false)).rejects.toThrow(
      /no listener on 127\.0\.0\.1:40000 after 0ms/,
    );
  });

  describe('with fake timers', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('keeps polling until the listener comes up', async () => {
      probeSocksPort.mockResolvedValueOnce(false).mockResolvedValue(true);
      const p = waitForSocksPort(40000, 10_000, () => false);
      await vi.advanceTimersByTimeAsync(250);
      await expect(p).resolves.toBeUndefined();
      expect(probeSocksPort).toHaveBeenCalledTimes(2);
    });
  });
});

import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `TorProvider` — one `tor` process per connection with its own DataDirectory. Pinned: `connect`
 * resolves + verifies any upstream BEFORE Tor starts, reserves a loopback SOCKS port, writes a torrc
 * 0o600 (with `Socks5Proxy` only when chained), spawns `tor -f`, waits for the port and reports whether
 * it chained; a failed wait tears down and throws with the tail of Tor's output; `disconnect` kills the
 * child but keeps the DataDirectory; `probe` is true only when the process is alive AND its listener
 * answers; and `forget` deletes the whole DataDirectory.
 */

const cp = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => cp);
const fs = vi.hoisted(() => ({ mkdirSync: vi.fn(), rmSync: vi.fn(), writeFileSync: vi.fn() }));
vi.mock('node:fs', () => fs);
vi.mock('electron', () => ({ app: { getPath: () => '/userData' } }));
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const probeSocksPort = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock('./connection-provider.electron', () => ({ probeSocksPort }));
const locateBinary = vi.hoisted(() => vi.fn(() => '/bin/tor'));
vi.mock('./vpn-binaries.electron', () => ({ locateBinary }));
const loopback = vi.hoisted(() => ({
  reserveLoopbackPort: vi.fn(() => Promise.resolve(9050)),
  waitForSocksPort: vi.fn(() => Promise.resolve()),
}));
vi.mock('./loopback-port.electron', () => loopback);

const { TorProvider } = await import('./tor-provider.electron');

const dataDir = (id: string): string => join('/userData', 'vpn', 'tor', id);

type Child = {
  stdout: { on: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
  exitCode: number | null;
  killed: boolean;
};
let child: Child;
beforeEach(() => {
  vi.clearAllMocks();
  child = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
    exitCode: null,
    killed: false,
  };
  cp.spawn.mockReturnValue(child);
  loopback.reserveLoopbackPort.mockResolvedValue(9050);
  loopback.waitForSocksPort.mockResolvedValue(undefined);
  probeSocksPort.mockResolvedValue(true);
});

describe('connect', () => {
  it('writes a torrc without an upstream proxy and reports an unchained route', async () => {
    const res = await new TorProvider('c1', null).connect();
    const [path, torrc, opts] = fs.writeFileSync.mock.calls[0] as [string, string, unknown];
    expect(path).toBe(join(dataDir('c1'), 'torrc'));
    expect(torrc).toContain('SocksPort 127.0.0.1:9050');
    expect(torrc).toContain('ControlPort 0');
    expect(torrc).not.toContain('Socks5Proxy');
    expect(opts).toEqual({ mode: 0o600 });
    expect(cp.spawn).toHaveBeenCalledWith(
      '/bin/tor',
      ['-f', join(dataDir('c1'), 'torrc')],
      expect.objectContaining({ windowsHide: true }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Tor connection up',
      expect.objectContaining({ chained: false }),
    );
    expect(res).toEqual({ socksPort: 9050 });
  });

  it('resolves the upstream before starting Tor and chains through it', async () => {
    const order: string[] = [];
    const resolveUpstream = vi.fn(() => {
      order.push('upstream');
      return Promise.resolve(40100);
    });
    loopback.reserveLoopbackPort.mockImplementation(() => {
      order.push('reserve');
      return Promise.resolve(9050);
    });
    await new TorProvider('c2', resolveUpstream).connect();
    expect(order).toEqual(['upstream', 'reserve']);
    const torrc = (fs.writeFileSync.mock.calls[0] as [string, string])[1];
    expect(torrc).toContain('Socks5Proxy 127.0.0.1:40100');
    expect(logger.info).toHaveBeenCalledWith(
      'Tor connection up',
      expect.objectContaining({ chained: true }),
    );
  });

  it('tears down and throws with the tail of Tor output when it never comes up', async () => {
    child.stdout.on.mockImplementation((ev: string, fn: (c: Buffer) => void) => {
      if (ev === 'data') fn(Buffer.from('line1\nline2\nBootstrapped 10%: failed'));
    });
    loopback.waitForSocksPort.mockRejectedValue(new Error('timed out'));
    await expect(new TorProvider('c1', null).connect()).rejects.toThrow(/Bootstrapped 10%: failed/);
    expect(child.kill).toHaveBeenCalled();
  });
});

describe('disconnect', () => {
  it('is a no-op before a connect', async () => {
    await expect(new TorProvider('c1', null).disconnect()).resolves.toBeUndefined();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('kills the child but keeps the DataDirectory', async () => {
    const provider = new TorProvider('c1', null);
    await provider.connect();
    fs.rmSync.mockClear();
    await provider.disconnect();
    expect(child.kill).toHaveBeenCalled();
    expect(fs.rmSync).not.toHaveBeenCalled();
  });
});

describe('probe + forget', () => {
  it('probe is false without a live process and true when the listener answers', async () => {
    const provider = new TorProvider('c1', null);
    expect(await provider.probe()).toBe(false);

    await provider.connect();
    expect(await provider.probe()).toBe(true);
    expect(probeSocksPort).toHaveBeenCalledWith(9050);

    child.exitCode = 0;
    expect(await provider.probe()).toBe(false);
  });

  it('forget wipes the whole DataDirectory', () => {
    TorProvider.forget('c1');
    expect(fs.rmSync).toHaveBeenCalledWith(dataDir('c1'), { recursive: true, force: true });
  });
});

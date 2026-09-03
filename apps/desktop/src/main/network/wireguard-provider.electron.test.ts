import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `WireGuardProvider` — a userspace WireGuard tunnel fronted by wireproxy's SOCKS5 listener. Pinned:
 * `connect` refuses a connection with no stored profile, re-parses the config, reserves a loopback
 * port, writes the rendered wireproxy config 0o600, spawns the binary, waits for the SOCKS port and
 * deletes the config file in `finally`; a failed wait tears down and throws a 502 carrying wireproxy's
 * stderr; `disconnect` kills the child and removes the config; and `probe` is true only when the
 * process is alive AND its listener answers.
 */

const RUN_DIR = join('/userData', 'vpn', 'run');

const cp = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => cp);
const fs = vi.hoisted(() => ({ mkdirSync: vi.fn(), rmSync: vi.fn(), writeFileSync: vi.fn() }));
vi.mock('node:fs', () => fs);
vi.mock('electron', () => ({ app: { getPath: () => '/userData' } }));

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: logger }));

const probeSocksPort = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock('./connection-provider.electron', () => ({ probeSocksPort }));
const locateBinary = vi.hoisted(() => vi.fn(() => '/bin/wireproxy'));
vi.mock('./vpn-binaries.electron', () => ({ locateBinary }));
const vpnSecrets = vi.hoisted(() => ({ read: vi.fn((): string | null => '[Interface]') }));
vi.mock('./vpn-secrets.electron', () => ({ default: vpnSecrets }));
vi.mock('./wireguard-config', () => ({
  parseWireGuardConfig: (t: string) => ({ raw: t }),
  toWireproxyConfig: (_c: unknown, port: number) => `# wireproxy for :${port}`,
}));
const loopback = vi.hoisted(() => ({
  reserveLoopbackPort: vi.fn(() => Promise.resolve(40123)),
  waitForSocksPort: vi.fn(() => Promise.resolve()),
}));
vi.mock('./loopback-port.electron', () => loopback);

const { WireGuardProvider } = await import('./wireguard-provider.electron');

type Child = {
  stderr: { on: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
  exitCode: number | null;
  killed: boolean;
};
let child: Child;
beforeEach(() => {
  vi.clearAllMocks();
  child = { stderr: { on: vi.fn() }, kill: vi.fn(), exitCode: null, killed: false };
  cp.spawn.mockReturnValue(child);
  vpnSecrets.read.mockReturnValue('[Interface]\nPrivateKey=x');
  loopback.reserveLoopbackPort.mockResolvedValue(40123);
  loopback.waitForSocksPort.mockResolvedValue(undefined);
  probeSocksPort.mockResolvedValue(true);
});

describe('connect', () => {
  it('refuses a connection with no stored profile', async () => {
    vpnSecrets.read.mockReturnValue(null);
    await expect(new WireGuardProvider('c1').connect()).rejects.toThrow(
      /no stored WireGuard profile/,
    );
  });

  it('renders the config 0o600, spawns wireproxy, and returns the reserved port', async () => {
    const res = await new WireGuardProvider('c1').connect();
    const configPath = join(RUN_DIR, 'c1.conf');
    expect(fs.mkdirSync).toHaveBeenCalledWith(RUN_DIR, { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(configPath, '# wireproxy for :40123', {
      mode: 0o600,
    });
    expect(cp.spawn).toHaveBeenCalledWith(
      '/bin/wireproxy',
      ['-c', configPath],
      expect.objectContaining({ windowsHide: true }),
    );
    expect(fs.rmSync).toHaveBeenCalledWith(configPath, { force: true }); // finally
    expect(res).toEqual({ socksPort: 40123 });
  });

  it('tears down and 502s with wireproxy stderr when the listener never comes up', async () => {
    child.stderr.on.mockImplementation((ev: string, fn: (c: Buffer) => void) => {
      if (ev === 'data') fn(Buffer.from('bad private key'));
    });
    loopback.waitForSocksPort.mockRejectedValue(new Error('timed out'));
    const provider = new WireGuardProvider('c1');
    await expect(provider.connect()).rejects.toMatchObject({
      statusCode: 502,
      code: 'networkTunnelFailed',
      message: expect.stringContaining('bad private key') as string,
    });
    expect(child.kill).toHaveBeenCalled();
    expect(fs.rmSync).toHaveBeenCalledWith(join(RUN_DIR, 'c1.conf'), { force: true });
  });
});

describe('disconnect', () => {
  it('is a no-op before a connect', async () => {
    await expect(new WireGuardProvider('c1').disconnect()).resolves.toBeUndefined();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('kills the child and removes the config after a connect', async () => {
    const provider = new WireGuardProvider('c1');
    await provider.connect();
    fs.rmSync.mockClear();
    await provider.disconnect();
    expect(child.kill).toHaveBeenCalled();
    expect(fs.rmSync).toHaveBeenCalledWith(join(RUN_DIR, 'c1.conf'), { force: true });
  });
});

describe('probe', () => {
  it('is false without a live process and true only when the listener answers', async () => {
    const provider = new WireGuardProvider('c1');
    expect(await provider.probe()).toBe(false); // never connected

    await provider.connect();
    expect(await provider.probe()).toBe(true);
    expect(probeSocksPort).toHaveBeenCalledWith(40123);

    child.exitCode = 1;
    expect(await provider.probe()).toBe(false);
  });
});

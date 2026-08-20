import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    resolveProxyResult: { value: 'SOCKS5 127.0.0.1:1080' },
    attacherRan: { value: false },
    fromPartition: vi.fn((partition: string) => ({
      partition,
      // Not `async () => {}`: an async arrow with no await trips the lint rule, and the shape Electron
      // actually exposes is "returns a promise", which this states directly.
      setProxy: vi.fn((): Promise<void> => {
        order.push('setProxy');
        return Promise.resolve();
      }),
      resolveProxy: vi.fn((): Promise<string> => Promise.resolve(h.resolveProxyResult.value)),
    })),
  };
});

vi.mock('electron', () => ({ session: { fromPartition: h.fromPartition } }));

const { default: BrowsingSessions } = await import('./browsing-sessions.electron');
const { ensureTunnelSession, resetTunnelSessionsForTests, invalidateTunnelVerification } =
  await import('./tunnel-session.electron');

beforeEach(() => {
  BrowsingSessions.resetForTests();
  resetTunnelSessionsForTests();
  h.order.length = 0;
  h.resolveProxyResult.value = 'SOCKS5 127.0.0.1:1080';
  h.fromPartition.mockClear();
});

describe('binding a tunnel session', () => {
  it('lands on the connection’s own partition', async () => {
    const bind = await ensureTunnelSession('vpn-a', 1080);
    expect(bind.partition).toBe('persist:tepegoz-web--conn-vpn-a');
  });

  it('wires the filtering/quarantine plane BEFORE any proxy carries traffic', async () => {
    // The window this ordering closes: a partition that can reach the network while the ad-blocking,
    // download-quarantine and User-Agent attachers have not run yet.
    BrowsingSessions.register('filter', () => {
      h.order.push('attach:filter');
    });
    await ensureTunnelSession('vpn-a', 1080);
    expect(h.order).toEqual(['attach:filter', 'setProxy']);
  });

  it('refuses the bind when the session still resolves to DIRECT — a tunnel in name only', async () => {
    h.resolveProxyResult.value = 'DIRECT';
    await expect(ensureTunnelSession('vpn-a', 1080)).rejects.toThrow(/did not take effect/);
  });

  it('refuses a config that could leak, before it ever reaches setProxy', async () => {
    await expect(ensureTunnelSession('vpn-a', 0)).rejects.toThrow(/bad_port/);
    expect(h.order).not.toContain('setProxy');
  });

  it('refuses an invalid connection id rather than inventing a partition for it', async () => {
    await expect(ensureTunnelSession('vpn/a', 1080)).rejects.toThrow(/invalid connection id/);
  });

  it('a CRITICAL attacher failure aborts the bind — it never falls back to Direct', async () => {
    BrowsingSessions.register(
      'downloads',
      () => {
        throw new Error('quarantine unavailable');
      },
      { critical: true },
    );
    await expect(ensureTunnelSession('vpn-a', 1080)).rejects.toThrow(/quarantine unavailable/);
    expect(h.order).not.toContain('setProxy');
  });

  it('re-binding the same connection is cheap, and re-verifies after an explicit invalidation', async () => {
    await ensureTunnelSession('vpn-a', 1080);
    await ensureTunnelSession('vpn-a', 1080);
    expect(h.order.filter((o) => o === 'setProxy')).toHaveLength(1);

    invalidateTunnelVerification('vpn-a');
    await ensureTunnelSession('vpn-a', 1081);
    expect(h.order.filter((o) => o === 'setProxy')).toHaveLength(2);
  });

  it('two connections get two sessions', async () => {
    const a = await ensureTunnelSession('vpn-a', 1080);
    const b = await ensureTunnelSession('vpn-b', 1081);
    expect(a.partition).not.toBe(b.partition);
    expect(a.session).not.toBe(b.session);
  });
});

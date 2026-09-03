import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    resolveProxyResult: { value: 'SOCKS5 127.0.0.1:1080' },
    setProxyRejects: { value: false },
    attacherRan: { value: false },
    fromPartition: vi.fn((partition: string) => ({
      partition,
      // Not `async () => {}`: an async arrow with no await trips the lint rule, and the shape Electron
      // actually exposes is "returns a promise", which this states directly.
      // Recorded WITH its rules, because a tunnel partition receives two different proxy configs in a
      // deliberate order: the blackhole at creation, then the real tunnel once verified.
      setProxy: vi.fn((config: { proxyRules: string }): Promise<void> => {
        order.push(config.proxyRules === 'socks5://127.0.0.1:1' ? 'blackhole' : 'setProxy');
        return h.setProxyRejects.value
          ? Promise.reject(new Error('setProxy failed'))
          : Promise.resolve();
      }),
      resolveProxy: vi.fn((): Promise<string> => Promise.resolve(h.resolveProxyResult.value)),
    })),
  };
});

vi.mock('electron', () => ({ session: { fromPartition: h.fromPartition } }));

const { default: BrowsingSessions } = await import('./browsing-sessions.electron');
const {
  ensureTunnelSession,
  resetTunnelSessionsForTests,
  invalidateTunnelVerification,
  applyTunnelHardening,
  blackholeTunnelSession,
} = await import('./tunnel-session.electron');

beforeEach(() => {
  BrowsingSessions.resetForTests();
  resetTunnelSessionsForTests();
  h.order.length = 0;
  h.resolveProxyResult.value = 'SOCKS5 127.0.0.1:1080';
  h.setProxyRejects.value = false;
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
    // And the partition is blackholed before even that: no ordering of creation, wiring and binding
    // leaves a window where the partition can reach the network unproxied.
    expect(h.order).toEqual(['blackhole', 'attach:filter', 'setProxy']);
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

describe('applyTunnelHardening', () => {
  it('pins the WebRTC IP-handling policy so a tunneled tab cannot leak a real ICE candidate', () => {
    const wc = { setWebRTCIPHandlingPolicy: vi.fn() };
    applyTunnelHardening(wc as never);
    expect(wc.setWebRTCIPHandlingPolicy).toHaveBeenCalledWith('disable_non_proxied_udp');
  });

  it('rethrows so the caller can treat a failed WebRTC lock as a failed bind', () => {
    const wc = {
      setWebRTCIPHandlingPolicy: vi.fn(() => {
        throw new Error('policy rejected');
      }),
    };
    expect(() => applyTunnelHardening(wc as never)).toThrow('policy rejected');
  });
});

describe('blackholeTunnelSession', () => {
  it('does nothing for an invalid connection id', async () => {
    await blackholeTunnelSession('vpn/bad');
    expect(h.order).not.toContain('blackhole');
  });

  it('points the partition back at the blackhole and forgets its verification', async () => {
    await ensureTunnelSession('vpn-a', 1080);
    h.order.length = 0;

    await blackholeTunnelSession('vpn-a');
    expect(h.order).toContain('blackhole');

    // Verification was dropped: the next bind must re-run the real setProxy + resolveProxy check.
    await ensureTunnelSession('vpn-a', 1080);
    expect(h.order.filter((o) => o === 'setProxy')).toHaveLength(1);
  });

  it('never throws even if the blackhole setProxy fails — the health poll must survive', async () => {
    await ensureTunnelSession('vpn-a', 1080);
    h.setProxyRejects.value = true;
    await expect(blackholeTunnelSession('vpn-a')).resolves.toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `BrowsingSessions` — the registry of browsing sessions + the per-session attacher plane. Pinned:
 * `register` + `ensure` create a session and run every attacher against it exactly once (retro-applying
 * to sessions already live); a critical attacher that throws poisons the partition for the process
 * lifetime while a non-critical one only warns; `direct` / `defaultForNewTab` / `private` route through
 * `ensure` (fail-closed when a provider throws or hands back the wrong partition kind); a fresh tunnel
 * partition is blackholed on creation; and `release` refuses a non-tunnel partition and wipes a tunnel
 * one.
 */

const DIRECT_PARTITION = 'persist:tepegoz-web';
const PRIVATE_PARTITION = 'tepegoz-private';
vi.mock('@tepegoz/tab-engine', () => ({
  DIRECT_PARTITION,
  PRIVATE_PARTITION,
  isPrivatePartition: (p: string) => p.startsWith('tepegoz-private'),
}));
vi.mock('@tepegoz/security-policy', () => ({
  BLACKHOLE_PROXY_CONFIG: { proxyRules: 'blackhole' },
}));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const fromPartition = vi.hoisted(() =>
  vi.fn((p: string) => ({
    __partition: p,
    setProxy: vi.fn(() => Promise.resolve()),
    clearStorageData: vi.fn(() => Promise.resolve()),
    clearCache: vi.fn(() => Promise.resolve()),
    clearAuthCache: vi.fn(() => Promise.resolve()),
    clearHostResolverCache: vi.fn(() => Promise.resolve()),
  })),
);
vi.mock('electron', () => ({ session: { fromPartition } }));

const BrowsingSessions = (await import('./browsing-sessions.electron')).default;
const cast = <T>(v: unknown): T => v as T;

/** A `session.fromPartition` result with every method resolving, minus the ones `over` overrides. */
const fakeSes = (partition: string, over: Record<string, unknown> = {}): unknown => ({
  __partition: partition,
  setProxy: vi.fn(() => Promise.resolve()),
  clearStorageData: vi.fn(() => Promise.resolve()),
  clearCache: vi.fn(() => Promise.resolve()),
  clearAuthCache: vi.fn(() => Promise.resolve()),
  clearHostResolverCache: vi.fn(() => Promise.resolve()),
  ...over,
});
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  BrowsingSessions.resetForTests();
});

describe('register + ensure', () => {
  it('runs each attacher against a session exactly once, retro-applying to live ones', () => {
    const a = vi.fn();
    BrowsingSessions.register('filter', a);
    const ses1 = BrowsingSessions.ensure(DIRECT_PARTITION);
    expect(a).toHaveBeenCalledWith(ses1, DIRECT_PARTITION);

    const b = vi.fn();
    BrowsingSessions.register('quarantine', b);
    expect(b).toHaveBeenCalledWith(ses1, DIRECT_PARTITION); // retro-applied

    a.mockClear();
    expect(BrowsingSessions.ensure(DIRECT_PARTITION)).toBe(ses1);
    expect(a).not.toHaveBeenCalled(); // exactly once
  });

  it('poisons the partition for good when a critical attacher throws in ensure', () => {
    BrowsingSessions.register(
      'crit',
      () => {
        throw new Error('filter plane down');
      },
      { critical: true },
    );
    expect(() => BrowsingSessions.ensure(DIRECT_PARTITION)).toThrow('filter plane down');
    expect(() => BrowsingSessions.ensure(DIRECT_PARTITION)).toThrow('filter plane down');
  });

  it('poisons an already-live partition when register retro-applies a failing critical attacher', () => {
    BrowsingSessions.ensure(DIRECT_PARTITION);
    BrowsingSessions.register(
      'crit',
      () => {
        throw new Error('boom');
      },
      { critical: true },
    );
    expect(BrowsingSessions.all()).toEqual([]);
    expect(() => BrowsingSessions.ensure(DIRECT_PARTITION)).toThrow('boom');
  });

  it('only warns when a non-critical attacher throws', () => {
    BrowsingSessions.register('soft', () => {
      throw new Error('meh');
    });
    expect(() => BrowsingSessions.ensure(DIRECT_PARTITION)).not.toThrow();
  });

  it('blackholes a fresh tunnel partition on creation', () => {
    const ses = BrowsingSessions.ensure(`${DIRECT_PARTITION}--conn-abc`);
    expect(
      (ses as unknown as { setProxy: ReturnType<typeof vi.fn> }).setProxy,
    ).toHaveBeenCalledWith({
      proxyRules: 'blackhole',
    });
  });
});

describe('route accessors', () => {
  it('direct + defaultForNewTab fall back to the Direct session with no provider', () => {
    const d = BrowsingSessions.direct();
    expect(BrowsingSessions.defaultForNewTab()).toBe(d);
  });

  it('defaultForNewTab uses the installed provider, and rethrows a failing one', () => {
    const custom = BrowsingSessions.ensure(`${DIRECT_PARTITION}--conn-1`);
    BrowsingSessions.setNewTabSessionProvider(() => cast(custom));
    expect(BrowsingSessions.defaultForNewTab()).toBe(custom);

    BrowsingSessions.setNewTabSessionProvider(() => {
      throw new Error('no route');
    });
    expect(() => BrowsingSessions.defaultForNewTab()).toThrow('no route');
  });

  it('private uses PRIVATE_PARTITION by default and refuses a non-private provider result', () => {
    const p = BrowsingSessions.private();
    expect((p as unknown as { __partition: string }).__partition).toBe(PRIVATE_PARTITION);

    BrowsingSessions.setPrivatePartitionProvider(() => 'persist:not-private');
    expect(() => BrowsingSessions.private()).toThrow(/Not a private partition/);
  });

  it('all returns live sessions in creation order', () => {
    BrowsingSessions.ensure(DIRECT_PARTITION);
    BrowsingSessions.ensure(`${DIRECT_PARTITION}--conn-x`);
    expect(BrowsingSessions.all().map((s) => s.partition)).toEqual([
      DIRECT_PARTITION,
      `${DIRECT_PARTITION}--conn-x`,
    ]);
  });
});

describe('partition classification', () => {
  it('isBrowsingPartition covers direct, tunnel and private; isTunnelPartition only tunnels', () => {
    expect(BrowsingSessions.isBrowsingPartition(DIRECT_PARTITION)).toBe(true);
    expect(BrowsingSessions.isBrowsingPartition(`${DIRECT_PARTITION}--conn-1`)).toBe(true);
    expect(BrowsingSessions.isBrowsingPartition('tepegoz-private--conn-2')).toBe(true);
    expect(BrowsingSessions.isBrowsingPartition('persist:something-else')).toBe(false);

    expect(BrowsingSessions.isTunnelPartition(`${DIRECT_PARTITION}--conn-1`)).toBe(true);
    expect(BrowsingSessions.isTunnelPartition(DIRECT_PARTITION)).toBe(false);
  });
});

describe('release + discardPrivate', () => {
  it('release refuses a non-tunnel partition', async () => {
    await expect(BrowsingSessions.release(DIRECT_PARTITION)).rejects.toThrow(/non-tunnel/);
  });

  it('release wipes a live tunnel partition and forgets it', async () => {
    const part = `${DIRECT_PARTITION}--conn-gone`;
    const ses = BrowsingSessions.ensure(part) as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    await BrowsingSessions.release(part);
    expect(ses.clearStorageData).toHaveBeenCalled();
    expect(ses.clearHostResolverCache).toHaveBeenCalled();
    expect(BrowsingSessions.all()).toEqual([]);
  });

  it('discardPrivate clears every private session and drops it from the registry', async () => {
    BrowsingSessions.setPrivatePartitionProvider(() => 'tepegoz-private--conn-7');
    const ses = BrowsingSessions.private() as unknown as Record<string, ReturnType<typeof vi.fn>>;
    await BrowsingSessions.discardPrivate();
    expect(ses.clearStorageData).toHaveBeenCalled();
    expect(ses.clearCache).toHaveBeenCalled();
    expect(BrowsingSessions.privateSessions()).toEqual([]);
  });

  it('logs but does not throw when blackholing a fresh tunnel partition fails', async () => {
    const part = `${DIRECT_PARTITION}--conn-noproxy`;
    fromPartition.mockReturnValueOnce(
      fakeSes(part, { setProxy: vi.fn(() => Promise.reject(new Error('proxy down'))) }) as never,
    );
    expect(() => BrowsingSessions.ensure(part)).not.toThrow();
    await flush();
    expect(logger.error).toHaveBeenCalledWith(
      'Could not blackhole a new tunnel partition',
      expect.objectContaining({ partition: part, err: expect.stringContaining('proxy down') as string }),
    );
  });

  it('discardPrivate swallows a per-session cleanup failure and still drops the session', async () => {
    const part = 'tepegoz-private--conn-bad';
    fromPartition.mockReturnValueOnce(
      fakeSes(part, {
        clearStorageData: vi.fn(() => Promise.reject(new Error('mem cleanup failed'))),
      }) as never,
    );
    BrowsingSessions.setPrivatePartitionProvider(() => part);
    BrowsingSessions.private();
    await BrowsingSessions.discardPrivate();
    expect(logger.warn).toHaveBeenCalledWith(
      'Private session cleanup failed; it dies with the process regardless',
      expect.objectContaining({ partition: part }),
    );
    expect(BrowsingSessions.privateSessions()).toEqual([]);
  });

  it('release rethrows and reports a failed tunnel-partition wipe', async () => {
    const part = `${DIRECT_PARTITION}--conn-diskfull`;
    fromPartition.mockReturnValueOnce(
      fakeSes(part, {
        clearStorageData: vi.fn(() => Promise.reject(new Error('disk full'))),
      }) as never,
    );
    BrowsingSessions.ensure(part);
    await expect(BrowsingSessions.release(part)).rejects.toThrow('disk full');
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to clear a released tunnel partition',
      expect.objectContaining({ partition: part }),
    );
  });
});

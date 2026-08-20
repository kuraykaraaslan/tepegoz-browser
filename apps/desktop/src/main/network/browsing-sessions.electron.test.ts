import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fromPartition: vi.fn((partition: string) => ({ partition })),
}));

vi.mock('electron', () => ({ session: { fromPartition: h.fromPartition } }));

const { default: BrowsingSessions } = await import('./browsing-sessions.electron');

const DIRECT = 'persist:tepegoz-web';
const TUNNEL = 'persist:tepegoz-web--conn-vpn-a';

beforeEach(() => {
  BrowsingSessions.resetForTests();
  h.fromPartition.mockClear();
});

describe('session identity', () => {
  it('returns the SAME session object for a partition, creating it once', () => {
    const a = BrowsingSessions.ensure(DIRECT);
    const b = BrowsingSessions.ensure(DIRECT);
    expect(a).toBe(b);
    expect(h.fromPartition).toHaveBeenCalledTimes(1);
  });

  it('a tunnel partition is a DIFFERENT session from Direct', () => {
    expect(BrowsingSessions.ensure(DIRECT)).not.toBe(BrowsingSessions.ensure(TUNNEL));
  });
});

describe('per-session wiring — the whole point of the registry', () => {
  it('runs every registered attacher on a NEW session', () => {
    const filter = vi.fn();
    const downloads = vi.fn();
    BrowsingSessions.register('filter', filter);
    BrowsingSessions.register('downloads', downloads);

    BrowsingSessions.ensure(TUNNEL);

    expect(filter).toHaveBeenCalledWith({ partition: TUNNEL }, TUNNEL);
    expect(downloads).toHaveBeenCalledWith({ partition: TUNNEL }, TUNNEL);
  });

  it('runs each attacher exactly once per session, however often ensure is called', () => {
    const filter = vi.fn();
    BrowsingSessions.register('filter', filter);
    BrowsingSessions.ensure(DIRECT);
    BrowsingSessions.ensure(DIRECT);
    BrowsingSessions.ensure(DIRECT);
    expect(filter).toHaveBeenCalledTimes(1);
  });

  it('RETRO-APPLIES to sessions that already existed — registration order cannot matter', () => {
    BrowsingSessions.ensure(DIRECT);
    BrowsingSessions.ensure(TUNNEL);
    const seen: string[] = [];
    BrowsingSessions.register('late', (_ses, partition) => {
      seen.push(partition);
    });
    expect(seen).toEqual([DIRECT, TUNNEL]);
  });

  it('the regression this module exists to prevent: a tunnel session is wired like Direct is', () => {
    const seen: string[] = [];
    BrowsingSessions.register('filter', (_s, p) => seen.push(`filter:${p}`));
    BrowsingSessions.register('ua', (_s, p) => seen.push(`ua:${p}`));
    BrowsingSessions.ensure(DIRECT);
    BrowsingSessions.ensure(TUNNEL);
    expect(seen).toContain('filter:' + TUNNEL);
    expect(seen).toContain('ua:' + TUNNEL);
  });
});

describe('a failing attacher', () => {
  it('a NON-critical failure degrades that one feature and lets the others attach', () => {
    const ok = vi.fn();
    BrowsingSessions.register('broken', () => {
      throw new Error('nope');
    });
    BrowsingSessions.register('ok', ok);
    expect(() => BrowsingSessions.ensure(TUNNEL)).not.toThrow();
    expect(ok).toHaveBeenCalledOnce();
  });

  it('a CRITICAL failure refuses the session — no half-wired session can host a tab', () => {
    BrowsingSessions.register(
      'filter',
      () => {
        throw new Error('filter plane unavailable');
      },
      { critical: true },
    );
    expect(() => BrowsingSessions.ensure(TUNNEL)).toThrow(/filter plane unavailable/);
  });

  it('a retry after a CRITICAL failure still refuses — it never degrades into a silently unwired session', () => {
    // Without the poison list this is the leak: exactly-once would SKIP the attacher that failed, and
    // the second ensure() would hand back a session that looks wired and has no filtering on it.
    BrowsingSessions.register(
      'filter',
      () => {
        throw new Error('filter plane unavailable');
      },
      { critical: true },
    );
    expect(() => BrowsingSessions.ensure(TUNNEL)).toThrow();
    expect(() => BrowsingSessions.ensure(TUNNEL)).toThrow(/filter plane unavailable/);
    expect(BrowsingSessions.all().map((s) => s.partition)).not.toContain(TUNNEL);
  });

  it('a critical attacher registered LATE poisons the live session it cannot attach to', () => {
    BrowsingSessions.ensure(TUNNEL);
    BrowsingSessions.register(
      'filter',
      () => {
        throw new Error('too late');
      },
      { critical: true },
    );
    expect(() => BrowsingSessions.ensure(TUNNEL)).toThrow(/too late/);
  });
});

describe('enumeration', () => {
  it('lists every live browsing session, base partition first', () => {
    BrowsingSessions.ensure(DIRECT);
    BrowsingSessions.ensure(TUNNEL);
    expect(BrowsingSessions.all().map((s) => s.partition)).toEqual([DIRECT, TUNNEL]);
  });

  it('recognises our browsing partitions and nothing else', () => {
    expect(BrowsingSessions.isBrowsingPartition(DIRECT)).toBe(true);
    expect(BrowsingSessions.isBrowsingPartition(TUNNEL)).toBe(true);
    expect(BrowsingSessions.isBrowsingPartition('persist:tepegoz-app')).toBe(false);
    expect(BrowsingSessions.isBrowsingPartition('tepegoz-extraction-sandbox')).toBe(false);
  });
});

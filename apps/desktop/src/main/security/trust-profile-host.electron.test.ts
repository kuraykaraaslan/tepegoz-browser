import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PolicyKernel } from '@tepegoz/security-policy';
import { TrustProfileStore, migrate, openDatabase, type Db } from '@tepegoz/persistence';

/**
 * Scoped Trust Profiles, main-process half.
 *
 * The file shipped at 22% statements and 0% functions — nothing in it had ever executed. Its docblock
 * makes a specific security promise: "When the database is unavailable the kernel keeps an EMPTY set,
 * which is `default` everywhere: the degraded state is the one that asks, never the one that assumes a
 * site was trusted." That promise is four `if (db === null)` branches, and an unexecuted branch is a
 * claim, not a guarantee.
 *
 * The failure it guards against is quiet and bad in one direction only: if a failed database open left
 * a STALE trusted set in the kernel — or if `publish()` were skipped so the kernel kept whatever it had
 * — a site the user demoted to `restricted` would keep its old permissions until the next launch, with
 * no error anywhere. So the assertions below are about what the kernel is HANDED, not about what the
 * functions return.
 *
 * The store and the kernel are real; only `getDb` is swapped, because "the database is unavailable" is
 * precisely the condition under test and there is no honest way to produce it with a live handle.
 */

const h = vi.hoisted(() => ({ db: null as Db | null }));

vi.mock('../db/database.electron', () => ({
  getDb: () => h.db,
}));

const { initTrustProfiles, listTrustProfiles, removeTrustProfile, setTrustProfile } =
  await import('./trust-profile-host.electron');

/** Capture what the kernel is told, since the published set is private to it. */
let published: { domain: string; level: string }[][];

beforeEach(() => {
  published = [];
  vi.spyOn(PolicyKernel, 'setTrustProfiles').mockImplementation((profiles) => {
    published.push(profiles.map((p) => ({ domain: p.domain, level: p.level })));
  });
  h.db = openDatabase(':memory:');
  migrate(h.db);
});

afterEach(() => {
  vi.restoreAllMocks();
  h.db = null;
});

describe('with a working database', () => {
  it('loads the stored profiles into the kernel at startup', () => {
    if (h.db !== null) TrustProfileStore.put(h.db, 'github.com', 'trusted');

    initTrustProfiles();

    expect(published.at(-1)).toEqual([{ domain: 'github.com', level: 'trusted' }]);
  });

  it('re-publishes immediately when a level is set, not at the next launch', () => {
    setTrustProfile('bank.example', 'restricted');

    // The user changed a permission; the very next policy decision must already see it.
    expect(published.at(-1)).toEqual([{ domain: 'bank.example', level: 'restricted' }]);
    expect(listTrustProfiles().map((p) => p.domain)).toEqual(['bank.example']);
  });

  it('re-publishes the remaining set when a profile is removed', () => {
    setTrustProfile('a.example', 'trusted');
    setTrustProfile('b.example', 'restricted');

    removeTrustProfile('a.example');

    expect(published.at(-1)?.map((p) => p.domain)).not.toContain('a.example');
    expect(published.at(-1)?.map((p) => p.domain)).toContain('b.example');
  });

  it('keeps one row per domain when the same site is set twice', () => {
    setTrustProfile('shop.example', 'trusted');
    setTrustProfile('shop.example', 'restricted');

    expect(published.at(-1)).toEqual([{ domain: 'shop.example', level: 'restricted' }]);
  });
});

describe('with the database unavailable — the degraded state must ASK, never assume', () => {
  beforeEach(() => {
    h.db = null;
  });

  it('publishes an EMPTY set at startup rather than leaving the kernel as it was', () => {
    initTrustProfiles();

    // Not "no call" — an explicit empty set. Leaving a stale trusted set in place is the one outcome
    // that silently grants permissions the user can no longer see or revoke.
    expect(published.at(-1)).toEqual([]);
  });

  it('reports no profiles rather than throwing at the settings screen', () => {
    expect(listTrustProfiles()).toEqual([]);
  });

  it('does not pretend a write succeeded', () => {
    expect(setTrustProfile('bank.example', 'restricted')).toEqual([]);
    expect(removeTrustProfile('bank.example')).toEqual([]);
  });

  it('never publishes a trusted entry it could not have read', () => {
    setTrustProfile('bank.example', 'trusted');

    expect(published.flat()).toEqual([]);
  });
});

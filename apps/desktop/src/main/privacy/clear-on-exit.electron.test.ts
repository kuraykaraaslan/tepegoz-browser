import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate, openDatabase, MetaStore, type Db } from '@tepegoz/persistence';
import type { BrowsingDataClearRequest } from '@tepegoz/shared-types';

/**
 * "Clear these when the browser closes", and the hole every other browser's version of it has.
 *
 * Firefox and Brave run the clear in a quit handler, so a crash or a `kill` leaves everything behind —
 * the setting does nothing on the one exit the user did not choose. This module closes that with a
 * marker, and these tests are about the marker, because the marker IS the feature.
 */
const prefs = vi.hoisted(() => ({ value: { clearOnExit: [] as string[] } }));
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs.value } }));

const cleared = vi.hoisted(() => ({ calls: [] as BrowsingDataClearRequest[], fail: false }));
vi.mock('./clear-browsing-data.electron', () => ({
  clearBrowsingData: (_db: unknown, request: BrowsingDataClearRequest) => {
    cleared.calls.push(request);
    return cleared.fail ? Promise.reject(new Error('nope')) : Promise.resolve({});
  },
}));

const { settleClearOnExit, clearOnExitNow, pendingCategories } = await import(
  './clear-on-exit.electron'
);

const PENDING_KEY = 'clear_on_exit_pending';

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
  prefs.value = { clearOnExit: [] };
  cleared.calls = [];
  cleared.fail = false;
});

describe('settleClearOnExit', () => {
  it('finishes what a killed session left owing, then arms this one', async () => {
    // The previous run set the marker and never got to remove it — a crash, a kill, a flat battery.
    MetaStore.set(db, PENDING_KEY, JSON.stringify(['history', 'cookies']));
    prefs.value = { clearOnExit: ['cache'] };

    await settleClearOnExit(db);

    expect(cleared.calls).toEqual([{ range: 'all-time', categories: ['history', 'cookies'] }]);
    // And the marker now describes THIS session, not the one that died.
    expect(pendingCategories(db)).toEqual(['cache']);
  });

  it('clears nothing when the previous session had nothing owing', async () => {
    prefs.value = { clearOnExit: ['history'] };
    await settleClearOnExit(db);
    expect(cleared.calls).toEqual([]);
    expect(pendingCategories(db)).toEqual(['history']);
  });

  it('disarms the marker when the preference is turned off', async () => {
    MetaStore.set(db, PENDING_KEY, JSON.stringify(['history']));
    prefs.value = { clearOnExit: [] };
    await settleClearOnExit(db);
    expect(pendingCategories(db)).toEqual([]);
  });

  it('refuses to act on a marker it cannot read', async () => {
    // A marker we cannot parse is not a licence to delete something we cannot name.
    MetaStore.set(db, PENDING_KEY, 'not json');
    await settleClearOnExit(db);
    expect(cleared.calls).toEqual([]);
  });

  it('ignores a category a future build stopped knowing about', async () => {
    MetaStore.set(db, PENDING_KEY, JSON.stringify(['history', 'telepathy']));
    await settleClearOnExit(db);
    expect(cleared.calls).toEqual([{ range: 'all-time', categories: ['history'] }]);
  });

  it('does nothing at all without a database', async () => {
    await expect(settleClearOnExit(null)).resolves.toBeUndefined();
    expect(cleared.calls).toEqual([]);
  });
});

describe('clearOnExitNow', () => {
  it('runs the configured clear and retires the marker once it finishes', async () => {
    MetaStore.set(db, PENDING_KEY, JSON.stringify(['history']));
    prefs.value = { clearOnExit: ['history'] };

    clearOnExitNow(db);
    await Promise.resolve();
    await Promise.resolve();

    expect(cleared.calls).toEqual([{ range: 'all-time', categories: ['history'] }]);
    expect(pendingCategories(db)).toEqual([]);
  });

  it('LEAVES the marker when the clear fails, so the next launch does it', async () => {
    // The whole design in one case: only a clear that finished may retire the marker.
    MetaStore.set(db, PENDING_KEY, JSON.stringify(['history']));
    prefs.value = { clearOnExit: ['history'] };
    cleared.fail = true;

    clearOnExitNow(db);
    await Promise.resolve();
    await Promise.resolve();

    expect(pendingCategories(db)).toEqual(['history']);
  });

  it('is a no-op when the preference is off', () => {
    clearOnExitNow(db);
    expect(cleared.calls).toEqual([]);
  });
});

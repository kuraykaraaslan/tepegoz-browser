import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import { MetaStore, type Db } from '@tepegoz/persistence';
import { BrowsingDataCategorySchema, type BrowsingDataCategory } from '@tepegoz/shared-types';
import { clearBrowsingData } from './clear-browsing-data.electron';

/**
 * "Clear these when the browser closes."
 *
 * Firefox and Brave both ship this, and both share a hole: the clear runs in a quit handler, so a
 * crash — or a `kill`, or a laptop losing power — leaves everything behind. The setting a person chose
 * precisely because they did not want traces left silently does nothing on the one exit that was not
 * theirs to control.
 *
 * This closes that hole with a marker rather than by trying harder at quit:
 *
 *  - At **startup**, before anything else reads the profile: if a marker from the previous session is
 *    still there, that session did not finish its clear. Do it now, then remove it.
 *  - Then **arm** the marker for this session, if the preference asks for anything.
 *  - At **quit**, run the clear and remove the marker when it resolves.
 *
 * So the normal case clears at exit (which is what the setting says, and it means the data is gone
 * while the app is closed), and every abnormal case is caught by the next launch. The marker is only
 * removed by a clear that actually finished, so the worst outcome is doing it twice — which for a
 * delete is not a cost.
 *
 * The marker lives in the `meta` table, not in preferences: it is a fact about a RUN, not a setting,
 * and putting it in the preferences file would sync it to a device that never had the session.
 */
const PENDING_KEY = 'clear_on_exit_pending';

/** Categories to clear, from the preference, ignoring anything a future build stopped knowing about. */
export function configuredCategories(): BrowsingDataCategory[] {
  const raw: unknown = PreferenceStore.getAll().clearOnExit;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const parsed = BrowsingDataCategorySchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

/** What the previous session left owing. Empty when nothing is pending or the marker is unreadable. */
export function pendingCategories(db: Db): BrowsingDataCategory[] {
  const raw = MetaStore.get(db, PENDING_KEY);
  if (raw === undefined || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const checked = BrowsingDataCategorySchema.safeParse(value);
      return checked.success ? [checked.data] : [];
    });
  } catch {
    // A marker we cannot read is not a licence to delete something we cannot name.
    return [];
  }
}

/**
 * Finish the previous session's clear if it did not, then arm this one. Call once at startup, after
 * `migrate` and before the first window opens.
 */
export async function settleClearOnExit(db: Db | null): Promise<void> {
  if (db === null) return;
  const owed = pendingCategories(db);
  if (owed.length > 0) {
    Logger.info('Finishing a clear-on-exit the previous session did not complete', {
      categories: owed.join(','),
    });
    await clearBrowsingData(db, { range: 'all-time', categories: owed });
    MetaStore.set(db, PENDING_KEY, '');
  }
  const next = configuredCategories();
  MetaStore.set(db, PENDING_KEY, next.length === 0 ? '' : JSON.stringify(next));
}

/**
 * Run the clear on the way out. Deliberately NOT awaited by the quit sequence: Electron may take the
 * process down mid-flight, and that is exactly what the startup marker is for. Never blocks a quit the
 * user asked for.
 */
export function clearOnExitNow(db: Db | null): void {
  if (db === null) return;
  const categories = configuredCategories();
  if (categories.length === 0) return;
  void clearBrowsingData(db, { range: 'all-time', categories }).then(
    () => {
      // Only a clear that finished may retire the marker. Anything else leaves it for the next launch.
      try {
        MetaStore.set(db, PENDING_KEY, '');
      } catch {
        /* the database may already be closing — the marker simply survives, which is the safe way */
      }
    },
    (err: unknown) => {
      Logger.warn('Clear-on-exit did not finish; the next launch will', { err: String(err) });
    },
  );
}

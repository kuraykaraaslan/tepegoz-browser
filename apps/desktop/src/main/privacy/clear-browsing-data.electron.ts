import { randomUUID } from 'node:crypto';
import { session } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  browsingDataCutoff,
  type BrowsingDataCategory,
  type BrowsingDataClearRequest,
  type BrowsingDataClearResult,
} from '@tepegoz/shared-types';
import {
  AgentConversationStore,
  DownloadStore,
  EventJournal,
  HistoryStore,
  type Db,
} from '@tepegoz/persistence';
import { APP_PARTITION } from '../window';
import BrowsingSessions from '../network/browsing-sessions.electron';

/**
 * "Clear browsing data" — one action for the whole set, over a time range.
 *
 * The three properties inherited from the per-site clear, because they were right there too:
 *
 * 1. **Only BROWSING partitions.** `APP_PARTITION` holds the browser's own chrome state, not the
 *    user's browsing, and clearing it would remove something nobody asked about.
 * 2. **EVERY browsing partition.** Since Phase 5 a tab bound to a VPN/Tor connection keeps its cookies
 *    in that connection's own partition. Stopping at the base partition would report success and leave
 *    the sessions behind the tunnel intact — the copy the user is least likely to think to check.
 * 3. **Recorded in the Event Journal** (`BrowsingDataCleared`): a destructive action nobody can find
 *    afterwards is one nobody can reason about.
 *
 * And one that is specific to this dialog: **a category that fails is REPORTED**, never swallowed. The
 * whole point of a single clear button is that the user stops checking, so it has to be the one place
 * that cannot quietly do less than it says.
 */
export async function clearBrowsingData(
  db: Db | null,
  request: BrowsingDataClearRequest,
  now = Date.now(),
): Promise<BrowsingDataClearResult> {
  const cutoff = browsingDataCutoff(request.range, now);
  const wanted = new Set<BrowsingDataCategory>(request.categories);
  const result: BrowsingDataClearResult = {
    range: request.range,
    historyEntries: 0,
    downloadEntries: 0,
    agentConversations: 0,
    cookiePartitions: 0,
    cachePartitions: 0,
    failed: [],
  };

  const fail = (category: BrowsingDataCategory, err: unknown): void => {
    result.failed.push(category);
    Logger.warn('Clear browsing data: a category failed', { category, err: String(err) });
  };

  // The database half. Each category is attempted on its own: one failing table must not abandon the
  // others, and the user is told which one did not happen.
  if (db !== null) {
    if (wanted.has('history')) {
      try {
        result.historyEntries =
          cutoff === null ? clearAllHistory(db) : HistoryStore.deleteSince(db, cutoff);
      } catch (err) {
        fail('history', err);
      }
    }
    if (wanted.has('downloads')) {
      try {
        // `?? 0` is the whole "all time" case: every row was created at or after the epoch.
        result.downloadEntries = DownloadStore.clearTerminalSince(db, cutoff ?? 0);
      } catch (err) {
        fail('downloads', err);
      }
    }
    if (wanted.has('agentHistory')) {
      try {
        result.agentConversations = AgentConversationStore.clearSince(db, cutoff ?? 0);
      } catch (err) {
        fail('agentHistory', err);
      }
    }
  } else {
    // No database is not "nothing to clear" — it is "this could not be done", and the categories that
    // live in it have to say so.
    for (const category of ['history', 'downloads', 'agentHistory'] as const) {
      if (wanted.has(category)) result.failed.push(category);
    }
  }

  // The Chromium half. No time range exists here at any Electron version (see TIME_RANGEABLE_CATEGORIES
  // in shared-types) — these are all-or-nothing, which the dialog says out loud.
  const appSession = session.fromPartition(APP_PARTITION);
  const targets = BrowsingSessions.all().filter((s) => s.session !== appSession);

  if (wanted.has('cookies')) {
    let cleared = 0;
    for (const { partition, session: ses } of targets) {
      try {
        await ses.clearStorageData({
          storages: [
            'cookies',
            'localstorage',
            'indexdb',
            'cachestorage',
            'serviceworkers',
            'shadercache',
            'filesystem',
          ],
        });
        cleared++;
      } catch (err) {
        Logger.warn('Clear browsing data: a partition refused a storage clear', {
          partition,
          err: String(err),
        });
      }
    }
    result.cookiePartitions = cleared;
    if (cleared === 0 && targets.length > 0) result.failed.push('cookies');
  }

  if (wanted.has('cache')) {
    let cleared = 0;
    for (const { partition, session: ses } of targets) {
      try {
        await ses.clearCache();
        cleared++;
      } catch (err) {
        Logger.warn('Clear browsing data: a partition refused a cache clear', {
          partition,
          err: String(err),
        });
      }
    }
    result.cachePartitions = cleared;
    if (cleared === 0 && targets.length > 0) result.failed.push('cache');
  }

  journal(db, request, result);
  Logger.info('Cleared browsing data', {
    range: request.range,
    categories: request.categories.join(','),
    failed: result.failed.length,
  });
  return result;
}

/** `HistoryStore.clear` returns nothing, and the dialog reports counts — so count first. */
function clearAllHistory(db: Db): number {
  const total = HistoryStore.count(db);
  HistoryStore.clear(db);
  return total;
}

function journal(
  db: Db | null,
  request: BrowsingDataClearRequest,
  result: BrowsingDataClearResult,
): void {
  if (db === null) return;
  try {
    EventJournal.append(db, {
      id: randomUUID(),
      type: 'BrowsingDataCleared',
      ts: Date.now(),
      actor: 'user',
      correlationId: `clear-browsing-data-${String(Date.now())}`,
      // Counts and category names only. What was cleared is exactly the data the user asked to be
      // rid of, so the record of the clearing must not become a copy of it.
      payload: {
        range: request.range,
        categories: request.categories,
        historyEntries: result.historyEntries,
        downloadEntries: result.downloadEntries,
        agentConversations: result.agentConversations,
        failed: result.failed,
      },
      redacted: false,
    });
  } catch (err) {
    Logger.warn('Clear browsing data journal append failed', { err: String(err) });
  }
}

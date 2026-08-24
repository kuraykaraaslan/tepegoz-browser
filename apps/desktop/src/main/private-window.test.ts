import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const record = vi.fn();
const setTitle = vi.fn();
const getDb = vi.fn();
const isSensitiveSite = vi.fn();

vi.mock('@tepegoz/persistence', () => ({
  HistoryStore: {
    record: (...a: unknown[]): void => {
      record(...a);
    },
    setTitle: (...a: unknown[]): void => {
      setTitle(...a);
    },
  },
}));
vi.mock('../db/database.electron', () => ({ getDb: () => getDb() as unknown }));
vi.mock('@tepegoz/security-policy', () => ({
  isSensitiveSite: (...a: unknown[]) => isSensitiveSite(...a) as unknown,
}));

const { isPrivatePartition, PRIVATE_PARTITION, privatePartitionKey } =
  await import('@tepegoz/tab-engine');

/**
 * What "private" has to mean here, checked one claim at a time.
 *
 * The claims are the ones the phase's DoD line makes — an ephemeral session that leaves nothing on
 * close, with the sensitive-site lockout still holding — plus the two writes that would have leaked to
 * disk despite the in-memory partition, because they are separate stores the partition does not cover.
 */
beforeEach(() => {
  vi.clearAllMocks();
  getDb.mockReturnValue({ fake: 'db' });
});

describe('what the in-memory partition does NOT cover', () => {
  /**
   * The partition keeps cookies and cache off disk. It does not touch these two, which are separate
   * SQLite stores written by the tab model — so each needs its own guard, and each is a place a
   * "private" window would otherwise have left a permanent record of exactly what was browsed.
   */
  it('history is a separate store, so the write is guarded, not the partition', () => {
    // Guarding the WRITE rather than deleting on close is deliberate: record-then-delete leaves the row
    // on disk in between, and a crash in between leaves it there for good.
    const wiring = readSource('tabs-view-wiring.ts');
    const navigate = wiring.slice(wiring.indexOf("wc.on('did-navigate'"));
    expect(navigate).toContain('if (host.isPrivate) return;');
    expect(wiring).toContain('if (!host.isPrivate) HistoryStore.setTitle');
  });

  it('the session snapshot is another, so private windows are filtered out of it', () => {
    // Without this the snapshot would have put every private URL into SQLite and then REOPENED those
    // tabs on the next launch, in an ordinary window.
    const manager = readSource('tabs-manager-base.ts');
    const persist = manager.slice(manager.indexOf('static persistNow'));
    expect(persist).toContain('.filter((wt) => !wt.isPrivate)');
  });
});

describe('discarding', () => {
  it('waits for the LAST private window, not the first', () => {
    // Two private windows share one throwaway identity (Chrome's model, and what a user expects when
    // they open a link from one into another). Wiping on the first close would sign them out of the
    // window still in front of them.
    const windows = readSource('browser-windows.ts');
    expect(windows).toContain('!TabManager.hasPrivateWindow()');
    expect(windows).toContain('BrowsingSessions.discardPrivate()');
  });

  it('forgets the session object as well as wiping it', () => {
    // A retained `Session` keeps its in-memory jar alive, so the next private window would resume the
    // previous identity — the one thing a disposable mode may never do.
    const sessions = readSource('network/browsing-sessions.electron.ts');
    const discard = sessions.slice(sessions.indexOf('async discardPrivate'));
    expect(discard).toContain('live.delete(partition)');
    expect(discard).toContain('appliedPairs.delete');
  });

  it('routes private sessions through the attacher plane like every other session', () => {
    // A private session that skipped it would have no ad/tracker filtering, no download quarantine and
    // no User-Agent override: a privacy regression inside the privacy feature.
    const sessions = readSource('network/browsing-sessions.electron.ts');
    const priv = sessions.slice(
      sessions.indexOf('  private()'),
      sessions.indexOf('privateSessions'),
    );
    expect(priv).toContain('BrowsingSessions.ensure(key)');
  });
});

describe('the sensitive-site lockout still holds', () => {
  it('is decided by URL, so a private window cannot route around it', () => {
    // The lockout's inputs are the URL and nothing else — no session, no partition, no window. That is
    // why it survives here, and this asserts the property rather than trusting it.
    isSensitiveSite.mockReturnValue(true);
    expect(isSensitiveSite('https://www.garanti.com.tr/')).toBe(true);
    expect(isSensitiveSite).toHaveBeenCalledWith('https://www.garanti.com.tr/');
    // One argument: had it taken a session or a partition, a private window would be a different
    // input and this test would be the place that noticed.
    expect(isSensitiveSite.mock.calls[0]).toHaveLength(1);
  });
});

describe('the partition itself', () => {
  it('is in-memory for every route the profile can be on', () => {
    expect(PRIVATE_PARTITION.startsWith('persist:')).toBe(false);
    expect(privatePartitionKey({ connectionId: 'tor' }).startsWith('persist:')).toBe(false);
    expect(isPrivatePartition(privatePartitionKey({ connectionId: 'tor' }))).toBe(true);
  });
});

/**
 * Reads a main-process source file. These four assertions are about WIRING — that a guard exists at a
 * specific point in a specific file — which no unit test of the surrounding function can express,
 * because the functions involved need a live BrowserWindow, a WebContentsView and a real Electron
 * session. Reading the source is the honest way to state "this line is load-bearing": it is a weaker
 * check than executing it, and it is recorded as such rather than dressed up as behavioural coverage.
 */
function readSource(relative: string): string {
  return readFileSync(join(__dirname, relative), 'utf8');
}

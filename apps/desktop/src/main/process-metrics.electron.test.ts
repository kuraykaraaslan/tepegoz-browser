import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeWc = {
  isDestroyed: () => boolean;
  getOSProcessId: () => number;
  forcefullyCrashRenderer: ReturnType<typeof vi.fn>;
};
type FakeWt = {
  getState: () => { tabs: { id: string; title: string; url: string; discarded?: boolean }[] };
  webContentsForTab: (id: string) => FakeWc | null;
};
const tabsMgr = vi.hoisted(() => ({ windows: [] as unknown[] }));
vi.mock('./tabs', () => ({ default: { all: () => tabsMgr.windows } }));

const appMock = vi.hoisted(() => ({ getAppMetrics: vi.fn<() => unknown[]>(() => []) }));
vi.mock('electron', () => ({ app: appMock }));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const { mapAppMetrics, collectProcessSnapshot, endTabProcess } =
  await import('./process-metrics.electron');

beforeEach(() => {
  vi.clearAllMocks();
  tabsMgr.windows = [];
  appMock.getAppMetrics.mockReturnValue([]);
});

const cpu = (percentCPUUsage: number) => ({ percentCPUUsage });
const mem = (workingSetSize: number) => ({ workingSetSize });

describe('mapAppMetrics', () => {
  it('names a renderer by the tab it hosts and carries the tab id', () => {
    const rows = mapAppMetrics(
      [{ pid: 42, type: 'Tab', cpu: cpu(5), memory: mem(1024) }],
      [{ tabId: 't-1', title: 'My Page', url: 'https://ex.com/', discarded: false, pid: 42 }],
    );
    expect(rows).toEqual([
      {
        pid: 42,
        kind: 'tab',
        label: 'My Page',
        cpuPercent: 5,
        memoryBytes: 1024 * 1024,
        tabId: 't-1',
        discarded: false,
      },
    ]);
  });

  it('falls back to the host when a tab has no title yet', () => {
    const [row] = mapAppMetrics(
      [{ pid: 7, type: 'Tab', cpu: cpu(0), memory: mem(0) }],
      [{ tabId: 't', title: '   ', url: 'https://sub.example.org/x', discarded: false, pid: 7 }],
    );
    expect(row?.label).toBe('sub.example.org');
  });

  it('classifies browser / GPU / utility infrastructure processes', () => {
    const rows = mapAppMetrics(
      [
        { pid: 1, type: 'Browser', cpu: cpu(2), memory: mem(500) },
        { pid: 2, type: 'GPU', cpu: cpu(1), memory: mem(300) },
        { pid: 3, type: 'Utility', cpu: cpu(0), memory: mem(100), name: 'Network Service' },
      ],
      [],
    );
    expect(rows.map((r) => [r.kind, r.label])).toEqual([
      ['browser', 'Browser'],
      ['gpu', 'GPU'],
      ['utility', 'Network Service'],
    ]);
  });

  it('rounds CPU to one decimal and converts working-set KiB → bytes', () => {
    const [row] = mapAppMetrics(
      [{ pid: 9, type: 'Browser', cpu: cpu(3.456), memory: mem(2048) }],
      [],
    );
    expect(row?.cpuPercent).toBe(3.5);
    expect(row?.memoryBytes).toBe(2048 * 1024);
  });

  it('adds a discarded tab as a zero row with pid 0, after the real processes', () => {
    const rows = mapAppMetrics(
      [{ pid: 1, type: 'Browser', cpu: cpu(0), memory: mem(0) }],
      [
        { tabId: 'live', title: 'Live', url: 'https://a/', discarded: false, pid: null },
        { tabId: 'asleep', title: 'Asleep', url: 'https://b/', discarded: true, pid: null },
      ],
    );
    // The live tab has no metrics entry AND no pid → it produces no row; only the discarded one does.
    expect(rows.filter((r) => r.kind === 'tab')).toEqual([
      {
        pid: 0,
        kind: 'tab',
        label: 'Asleep',
        cpuPercent: 0,
        memoryBytes: 0,
        tabId: 'asleep',
        discarded: true,
      },
    ]);
  });

  it('labels a titleless tab whose URL will not parse with the raw URL string', () => {
    const [row] = mapAppMetrics(
      [{ pid: 5, type: 'Tab', cpu: cpu(0), memory: mem(0) }],
      [{ tabId: 't', title: '', url: 'not::a::url', discarded: false, pid: 5 }],
    );
    expect(row?.label).toBe('not::a::url');
  });

  it('clamps a negative working-set to zero and falls back to serviceName then type for a label', () => {
    const rows = mapAppMetrics(
      [
        { pid: 1, type: 'Utility', cpu: cpu(0), memory: mem(-999), serviceName: 'Audio' },
        { pid: 2, type: 'Pdf', cpu: cpu(0), memory: mem(0) },
      ],
      [],
    );
    expect(rows[0]).toMatchObject({ label: 'Audio', memoryBytes: 0 });
    expect(rows[1]?.label).toBe('Pdf');
  });
});

describe('collectProcessSnapshot', () => {
  it('joins app metrics against every window’s live tabs, resolving each renderer pid', () => {
    const wc: FakeWc = {
      isDestroyed: () => false,
      getOSProcessId: () => 321,
      forcefullyCrashRenderer: vi.fn(),
    };
    tabsMgr.windows = [
      {
        getState: () => ({
          tabs: [{ id: 't1', title: 'Docs', url: 'https://d/', discarded: false }],
        }),
        webContentsForTab: () => wc,
      } satisfies FakeWt,
    ];
    appMock.getAppMetrics.mockReturnValue([
      { pid: 321, type: 'Tab', cpu: { percentCPUUsage: 2 }, memory: { workingSetSize: 4 } },
    ]);

    const snap = collectProcessSnapshot();
    expect(snap.rows).toEqual([
      expect.objectContaining({ pid: 321, kind: 'tab', label: 'Docs', tabId: 't1' }),
    ]);
    expect(typeof snap.sampledAt).toBe('number');
  });

  it('treats a destroyed / missing / throwing / non-positive pid webContents as no renderer', () => {
    const throwingWc: FakeWc = {
      isDestroyed: () => false,
      getOSProcessId: () => {
        throw new Error('gone');
      },
      forcefullyCrashRenderer: vi.fn(),
    };
    const zeroWc: FakeWc = {
      isDestroyed: () => false,
      getOSProcessId: () => 0,
      forcefullyCrashRenderer: vi.fn(),
    };
    tabsMgr.windows = [
      {
        getState: () => ({
          tabs: [
            { id: 'a', title: 'A', url: 'https://a/', discarded: false },
            { id: 'b', title: 'B', url: 'https://b/', discarded: false },
            { id: 'c', title: 'C', url: 'https://c/', discarded: true },
          ],
        }),
        webContentsForTab: (id: string) => (id === 'a' ? null : id === 'b' ? throwingWc : zeroWc),
      } satisfies FakeWt,
    ];
    appMock.getAppMetrics.mockReturnValue([]);

    const snap = collectProcessSnapshot();
    // a/b resolve to no pid → no row; c is discarded → one zero row.
    expect(snap.rows).toEqual([expect.objectContaining({ pid: 0, tabId: 'c', discarded: true })]);
  });
});

describe('endTabProcess', () => {
  it('force-crashes the matching tab renderer and logs it', () => {
    const crash = vi.fn();
    tabsMgr.windows = [
      {
        getState: () => ({ tabs: [] }),
        webContentsForTab: (id: string) =>
          id === 'kill-me'
            ? { isDestroyed: () => false, getOSProcessId: () => 1, forcefullyCrashRenderer: crash }
            : null,
      } satisfies FakeWt,
    ];
    endTabProcess('kill-me');
    expect(crash).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('Task manager: ending tab renderer', {
      tabId: 'kill-me',
    });
  });

  it('is a no-op for an unknown or already-destroyed tab', () => {
    const crash = vi.fn();
    tabsMgr.windows = [
      {
        getState: () => ({ tabs: [] }),
        webContentsForTab: () => ({
          isDestroyed: () => true,
          getOSProcessId: () => 1,
          forcefullyCrashRenderer: crash,
        }),
      } satisfies FakeWt,
    ];
    endTabProcess('whatever');
    expect(crash).not.toHaveBeenCalled();
  });
});

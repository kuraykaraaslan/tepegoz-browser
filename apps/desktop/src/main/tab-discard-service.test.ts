import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabInfo } from '@tepegoz/desktop-ipc';

const getAll = vi.fn();
const all = vi.fn();

vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: (...args: unknown[]) => getAll(...args) as unknown },
}));
vi.mock('./tabs', () => ({
  default: { all: (...args: unknown[]) => all(...args) as unknown },
}));

const { sweep } = await import('./tab-discard-service');

/** A fake `WindowTabs` exposing just what `sweep` reads: the live state and the two discard primitives. */
function makeWindowTabs(tabs: Partial<TabInfo>[], opts?: { undiscardable?: Set<string> }) {
  const fullTabs = tabs.map((t) => ({
    id: t.id!,
    title: t.title ?? '',
    url: t.url ?? 'https://example.com/',
    isLoading: false,
    faviconUrl: null,
    pinned: false,
    groupId: null,
    ...t,
  }));
  return {
    getState: () => ({
      tabs: fullTabs,
      groups: [],
      activeId: null,
      canGoBack: false,
      canGoForward: false,
      isPrivate: false,
    }),
    canDiscard: (id: string) => !(opts?.undiscardable?.has(id) ?? false),
    discardTab: vi.fn(),
  };
}

/**
 * The auto-discard sweep. What's worth pinning: it only touches tabs `canDiscard` allows, it measures
 * an UNBROKEN stretch in the background (not a running total), it resets that clock the moment a tab
 * stops being eligible, and it forgets closed tabs instead of leaking memory of its own across a long
 * session — the exact kind of bug this feature exists to prevent, in the code that implements it.
 */
describe('sweep', () => {
  beforeEach(() => {
    getAll.mockReset();
    all.mockReset();
    getAll.mockReturnValue({ tabDiscardEnabled: true, tabDiscardIdleMinutes: 30 });
  });

  it('does nothing when the preference is off', () => {
    getAll.mockReturnValue({ tabDiscardEnabled: false, tabDiscardIdleMinutes: 30 });
    const wt = makeWindowTabs([{ id: 'a' }]);
    all.mockReturnValue([wt]);
    sweep(0);
    sweep(60 * 60_000);
    expect(wt.discardTab).not.toHaveBeenCalled();
  });

  it('discards a tab only after it has sat past the idle threshold', () => {
    const wt = makeWindowTabs([{ id: 'a' }]);
    all.mockReturnValue([wt]);
    const idleMs = 30 * 60_000;

    sweep(0); // first sighting — starts the clock, does not discard
    expect(wt.discardTab).not.toHaveBeenCalled();

    sweep(idleMs - 1000); // just short of the threshold
    expect(wt.discardTab).not.toHaveBeenCalled();

    sweep(idleMs); // threshold reached
    expect(wt.discardTab).toHaveBeenCalledWith('a');
    expect(wt.discardTab).toHaveBeenCalledTimes(1);
  });

  it('never calls discardTab for an id canDiscard refuses', () => {
    const wt = makeWindowTabs([{ id: 'active' }], { undiscardable: new Set(['active']) });
    all.mockReturnValue([wt]);
    sweep(0);
    sweep(60 * 60_000);
    expect(wt.discardTab).not.toHaveBeenCalled();
  });

  it('resets the clock once a tab stops being an eligible candidate, so a later re-scan starts over', () => {
    const idleMs = 30 * 60_000;
    let eligible = true;
    const discardTab = vi.fn();
    const wt = {
      getState: () => ({
        tabs: [{ id: 'a', title: '', url: '', isLoading: false, faviconUrl: null, pinned: false, groupId: null }],
        groups: [],
        activeId: null,
        canGoBack: false,
        canGoForward: false,
        isPrivate: false,
      }),
      canDiscard: () => eligible,
      discardTab,
    };
    all.mockReturnValue([wt]);

    sweep(0); // starts the clock
    eligible = false;
    sweep(idleMs); // ineligible mid-stretch — must NOT discard, and must clear the clock
    expect(discardTab).not.toHaveBeenCalled();

    eligible = true;
    sweep(idleMs + 1000); // freshly eligible again — one tick in, not yet past a NEW threshold
    expect(discardTab).not.toHaveBeenCalled();

    sweep(idleMs + 1000 + idleMs);
    expect(discardTab).toHaveBeenCalledTimes(1);
  });

  it('forgets a tab that closed instead of leaking it across scans forever', () => {
    const wt1 = makeWindowTabs([{ id: 'a' }]);
    all.mockReturnValue([wt1]);
    sweep(0);

    // The tab is gone from the next scan (closed).
    const wt2 = makeWindowTabs([]);
    all.mockReturnValue([wt2]);
    sweep(1000);

    // If it reappeared with the SAME id, it must be treated as a fresh sighting, not as having already
    // waited out the threshold from before it closed.
    const wt3 = makeWindowTabs([{ id: 'a' }]);
    all.mockReturnValue([wt3]);
    sweep(30 * 60_000 + 2000);
    expect(wt3.discardTab).not.toHaveBeenCalled();
  });
});

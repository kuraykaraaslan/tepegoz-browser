import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SafeBrowsingRefreshScheduler,
  type RefreshSchedulerPorts,
} from './safe-browsing-refresh-scheduler';

function make(over: Partial<RefreshSchedulerPorts> = {}) {
  const refresh = over.refresh ?? vi.fn<() => Promise<void>>(() => Promise.resolve());
  const ports: RefreshSchedulerPorts = {
    lastRefreshAt: () => null,
    now: () => 0,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => {
      clearTimeout(h as ReturnType<typeof setTimeout>);
    },
    enabled: () => true,
    ...over,
    refresh,
  };
  return { ports, refresh };
}

const INTERVAL = 6 * 60 * 60 * 1000;
const flush = () => Promise.resolve();

describe('SafeBrowsingRefreshScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('refreshes immediately on first launch when nothing is stored', async () => {
    const { ports, refresh } = make({ lastRefreshAt: () => null });
    new SafeBrowsingRefreshScheduler(ports).start();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('waits out the remaining interval when the stored data is fresh', async () => {
    const { ports, refresh } = make({ lastRefreshAt: () => 0, now: () => INTERVAL - 1000 });
    new SafeBrowsingRefreshScheduler(ports).start();
    await vi.advanceTimersByTimeAsync(999);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('reschedules at the full interval after a success', async () => {
    const { ports, refresh } = make({ lastRefreshAt: () => null });
    new SafeBrowsingRefreshScheduler(ports).start();
    await vi.advanceTimersByTimeAsync(0);
    await flush();
    expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('backs off exponentially on repeated failure, capped', async () => {
    const { ports, refresh } = make({
      refresh: vi.fn<() => Promise<void>>(() => Promise.reject(new Error('offline'))),
      lastRefreshAt: () => null,
    });
    new SafeBrowsingRefreshScheduler(ports, { minBackoffMs: 1000, maxBackoffMs: 4000 }).start();

    await vi.advanceTimersByTimeAsync(0);
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(refresh).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(4000);
    await flush();
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it('does not refresh while disabled, but keeps re-checking for a toggle-on', async () => {
    let on = false;
    const { ports, refresh } = make({ enabled: () => on, lastRefreshAt: () => null });
    new SafeBrowsingRefreshScheduler(ports, { intervalMs: 1000 }).start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).not.toHaveBeenCalled();
    on = true;
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('stop() cancels a pending refresh', async () => {
    const { ports, refresh } = make({ lastRefreshAt: () => 0, now: () => 0 });
    const s = new SafeBrowsingRefreshScheduler(ports);
    s.start();
    s.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL * 2);
    expect(refresh).not.toHaveBeenCalled();
  });
});

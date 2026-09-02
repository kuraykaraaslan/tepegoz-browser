import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `task-service-support` — the pure helpers + two side-effecting ones shared across the task-service
 * concern modules. Pinned: the trigger key/type/source derivations, `hashText`, `computeNextRunAt`
 * (interval via `nextIntervalRunAt`, enabled pageChange as `at + everyMinutes`, disabled skipped,
 * min of many, undefined when none); `readPageChangeText` (blocked tab → 409, selector vs innerText
 * script, non-string coerced to '', tab always closed); and `appendAudit` (no-op without a DB,
 * system/redacted journal entry, append failure swallowed).
 */

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: logger }));

const nextIntervalRunAt = vi.hoisted(() => vi.fn((): number | null => 5_000));
vi.mock('@tepegoz/tasks', () => ({ nextIntervalRunAt }));

const journal = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: journal }));

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const wc = vi.hoisted(() => ({
  once: vi.fn((_ev: string, cb: () => void) => cb()), // resolve waitForLoad immediately
  removeListener: vi.fn(),
  isDestroyed: vi.fn(() => false),
  getURL: vi.fn(() => 'https://watch.test/final'),
  executeJavaScript: vi.fn<(script: string, gesture?: boolean) => Promise<unknown>>(() =>
    Promise.resolve('page text'),
  ),
}));
const tm = vi.hoisted(() => ({
  createTab: vi.fn((): string | null => 'wtab'),
  webContentsForTab: vi.fn((): unknown => null),
  closeTab: vi.fn(),
}));
vi.mock('../tabs', () => ({ default: tm }));

const support = await import('./task-service-support.electron');

beforeEach(() => {
  vi.clearAllMocks();
  db.value = { __db: true };
  nextIntervalRunAt.mockReturnValue(5_000);
  tm.createTab.mockReturnValue('wtab');
  tm.webContentsForTab.mockReturnValue(wc);
  wc.isDestroyed.mockReturnValue(false);
  wc.executeJavaScript.mockResolvedValue('page text');
});

describe('trigger derivations', () => {
  it('triggerKey encodes type + index (+ url/source)', () => {
    expect(support.triggerKey({ type: 'manual' } as never, 0)).toBe('manual:0');
    expect(support.triggerKey({ type: 'interval' } as never, 1)).toBe('interval:1');
    expect(support.triggerKey({ type: 'pageChange', url: 'u' } as never, 2)).toBe('pageChange:2:u');
    expect(support.triggerKey({ type: 'external', source: 'gh' } as never, 3)).toBe(
      'external:gh:3',
    );
  });

  it('triggerType is the discriminant; triggerSource is the url / source / undefined', () => {
    expect(support.triggerType({ type: 'interval' } as never)).toBe('interval');
    expect(support.triggerSource({ type: 'pageChange', url: 'u' } as never)).toBe('u');
    expect(support.triggerSource({ type: 'external', source: 'gh' } as never)).toBe('gh');
    expect(support.triggerSource({ type: 'manual' } as never)).toBeUndefined();
  });
});

it('hashText is sha256 hex', () => {
  expect(support.hashText('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
});

describe('computeNextRunAt', () => {
  it('uses nextIntervalRunAt for interval triggers', () => {
    expect(support.computeNextRunAt({ triggers: [{ type: 'interval' }] } as never, 100)).toBe(
      5_000,
    );
  });

  it('adds everyMinutes for an enabled pageChange and skips a disabled one', () => {
    expect(
      support.computeNextRunAt(
        {
          triggers: [
            { type: 'pageChange', enabled: true, everyMinutes: 10 },
            { type: 'pageChange', enabled: false, everyMinutes: 1 },
          ],
        } as never,
        1_000,
      ),
    ).toBe(1_000 + 10 * 60 * 1000);
  });

  it('returns the soonest of several, and undefined when nothing schedules', () => {
    nextIntervalRunAt.mockReturnValue(9_999_999);
    expect(
      support.computeNextRunAt(
        {
          triggers: [{ type: 'interval' }, { type: 'pageChange', enabled: true, everyMinutes: 1 }],
        } as never,
        0,
      ),
    ).toBe(60_000);
    nextIntervalRunAt.mockReturnValue(null);
    expect(
      support.computeNextRunAt(
        { triggers: [{ type: 'interval' }, { type: 'manual' }] } as never,
        0,
      ),
    ).toBeUndefined();
  });
});

describe('readPageChangeText', () => {
  it('throws 409 when the watcher tab is blocked', async () => {
    tm.createTab.mockReturnValue(null);
    await expect(
      support.readPageChangeText({ url: 'https://watch.test/' } as never),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('runs a querySelector script when a selector is set, else reads innerText', async () => {
    await support.readPageChangeText({ url: 'https://watch.test/', selector: '#price' } as never);
    expect(wc.executeJavaScript.mock.calls[0]![0]).toContain('document.querySelector("#price")');

    await support.readPageChangeText({ url: 'https://watch.test/' } as never);
    expect(wc.executeJavaScript.mock.calls[1]![0]).toContain('document.body.innerText');
  });

  it('returns the live URL + text, coercing a non-string result to empty, and closes the tab', async () => {
    wc.executeJavaScript.mockResolvedValue(42);
    const out = await support.readPageChangeText({ url: 'https://watch.test/' } as never);
    expect(out).toEqual({ url: 'https://watch.test/final', text: '' });
    expect(tm.closeTab).toHaveBeenCalledWith('wtab');
  });

  it('throws 409 (and still closes the tab) when the tab is gone after load', async () => {
    wc.isDestroyed.mockReturnValue(true);
    await expect(
      support.readPageChangeText({ url: 'https://watch.test/' } as never),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(tm.closeTab).toHaveBeenCalledWith('wtab');
  });
});

describe('appendAudit', () => {
  it('is a no-op without a database', () => {
    db.value = null;
    support.appendAudit('TaskRan' as never, { a: 1 }, 'corr-1');
    expect(journal.append).not.toHaveBeenCalled();
  });

  it('writes a redacted system journal entry', () => {
    support.appendAudit('TaskRan' as never, { a: 1 }, 'corr-1');
    expect(journal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({
        type: 'TaskRan',
        actor: 'system',
        redacted: true,
        correlationId: 'corr-1',
        payload: { a: 1 },
      }),
    );
  });

  it('swallows an append failure with a warning', () => {
    journal.append.mockImplementation(() => {
      throw new Error('io');
    });
    expect(() => support.appendAudit('TaskRan' as never, {}, 'c')).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith('Task audit append failed', expect.anything());
  });
});

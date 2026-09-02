import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Automatic retry of a transfer the network dropped, while the app runs. The policy itself
 * (`planDownloadRetry`) is pure and tested in `@tepegoz/downloads`; what this file adds is the wiring
 * — it fires only for `interrupted`, it parks the row at `paused` (never a `failed` that flickers), it
 * goes through the SAME `resumeInterrupted` path a manual resume takes, and a timer that fires into a
 * record that has since been cancelled or cleared does nothing.
 */

const records = new Map<string, Record<string, unknown>>();
const recordsRef = records;

const store = vi.hoisted(() => ({
  patch: vi.fn((_state: unknown, id: string, p: Record<string, unknown>) => {
    const cur = recordsRef.get(id);
    if (cur !== undefined) recordsRef.set(id, { ...cur, ...p });
  }),
}));
const resume = vi.hoisted(() => ({
  resumeInterrupted: vi.fn<
    (...args: unknown[]) => { action: 'resume' | 'restart'; offset: number; reason: string }
  >(() => ({ action: 'resume', offset: 10, reason: 'ok' })),
}));

vi.mock('./download-service-store.electron', () => store);
vi.mock('./download-service-resume.electron', () => resume);
vi.mock('@tepegoz/libs', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { scheduleAutoRetry, forget, forgetAll, attemptsFor } = await import(
  './download-service-autoretry.electron'
);

function seed(id: string, over: Record<string, unknown> = {}): void {
  records.set(id, { id, status: 'in_progress', canResume: true, ...over });
}
const state = { records } as unknown as Parameters<typeof scheduleAutoRetry>[0];

beforeEach(() => {
  vi.useFakeTimers();
  records.clear();
  forgetAll();
  vi.clearAllMocks();
});
afterEach(() => {
  forgetAll();
  vi.useRealTimers();
});

describe('scheduleAutoRetry', () => {
  it('never retries a user cancel', () => {
    seed('d1');
    expect(scheduleAutoRetry(state, 'd1', 'cancelled')).toBe(false);
    expect(attemptsFor('d1')).toBe(0);
    expect(store.patch).not.toHaveBeenCalled();
  });

  it('never retries a completed transfer', () => {
    seed('d2');
    expect(scheduleAutoRetry(state, 'd2', 'completed')).toBe(false);
  });

  it('parks an interrupted transfer at paused and schedules a retry', () => {
    seed('d3');
    expect(scheduleAutoRetry(state, 'd3', 'interrupted')).toBe(true);
    expect(attemptsFor('d3')).toBe(1);
    expect(store.patch).toHaveBeenCalledWith(state, 'd3', { status: 'paused', error: undefined });
    // Not resumed yet — the backoff has not elapsed.
    expect(resume.resumeInterrupted).not.toHaveBeenCalled();
  });

  it('goes through resumeInterrupted when the backoff elapses', () => {
    seed('d4', { status: 'in_progress' });
    scheduleAutoRetry(state, 'd4', 'interrupted');
    records.set('d4', { ...records.get('d4')!, status: 'paused' });

    vi.advanceTimersByTime(1_000); // first backoff is 1s
    expect(resume.resumeInterrupted).toHaveBeenCalledTimes(1);
    // A clean resume leaves the row alone — no `failed` written by the retry path.
    expect(records.get('d4')!.status).toBe('paused');
  });

  it('marks the row failed when the resumed bytes cannot be trusted', () => {
    seed('d5', { status: 'paused' });
    resume.resumeInterrupted.mockReturnValueOnce({
      action: 'restart',
      offset: 0,
      reason: 'byte-count-disagrees',
    });
    scheduleAutoRetry(state, 'd5', 'interrupted');
    vi.advanceTimersByTime(1_000);

    expect(records.get('d5')!.status).toBe('failed');
    expect(records.get('d5')!.error).toBe('byte-count-disagrees');
    expect(attemptsFor('d5')).toBe(0); // forgotten
  });

  it('does nothing when the timer fires into a record that is gone or no longer paused', () => {
    seed('d6', { status: 'paused' });
    scheduleAutoRetry(state, 'd6', 'interrupted');
    records.delete('d6'); // user cleared it during the wait
    vi.advanceTimersByTime(60_000);
    expect(resume.resumeInterrupted).not.toHaveBeenCalled();
  });

  it('marks the row failed when resumeInterrupted throws', () => {
    seed('d7', { status: 'paused' });
    resume.resumeInterrupted.mockImplementationOnce(() => {
      throw new Error('net down');
    });
    scheduleAutoRetry(state, 'd7', 'interrupted');
    vi.advanceTimersByTime(1_000);
    expect(records.get('d7')!.status).toBe('failed');
    expect(attemptsFor('d7')).toBe(0);
  });

  it('stops after the retry budget is exhausted', () => {
    seed('d8', { status: 'paused' });
    // Four retries scheduled; the fifth call is refused.
    for (let i = 0; i < 4; i++) {
      expect(scheduleAutoRetry(state, 'd8', 'interrupted')).toBe(true);
      records.set('d8', { ...records.get('d8')!, status: 'paused' });
    }
    expect(attemptsFor('d8')).toBe(4);
    expect(scheduleAutoRetry(state, 'd8', 'interrupted')).toBe(false);
    expect(attemptsFor('d8')).toBe(0); // budget-exhausted forgets it
  });
});

describe('forget', () => {
  it('cancels a pending retry so its timer never resumes', () => {
    seed('d9', { status: 'paused' });
    scheduleAutoRetry(state, 'd9', 'interrupted');
    forget('d9');
    vi.advanceTimersByTime(60_000);
    expect(resume.resumeInterrupted).not.toHaveBeenCalled();
    expect(attemptsFor('d9')).toBe(0);
  });
});

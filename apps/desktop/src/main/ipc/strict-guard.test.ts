import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The regression guard S6 PR5 exists to be (S6 PR5).
 *
 * `setStrictMode` shipped in C7 and was **unreachable** — the code existed, the mode could not be turned
 * on, and nothing failed. That is the failure this test is shaped against: not "does strict mode redact
 * correctly" (content-guard's own tests cover that), but **"is the setter still reached from the
 * preference"**. Re-orphaning it is a silent regression, so it needs a loud test.
 */

const setStrictMode = vi.fn();
const getAll = vi.fn((): { agentStrictGuard: boolean } => ({ agentStrictGuard: false }));

vi.mock('@tepegoz/tool-executor', () => ({ setStrictMode }));
vi.mock('@tepegoz/preferences', () => ({ default: { getAll, update: vi.fn() } }));
vi.mock('@tepegoz/libs', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  setStrictMode.mockClear();
  getAll.mockClear();
});
afterEach(() => {
  vi.resetModules();
});

describe('the hardened-guard preference reaches setStrictMode', () => {
  it('applies the persisted posture, so a preference is never merely stored', async () => {
    getAll.mockReturnValue({ agentStrictGuard: true });
    const { applyStrictGuard } = await import('./strict-guard');
    applyStrictGuard();
    expect(setStrictMode).toHaveBeenCalledWith(true);
  });

  it('applies OFF just as explicitly — the default must be asserted, not assumed', async () => {
    getAll.mockReturnValue({ agentStrictGuard: false });
    const { applyStrictGuard } = await import('./strict-guard');
    applyStrictGuard();
    expect(setStrictMode).toHaveBeenCalledWith(false);
  });

  it('reads the preference each time, so a toggle takes effect without a restart', async () => {
    const { applyStrictGuard } = await import('./strict-guard');
    getAll.mockReturnValue({ agentStrictGuard: false });
    applyStrictGuard();
    getAll.mockReturnValue({ agentStrictGuard: true });
    applyStrictGuard();
    expect(setStrictMode).toHaveBeenNthCalledWith(1, false);
    expect(setStrictMode).toHaveBeenNthCalledWith(2, true);
  });
});

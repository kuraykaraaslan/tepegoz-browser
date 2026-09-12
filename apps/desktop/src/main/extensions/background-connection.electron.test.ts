import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `BackgroundConnectionService` — main-process wiring for the shared `BackgroundConnectionSupervisor`
 * (the "background-connection supervisor" shared prerequisite `phases/extensions/README.md` owed).
 * The supervisor's own fan-out / isolation behavior is unit-tested in `@tepegoz/extension-host`
 * directly; this pins only the wiring: `provide` reaches the real supervisor, `Logger.info` is the
 * log sink, and each of the four lifecycle methods delegates.
 */

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const { default: BackgroundConnectionService } = await import('./background-connection.electron');

beforeEach(() => {
  vi.clearAllMocks();
});

function provider(id: string) {
  return {
    extensionId: id,
    init: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    reconcile: vi.fn(() => Promise.resolve()),
    notifyEgressChange: vi.fn(),
  };
}

describe('BackgroundConnectionService', () => {
  it('provide() registers with the real supervisor, and every lifecycle method fans out to it', async () => {
    const chat = provider('com.tepegoz.chat');
    BackgroundConnectionService.provide(chat);

    await BackgroundConnectionService.init();
    expect(chat.init).toHaveBeenCalledTimes(1);

    await BackgroundConnectionService.reconcile();
    expect(chat.reconcile).toHaveBeenCalledTimes(1);

    BackgroundConnectionService.notifyEgressChange();
    expect(chat.notifyEgressChange).toHaveBeenCalledTimes(1);

    await BackgroundConnectionService.stop();
    expect(chat.stop).toHaveBeenCalledTimes(1);
  });

  it("a provider's failure is logged through the real Logger, not thrown past the caller", async () => {
    const broken = provider('com.tepegoz.broken');
    broken.init.mockImplementation(() => Promise.reject(new Error('socket exploded')));
    BackgroundConnectionService.provide(broken);

    await expect(BackgroundConnectionService.init()).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      'background-connection init failed',
      expect.objectContaining({ ext: 'com.tepegoz.broken' }),
    );
  });
});

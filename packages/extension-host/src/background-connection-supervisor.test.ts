import { describe, expect, it, vi } from 'vitest';
import { BackgroundConnectionSupervisor, type BackgroundConnectionProvider } from './background-connection-supervisor';

function provider(over: Partial<BackgroundConnectionProvider> = {}): BackgroundConnectionProvider {
  return {
    extensionId: 'com.tepegoz.demo',
    init: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    reconcile: vi.fn(() => Promise.resolve()),
    notifyEgressChange: vi.fn(),
    ...over,
  };
}

describe('BackgroundConnectionSupervisor', () => {
  it('fans init/stop/reconcile/notifyEgressChange out to every registered provider', async () => {
    const sup = new BackgroundConnectionSupervisor();
    const chat = provider({ extensionId: 'com.tepegoz.chat' });
    const mail = provider({ extensionId: 'com.tepegoz.mail' });
    sup.provide(chat);
    sup.provide(mail);

    await sup.init();
    expect(chat.init).toHaveBeenCalledTimes(1);
    expect(mail.init).toHaveBeenCalledTimes(1);

    sup.notifyEgressChange();
    expect(chat.notifyEgressChange).toHaveBeenCalledTimes(1);
    expect(mail.notifyEgressChange).toHaveBeenCalledTimes(1);

    await sup.reconcile();
    expect(chat.reconcile).toHaveBeenCalledTimes(1);
    expect(mail.reconcile).toHaveBeenCalledTimes(1);

    await sup.stop();
    expect(chat.stop).toHaveBeenCalledTimes(1);
    expect(mail.stop).toHaveBeenCalledTimes(1);

    expect(sup.providerIds()).toEqual(['com.tepegoz.chat', 'com.tepegoz.mail']);
  });

  it('is a no-op with nothing registered — every call resolves cleanly', async () => {
    const sup = new BackgroundConnectionSupervisor();
    await expect(sup.init()).resolves.toBeUndefined();
    await expect(sup.stop()).resolves.toBeUndefined();
    await expect(sup.reconcile()).resolves.toBeUndefined();
    expect(() => sup.notifyEgressChange()).not.toThrow();
  });

  it("one provider's failure is isolated — a broken mail account must never stop chat's lifecycle call", async () => {
    const log = vi.fn();
    const sup = new BackgroundConnectionSupervisor({ log });
    const brokenInit = vi.fn(() => Promise.reject(new Error('mail socket exploded')));
    const mail = provider({ extensionId: 'com.tepegoz.mail', init: brokenInit });
    const chat = provider({ extensionId: 'com.tepegoz.chat' });
    sup.provide(mail);
    sup.provide(chat);

    await expect(sup.init()).resolves.toBeUndefined(); // never rejects/throws past the caller
    expect(chat.init).toHaveBeenCalledTimes(1); // ran anyway
    expect(log).toHaveBeenCalledWith('background-connection init failed', expect.objectContaining({ ext: 'com.tepegoz.mail' }));
    const [, meta] = log.mock.calls[0] as [string, { err: string }];
    expect(meta.err).toContain('mail socket exploded');
  });

  it('isolates a synchronous notifyEgressChange throw the same way', () => {
    const log = vi.fn();
    const sup = new BackgroundConnectionSupervisor({ log });
    const broken = provider({
      extensionId: 'com.tepegoz.mail',
      notifyEgressChange: () => {
        throw new Error('boom');
      },
    });
    const chat = provider({ extensionId: 'com.tepegoz.chat' });
    sup.provide(broken);
    sup.provide(chat);

    expect(() => sup.notifyEgressChange()).not.toThrow();
    expect(chat.notifyEgressChange).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'background-connection notifyEgressChange failed',
      expect.objectContaining({ ext: 'com.tepegoz.mail' }),
    );
  });

  it('isolates a stop/reconcile rejection the same way, per phase', async () => {
    const log = vi.fn();
    const sup = new BackgroundConnectionSupervisor({ log });
    const mail = provider({
      extensionId: 'com.tepegoz.mail',
      stop: vi.fn(() => Promise.reject(new Error('stop failed'))),
      reconcile: vi.fn(() => Promise.reject(new Error('reconcile failed'))),
    });
    sup.provide(mail);

    await sup.stop();
    expect(log).toHaveBeenCalledWith('background-connection stop failed', expect.objectContaining({ ext: 'com.tepegoz.mail' }));

    await sup.reconcile();
    expect(log).toHaveBeenCalledWith(
      'background-connection reconcile failed',
      expect.objectContaining({ ext: 'com.tepegoz.mail' }),
    );
  });
});

import { describe, expect, it, vi } from 'vitest';

/**
 * `ActionInterceptorService` — main-process wiring for the synchronous action-interception plane
 * (ADR-0022). It hands the Electron-free `ActionInterceptorSupervisor` a prefs-backed `isEnabled` and
 * a `Logger`-backed `log`, then exposes `provide` (register an extension's interceptor set) and
 * `shouldBlock` (ask "block this action?"). Pinned: both facade methods delegate 1:1 and the two
 * constructor closures route to the right place.
 */

const sup = vi.hoisted(
  (): {
    ctor: unknown;
    provide: ReturnType<typeof vi.fn>;
    evaluate: ReturnType<typeof vi.fn>;
  } => ({
    ctor: undefined,
    provide: vi.fn(),
    evaluate: vi.fn((): boolean => false),
  }),
);
class ActionInterceptorSupervisorMock {
  constructor(opts: unknown) {
    sup.ctor = opts;
  }
  provide = sup.provide;
  evaluate = sup.evaluate;
}
vi.mock('@tepegoz/extension-host', () => ({
  ActionInterceptorSupervisor: ActionInterceptorSupervisorMock,
}));

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const isExtensionEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/desktop-ipc', () => ({ isExtensionEnabled }));

const prefs = vi.hoisted(() => ({ getAll: vi.fn(() => ({ extensions: [{ id: 'pb' }] })) }));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const { default: svc } = await import('./action-interceptors.electron');
const ctor = () =>
  sup.ctor as { isEnabled: (id: string) => boolean; log: (m: string, meta?: unknown) => void };

describe('ActionInterceptorService', () => {
  it('provide forwards the interceptor set to the supervisor', () => {
    const set = { extensionId: 'pb', interceptors: {} };
    svc.provide(set as never);
    expect(sup.provide).toHaveBeenCalledWith(set);
  });

  it('shouldBlock returns the supervisor verdict for the action type + context', () => {
    sup.evaluate.mockReturnValue(true);
    expect(svc.shouldBlock('popup:open' as never, { url: 'https://x.test/' } as never)).toBe(true);
    expect(sup.evaluate).toHaveBeenCalledWith('popup:open', { url: 'https://x.test/' });
  });

  it('the isEnabled closure consults isExtensionEnabled with the prefs map', () => {
    isExtensionEnabled.mockReturnValue(false);
    expect(ctor().isEnabled('pb')).toBe(false);
    expect(isExtensionEnabled).toHaveBeenCalledWith([{ id: 'pb' }], 'pb');
  });

  it('the log closure forwards to Logger.info', () => {
    ctor().log('blocked a tab:create', { extId: 'pb' });
    expect(logger.info).toHaveBeenCalledWith('blocked a tab:create', { extId: 'pb' });
  });
});

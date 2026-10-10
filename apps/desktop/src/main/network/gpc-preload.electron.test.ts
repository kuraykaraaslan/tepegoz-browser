import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ADR-0051: the page preload is attached or detached to match the setting, once per session, and a session
 * that cannot take it never breaks the rest.
 */
const prefs = vi.hoisted(() => ({ value: { globalPrivacyControl: true } }));
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs.value } }));
const logger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const sessions = vi.hoisted(() => ({
  list: [] as { partition: string; session: unknown }[],
  attachers: new Map<string, (ses: unknown, partition: string) => void>(),
}));
vi.mock('./browsing-sessions.electron', () => ({
  default: {
    all: () => sessions.list,
    register: (id: string, attacher: (ses: unknown, partition: string) => void) => {
      sessions.attachers.set(id, attacher);
    },
  },
}));

const { syncGpcPreload, registerGpcPreload, reconcileGpcPreload, gpcPreloadPath } =
  await import('./gpc-preload.electron');

let counter = 0;
const fakeSession = (opts: { failRegister?: boolean } = {}) => ({
  registerPreloadScript: vi.fn(() => {
    if (opts.failRegister === true) throw new Error('no');
    counter += 1;
    return `id-${String(counter)}`;
  }),
  unregisterPreloadScript: vi.fn(),
});

beforeEach(() => {
  counter = 0;
  prefs.value = { globalPrivacyControl: true };
  sessions.list = [];
  sessions.attachers.clear();
  logger.warn.mockClear();
});

describe('syncGpcPreload', () => {
  it('attaches a frame preload to a session while the setting is on, exactly once', () => {
    const ses = fakeSession();
    syncGpcPreload(ses as never, true, '/app/preload/page-gpc.js');
    syncGpcPreload(ses as never, true, '/app/preload/page-gpc.js');
    expect(ses.registerPreloadScript).toHaveBeenCalledTimes(1);
    expect(ses.registerPreloadScript).toHaveBeenCalledWith({
      type: 'frame',
      filePath: '/app/preload/page-gpc.js',
    });
  });

  it('detaches it with the id it was given when the setting turns off, once', () => {
    const ses = fakeSession();
    syncGpcPreload(ses as never, true);
    syncGpcPreload(ses as never, false);
    syncGpcPreload(ses as never, false);
    expect(ses.unregisterPreloadScript).toHaveBeenCalledTimes(1);
    expect(ses.unregisterPreloadScript).toHaveBeenCalledWith('id-1');
  });

  it('can be switched on again after being off (a fresh registration)', () => {
    const ses = fakeSession();
    syncGpcPreload(ses as never, true);
    syncGpcPreload(ses as never, false);
    syncGpcPreload(ses as never, true);
    expect(ses.registerPreloadScript).toHaveBeenCalledTimes(2);
  });

  it('does nothing for a session that is already off', () => {
    const ses = fakeSession();
    syncGpcPreload(ses as never, false);
    expect(ses.unregisterPreloadScript).not.toHaveBeenCalled();
    expect(ses.registerPreloadScript).not.toHaveBeenCalled();
  });

  it('points at the built page-facing preload, which is not the chrome bridge', () => {
    expect(gpcPreloadPath()).toMatch(/preload[\\/]page-gpc\.js$/);
    expect(gpcPreloadPath()).not.toMatch(/preload[\\/]index\.js$/);
  });
});

describe('registerGpcPreload (new sessions)', () => {
  it('attaches to a session as it appears, following the setting at that moment', () => {
    registerGpcPreload();
    const attach = sessions.attachers.get('gpc-preload')!;
    const on = fakeSession();
    attach(on, 'persist:a');
    expect(on.registerPreloadScript).toHaveBeenCalledTimes(1);

    prefs.value = { globalPrivacyControl: false };
    const off = fakeSession();
    attach(off, 'persist:b');
    expect(off.registerPreloadScript).not.toHaveBeenCalled();
  });

  it('reads a preferences object that predates the field as ON (the default)', () => {
    registerGpcPreload();
    prefs.value = { globalPrivacyControl: undefined as never };
    const ses = fakeSession();
    sessions.attachers.get('gpc-preload')!(ses, 'persist:a');
    expect(ses.registerPreloadScript).toHaveBeenCalledTimes(1);
  });

  it('never throws out of the attacher — a session that cannot take it is logged, not refused', () => {
    registerGpcPreload();
    expect(() =>
      sessions.attachers.get('gpc-preload')!(fakeSession({ failRegister: true }), 'persist:a'),
    ).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('reconcileGpcPreload (the setting changed)', () => {
  it('detaches from every live session when turned off, and re-attaches when turned on', () => {
    const a = fakeSession();
    const b = fakeSession();
    sessions.list = [
      { partition: 'a', session: a },
      { partition: 'b', session: b },
    ];
    reconcileGpcPreload(); // on
    expect(a.registerPreloadScript).toHaveBeenCalledTimes(1);
    expect(b.registerPreloadScript).toHaveBeenCalledTimes(1);

    prefs.value = { globalPrivacyControl: false };
    reconcileGpcPreload();
    expect(a.unregisterPreloadScript).toHaveBeenCalledTimes(1);
    expect(b.unregisterPreloadScript).toHaveBeenCalledTimes(1);

    prefs.value = { globalPrivacyControl: true };
    reconcileGpcPreload();
    expect(a.registerPreloadScript).toHaveBeenCalledTimes(2);
  });

  it('one session failing does not stop the others', () => {
    const bad = fakeSession({ failRegister: true });
    const good = fakeSession();
    sessions.list = [
      { partition: 'bad', session: bad },
      { partition: 'good', session: good },
    ];
    expect(() => {
      reconcileGpcPreload();
    }).not.toThrow();
    expect(good.registerPreloadScript).toHaveBeenCalledTimes(1);
  });
});

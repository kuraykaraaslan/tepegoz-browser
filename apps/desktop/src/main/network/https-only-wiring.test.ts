import { beforeEach, describe, expect, it, vi } from 'vitest';

const pending = vi.hoisted(() => ({
  record: undefined as undefined | { host: string; httpUrl: string; reason: string; ts: number },
  clear: vi.fn(),
}));
vi.mock('./https-only.electron', () => ({
  getPendingHttpsOnly: () => pending.record,
  clearPendingHttpsOnly: pending.clear,
  tunnelKindOfPartition: () => 'tor',
}));

const sessions = vi.hoisted(() => {
  const state: { partition: string | null } = { partition: 'persist:tepegoz-web--conn-tor1' };
  return state;
});
vi.mock('./browsing-sessions.electron', () => ({
  default: { partitionOf: () => sessions.partition },
}));

const binding = vi.hoisted(() => ({ mayEgress: vi.fn(() => true) }));
vi.mock('./binding-service.electron', () => ({ default: binding }));

const ui = vi.hoisted(() => ({ showHttpsOnlyInterstitial: vi.fn() }));
vi.mock('../security/https-only-interstitial.electron', () => ui);

const { wireHttpsOnly } = await import('./https-only-wiring');

type Listener = (...a: unknown[]) => void;
function wire() {
  const listeners = new Map<string, Listener>();
  const wc = {
    id: 7,
    session: {},
    on: vi.fn((ev: string, l: Listener) => {
      listeners.set(ev, l);
    }),
  };
  wireHttpsOnly(wc as never, 't1');
  return {
    wc,
    fail: (code: number, url = 'https://old.example/p', main = true) => {
      listeners.get('did-fail-load')!({}, code, 'desc', url, main);
    },
    navigated: () => {
      listeners.get('did-navigate')!({}, 'x');
    },
    stopped: () => {
      listeners.get('did-stop-loading')!({});
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pending.record = {
    host: 'old.example',
    httpUrl: 'http://old.example/p',
    reason: 'upgraded',
    ts: 1,
  };
  sessions.partition = 'persist:tepegoz-web--conn-tor1';
  binding.mayEgress.mockReturnValue(true);
});

describe('wireHttpsOnly did-fail-load', () => {
  it.each([-100, -102, -101, -107, -118, -120, -121, -324])(
    'offers the bypass for allowlisted code %i',
    (code) => {
      const t = wire();
      t.fail(code);
      expect(ui.showHttpsOnlyInterstitial).toHaveBeenCalledWith(
        t.wc,
        'bypass',
        'old.example',
        'http://old.example/p',
        'tor',
      );
      expect(pending.clear).toHaveBeenCalledWith(7);
    },
  );

  it.each([-3, -200, -201, -202, -105, -109, -115, -130, -20])(
    'shows no bypass for code %i',
    (code) => {
      wire().fail(code);
      expect(ui.showHttpsOnlyInterstitial).not.toHaveBeenCalled();
    },
  );

  it('a loop cancel offers the bypass whatever the code', () => {
    pending.record = { ...pending.record!, reason: 'loop' };
    wire().fail(-20);
    expect(ui.showHttpsOnlyInterstitial).toHaveBeenCalledWith(
      expect.anything(),
      'bypass',
      'old.example',
      expect.any(String),
      'tor',
    );
  });

  it('a non-get cancel shows the back-only form page, never a bypass', () => {
    pending.record = { ...pending.record!, reason: 'non-get' };
    wire().fail(-20);
    expect(ui.showHttpsOnlyInterstitial).toHaveBeenCalledWith(
      expect.anything(),
      'non-get',
      'old.example',
      expect.any(String),
      'tor',
    );
  });

  it('a down tunnel shows the tunnel-down page with no bypass, even for an allowlisted code', () => {
    binding.mayEgress.mockReturnValue(false);
    wire().fail(-102);
    expect(binding.mayEgress).toHaveBeenCalledWith('t1');
    expect(ui.showHttpsOnlyInterstitial).toHaveBeenCalledTimes(1);
    expect(ui.showHttpsOnlyInterstitial.mock.calls[0]![1]).toBe('tunnel-down');
  });

  it('ignores a subframe failure', () => {
    wire().fail(-102, 'https://old.example/p', false);
    expect(ui.showHttpsOnlyInterstitial).not.toHaveBeenCalled();
    expect(pending.clear).not.toHaveBeenCalled();
  });

  it('ignores a failure for a different host', () => {
    wire().fail(-102, 'https://other.example/');
    expect(ui.showHttpsOnlyInterstitial).not.toHaveBeenCalled();
  });

  it('ignores an unparseable validatedURL', () => {
    wire().fail(-102, 'not a url');
    expect(ui.showHttpsOnlyInterstitial).not.toHaveBeenCalled();
  });

  it('ignores when there is no pending record (expired, cleared, or never upgraded)', () => {
    pending.record = undefined;
    wire().fail(-102);
    expect(ui.showHttpsOnlyInterstitial).not.toHaveBeenCalled();
  });

  it('ignores a contents with no browsing partition', () => {
    sessions.partition = null;
    wire().fail(-102);
    expect(ui.showHttpsOnlyInterstitial).not.toHaveBeenCalled();
  });

  it('matches the host case-insensitively', () => {
    wire().fail(-102, 'https://OLD.example/p');
    expect(ui.showHttpsOnlyInterstitial).toHaveBeenCalledTimes(1);
  });
});

describe('wireHttpsOnly did-stop-loading', () => {
  it('clears a record whose load stopped without committing (download / 204)', () => {
    const w = wire();
    w.stopped();
    expect(pending.clear).toHaveBeenCalledWith(7);
  });
});

describe('wireHttpsOnly did-navigate', () => {
  it('clears the pending record for this contents', () => {
    wire().navigated();
    expect(pending.clear).toHaveBeenCalledWith(7);
  });
});

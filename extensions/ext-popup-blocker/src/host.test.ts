import { describe, it, expect, vi } from 'vitest';
import { createPopupBlockerHost, type PopupBlockerPorts } from './host';
import type { PopupBlockerSettings } from './types';

function fakePorts(overrides?: {
  popupBlocker?: Partial<PopupBlockerSettings>;
  seeded?: boolean;
}): PopupBlockerPorts & {
  pushed: unknown[];
  prefs: { popupBlocker: PopupBlockerSettings; popupBlockerSeeded: boolean };
} {
  const state = {
    prefs: {
      popupBlocker: {
        enabled: true,
        showNotifications: true,
        trustedOrigins: [],
        ...overrides?.popupBlocker,
      },
      popupBlockerSeeded: overrides?.seeded ?? false,
    },
    pushed: [] as unknown[],
  };
  return {
    getPrefs: () => state.prefs,
    updatePrefs: (patch) => {
      state.prefs = { ...state.prefs, ...patch };
    },
    pushNotification: (draft) => {
      state.pushed.push(draft);
    },
    locale: () => 'en',
    get pushed() {
      return state.pushed;
    },
    get prefs() {
      return state.prefs;
    },
  };
}

describe('createPopupBlockerHost', () => {
  it('registers a single popup:open interceptor for the extension', () => {
    const host = createPopupBlockerHost(fakePorts());
    expect(host.interceptors.extensionId).toBe('com.tepegoz.popup-blocker');
    expect(host.interceptors.interceptors.map((i) => i.actionType)).toEqual(['popup:open']);
  });

  it('init() seeds default trusted origins exactly once', () => {
    const ports = fakePorts();
    const host = createPopupBlockerHost(ports);
    host.init();
    expect(ports.prefs.popupBlockerSeeded).toBe(true);
    expect(ports.prefs.popupBlocker.trustedOrigins.length).toBeGreaterThan(0);

    // A user-removed default must not come back on a second init() (already seeded).
    const afterUserRemoval = ports.prefs.popupBlocker.trustedOrigins.slice(1);
    ports.updatePrefs({
      popupBlocker: { ...ports.prefs.popupBlocker, trustedOrigins: afterUserRemoval },
    });
    host.init();
    expect(ports.prefs.popupBlocker.trustedOrigins).toEqual(afterUserRemoval);
  });

  it('shouldBlock blocks by default and allows trusted origins', () => {
    const host = createPopupBlockerHost(fakePorts());
    const shouldBlock = host.interceptors.interceptors[0]!.shouldBlock;
    expect(shouldBlock({ sourceOrigin: 'https://ads.example', url: 'https://ads.example/x' })).toBe(
      true,
    );

    host.trustOrigin('https://ads.example');
    expect(shouldBlock({ sourceOrigin: 'https://ads.example', url: 'https://ads.example/x' })).toBe(
      false,
    );
  });

  it('shouldBlock is false when the feature toggle is off, regardless of trust list', () => {
    const host = createPopupBlockerHost(
      fakePorts({ popupBlocker: { enabled: false }, seeded: true }),
    );
    host.init(); // loads `enabled: false` from prefs — settings start at the hardcoded default otherwise
    const shouldBlock = host.interceptors.interceptors[0]!.shouldBlock;
    expect(shouldBlock({ sourceOrigin: 'https://ads.example', url: 'https://ads.example/x' })).toBe(
      false,
    );
  });

  it('onBlocked records a recent request and pushes a notification with 4 actions', () => {
    const ports = fakePorts();
    const host = createPopupBlockerHost(ports);
    const { onBlocked } = host.interceptors.interceptors[0]!;
    onBlocked?.({ sourceOrigin: 'https://ads.example', url: 'https://ads.example/x' });

    expect(host.getRecentRequests()).toHaveLength(1);
    expect(ports.pushed).toHaveLength(1);
    const draft = ports.pushed[0] as { actions: { id: string }[] };
    expect(draft.actions.map((a) => a.id)).toEqual(['allow', 'background', 'redirect', 'trust']);
  });

  it('onBlocked is silent when showNotifications is off', () => {
    const ports = fakePorts({ popupBlocker: { showNotifications: false }, seeded: true });
    const host = createPopupBlockerHost(ports);
    host.init();
    const { onBlocked } = host.interceptors.interceptors[0]!;
    onBlocked?.({ sourceOrigin: 'https://ads.example', url: 'https://ads.example/x' });
    expect(ports.pushed).toHaveLength(0);
    expect(host.getRecentRequests()).toHaveLength(1); // still recorded
  });

  it('update() persists a patch and get() returns a defensive copy', () => {
    const ports = fakePorts();
    const host = createPopupBlockerHost(ports);
    const updated = host.update({ showNotifications: false });
    expect(updated.showNotifications).toBe(false);
    expect(ports.prefs.popupBlocker.showNotifications).toBe(false);

    const copy = host.get();
    copy.trustedOrigins.push('https://mutated.example');
    expect(host.get().trustedOrigins).not.toContain('https://mutated.example');
  });

  it('trustOrigin is a no-op for an empty or already-trusted origin', () => {
    const spy = vi.fn();
    const ports = fakePorts();
    const host = createPopupBlockerHost({
      ...ports,
      updatePrefs: (p) => {
        spy(p);
        ports.updatePrefs(p);
      },
    });
    host.trustOrigin('https://a.example');
    spy.mockClear();
    host.trustOrigin('https://a.example'); // already trusted
    host.trustOrigin(''); // empty
    expect(spy).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';

/**
 * Main-process wiring shim for the Popup Blocker (strict) extension host (ADR-0022). All it does is
 * hand `createPopupBlockerHost` four concrete adapters. Pinned: `getPrefs` slices exactly the two
 * popup-blocker keys off `PreferenceStore`, `updatePrefs` forwards the patch verbatim,
 * `pushNotification` routes to `NotificationHost`, and `locale` reads `mainLocale()`.
 */

type Opts = {
  getPrefs: () => { popupBlocker: unknown; popupBlockerSeeded: unknown };
  updatePrefs: (patch: unknown) => void;
  pushNotification: (draft: unknown) => void;
  locale: () => string;
};
const cap = vi.hoisted((): { opts?: Opts } => ({}));
vi.mock('@tepegoz/ext-popup-blocker/host', () => ({
  createPopupBlockerHost: (opts: Opts) => {
    cap.opts = opts;
    return { __host: 'popup' };
  },
}));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({
    popupBlocker: { mode: 'strict' },
    popupBlockerSeeded: true,
    unrelated: 1,
  })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const notifications = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../notifications/notification-host', () => ({ default: notifications }));
vi.mock('../lib/i18n-main', () => ({ mainLocale: () => 'tr' }));

const { default: popupBlockerHost } = await import('./popup-blocker-host.electron');
const opts = (): Opts => cap.opts!;

describe('popup-blocker-host wiring', () => {
  it('exports whatever the factory returned', () => {
    expect(popupBlockerHost).toEqual({ __host: 'popup' });
  });

  it('getPrefs exposes only the two popup-blocker keys', () => {
    expect(opts().getPrefs()).toEqual({
      popupBlocker: { mode: 'strict' },
      popupBlockerSeeded: true,
    });
  });

  it('updatePrefs forwards the patch to PreferenceStore.update', () => {
    opts().updatePrefs({ popupBlocker: { mode: 'off' } });
    expect(prefs.update).toHaveBeenCalledWith({ popupBlocker: { mode: 'off' } });
  });

  it('pushNotification routes to the NotificationHost', () => {
    const draft = { title: 'Blocked a popup' };
    opts().pushNotification(draft);
    expect(notifications.push).toHaveBeenCalledWith(draft);
  });

  it('locale reads mainLocale()', () => {
    expect(opts().locale()).toBe('tr');
  });
});

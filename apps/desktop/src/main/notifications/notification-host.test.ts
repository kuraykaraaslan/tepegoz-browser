import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The main-process notification router. Guarantees pinned here:
 *   - an invalid payload is dropped (returns null, warns) and never reaches the store;
 *   - the CENTER (persisted history) is always recorded when requested — even with notifications off;
 *   - the intrusive surfaces (toast + native OS) are suppressed when the user has notifications off;
 *   - a toast goes only to a live focused window; a missing one is not an error;
 *   - `attach` wires the store→renderer broadcast exactly once.
 */

const getAllWindows = vi.hoisted(() => vi.fn(() => [] as unknown[]));
const notificationShow = vi.hoisted(() => vi.fn());
const notificationCtor = vi.hoisted(() => vi.fn());
const notificationSupported = vi.hoisted(() => vi.fn(() => true));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows },
  Notification: Object.assign(
    class {
      constructor(opts: unknown) {
        notificationCtor(opts);
      }
      show = notificationShow;
    },
    { isSupported: notificationSupported },
  ),
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const storeAdd = vi.hoisted(() => vi.fn());
const storeSubscribe = vi.hoisted(() => vi.fn());
vi.mock('@tepegoz/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tepegoz/notifications')>();
  return {
    ...actual,
    default: { add: storeAdd, subscribe: storeSubscribe, state: () => [] },
  };
});

const prefs = vi.hoisted(() => ({ notificationsEnabled: true }));
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs } }));

const focusedWindow = vi.hoisted(() => vi.fn());
vi.mock('../tabs', () => ({ default: { focusedWindow } }));

let NotificationHost: typeof import('./notification-host').default;

beforeEach(async () => {
  vi.resetModules();
  storeAdd.mockClear();
  storeSubscribe.mockClear();
  notificationCtor.mockClear();
  notificationShow.mockClear();
  notificationSupported.mockReturnValue(true);
  getAllWindows.mockReturnValue([]);
  focusedWindow.mockReset().mockReturnValue(null); // TabManager.focusedWindow() → BrowserWindow | null
  prefs.notificationsEnabled = true;
  NotificationHost = (await import('./notification-host')).default;
});

const draft = (over: Record<string, unknown> = {}) => ({
  kind: 'info',
  source: 'system',
  title: 'Hello',
  body: 'World',
  channels: ['center', 'toast', 'native'],
  ...over,
});

const liveWindow = () => {
  const send = vi.fn();
  return { send, win: { isDestroyed: () => false, webContents: { send } } };
};

describe('push — validation', () => {
  it('drops an invalid payload and never touches the store', () => {
    expect(NotificationHost.push(draft({ title: '' }) as never)).toBeNull();
    expect(storeAdd).not.toHaveBeenCalled();
  });

  it('returns a stored item with an id and timestamp for a valid payload', () => {
    const item = NotificationHost.push(draft({ channels: ['center'] }) as never);
    expect(item).not.toBeNull();
    expect(item?.id).toMatch(/^ntf-\d+$/);
    expect(typeof item?.ts).toBe('number');
  });
});

describe('push — channel routing', () => {
  it('records the center even when notifications are turned off', () => {
    prefs.notificationsEnabled = false;
    NotificationHost.push(draft({ channels: ['center'] }) as never);
    expect(storeAdd).toHaveBeenCalledTimes(1);
  });

  it('does not record the center when the source did not ask for it', () => {
    NotificationHost.push(draft({ channels: ['toast'] }) as never);
    expect(storeAdd).not.toHaveBeenCalled();
  });

  it('sends a toast to the live focused window when enabled', () => {
    const w = liveWindow();
    focusedWindow.mockReturnValue(w.win);
    NotificationHost.push(draft({ channels: ['toast'] }) as never);
    expect(w.send).toHaveBeenCalledTimes(1);
  });

  it('suppresses the toast when notifications are off', () => {
    const w = liveWindow();
    focusedWindow.mockReturnValue(w.win);
    prefs.notificationsEnabled = false;
    NotificationHost.push(draft({ channels: ['toast'] }) as never);
    expect(w.send).not.toHaveBeenCalled();
  });

  it('does not throw when there is no focused window for a toast', () => {
    focusedWindow.mockReturnValue(null);
    expect(() => NotificationHost.push(draft({ channels: ['toast'] }) as never)).not.toThrow();
  });

  it('shows a native OS notification when enabled and supported', () => {
    NotificationHost.push(draft({ channels: ['native'] }) as never);
    expect(notificationCtor).toHaveBeenCalledWith({ title: 'Hello', body: 'World' });
    expect(notificationShow).toHaveBeenCalledTimes(1);
  });

  it('does not show a native notification when the platform does not support it', () => {
    notificationSupported.mockReturnValue(false);
    NotificationHost.push(draft({ channels: ['native'] }) as never);
    expect(notificationShow).not.toHaveBeenCalled();
  });

  it('suppresses the native notification when notifications are off', () => {
    prefs.notificationsEnabled = false;
    NotificationHost.push(draft({ channels: ['native'] }) as never);
    expect(notificationShow).not.toHaveBeenCalled();
  });
});

describe('attach', () => {
  it('subscribes the broadcast exactly once however many times it is called', () => {
    NotificationHost.attach();
    NotificationHost.attach();
    expect(storeSubscribe).toHaveBeenCalledTimes(1);
  });

  it('the wired broadcast pushes the center snapshot to every live app window', () => {
    const live = liveWindow();
    const deadSend = vi.fn();
    const dead = { isDestroyed: () => true, webContents: { send: deadSend } };
    getAllWindows.mockReturnValue([dead, live.win]);

    NotificationHost.attach();
    const broadcast = storeSubscribe.mock.calls[0]![0] as () => void;
    broadcast();

    expect(live.send).toHaveBeenCalledWith(expect.anything(), []); // state() → []
    expect(deadSend).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `WebPermissionBroker` — the per-origin Web permission prompt/decision broker. Pinned: every
 * `request` records that the origin asked (even when short-circuited); `notifications` is auto-denied
 * while the global switch is off; a stored `allowed`/`denied` answers without a prompt; an undecided
 * request with no focused window is denied, otherwise it sends the prompt IPC and resolves on
 * `respond` (persisting only when `remember`), or auto-denies at the 60s timeout; `requestAll` is
 * sequential + short-circuiting; and `isAllowed` reflects the stored grant.
 */

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({
    sitePermissions: {},
    notificationsEnabled: true,
  })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));
vi.mock('@tepegoz/desktop-ipc', () => ({
  IpcChannels: new Proxy({}, { get: (_t, k) => k, has: () => true }),
}));

const focusedWindow = vi.hoisted(() => vi.fn((): unknown => null));
vi.mock('../tabs', () => ({ default: { focusedWindow } }));

type Mod = typeof import('./permission-broker');
async function load(): Promise<Mod> {
  vi.resetModules();
  return import('./permission-broker');
}

const win = () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } });

let mod: Mod;
beforeEach(async () => {
  vi.clearAllMocks();
  prefs.getAll.mockReturnValue({ sitePermissions: {}, notificationsEnabled: true });
  focusedWindow.mockReturnValue(null);
  mod = await load();
});

describe('request — short-circuits', () => {
  it('records the asked capability even when the answer is short-circuited', async () => {
    prefs.getAll.mockReturnValue({
      sitePermissions: { 'https://a': { camera: 'allowed' } },
      notificationsEnabled: true,
    });
    await mod.default.request('camera', 'https://a');
    expect(mod.requestedCapabilities('https://a')).toEqual(['camera']);
  });

  it('auto-denies notifications while the global switch is off', async () => {
    prefs.getAll.mockReturnValue({ sitePermissions: {}, notificationsEnabled: false });
    expect(await mod.default.request('notifications', 'https://a')).toBe(false);
  });

  it('answers from a stored allowed / denied decision without prompting', async () => {
    prefs.getAll.mockReturnValue({
      sitePermissions: { 'https://a': { camera: 'allowed', microphone: 'denied' } },
      notificationsEnabled: true,
    });
    expect(await mod.default.request('camera', 'https://a')).toBe(true);
    expect(await mod.default.request('microphone', 'https://a')).toBe(false);
  });

  it('denies an undecided request when there is no focused window', async () => {
    focusedWindow.mockReturnValue(null);
    expect(await mod.default.request('camera', 'https://a')).toBe(false);
  });
});

describe('request — the prompt round-trip', () => {
  it('sends the prompt IPC and resolves on respond, persisting only when remember is set', async () => {
    const w = win();
    focusedWindow.mockReturnValue(w);
    const p = mod.default.request('camera', 'https://a');
    expect(w.webContents.send).toHaveBeenCalledWith(
      'notificationPermissionRequest',
      expect.objectContaining({ origin: 'https://a', capability: 'camera' }),
    );
    const { requestId } = w.webContents.send.mock.calls[0]![1] as { requestId: string };

    mod.default.respond({ requestId, allow: true, remember: true });
    expect(await p).toBe(true);
    expect(prefs.update).toHaveBeenCalledWith({
      sitePermissions: { 'https://a': { camera: 'allowed' } },
    });
  });

  it('does not persist when remember is not set, and ignores an unknown requestId', async () => {
    const w = win();
    focusedWindow.mockReturnValue(w);
    const p = mod.default.request('camera', 'https://a');
    const { requestId } = w.webContents.send.mock.calls[0]![1] as { requestId: string };

    mod.default.respond({ requestId: 'perm-999', allow: true, remember: false }); // unknown → no-op
    mod.default.respond({ requestId, allow: false, remember: false });
    expect(await p).toBe(false);
    expect(prefs.update).not.toHaveBeenCalled();
  });

  it('auto-denies at the prompt timeout', async () => {
    vi.useFakeTimers();
    const w = win();
    focusedWindow.mockReturnValue(w);
    const p = mod.default.request('camera', 'https://a');
    vi.advanceTimersByTime(60_000);
    expect(await p).toBe(false);
    vi.useRealTimers();
  });
});

describe('requestAll + isAllowed', () => {
  it('requestAll is sequential and short-circuits on the first denial', async () => {
    prefs.getAll.mockReturnValue({
      sitePermissions: { 'https://a': { camera: 'denied', microphone: 'allowed' } },
      notificationsEnabled: true,
    });
    expect(await mod.default.requestAll(['camera', 'microphone'], 'https://a')).toBe(false);
    // microphone was never consulted
    expect(mod.requestedCapabilities('https://a')).toEqual(['camera']);
  });

  it('requestAll is true only when every capability is granted, false for an empty list', async () => {
    prefs.getAll.mockReturnValue({
      sitePermissions: { 'https://a': { camera: 'allowed', microphone: 'allowed' } },
      notificationsEnabled: true,
    });
    expect(await mod.default.requestAll(['camera', 'microphone'], 'https://a')).toBe(true);
    expect(await mod.default.requestAll([], 'https://a')).toBe(false);
  });

  it('isAllowed reflects the stored grant and the global switch', () => {
    prefs.getAll.mockReturnValue({
      sitePermissions: { 'https://a': { camera: 'allowed', notifications: 'allowed' } },
      notificationsEnabled: false,
    });
    expect(mod.default.isAllowed('camera', 'https://a')).toBe(true);
    expect(mod.default.isAllowed('notifications', 'https://a')).toBe(false);
    expect(mod.default.isAllowed('camera', 'https://other')).toBe(false);
  });
});

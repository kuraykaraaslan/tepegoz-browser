import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `browser-windows` — chrome-window lifecycle. Pinned: `initHosts` wires the window-agnostic host
 * singletons once; `openWindow` creates the window, registers its tab manager (private flag through),
 * places a torn-off / restored window on-screen, and picks the bootstrap surface (kiosk chromeless +
 * pinned tab / onboarding / normal chrome + tab seed per mode); the `close` handler honours
 * close-to-tray; the `closed` handler persists + unregisters and discards private browsing on the
 * last private window; the chrome `before-input-event` routes zoom + window shortcuts; and
 * `completeOnboarding` flips the flag, swaps to chrome and seeds tabs.
 */

const win = vi.hoisted(() => ({
  createWindow: vi.fn(),
  effectiveStartupMode: vi.fn((): string => 'window'),
  hideToTray: vi.fn(),
}));
vi.mock('./window', () => win);
vi.mock('./window-placement', () => ({
  ensureOnScreen: vi.fn((b: object) => ({ ...b, placed: true })),
}));

const wt = vi.hoisted(() => ({
  createTab: vi.fn(),
  tabCount: vi.fn(() => 1),
  restoreWindow: vi.fn(() => [] as string[]),
  getState: vi.fn(() => ({ activeId: 'a1' })),
  closeTab: vi.fn(),
  activeWebContents: vi.fn(() => null),
  refreshState: vi.fn(),
}));
const tm = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  persistNow: vi.fn(),
  hasPrivateWindow: vi.fn(() => false),
  forWindow: vi.fn((): unknown => wt),
  forSenderWindow: vi.fn((): unknown => wt),
}));
vi.mock('./tabs', () => ({ default: tm }));

const sessions = vi.hoisted(() => ({ discardPrivate: vi.fn() }));
vi.mock('./network/browsing-sessions.electron', () => ({ default: sessions }));
const privateOpener = vi.hoisted(() => ({
  openPrivateWindow: vi.fn(),
  setPrivateWindowOpener: vi.fn(),
}));
vi.mock('./private-window-opener', () => privateOpener);
const quitState = vi.hoisted(() => ({ isQuitting: vi.fn(() => false) }));
vi.mock('./quit-state', () => quitState);
vi.mock('./tray', () => ({ notifyHiddenToTrayOnce: vi.fn() }));
const power = vi.hoisted(() => ({ reconcileTrayPowerBlocker: vi.fn() }));
vi.mock('./power-lifecycle', () => power);
const shortcut = vi.hoisted(() => ({
  handleWindowShortcut: vi.fn<
    (win: unknown, input: unknown, targets: { closeActiveTab: () => void }) => boolean
  >(() => false),
}));
vi.mock('./keyboard-shortcuts', () => shortcut);
const zoom = vi.hoisted(() => ({ handleZoomShortcut: vi.fn(() => false) }));
vi.mock('./site-zoom', () => zoom);
const notif = vi.hoisted(() => ({ attach: vi.fn() }));
vi.mock('./notifications/notification-host', () => ({ default: notif }));
const passwordHost = vi.hoisted(() => ({ attach: vi.fn() }));
vi.mock('./password/password-host', () => ({ default: passwordHost }));
const autofillHost = vi.hoisted(() => ({ attach: vi.fn() }));
vi.mock('./password/autofill-host', () => ({ default: autofillHost }));
vi.mock('./stores.electron', () => ({ passwordVault: { __vault: true } }));
const db = vi.hoisted((): { value: unknown } => ({ value: null }));
vi.mock('./db/database.electron', () => ({ getDb: () => db.value }));
const onboarding = vi.hoisted(() => ({
  loadBrowser: vi.fn(),
  loadOnboarding: vi.fn(),
  shouldShowOnboarding: vi.fn(() => false),
}));
vi.mock('./onboarding.electron', () => onboarding);
const safeMode = vi.hoisted(() => ({ isSafeMode: vi.fn(() => false) }));
vi.mock('./recovery/safe-mode', () => safeMode);
vi.mock('./recovery/session-restore-undo', () => ({ recordRestoredTabs: vi.fn() }));
const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ closeToTray: false, kioskUrl: '', onboardingCompleted: false })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));
vi.mock('@tepegoz/persistence', () => ({ SessionStore: { load: vi.fn(() => null) } }));

function fakeWin() {
  return {
    getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    setBounds: vi.fn(),
    once: vi.fn(),
    on: vi.fn(),
    webContents: { on: vi.fn() },
  };
}
let winInstance: ReturnType<typeof fakeWin>;

type Mod = typeof import('./browser-windows');
async function load(): Promise<Mod> {
  vi.resetModules();
  return import('./browser-windows');
}

const handlerFor = (o: { on: ReturnType<typeof vi.fn> }, ev: string) =>
  o.on.mock.calls.find((c) => c[0] === ev)?.[1] as ((...a: unknown[]) => unknown) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  winInstance = fakeWin();
  win.createWindow.mockReturnValue(winInstance);
  win.effectiveStartupMode.mockReturnValue('window');
  tm.forWindow.mockReturnValue(wt);
  tm.forSenderWindow.mockReturnValue(wt);
  tm.hasPrivateWindow.mockReturnValue(false);
  wt.tabCount.mockReturnValue(1);
  wt.getState.mockReturnValue({ activeId: 'a1' });
  db.value = null;
  onboarding.shouldShowOnboarding.mockReturnValue(false);
  safeMode.isSafeMode.mockReturnValue(false);
  quitState.isQuitting.mockReturnValue(false);
  zoom.handleZoomShortcut.mockReturnValue(false);
  shortcut.handleWindowShortcut.mockReturnValue(false);
  prefs.getAll.mockReturnValue({ closeToTray: false, kioskUrl: '', onboardingCompleted: false });
});

describe('initHosts', () => {
  it('wires the private-window opener and attaches the host singletons once', async () => {
    const { initHosts } = await load();
    initHosts();
    expect(privateOpener.setPrivateWindowOpener).toHaveBeenCalledWith(expect.any(Function));
    expect(notif.attach).toHaveBeenCalledTimes(1);
    expect(passwordHost.attach).toHaveBeenCalledTimes(1);
    expect(autofillHost.attach).toHaveBeenCalledWith({ __vault: true });
  });
});

describe('openWindow', () => {
  it('creates the window, registers its tab manager, loads chrome and seeds a restore tab', async () => {
    const { openWindow } = await load();
    openWindow();
    expect(tm.register).toHaveBeenCalledWith(winInstance, { isPrivate: false });
    expect(onboarding.loadBrowser).toHaveBeenCalledWith(winInstance);
    expect(wt.createTab).toHaveBeenCalledTimes(1);
  });

  it('passes the private flag through to register', async () => {
    const { openWindow } = await load();
    openWindow({ isPrivate: true });
    expect(tm.register).toHaveBeenCalledWith(winInstance, { isPrivate: true });
  });

  it('places a torn-off / restored window on-screen', async () => {
    const { openWindow } = await load();
    openWindow({ position: { x: 10, y: 20 }, size: { width: 400, height: 300 } });
    expect(winInstance.setBounds).toHaveBeenCalledWith(
      expect.objectContaining({ x: 10, y: 20, width: 400, height: 300, placed: true }),
    );
  });

  it('loads the onboarding surface when it is still pending', async () => {
    onboarding.shouldShowOnboarding.mockReturnValue(true);
    const { openWindow } = await load();
    openWindow();
    expect(onboarding.loadOnboarding).toHaveBeenCalledWith(winInstance);
    expect(onboarding.loadBrowser).not.toHaveBeenCalled();
  });

  it('kiosk: loads the chromeless variant and pins a single tab to the kiosk URL', async () => {
    win.effectiveStartupMode.mockReturnValue('kiosk');
    prefs.getAll.mockReturnValue({
      closeToTray: false,
      kioskUrl: 'https://kiosk.test/',
      onboardingCompleted: true,
    });
    const { openWindow } = await load();
    openWindow();
    expect(onboarding.loadBrowser).toHaveBeenCalledWith(winInstance, { kiosk: true });
    expect(wt.createTab).toHaveBeenCalledWith('https://kiosk.test/');
  });

  it('tabs:"default" seeds one blank tab; tabs:"none" seeds nothing', async () => {
    const a = await load();
    a.openWindow({ tabs: 'default' });
    expect(wt.createTab).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    win.createWindow.mockReturnValue(winInstance);
    tm.forWindow.mockReturnValue(wt);
    const b = await load();
    b.openWindow({ tabs: 'none' });
    expect(wt.createTab).not.toHaveBeenCalled();
  });
});

describe('the window lifecycle handlers', () => {
  it('close: does nothing with close-to-tray off, hides to tray when on', async () => {
    const { openWindow } = await load();
    openWindow();
    const onClose = handlerFor(winInstance, 'close')!;

    const ev1 = { preventDefault: vi.fn() };
    onClose(ev1);
    expect(ev1.preventDefault).not.toHaveBeenCalled();

    prefs.getAll.mockReturnValue({ closeToTray: true, kioskUrl: '', onboardingCompleted: true });
    const ev2 = { preventDefault: vi.fn() };
    onClose(ev2);
    expect(ev2.preventDefault).toHaveBeenCalled();
    expect(win.hideToTray).toHaveBeenCalledWith(winInstance);
  });

  it('closed: persists + unregisters, and discards private browsing on the last private window', async () => {
    const { openWindow } = await load();
    openWindow({ isPrivate: true });
    const onClosed = handlerFor(winInstance, 'closed')!;
    onClosed();
    expect(tm.persistNow).toHaveBeenCalled();
    expect(tm.unregister).toHaveBeenCalledWith(winInstance);
    expect(sessions.discardPrivate).toHaveBeenCalled();
  });

  it('chrome before-input-event routes the zoom shortcut then the window shortcut', async () => {
    const { openWindow } = await load();
    openWindow();
    const onKey = handlerFor(winInstance.webContents, 'before-input-event')!;

    zoom.handleZoomShortcut.mockReturnValue(true);
    const ev1 = { preventDefault: vi.fn() };
    onKey(ev1, { type: 'keyDown' });
    expect(ev1.preventDefault).toHaveBeenCalled();
    expect(wt.refreshState).toHaveBeenCalled();

    zoom.handleZoomShortcut.mockReturnValue(false);
    shortcut.handleWindowShortcut.mockImplementation(
      (_w: unknown, _i: unknown, targets: { closeActiveTab: () => void }) => {
        targets.closeActiveTab();
        return true;
      },
    );
    const ev2 = { preventDefault: vi.fn() };
    onKey(ev2, { type: 'keyDown' });
    expect(ev2.preventDefault).toHaveBeenCalled();
    expect(wt.closeTab).toHaveBeenCalledWith('a1');
  });
});

describe('completeOnboarding', () => {
  it('flips the flag, swaps to chrome and seeds tabs', async () => {
    const { completeOnboarding } = await load();
    completeOnboarding(winInstance as never);
    expect(prefs.update).toHaveBeenCalledWith({ onboardingCompleted: true });
    expect(onboarding.loadBrowser).toHaveBeenCalledWith(winInstance);
    expect(wt.createTab).toHaveBeenCalled();
  });
});

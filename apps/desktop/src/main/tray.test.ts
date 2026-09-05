import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The system-tray icon — the one surface that survives every chrome window being hidden. Guarantees
 * pinned here:
 *   - `initTray` is idempotent and wires click + double-click to "show or open";
 *   - a tray click reveals existing windows, or opens ONE fresh window when none exist;
 *   - revealing all windows also stops the keep-awake blocker (nothing is parked any more);
 *   - Quit marks the quit intent BEFORE `app.quit()` so the close-interceptor lets windows go;
 *   - the "running in the tray" hint fires exactly once and then remembers not to nag;
 *   - the agent-running tooltip only re-renders on an actual state change.
 */

const el = vi.hoisted(() => ({
  quit: vi.fn(),
  buildFromTemplate: vi.fn((t: unknown) => ({ __menu: t })),
  createFromPath: vi.fn(() => ({ __img: true })),
  notificationShow: vi.fn(),
  notificationCtor: vi.fn(),
  notificationSupported: vi.fn(() => true),
  trayInstances: [] as MockTray[],
}));

class MockTray {
  toolTip = '';
  menu: unknown = null;
  handlers = new Map<string, () => void>();
  constructor() {
    el.trayInstances.push(this);
  }
  setToolTip(s: string): void {
    this.toolTip = s;
  }
  setContextMenu(m: unknown): void {
    this.menu = m;
  }
  on(event: string, cb: () => void): void {
    this.handlers.set(event, cb);
  }
}

vi.mock('electron', () => ({
  app: { quit: el.quit },
  Menu: { buildFromTemplate: el.buildFromTemplate },
  nativeImage: { createFromPath: el.createFromPath },
  Tray: MockTray,
  Notification: Object.assign(
    class {
      constructor(o: unknown) {
        el.notificationCtor(o);
      }
      show = el.notificationShow;
    },
    { isSupported: el.notificationSupported },
  ),
}));

const prefs = vi.hoisted(
  (): { value: Record<string, unknown>; update: ReturnType<typeof vi.fn> } => ({
    value: { trayHintShown: false },
    update: vi.fn(),
  }),
);
vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: () => prefs.value, update: prefs.update },
}));
vi.mock('./lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: {
      trayShow: 'Show',
      trayQuit: 'Quit',
      trayTooltip: 'Tepegöz',
      trayRunning: 'Still running in the tray.',
      trayAgentRunning: 'Agent is working…',
    },
  }),
}));

const tabs = vi.hoisted(
  (): {
    windows: { window: string }[];
    focused: { focus: () => void } | null;
  } => ({
    windows: [],
    focused: { focus: vi.fn() },
  }),
);
vi.mock('./tabs', () => ({
  default: { all: () => tabs.windows, focusedWindow: () => tabs.focused },
}));
const showFromTray = vi.hoisted(() => vi.fn());
vi.mock('./window', () => ({ ICON_PATH: '/icon.png', showFromTray }));
const markQuitting = vi.hoisted(() => vi.fn());
vi.mock('./quit-state', () => ({ markQuitting }));
const reconcilePower = vi.hoisted(() => vi.fn());
vi.mock('./power-lifecycle', () => ({ reconcileTrayPowerBlocker: reconcilePower }));
const openWindow = vi.hoisted(() => vi.fn());
vi.mock('./browser-windows', () => ({ openWindow }));

async function load() {
  return import('./tray');
}

beforeEach(() => {
  vi.resetModules();
  el.quit.mockClear();
  el.buildFromTemplate.mockClear();
  el.notificationShow.mockClear();
  el.notificationCtor.mockClear();
  el.notificationSupported.mockReturnValue(true);
  el.trayInstances.length = 0;
  prefs.value = { trayHintShown: false };
  prefs.update.mockClear();
  tabs.windows = [];
  tabs.focused = { focus: vi.fn() };
  showFromTray.mockClear();
  markQuitting.mockClear();
  reconcilePower.mockClear();
  openWindow.mockClear();
});

describe('initTray', () => {
  it('creates the tray once and ignores a second call', async () => {
    const { initTray } = await load();
    initTray();
    initTray();
    expect(el.trayInstances).toHaveLength(1);
  });

  it('wires click and double-click', async () => {
    const { initTray } = await load();
    initTray();
    const t = el.trayInstances[0]!;
    expect(t.handlers.has('click')).toBe(true);
    expect(t.handlers.has('double-click')).toBe(true);
  });
});

describe('revealAllWindows', () => {
  it('shows every window, focuses the last-focused, and stops keep-awake', async () => {
    tabs.windows = [{ window: 'a' }, { window: 'b' }];
    const focus = vi.fn();
    tabs.focused = { focus };
    const { revealAllWindows } = await load();
    revealAllWindows();
    expect(showFromTray).toHaveBeenCalledTimes(2);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(reconcilePower).toHaveBeenCalledTimes(1);
  });
});

describe('tray click', () => {
  it('reveals existing windows when there are any', async () => {
    tabs.windows = [{ window: 'a' }];
    const { initTray } = await load();
    initTray();
    el.trayInstances[0]!.handlers.get('click')!();
    expect(showFromTray).toHaveBeenCalledTimes(1);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('opens ONE fresh visible window when none exist', async () => {
    tabs.windows = [];
    const { initTray } = await load();
    initTray();
    el.trayInstances[0]!.handlers.get('click')!();
    await vi.waitFor(() => expect(openWindow).toHaveBeenCalledWith({ foreground: true }));
    expect(openWindow).toHaveBeenCalledTimes(1);
  });
});

describe('Show item', () => {
  it('reveals existing windows when the context-menu "Show" item is clicked', async () => {
    tabs.windows = [{ window: 'a' }];
    const { initTray } = await load();
    initTray();
    const template = el.buildFromTemplate.mock.calls[0]![0] as {
      label?: string;
      click?: () => void;
    }[];
    const show = template.find((i) => i.label === 'Show');
    show?.click?.();
    expect(showFromTray).toHaveBeenCalledTimes(1);
    expect(openWindow).not.toHaveBeenCalled();
  });
});

describe('Quit item', () => {
  it('marks the quit intent before calling app.quit', async () => {
    const { initTray } = await load();
    initTray();
    const template = el.buildFromTemplate.mock.calls[0]![0] as {
      label?: string;
      click?: () => void;
    }[];
    const quit = template.find((i) => i.label === 'Quit');
    quit?.click?.();
    expect(markQuitting).toHaveBeenCalledTimes(1);
    expect(el.quit).toHaveBeenCalledTimes(1);
    expect(markQuitting.mock.invocationCallOrder[0]).toBeLessThan(
      el.quit.mock.invocationCallOrder[0]!,
    );
  });
});

describe('refreshTray', () => {
  it('is a no-op before the tray exists', async () => {
    const { refreshTray } = await load();
    expect(() => refreshTray()).not.toThrow();
    expect(el.buildFromTemplate).not.toHaveBeenCalled();
  });

  it('rebuilds the menu + tooltip once the tray exists', async () => {
    const { initTray, refreshTray } = await load();
    initTray();
    el.buildFromTemplate.mockClear();
    refreshTray();
    expect(el.buildFromTemplate).toHaveBeenCalledTimes(1);
  });
});

describe('setTrayAgentRunning', () => {
  it('updates the tooltip when the state flips, and skips a redundant set', async () => {
    const { initTray, setTrayAgentRunning } = await load();
    initTray();
    const t = el.trayInstances[0]!;
    t.toolTip = 'seed';
    setTrayAgentRunning(true);
    expect(t.toolTip).toBe('Agent is working…');
    t.toolTip = 'seed';
    setTrayAgentRunning(true); // no change
    expect(t.toolTip).toBe('seed');
  });
});

describe('notifyHiddenToTrayOnce', () => {
  it('shows the hint once and records that it was shown', async () => {
    const { notifyHiddenToTrayOnce } = await load();
    notifyHiddenToTrayOnce();
    expect(prefs.update).toHaveBeenCalledWith({ trayHintShown: true });
    expect(el.notificationShow).toHaveBeenCalledTimes(1);
  });

  it('never nags again once the pref is set', async () => {
    prefs.value = { trayHintShown: true };
    const { notifyHiddenToTrayOnce } = await load();
    notifyHiddenToTrayOnce();
    expect(el.notificationShow).not.toHaveBeenCalled();
    expect(prefs.update).not.toHaveBeenCalled();
  });

  it('records the hint even when the OS cannot show a notification', async () => {
    el.notificationSupported.mockReturnValue(false);
    const { notifyHiddenToTrayOnce } = await load();
    notifyHiddenToTrayOnce();
    expect(prefs.update).toHaveBeenCalledWith({ trayHintShown: true });
    expect(el.notificationShow).not.toHaveBeenCalled();
  });
});

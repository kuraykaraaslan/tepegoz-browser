import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

/**
 * The application menu. Electron installs a DEFAULT menu when `setApplicationMenu` is never called,
 * and that default bound `toggleDevTools`, the zoom roles and `close` straight to Electron's role
 * handlers — routing around this app's sensitive-site DevTools gate, its per-origin zoom ladder, and
 * "Ctrl+W closes a tab, not a window". So the guarantees pinned here:
 *   - off macOS the menu is explicitly `null` (frameless windows, no menu bar);
 *   - on macOS the menu is App + Edit ROLES only — enough to keep native copy/paste/⌘Q — and contains
 *     NONE of the roles that could step around a policy (devtools, zoom, window lifecycle).
 */

const setApplicationMenu = vi.hoisted(() => vi.fn());
const buildFromTemplate = vi.hoisted(() => vi.fn((t: unknown) => t));
vi.mock('electron', () => ({
  app: { getName: () => 'Tepegöz' },
  Menu: { setApplicationMenu, buildFromTemplate },
}));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ browser: { menuEdit: 'Edit' } }),
}));

const { installApplicationMenu, refreshApplicationMenu } = await import('./application-menu');

const realPlatform = process.platform;
const setPlatform = (p: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
};

beforeEach(() => {
  setApplicationMenu.mockClear();
  buildFromTemplate.mockClear();
});
afterEach(() => {
  setPlatform(realPlatform);
});

/** Every `role` string anywhere in a (possibly nested) menu template. */
function allRoles(template: MenuItemConstructorOptions[]): string[] {
  const out: string[] = [];
  const walk = (items: MenuItemConstructorOptions[]): void => {
    for (const item of items) {
      if (typeof item.role === 'string') out.push(item.role);
      if (Array.isArray(item.submenu)) walk(item.submenu);
    }
  };
  walk(template);
  return out;
}

describe('off macOS', () => {
  beforeEach(() => setPlatform('win32'));

  it('installs an explicit null menu and builds no template', () => {
    installApplicationMenu();
    expect(setApplicationMenu).toHaveBeenCalledWith(null);
    expect(buildFromTemplate).not.toHaveBeenCalled();
  });

  it('refresh is a no-op — there is no menu to rebuild', () => {
    refreshApplicationMenu();
    expect(setApplicationMenu).not.toHaveBeenCalled();
  });
});

describe('on macOS', () => {
  beforeEach(() => setPlatform('darwin'));

  it('installs a built menu', () => {
    installApplicationMenu();
    expect(buildFromTemplate).toHaveBeenCalledTimes(1);
    expect(setApplicationMenu).toHaveBeenCalledWith(expect.anything());
    expect(setApplicationMenu).not.toHaveBeenCalledWith(null);
  });

  it('has exactly two submenus: App and Edit', () => {
    installApplicationMenu();
    const template = buildFromTemplate.mock.calls[0]?.[0] as MenuItemConstructorOptions[];
    expect(template).toHaveLength(2);
    expect(template[0]?.label).toBe('Tepegöz');
    expect(template[1]?.label).toBe('Edit');
  });

  it('keeps native editing alive — cut/copy/paste/selectAll are present', () => {
    installApplicationMenu();
    const roles = allRoles(buildFromTemplate.mock.calls[0]?.[0] as MenuItemConstructorOptions[]);
    for (const r of ['cut', 'copy', 'paste', 'selectAll', 'quit']) {
      expect(roles).toContain(r);
    }
  });

  it('contains NONE of the roles that could route around an app policy', () => {
    installApplicationMenu();
    const roles = allRoles(buildFromTemplate.mock.calls[0]?.[0] as MenuItemConstructorOptions[]);
    for (const forbidden of [
      'toggleDevTools',
      'zoomIn',
      'zoomOut',
      'resetZoom',
      'close',
      'minimize',
      'togglefullscreen',
      'window',
      'reload',
      'forceReload',
    ]) {
      expect(roles).not.toContain(forbidden);
    }
  });

  it('refresh rebuilds the menu (paired with a locale change)', () => {
    refreshApplicationMenu();
    expect(buildFromTemplate).toHaveBeenCalledTimes(1);
    expect(setApplicationMenu).toHaveBeenCalledWith(expect.anything());
  });
});

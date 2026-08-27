import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Launch at system login" — three platforms, one entry point. What this pins: the Linux XDG
 * autostart file's exact body and `Exec=` line (packaged runs the binary; dev needs the app dir too),
 * that disabling removes the file, and that Windows/macOS go through `app.setLoginItemSettings` with
 * the dev-mode app-dir arg. `setLaunchAtLogin` never throws — a failed reconcile is logged, not fatal.
 */

const fs = vi.hoisted(() => ({ mkdir: vi.fn(), rm: vi.fn(), write: vi.fn() }));
vi.mock('node:fs', () => ({
  mkdirSync: (...a: unknown[]) => {
    fs.mkdir(...a);
  },
  rmSync: (...a: unknown[]) => {
    fs.rm(...a);
  },
  writeFileSync: (...a: unknown[]) => {
    fs.write(...a);
  },
}));

const el = vi.hoisted(() => ({
  isPackaged: false,
  execPath: '/opt/electron/electron',
  appPath: '/home/u/app',
  home: '/home/u',
  setLoginItemSettings: vi.fn(),
}));
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return el.isPackaged;
    },
    getAppPath: () => el.appPath,
    getPath: (k: string) => (k === 'home' ? el.home : `/tmp/${k}`),
    setLoginItemSettings: (o: unknown) => {
      el.setLoginItemSettings(o);
    },
  },
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn() } }));

const { buildAutostartEntry, linuxAutostartExec, setLaunchAtLogin } = await import(
  './launch-at-login'
);

const realPlatform = process.platform;
function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  el.isPackaged = false;
  el.execPath = '/opt/electron/electron';
  Object.defineProperty(process, 'execPath', { value: el.execPath, configurable: true });
  delete process.env.APPIMAGE;
});
afterEach(() => setPlatform(realPlatform));

describe('buildAutostartEntry', () => {
  it('is a valid XDG .desktop entry with the given Exec and a trailing newline', () => {
    const body = buildAutostartEntry('/usr/bin/tepegoz');
    expect(body).toContain('[Desktop Entry]');
    expect(body).toContain('Type=Application');
    expect(body).toContain('Exec=/usr/bin/tepegoz');
    expect(body).toContain('X-GNOME-Autostart-enabled=true');
    expect(body.endsWith('\n')).toBe(true);
  });
});

describe('linuxAutostartExec', () => {
  it('packaged: just the binary', () => {
    el.isPackaged = true;
    Object.defineProperty(process, 'execPath', { value: '/opt/Tepegoz/tepegoz', configurable: true });
    expect(linuxAutostartExec()).toBe('/opt/Tepegoz/tepegoz');
  });

  it('dev: electron + the app dir, each quoted only when it has a space', () => {
    el.isPackaged = false;
    Object.defineProperty(process, 'execPath', { value: '/opt/electron/electron', configurable: true });
    el.appPath = '/home/u/my app';
    expect(linuxAutostartExec()).toBe('/opt/electron/electron "/home/u/my app"');
    el.appPath = '/home/u/app';
  });

  it('prefers $APPIMAGE when set', () => {
    el.isPackaged = true;
    process.env.APPIMAGE = '/home/u/Tepegoz.AppImage';
    expect(linuxAutostartExec()).toBe('/home/u/Tepegoz.AppImage');
  });
});

describe('setLaunchAtLogin', () => {
  it('linux enable writes the autostart file under ~/.config/autostart', () => {
    setPlatform('linux');
    setLaunchAtLogin(true);
    expect(fs.mkdir).toHaveBeenCalled();
    const [path, body] = fs.write.mock.calls[0] as [string, string];
    expect(path.replace(/\\/g, '/')).toBe('/home/u/.config/autostart/tepegoz.desktop');
    expect(body).toContain('[Desktop Entry]');
    expect(el.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('linux disable removes the file and writes nothing', () => {
    setPlatform('linux');
    setLaunchAtLogin(false);
    expect(fs.rm).toHaveBeenCalledWith(
      expect.stringMatching(/tepegoz\.desktop$/),
      expect.objectContaining({ force: true }),
    );
    expect(fs.write).not.toHaveBeenCalled();
  });

  it('windows/macos go through setLoginItemSettings, with the app dir only in dev', () => {
    setPlatform('win32');
    setLaunchAtLogin(true);
    expect(el.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: [el.appPath],
    });
    el.setLoginItemSettings.mockClear();
    el.isPackaged = true;
    setLaunchAtLogin(true);
    expect(el.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, args: [] });
  });

  it('swallows a thrown reconcile error rather than crashing startup', () => {
    setPlatform('win32');
    el.setLoginItemSettings.mockImplementationOnce(() => {
      throw new Error('registry locked');
    });
    expect(() => setLaunchAtLogin(true)).not.toThrow();
  });
});

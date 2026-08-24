import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The deny-by-default permission handler — which had no test at all, despite being the control that
 * decides whether a browsed page can reach the camera, the microphone, the screen, the user's location
 * or their files.
 *
 * The property under test is the DEFAULT, not the exceptions. Three capabilities are brokered per-site
 * (notifications and the two clipboard permissions); every other permission Electron can hand us must
 * be refused without asking anyone. Writing it this way — enumerate Electron's whole union, assert the
 * complement is denied — means a permission ADDED by a future Electron is denied by this test's own
 * construction, and a capability someone quietly adds to `permissionCapability` fails it.
 *
 * `fileSystem` is in that list on purpose. It is the File System Access API
 * (`showOpenFilePicker`/`showDirectoryPicker`), and it is the one whose end-to-end behaviour could not
 * be measured in the harness: Chromium opens the native picker BEFORE requesting the permission, and no
 * automated harness can pick a file out of an OS dialog. What is asserted here is the half that is
 * ours — when the request reaches us, we refuse it.
 */

const webContentsCreated: ((event: unknown, contents: unknown) => void)[] = [];
const onHeadersReceived = vi.fn();

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    on: (event: string, listener: (event: unknown, contents: unknown) => void) => {
      if (event === 'web-contents-created') webContentsCreated.push(listener);
    },
  },
  session: { fromPartition: () => ({ webRequest: { onHeadersReceived } }) },
}));
vi.mock('./window', () => ({ APP_PARTITION: 'persist:app' }));

const allowed = new Set<string>();
vi.mock('./web-permissions/permission-broker', () => ({
  default: {
    request: (capability: string) => Promise.resolve(allowed.has(capability)),
    isAllowed: (capability: string) => allowed.has(capability),
  },
}));

const { installSecurity } = await import('./security');

/** Electron's full permission union, copied from `electron.d.ts` (both handler signatures, merged). */
const ALL_PERMISSIONS = [
  'clipboard-read',
  'clipboard-sanitized-write',
  'deprecated-sync-clipboard-read',
  'display-capture',
  'fullscreen',
  'geolocation',
  'hid',
  'idle-detection',
  'media',
  'mediaKeySystem',
  'midi',
  'midiSysex',
  'notifications',
  'openExternal',
  'pointerLock',
  'keyboardLock',
  'serial',
  'speaker-selection',
  'storage-access',
  'top-level-storage-access',
  'usb',
  'window-management',
  'fileSystem',
  'unknown',
] as const;

/** The only three that may reach the broker instead of being refused outright. */
const BROKERED = new Set([
  'notifications',
  'clipboard-read',
  'clipboard-sanitized-write',
  'deprecated-sync-clipboard-read',
]);

interface Handlers {
  request: (
    wc: unknown,
    permission: string,
    callback: (granted: boolean) => void,
    details: { requestingUrl: string },
  ) => void;
  check: (wc: unknown, permission: string, origin: string) => boolean;
}

function install(): Handlers {
  webContentsCreated.length = 0;
  installSecurity();
  let request: Handlers['request'] | null = null;
  let check: Handlers['check'] | null = null;
  const contents = {
    session: {
      setPermissionRequestHandler: (h: Handlers['request']) => {
        request = h;
      },
      setPermissionCheckHandler: (h: Handlers['check']) => {
        check = h;
      },
    },
  };
  webContentsCreated[0]?.(null, contents);
  if (request === null || check === null) throw new Error('handlers were not installed');
  return { request, check };
}

function ask(h: Handlers, permission: string, url = 'https://evil.example.com/'): Promise<boolean> {
  return new Promise((resolve) => {
    h.request(null, permission, resolve, { requestingUrl: url });
  });
}

beforeEach(() => {
  allowed.clear();
  onHeadersReceived.mockClear(); // `install()` runs per test, so the CSP spy would otherwise accumulate
});

describe('permission request handler', () => {
  const denied = ALL_PERMISSIONS.filter((p) => !BROKERED.has(p));

  for (const permission of denied) {
    it(`denies ${permission} without asking anyone`, async () => {
      await expect(ask(install(), permission)).resolves.toBe(false);
    });
  }

  it('routes the brokered capabilities to the broker instead of refusing them outright', async () => {
    allowed.add('notifications');
    allowed.add('clipboardRead');
    const h = install();
    await expect(ask(h, 'notifications')).resolves.toBe(true);
    await expect(ask(h, 'clipboard-read')).resolves.toBe(true);
    // …and the broker's "no" is honoured, so a granted capability is not a permanent yes.
    await expect(ask(h, 'clipboard-sanitized-write')).resolves.toBe(false);
  });

  it('denies a brokered capability when the requesting URL cannot be parsed into an origin', async () => {
    allowed.add('notifications');
    await expect(ask(install(), 'notifications', 'not a url')).resolves.toBe(false);
  });
});

describe('permission check handler (the synchronous permission-state query)', () => {
  it('reports every non-brokered permission as denied', () => {
    const h = install();
    for (const permission of ALL_PERMISSIONS.filter((p) => !BROKERED.has(p))) {
      expect(h.check(null, permission, 'https://evil.example.com')).toBe(false);
    }
  });

  it('reflects a stored grant for a brokered one, and only for the origin that holds it', () => {
    allowed.add('notifications');
    const h = install();
    expect(h.check(null, 'notifications', 'https://granted.example.com')).toBe(true);
    expect(h.check(null, 'geolocation', 'https://granted.example.com')).toBe(false);
  });
});

describe('chrome CSP', () => {
  it('is applied to the app partition, not to browsed pages', () => {
    install();
    expect(onHeadersReceived).toHaveBeenCalledTimes(1);
    const handler = onHeadersReceived.mock.calls[0]?.[0] as (
      d: { responseHeaders: Record<string, string[]> },
      cb: (r: { responseHeaders: Record<string, string[]> }) => void,
    ) => void;
    let headers: Record<string, string[]> = {};
    handler({ responseHeaders: {} }, (r) => {
      headers = r.responseHeaders;
    });
    const csp = headers['Content-Security-Policy']?.[0] ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Packaged build: no dev-server escape hatch may survive into it.
    expect(csp).not.toContain('unsafe-inline; ');
    expect(csp).not.toContain('ws:');
  });
});

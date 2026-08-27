import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The deny-by-default permission handler — which had no test at all, despite being the control that
 * decides whether a browsed page can reach the camera, the microphone, the screen, the user's location
 * or their files.
 *
 * The property under test is the DEFAULT, not the exceptions. A fixed set of capabilities is brokered
 * per-site — notifications, the two clipboard permissions, and (since the Permissions Center) camera,
 * microphone and geolocation; every other permission Electron can hand us must be refused without
 * asking anyone. Writing it this way — enumerate Electron's whole union, assert the complement is
 * denied — means a permission ADDED by a future Electron is denied by this test's own construction,
 * and a capability someone quietly adds to `permissionCapabilities` fails it.
 *
 * **Brokering camera/mic/location is not a weakening of the floor, and this file is where that claim
 * is checked rather than asserted.** A brokered capability still reaches no site without an explicit
 * per-origin answer from the user; what changed is that "ask" became reachable where it used to be a
 * flat refusal. The tests below pin both halves: nothing outside the union can even be asked for, and
 * a brokered one is refused until it is granted, for the exact origin that holds the grant.
 *
 * `display-capture` stays OUTSIDE the union deliberately and is asserted so. It is the one request
 * where a single mistaken "allow" hands over everything else on the screen, including windows this
 * browser does not own.
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
vi.mock('./internal-pages/protocol', () => ({ INTERNAL_PAGES_SCHEME: 'tepegoz' }));

const allowed = new Set<string>();
const asked: string[] = [];
vi.mock('./web-permissions/permission-broker', () => ({
  default: {
    request: (capability: string) => {
      asked.push(capability);
      return Promise.resolve(allowed.has(capability));
    },
    requestAll: (capabilities: string[]) => {
      for (const c of capabilities) {
        asked.push(c);
        if (!allowed.has(c)) return Promise.resolve(false);
      }
      return Promise.resolve(capabilities.length > 0);
    },
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

/** The only Chromium permissions that may reach the broker instead of being refused outright. */
const BROKERED = new Set([
  'notifications',
  'clipboard-read',
  'clipboard-sanitized-write',
  'deprecated-sync-clipboard-read',
  'geolocation',
  'media',
]);

interface Handlers {
  request: (
    wc: unknown,
    permission: string,
    callback: (granted: boolean) => void,
    details: { requestingUrl: string; mediaTypes?: readonly string[] },
  ) => void;
  check: (
    wc: unknown,
    permission: string,
    origin: string,
    details: { mediaType?: string },
  ) => boolean;
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

function ask(
  h: Handlers,
  permission: string,
  url = 'https://evil.example.com/',
  mediaTypes?: readonly string[],
): Promise<boolean> {
  return new Promise((resolve) => {
    h.request(null, permission, resolve, {
      requestingUrl: url,
      ...(mediaTypes === undefined ? {} : { mediaTypes }),
    });
  });
}

beforeEach(() => {
  allowed.clear();
  asked.length = 0;
  onHeadersReceived.mockClear(); // `install()` runs per test, so the CSP spy would otherwise accumulate
});

describe('permission request handler', () => {
  const denied = ALL_PERMISSIONS.filter((p) => !BROKERED.has(p));

  for (const permission of denied) {
    it(`denies ${permission} without asking anyone`, async () => {
      await expect(ask(install(), permission)).resolves.toBe(false);
      expect(asked).toEqual([]); // refused outright — the broker was never consulted
    });
  }

  it('refuses screen capture even though camera and microphone are brokered', async () => {
    // The distinction is the point: `display-capture` gives up every other window on the screen,
    // including ones this browser does not own, on a single mistaken click.
    await expect(ask(install(), 'display-capture')).resolves.toBe(false);
    expect(asked).toEqual([]);
  });

  it('refuses a media request that names NO media type', async () => {
    // A request for we-don't-know-what has no grant that could honestly cover it.
    await expect(ask(install(), 'media')).resolves.toBe(false);
    expect(asked).toEqual([]);
  });

  it('splits a media request into the capabilities it actually needs', async () => {
    allowed.add('camera');
    allowed.add('microphone');
    await expect(ask(install(), 'media', 'https://a.example/', ['video'])).resolves.toBe(true);
    expect(asked).toEqual(['camera']); // audio was never requested, so it is never asked about
  });

  it('requires BOTH grants when a page asks for camera AND microphone', async () => {
    // Mapping `media` to one capability would have meant a site granted the microphone silently
    // receiving the camera as well.
    allowed.add('microphone');
    await expect(ask(install(), 'media', 'https://a.example/', ['video', 'audio'])).resolves.toBe(
      false,
    );
    expect(asked).toEqual(['camera']); // and it stops at the refusal rather than asking twice
  });

  it('grants camera+microphone only when both are allowed', async () => {
    allowed.add('camera');
    allowed.add('microphone');
    await expect(ask(install(), 'media', 'https://a.example/', ['video', 'audio'])).resolves.toBe(
      true,
    );
    expect(asked).toEqual(['camera', 'microphone']);
  });

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
      expect(h.check(null, permission, 'https://evil.example.com', {})).toBe(false);
    }
  });

  it('reflects a stored grant for a brokered one, and not for one without a grant', () => {
    allowed.add('notifications');
    const h = install();
    expect(h.check(null, 'notifications', 'https://granted.example.com', {})).toBe(true);
    expect(h.check(null, 'geolocation', 'https://granted.example.com', {})).toBe(false);
  });

  it('answers a media check for the media type it names', () => {
    allowed.add('camera');
    const h = install();
    expect(h.check(null, 'media', 'https://a.example', { mediaType: 'video' })).toBe(true);
    expect(h.check(null, 'media', 'https://a.example', { mediaType: 'audio' })).toBe(false);
  });

  it("refuses a media check of type 'unknown' rather than guessing", () => {
    // The honest answer to "is this granted?" when we cannot tell what "this" is.
    allowed.add('camera');
    allowed.add('microphone');
    const h = install();
    expect(h.check(null, 'media', 'https://a.example', { mediaType: 'unknown' })).toBe(false);
  });

  it('does not crash when Electron supplies no details at all', () => {
    // Defensive: the typings say `details` is always present, and a check handler that threw would
    // take down a permission query rather than answering it.
    const h = install();
    expect(() =>
      h.check(null, 'media', 'https://a.example', undefined as unknown as { mediaType?: string }),
    ).not.toThrow();
  });
});

describe('chrome CSP', () => {
  type HeadersHandler = (
    d: { url: string; responseHeaders: Record<string, string[]> },
    cb: (r: { responseHeaders?: Record<string, string[]> }) => void,
  ) => void;

  function headersHandler(): HeadersHandler {
    install();
    expect(onHeadersReceived).toHaveBeenCalledTimes(1);
    return onHeadersReceived.mock.calls[0]?.[0] as HeadersHandler;
  }

  it('is applied to the app partition, not to browsed pages', () => {
    const handler = headersHandler();
    let headers: Record<string, string[]> = {};
    handler({ url: 'file:///out/renderer/index.html', responseHeaders: {} }, (r) => {
      headers = r.responseHeaders ?? {};
    });
    const csp = headers['Content-Security-Policy']?.[0] ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Packaged build: no dev-server escape hatch may survive into it.
    expect(csp).not.toContain('unsafe-inline; ');
    expect(csp).not.toContain('ws:');
  });

  it('leaves a tepegoz:// response untouched — it carries its own hash-based CSP already', () => {
    // Overwriting it here with the generic chrome CSP would drop the hash `internal-pages/protocol.ts`
    // computed for its inlined script; in a packaged build (no `unsafe-inline`) that silently blocks the
    // page's own script instead of merely weakening it.
    const handler = headersHandler();
    const original = { 'content-security-policy': ["script-src 'self' 'sha256-realHash'"] };
    let result: { responseHeaders?: Record<string, string[]> } | undefined;
    handler({ url: 'tepegoz://settings/', responseHeaders: original }, (r) => {
      result = r;
    });
    expect(result?.responseHeaders).toBeUndefined();
  });
});

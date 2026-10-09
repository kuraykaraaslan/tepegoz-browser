import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const prefs = vi.hoisted(() => {
  const state: { values: Record<string, unknown> } = { values: { httpsOnlyOnTunnel: true } };
  return state;
});
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs.values } }));

const pool = vi.hoisted(() => ({ kinds: new Map<string, string>() }));
vi.mock('./connection-pool.electron', () => ({
  default: {
    get: (id: string) => (pool.kinds.has(id) ? { kind: pool.kinds.get(id) } : undefined),
  },
}));

const electron = vi.hoisted(() => ({ urls: new Map<number, string>() }));
vi.mock('electron', () => ({
  webContents: {
    fromId: (id: number) =>
      electron.urls.has(id) ? { getURL: () => electron.urls.get(id) } : null,
  },
}));

const BrowsingWebRequestService = (
  await import('../web-request/browsing-web-request-service.electron')
).default;
const https = await import('./https-only.electron');

const TOR = 'persist:tepegoz-web--conn-tor1';
const TOR_PRIVATE = 'tepegoz-private--conn-tor1';
const DIRECT = 'persist:tepegoz-web';

function details(
  url: string,
  extra: Partial<Electron.OnBeforeRequestListenerDetails> = {},
): Electron.OnBeforeRequestListenerDetails {
  return {
    id: 1,
    url,
    method: 'GET',
    resourceType: 'mainFrame',
    referrer: '',
    timestamp: 0,
    uploadData: [],
    webContentsId: 5,
    ...extra,
  };
}

function fakeWebRequest() {
  let before:
    | ((
        d: Electron.OnBeforeRequestListenerDetails,
        cb: (r: Electron.CallbackResponse) => void,
      ) => void)
    | null = null;
  return {
    webRequest: {
      onBeforeRequest: (l: NonNullable<typeof before>) => {
        before = l;
      },
      onHeadersReceived: () => undefined,
      onCompleted: () => undefined,
      onErrorOccurred: () => undefined,
    } as unknown as Electron.WebRequest,
    before: (d: Electron.OnBeforeRequestListenerDetails) =>
      new Promise<Electron.CallbackResponse>((resolve) => {
        before!(d, resolve);
      }),
  };
}

const run = (d: Electron.OnBeforeRequestListenerDetails, partition: string | null = TOR) =>
  https.httpsOnlyHandler(d, partition === null ? {} : { partition });

beforeEach(() => {
  https.resetHttpsOnlyForTests();
  BrowsingWebRequestService.resetForTests();
  prefs.values = { httpsOnlyOnTunnel: true };
  pool.kinds.clear();
  pool.kinds.set('tor1', 'tor');
  electron.urls.clear();
  logger.warn.mockReset();
});

describe('httpsOnlyHandler: upgrade and scope', () => {
  it('upgrades a main-frame GET on a tunnel partition', () => {
    expect(run(details('http://old.example/a?b=1'))).toEqual({
      redirectURL: 'https://old.example/a?b=1',
    });
  });

  it('enforces the private-tunnel partition spelling too', () => {
    expect(run(details('http://old.example/'), TOR_PRIVATE)).toEqual({
      redirectURL: 'https://old.example/',
    });
  });

  it('never touches a Direct partition or a request with no partition', () => {
    expect(run(details('http://old.example/'), DIRECT)).toBeUndefined();
    expect(run(details('http://old.example/'), null)).toBeUndefined();
    expect(run(details('ws://old.example/s'), DIRECT)).toBeUndefined();
  });

  it('ignores https and other schemes without reading preferences', () => {
    prefs.values = new Proxy(
      {},
      {
        get: () => {
          throw new Error('prefs read');
        },
      },
    );
    expect(run(details('https://ok.example/'))).toBeUndefined();
    expect(run(details('data:text/html,hi'))).toBeUndefined();
  });

  it('allows everything when the preference is off', () => {
    prefs.values = { httpsOnlyOnTunnel: false };
    expect(run(details('http://old.example/'))).toBeUndefined();
  });

  it('cancels a non-GET and ws: instead of upgrading', () => {
    expect(run(details('http://old.example/', { method: 'POST' }))).toEqual({ cancel: true });
    expect(run(details('ws://old.example/s', { resourceType: 'webSocket' }))).toEqual({
      cancel: true,
    });
  });

  it('upgrades a subresource GET and cancels a subresource POST', () => {
    expect(run(details('http://cdn.example/x.js', { resourceType: 'script' }))).toEqual({
      redirectURL: 'https://cdn.example/x.js',
    });
    expect(run(details('http://cdn.example/x', { resourceType: 'xhr', method: 'PUT' }))).toEqual({
      cancel: true,
    });
  });

  it('allows loopback', () => {
    expect(run(details('http://127.0.0.1:3000/'))).toBeUndefined();
    expect(run(details('http://localhost/'))).toBeUndefined();
  });

  it('does not exempt LAN, private or dotless hosts', () => {
    expect(run(details('http://192.168.1.1/'))).toEqual({ redirectURL: 'https://192.168.1.1/' });
    expect(run(details('http://intranet/'))).toEqual({ redirectURL: 'https://intranet/' });
  });
});

describe('httpsOnlyHandler: .onion and tunnel kind', () => {
  it('allows .onion only when the connection is Tor', () => {
    expect(run(details('http://abc.onion/'))).toBeUndefined();
    pool.kinds.set('tor1', 'wireguard');
    expect(run(details('http://abc.onion/'))).toEqual({ redirectURL: 'https://abc.onion/' });
  });

  it('treats an unknown connection id as not Tor', () => {
    pool.kinds.clear();
    expect(https.tunnelKindOfPartition(TOR)).toBe('unknown');
    expect(run(details('http://abc.onion/'))).toEqual({ redirectURL: 'https://abc.onion/' });
  });

  it('maps pool kinds and labels them', () => {
    pool.kinds.set('tor1', 'byo-socks');
    expect(https.tunnelKindOfPartition(TOR)).toBe('socks');
    pool.kinds.set('tor1', 'wireguard');
    expect(https.tunnelKindOfPartition(TOR)).toBe('vpn');
    expect(https.tunnelKindOfPartition(DIRECT)).toBe('direct');
    pool.kinds.delete('tor1');
    expect(https.tunnelKindOfPartition(TOR)).toBe('unknown'); // a tunnel partition whose connection is gone
    expect(https.tunnelLabel('tor')).toBe('Tor');
    expect(https.tunnelLabel('vpn')).toBe('WireGuard');
    expect(https.tunnelLabel('socks')).toBe('SOCKS');
    expect(https.tunnelLabel('unknown')).toBe('VPN');
    expect(https.tunnelLabel('direct')).toBe(''); // nothing to name: the page uses the no-tunnel wording
  });
});

describe('httpsOnlyHandler: fail closed', () => {
  it('cancels on a tunnel partition when the internal read throws', () => {
    prefs.values = new Proxy(
      {},
      {
        get: () => {
          throw new Error('boom');
        },
      },
    );
    expect(run(details('http://old.example/'))).toEqual({ cancel: true });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('still allows on a Direct partition when the internal read would throw', () => {
    prefs.values = new Proxy(
      {},
      {
        get: () => {
          throw new Error('boom');
        },
      },
    );
    expect(run(details('http://old.example/'), DIRECT)).toBeUndefined();
  });

  it('cancels (not allows) a main-frame URL the handler cannot parse', () => {
    expect(run(details('http://'))).toEqual({ cancel: true });
  });
});

describe('httpsOnlyHandler: bypass', () => {
  it('allows a bypassed (partition, host) and does not leak to another partition or host', () => {
    https.addHttpsOnlyBypass(TOR, 'Old.Example');
    expect(run(details('http://old.example/'))).toBeUndefined();
    expect(run(details('http://old.example/'), TOR_PRIVATE)).toEqual({
      redirectURL: 'https://old.example/',
    });
    expect(run(details('http://other.example/'))).toEqual({
      redirectURL: 'https://other.example/',
    });
  });

  it('allows a same-host subresource when the top-level page host is bypassed', () => {
    https.addHttpsOnlyBypass(TOR, 'old.example');
    electron.urls.set(5, 'http://old.example/page');
    expect(run(details('http://old.example/x.js', { resourceType: 'script' }))).toBeUndefined();
  });

  it('still upgrades a THIRD-PARTY http subresource on a bypassed page', () => {
    https.addHttpsOnlyBypass(TOR, 'old.example');
    electron.urls.set(5, 'http://old.example/page');
    expect(run(details('http://tracker.example/p.png', { resourceType: 'image' }))).toEqual({
      redirectURL: 'https://tracker.example/p.png',
    });
    expect(
      run(details('http://tracker.example/', { resourceType: 'xhr', method: 'POST' })),
    ).toEqual({ cancel: true });
  });

  it('still enforces a subresource when the top-level host is not bypassed', () => {
    https.addHttpsOnlyBypass(TOR, 'old.example');
    electron.urls.set(5, 'http://elsewhere.example/page');
    expect(run(details('http://old.example/x.js', { resourceType: 'script' }))).toEqual({
      redirectURL: 'https://old.example/x.js',
    });
  });

  it('enforces a subresource with no webContentsId or a vanished contents', () => {
    https.addHttpsOnlyBypass(TOR, 'old.example');
    const noId = details('http://old.example/x.js', { resourceType: 'script' });
    delete (noId as { webContentsId?: number }).webContentsId;
    expect(run(noId)).toEqual({ redirectURL: 'https://old.example/x.js' });
    expect(
      run(details('http://old.example/x.js', { resourceType: 'script', webContentsId: 99 })),
    ).toEqual({
      redirectURL: 'https://old.example/x.js',
    });
  });

  it('caps the bypass set at 200, dropping the oldest', () => {
    for (let i = 0; i < 201; i++) https.addHttpsOnlyBypass(TOR, `h${String(i)}.example`);
    expect(https.isHttpsOnlyBypassed(TOR, 'h0.example')).toBe(false);
    expect(https.isHttpsOnlyBypassed(TOR, 'h200.example')).toBe(true);
  });
});

describe('httpsOnlyHandler: loop guard and pending record', () => {
  it('cancels a second identical http main-frame URL within the TTL as a loop', () => {
    expect(run(details('http://old.example/'))).toEqual({ redirectURL: 'https://old.example/' });
    expect(run(details('http://old.example/'))).toEqual({ cancel: true });
    expect(https.getPendingHttpsOnly(5)?.reason).toBe('loop');
  });

  it('does not mistake the same link opened again after the navigation ended for a loop', () => {
    expect(run(details('http://old.example/'))).toEqual({ redirectURL: 'https://old.example/' });
    https.clearPendingHttpsOnly(5);
    expect(run(details('http://old.example/'))).toEqual({ redirectURL: 'https://old.example/' });
  });

  it('keeps the loop guard per tab: another tab opening the same link is not a loop', () => {
    expect(run(details('http://old.example/'))).toEqual({ redirectURL: 'https://old.example/' });
    expect(run(details('http://old.example/', { webContentsId: 6 }))).toEqual({
      redirectURL: 'https://old.example/',
    });
  });

  it('records the upgrade for the tab and expires it after 60s', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    run(details('http://Old.Example/p'));
    expect(https.getPendingHttpsOnly(5)).toMatchObject({
      host: 'old.example',
      httpUrl: 'http://Old.Example/p',
      reason: 'upgraded',
    });
    now.mockReturnValue(1_000 + 60_000);
    expect(https.getPendingHttpsOnly(5)).toBeUndefined();
    now.mockRestore();
  });

  it('records a non-get cancel and can be cleared', () => {
    run(details('http://old.example/', { method: 'POST' }));
    expect(https.getPendingHttpsOnly(5)?.reason).toBe('non-get');
    https.clearPendingHttpsOnly(5);
    expect(https.getPendingHttpsOnly(5)).toBeUndefined();
  });

  it('records nothing for a subresource or an allowed request', () => {
    run(details('http://cdn.example/x.js', { resourceType: 'script' }));
    run(details('http://localhost/'));
    expect(https.getPendingHttpsOnly(5)).toBeUndefined();
  });
});

describe('registration with the multiplexer', () => {
  it('runs before adblock, so adblock still cancels the upgraded URL', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest, { partition: TOR });
    https.registerHttpsOnly();
    const adblockSaw: string[] = [];
    BrowsingWebRequestService.onBeforeRequest('adblock', (d) => {
      adblockSaw.push(d.url);
      return d.url.startsWith('https://ads.') ? { cancel: true } : undefined;
    });

    await expect(fake.before(details('http://old.example/'))).resolves.toEqual({
      redirectURL: 'https://old.example/',
    });
    // The redirected request comes back through the same pipeline as an https URL.
    await expect(fake.before(details('https://ads.example/t.js'))).resolves.toEqual({
      cancel: true,
    });
    expect(adblockSaw).toEqual(['https://ads.example/t.js']);
  });

  it('the multiplexer hands the handler its partition, and a Direct session is untouched', async () => {
    const tunnel = fakeWebRequest();
    const direct = fakeWebRequest();
    BrowsingWebRequestService.attach(tunnel.webRequest, { partition: TOR });
    BrowsingWebRequestService.attach(direct.webRequest, { partition: DIRECT });
    https.registerHttpsOnly();
    await expect(tunnel.before(details('http://a.example/'))).resolves.toEqual({
      redirectURL: 'https://a.example/',
    });
    await expect(direct.before(details('http://a.example/'))).resolves.toEqual({});
  });

  it('the returned disposer unregisters it', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest, { partition: TOR });
    https.registerHttpsOnly()();
    await expect(fake.before(details('http://a.example/'))).resolves.toEqual({});
  });
});

describe('HTTPS-first everywhere (Direct and private sessions)', () => {
  beforeEach(() => {
    prefs.values = { httpsOnlyOnTunnel: true, httpsFirstEverywhere: true };
  });

  it('upgrades a top-level GET navigation on an ordinary session', () => {
    expect(run(details('http://example.test/page?q=1'), DIRECT)).toEqual({
      redirectURL: 'https://example.test/page?q=1',
    });
    expect(run(details('http://example.test/'), 'tepegoz-private')).toEqual({
      redirectURL: 'https://example.test/',
    });
  });

  it('does nothing while the setting is off — the tunnel setting alone never reaches a Direct session', () => {
    prefs.values = { httpsOnlyOnTunnel: true, httpsFirstEverywhere: false };
    expect(run(details('http://example.test/'), DIRECT)).toBeUndefined();
    prefs.values = { httpsOnlyOnTunnel: true }; // a preferences object that predates the field
    expect(run(details('http://example.test/'), DIRECT)).toBeUndefined();
  });

  it('leaves sub-resources, form posts and WebSockets alone — it never cancels on the open web', () => {
    expect(
      run(details('http://cdn.test/x.js', { resourceType: 'script' }), DIRECT),
    ).toBeUndefined();
    expect(run(details('http://example.test/post', { method: 'POST' }), DIRECT)).toBeUndefined();
    expect(
      run(details('ws://example.test/socket', { resourceType: 'webSocket' }), DIRECT),
    ).toBeUndefined();
    expect(
      run(details('http://example.test/frame', { resourceType: 'subFrame' }), DIRECT),
    ).toBeUndefined();
  });

  it.each([
    'http://localhost/',
    'http://127.0.0.1:8080/',
    'http://printer/',
    'http://nas.local/',
    'http://192.168.1.1/',
    'http://10.0.0.5/',
    'http://172.20.1.1/',
    'http://169.254.1.1/',
    'http://[fd12::1]/',
    'http://[fe80::1]/',
  ])('exempts the local-network address %s', (url) => {
    expect(run(details(url), DIRECT)).toBeUndefined();
  });

  it.each(['http://8.8.8.8/', 'http://172.32.0.1/', 'http://example.com/'])(
    'does NOT exempt the public address %s',
    (url) => {
      const res = run(details(url), DIRECT);
      expect(res?.redirectURL?.startsWith('https://')).toBe(true);
    },
  );

  it('honours a per-site bypass on the Direct session, and does not leak it to a tunnel partition', () => {
    https.addHttpsOnlyBypass(DIRECT, 'example.test');
    expect(run(details('http://example.test/'), DIRECT)).toBeUndefined();
    expect(run(details('http://example.test/'), TOR)).toEqual({
      redirectURL: 'https://example.test/',
    });
  });

  it('guards against a redirect loop with a cancel, as on a tunnel', () => {
    expect(run(details('http://loop.test/'), DIRECT)).toEqual({
      redirectURL: 'https://loop.test/',
    });
    expect(run(details('http://loop.test/'), DIRECT)).toEqual({ cancel: true });
    expect(https.getPendingHttpsOnly(5)?.reason).toBe('loop');
  });

  it('fails OPEN on a Direct session: an internal error lets the page load instead of cancelling it', () => {
    prefs.values = new Proxy(
      {},
      {
        get: () => {
          throw new Error('boom');
        },
      },
    );
    expect(run(details('http://example.test/'), DIRECT)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not change the tunnel behaviour: a tunnel partition still follows its own setting', () => {
    prefs.values = { httpsOnlyOnTunnel: false, httpsFirstEverywhere: true };
    expect(run(details('http://example.test/'), TOR)).toBeUndefined();
    prefs.values = { httpsOnlyOnTunnel: true, httpsFirstEverywhere: false };
    expect(run(details('http://example.test/post', { method: 'POST' }), TOR)).toEqual({
      cancel: true,
    });
  });
});

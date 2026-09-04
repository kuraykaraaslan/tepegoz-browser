import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const BrowsingWebRequestService = (await import('./browsing-web-request-service.electron')).default;

function beforeDetails(id = 1): Electron.OnBeforeRequestListenerDetails {
  return {
    id,
    url: `https://example.test/${id}`,
    method: 'GET',
    resourceType: 'script',
    referrer: 'https://page.test/',
    timestamp: Date.now(),
    uploadData: [],
  };
}

function headersDetails(id = 1): Electron.OnHeadersReceivedListenerDetails {
  return {
    id,
    url: `https://example.test/${id}`,
    method: 'GET',
    resourceType: 'script',
    referrer: 'https://page.test/',
    timestamp: Date.now(),
    statusLine: 'HTTP/1.1 200 OK',
    statusCode: 200,
    responseHeaders: { server: ['fixture'] },
  };
}

function fakeWebRequest() {
  let before:
    | ((
        details: Electron.OnBeforeRequestListenerDetails,
        callback: (response: Electron.CallbackResponse) => void,
      ) => void)
    | null = null;
  let headers:
    | ((
        details: Electron.OnHeadersReceivedListenerDetails,
        callback: (response: Electron.HeadersReceivedResponse) => void,
      ) => void)
    | null = null;
  let completed: ((details: Electron.OnCompletedListenerDetails) => void) | null = null;
  let errorOccurred: ((details: Electron.OnErrorOccurredListenerDetails) => void) | null = null;

  return {
    webRequest: {
      onBeforeRequest: (listener: NonNullable<typeof before>) => {
        before = listener;
      },
      onHeadersReceived: (listener: NonNullable<typeof headers>) => {
        headers = listener;
      },
      onCompleted: (listener: NonNullable<typeof completed>) => {
        completed = listener;
      },
      onErrorOccurred: (listener: NonNullable<typeof errorOccurred>) => {
        errorOccurred = listener;
      },
    } as unknown as Electron.WebRequest,
    before: (details = beforeDetails()) =>
      new Promise<Electron.CallbackResponse>((resolve) => {
        if (before === null) throw new Error('before listener missing');
        before(details, resolve);
      }),
    headers: (details = headersDetails()) =>
      new Promise<Electron.HeadersReceivedResponse>((resolve) => {
        if (headers === null) throw new Error('headers listener missing');
        headers(details, resolve);
      }),
    completed: (details: Electron.OnCompletedListenerDetails) => {
      if (completed === null) throw new Error('completed listener missing');
      completed(details);
    },
    errorOccurred: (details: Electron.OnErrorOccurredListenerDetails) => {
      if (errorOccurred === null) throw new Error('error listener missing');
      errorOccurred(details);
    },
  };
}

describe('BrowsingWebRequestService', () => {
  beforeEach(() => {
    BrowsingWebRequestService.resetForTests();
    logger.warn.mockReset();
  });

  it('runs before-request handlers in order and stops at the first cancel/redirect', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest);
    const uploadObserver = vi.fn();
    const late = vi.fn();

    BrowsingWebRequestService.onBeforeRequest('uploads', (details) => {
      uploadObserver(details.id);
    });
    BrowsingWebRequestService.onBeforeRequest('adblock', () => ({ cancel: true }));
    BrowsingWebRequestService.onBeforeRequest('late', late);

    await expect(fake.before(beforeDetails(7))).resolves.toEqual({ cancel: true });
    expect(uploadObserver).toHaveBeenCalledWith(7);
    expect(late).not.toHaveBeenCalled();
  });

  it('merges response headers while preserving the original headers', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest);

    BrowsingWebRequestService.onHeadersReceived('a', () => ({
      responseHeaders: { 'x-a': ['1'] },
    }));
    BrowsingWebRequestService.onHeadersReceived('b', () => ({
      responseHeaders: { 'x-b': ['2'] },
      statusLine: 'HTTP/1.1 204 No Content',
    }));

    await expect(fake.headers()).resolves.toEqual({
      responseHeaders: { server: ['fixture'], 'x-a': ['1'], 'x-b': ['2'] },
      statusLine: 'HTTP/1.1 204 No Content',
    });
  });

  it('fails open on handler errors and continues to later handlers', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest);

    BrowsingWebRequestService.onBeforeRequest('bad', () => {
      throw new Error('boom');
    });
    BrowsingWebRequestService.onBeforeRequest('good', () => ({
      redirectURL: 'https://safe.test/',
    }));

    await expect(fake.before()).resolves.toEqual({ redirectURL: 'https://safe.test/' });
  });

  it('fails open on a headers-received handler error and still merges a later handler', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest);

    BrowsingWebRequestService.onHeadersReceived('bad', () => {
      throw new Error('headers boom');
    });
    BrowsingWebRequestService.onHeadersReceived('good', () => ({
      responseHeaders: { 'x-good': ['1'] },
    }));

    const res = await fake.headers();
    expect(res.responseHeaders).toMatchObject({ server: ['fixture'], 'x-good': ['1'] });
  });

  it('fails open when the WHOLE before-request pipeline throws (even the log sink), returning {}', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest);
    BrowsingWebRequestService.onBeforeRequest('bad', () => {
      throw new Error('boom');
    });
    // The per-handler catch calls Logger.warn — make THAT throw once, so the rejection escapes
    // runBeforeRequest itself and lands in the listener's outer `.then(_, onRejected)` arm.
    logger.warn.mockImplementationOnce(() => {
      throw new Error('log sink down');
    });

    await expect(fake.before()).resolves.toEqual({});
    expect(logger.warn).toHaveBeenCalledWith(
      'webRequest onBeforeRequest pipeline failed open',
      expect.objectContaining({ err: expect.stringContaining('log sink down') as string }),
    );
  });

  it('fails open when the WHOLE headers-received pipeline throws, still applying the session stamp', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest, {
      stampResponseHeaders: { 'x-dns-prefetch-control': 'off' },
    });
    BrowsingWebRequestService.onHeadersReceived('bad', () => {
      throw new Error('headers boom');
    });
    logger.warn.mockImplementationOnce(() => {
      throw new Error('log sink down');
    });

    const res = await fake.headers();
    expect(res.responseHeaders).toMatchObject({ 'x-dns-prefetch-control': ['off'] });
    expect(logger.warn).toHaveBeenCalledWith(
      'webRequest onHeadersReceived pipeline failed open',
      expect.objectContaining({ err: expect.stringContaining('log sink down') as string }),
    );
  });

  it('the unsubscribe closures stop each kind of handler from running again', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest);

    const before = vi.fn();
    const headers = vi.fn(() => ({ responseHeaders: { 'x-h': ['1'] } }));
    const completed = vi.fn();
    const errored = vi.fn();

    const offBefore = BrowsingWebRequestService.onBeforeRequest('b', (d) => {
      before(d.id);
    });
    const offHeaders = BrowsingWebRequestService.onHeadersReceived('h', headers);
    const offCompleted = BrowsingWebRequestService.onCompleted('c', completed);
    const offErrored = BrowsingWebRequestService.onErrorOccurred('e', errored);

    offBefore();
    offHeaders();
    offCompleted();
    offErrored();

    await fake.before(beforeDetails(1));
    await fake.headers();
    fake.completed({ id: 2 } as Electron.OnCompletedListenerDetails);
    fake.errorOccurred({ id: 3, error: 'x' } as Electron.OnErrorOccurredListenerDetails);

    expect(before).not.toHaveBeenCalled();
    expect(headers).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
    expect(errored).not.toHaveBeenCalled();
  });

  it('keeps completed and error observers independent', () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest);
    const completedA = vi.fn();
    const completedB = vi.fn();
    const failed = vi.fn();

    BrowsingWebRequestService.onCompleted('a', completedA);
    BrowsingWebRequestService.onCompleted('b', completedB);
    BrowsingWebRequestService.onErrorOccurred('err', failed);

    fake.completed({ id: 1 } as Electron.OnCompletedListenerDetails);
    fake.errorOccurred({
      id: 2,
      error: 'net::ERR_FAILED',
    } as Electron.OnErrorOccurredListenerDetails);

    expect(completedA).toHaveBeenCalledOnce();
    expect(completedB).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, error: 'net::ERR_FAILED' }),
    );
  });
  it('attaches to MORE THAN ONE session, running the same pipeline on each (Phase 5 tunnel partitions)', async () => {
    // The regression this replaces: a one-shot `initialized` flag gave the first session the whole
    // filtering plane and every later one — every VPN/Tor tunnel partition — nothing at all, silently.
    const direct = fakeWebRequest();
    const tunnel = fakeWebRequest();
    BrowsingWebRequestService.attach(direct.webRequest);
    BrowsingWebRequestService.attach(tunnel.webRequest);

    const blocked: string[] = [];
    BrowsingWebRequestService.onBeforeRequest('adblock', (details) => {
      blocked.push(details.url);
      return { cancel: true };
    });

    await expect(direct.before(beforeDetails(1))).resolves.toEqual({ cancel: true });
    await expect(tunnel.before(beforeDetails(2))).resolves.toEqual({ cancel: true });
    expect(blocked).toHaveLength(2);
  });

  it('attaching the SAME session twice does not double-run the pipeline', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest);
    BrowsingWebRequestService.attach(fake.webRequest);
    const seen = vi.fn();
    BrowsingWebRequestService.onBeforeRequest('count', (details) => {
      seen(details.id);
    });
    await fake.before(beforeDetails(1));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  describe('the per-session response-header stamp', () => {
    const STAMP = { 'x-dns-prefetch-control': 'off' };

    it('is merged onto whatever the handler pipeline produced', async () => {
      const fake = fakeWebRequest();
      BrowsingWebRequestService.attach(fake.webRequest, { stampResponseHeaders: STAMP });
      BrowsingWebRequestService.onHeadersReceived('a', () => ({
        responseHeaders: { 'x-a': ['1'] },
      }));

      const res = await fake.headers();
      expect(res.responseHeaders).toMatchObject({
        server: ['fixture'],
        'x-a': ['1'],
        'x-dns-prefetch-control': ['off'],
      });
    });

    it('overrides an existing value for the same header, and wraps a scalar header value', async () => {
      const fake = fakeWebRequest();
      BrowsingWebRequestService.attach(fake.webRequest, {
        stampResponseHeaders: { 'x-dns-prefetch-control': 'off' },
      });
      const details = {
        ...headersDetails(),
        responseHeaders: {
          'x-dns-prefetch-control': ['on'],
          'x-scalar': 'plain' as unknown as string[],
        },
      };
      const res = await fake.headers(details);
      expect(res.responseHeaders?.['x-dns-prefetch-control']).toEqual(['off']);
      expect(res.responseHeaders?.['x-scalar']).toEqual(['plain']);
    });

    it('is skipped when a handler cancelled the request', async () => {
      const fake = fakeWebRequest();
      BrowsingWebRequestService.attach(fake.webRequest, { stampResponseHeaders: STAMP });
      BrowsingWebRequestService.onHeadersReceived('block', () => ({ cancel: true }));

      const res = await fake.headers();
      expect(res).toEqual({ cancel: true });
    });

    it('is still applied when there were no handlers at all', async () => {
      const fake = fakeWebRequest();
      BrowsingWebRequestService.attach(fake.webRequest, { stampResponseHeaders: STAMP });
      const res = await fake.headers();
      expect(res.responseHeaders?.['x-dns-prefetch-control']).toEqual(['off']);
    });
  });

  it('a headers handler that only sets a status line still merges into the response', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest);
    BrowsingWebRequestService.onHeadersReceived('sl', () => ({
      statusLine: 'HTTP/1.1 503 Service Unavailable',
    }));
    const res = await fake.headers();
    expect(res.statusLine).toBe('HTTP/1.1 503 Service Unavailable');
  });

  it('observer failures — sync throw and async reject — never stop the other observers', () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.attach(fake.webRequest);
    const survivor = vi.fn();

    BrowsingWebRequestService.onCompleted('sync-throw', () => {
      throw new Error('observer exploded');
    });
    BrowsingWebRequestService.onCompleted('async-reject', () => Promise.reject(new Error('later')));
    BrowsingWebRequestService.onCompleted('survivor', survivor);

    expect(() => {
      fake.completed({ id: 9 } as Electron.OnCompletedListenerDetails);
    }).not.toThrow();
    expect(survivor).toHaveBeenCalledOnce();
  });
});

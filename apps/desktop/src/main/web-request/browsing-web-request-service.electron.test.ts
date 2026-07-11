import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrowsingWebRequestService from './browsing-web-request-service.electron';

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
  });

  it('runs before-request handlers in order and stops at the first cancel/redirect', async () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.init(fake.webRequest);
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
    BrowsingWebRequestService.init(fake.webRequest);

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
    BrowsingWebRequestService.init(fake.webRequest);

    BrowsingWebRequestService.onBeforeRequest('bad', () => {
      throw new Error('boom');
    });
    BrowsingWebRequestService.onBeforeRequest('good', () => ({
      redirectURL: 'https://safe.test/',
    }));

    await expect(fake.before()).resolves.toEqual({ redirectURL: 'https://safe.test/' });
  });

  it('keeps completed and error observers independent', () => {
    const fake = fakeWebRequest();
    BrowsingWebRequestService.init(fake.webRequest);
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
});

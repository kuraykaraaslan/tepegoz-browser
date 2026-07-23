import { describe, expect, it } from 'vitest';
import type { WebContents } from 'electron';
import { attachNetworkRecorder, networkSince } from './cdp-driver-network.electron';

/**
 * Locks the CDP contract the AI-8B recorder depends on: the payload SHAPES Chromium actually sends for
 * `Network.requestWillBeSent` / `responseReceived` / `loadingFailed`. A live harness run cannot tell a
 * broken parser from a flaky page, a rate-limited model, or an occluded window — this can, in
 * milliseconds, and it fails loudly if a schema drifts away from the real event.
 *
 * The payloads below are real Chromium event bodies (trimmed to the fields the recorder reads plus a few
 * it must tolerate), not invented ones — inventing them would test the parser against itself.
 */

/** Minimal stand-in for the Electron `webContents` surface the recorder touches. */
function fakeWebContents(): { wc: WebContents; emit: (method: string, params: unknown) => void } {
  const handlers: Array<(event: unknown, method: string, params?: unknown) => void> = [];
  const wc = {
    debugger: {
      on: (_event: string, handler: (e: unknown, method: string, params?: unknown) => void) => {
        handlers.push(handler);
      },
    },
    once: () => undefined,
  } as unknown as WebContents;
  return {
    wc,
    emit: (method, params) => {
      for (const h of handlers) h({}, method, params);
    },
  };
}

const requestWillBeSent = (over: Record<string, unknown> = {}): unknown => ({
  requestId: '1000.5',
  loaderId: '1000.1',
  documentURL: 'http://127.0.0.1:5000/silent-api-failure/index.html',
  request: {
    url: 'http://127.0.0.1:5000/__status/507',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    initialPriority: 'High',
    referrerPolicy: 'strict-origin-when-cross-origin',
  },
  timestamp: 12345.678,
  wallTime: 1_700_000_000.1,
  initiator: { type: 'script' },
  type: 'Fetch',
  frameId: 'FRAME1',
  hasUserGesture: false,
  ...over,
});

const responseReceived = (over: Record<string, unknown> = {}): unknown => ({
  requestId: '1000.5',
  loaderId: '1000.1',
  timestamp: 12345.9,
  type: 'Fetch',
  response: {
    url: 'http://127.0.0.1:5000/__status/507',
    status: 507,
    statusText: 'Insufficient Storage',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    mimeType: 'application/json',
    connectionReused: true,
    fromDiskCache: false,
    encodedDataLength: 120,
    securityState: 'insecure',
  },
  hasExtraInfo: true,
  frameId: 'FRAME1',
  ...over,
});

describe('AI-8B CDP network recorder', () => {
  it('records a failing fetch from the real Chromium event pair', () => {
    const { wc, emit } = fakeWebContents();
    attachNetworkRecorder(wc);
    const before = Date.now();
    emit('Network.requestWillBeSent', requestWillBeSent());
    emit('Network.responseReceived', responseReceived());

    const seen = networkSince(wc, before);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: 'http://127.0.0.1:5000/__status/507',
      status: 507,
      type: 'Fetch',
      redirects: 0,
    });
  });

  it('joins the method from the request even though responseReceived does not carry it', () => {
    const { wc, emit } = fakeWebContents();
    attachNetworkRecorder(wc);
    emit('Network.requestWillBeSent', requestWillBeSent({ request: { url: 'http://x/a', method: 'DELETE' } }));
    emit('Network.responseReceived', responseReceived({ response: { url: 'http://x/a', status: 403 } }));
    expect(networkSince(wc, 0)[0]?.method).toBe('DELETE');
  });

  it('counts redirect hops (a redirect reuses the same requestId)', () => {
    const { wc, emit } = fakeWebContents();
    attachNetworkRecorder(wc);
    emit('Network.requestWillBeSent', requestWillBeSent());
    emit(
      'Network.requestWillBeSent',
      requestWillBeSent({ redirectResponse: { url: 'http://127.0.0.1:5000/__status/507', status: 302 } }),
    );
    emit('Network.responseReceived', responseReceived());
    expect(networkSince(wc, 0)[0]?.redirects).toBe(1);
  });

  it('records a transport failure but ignores a canceled request', () => {
    const { wc, emit } = fakeWebContents();
    attachNetworkRecorder(wc);
    emit('Network.requestWillBeSent', requestWillBeSent({ requestId: 'A' }));
    emit('Network.loadingFailed', {
      requestId: 'A',
      timestamp: 1,
      type: 'Fetch',
      errorText: 'net::ERR_CONNECTION_REFUSED',
      canceled: false,
    });
    emit('Network.requestWillBeSent', requestWillBeSent({ requestId: 'B' }));
    emit('Network.loadingFailed', {
      requestId: 'B',
      timestamp: 2,
      type: 'Fetch',
      errorText: 'net::ERR_ABORTED',
      canceled: true,
    });

    const seen = networkSince(wc, 0);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ status: 0, errorText: 'net::ERR_CONNECTION_REFUSED' });
  });

  it('drops a malformed payload instead of throwing (a perception nicety must never break driving)', () => {
    const { wc, emit } = fakeWebContents();
    attachNetworkRecorder(wc);
    expect(() => {
      emit('Network.responseReceived', { requestId: 7, response: 'nope' });
      emit('Network.responseReceived', null);
      emit('Network.requestWillBeSent', undefined);
    }).not.toThrow();
    expect(networkSince(wc, 0)).toEqual([]);
  });

  it('filters by the action window and never reports events from before it', () => {
    const { wc, emit } = fakeWebContents();
    attachNetworkRecorder(wc);
    emit('Network.requestWillBeSent', requestWillBeSent());
    emit('Network.responseReceived', responseReceived());
    // A window that opens strictly after the recorded event sees nothing.
    expect(networkSince(wc, Date.now() + 1_000)).toEqual([]);
  });

  it('is idempotent — re-attaching on a tab switch does not double-record', () => {
    const { wc, emit } = fakeWebContents();
    attachNetworkRecorder(wc);
    attachNetworkRecorder(wc);
    attachNetworkRecorder(wc);
    emit('Network.requestWillBeSent', requestWillBeSent());
    emit('Network.responseReceived', responseReceived());
    expect(networkSince(wc, 0)).toHaveLength(1);
  });
});

import { Logger } from '@tepegoz/libs';

export type BeforeRequestHandler = (
  details: Electron.OnBeforeRequestListenerDetails,
) => Electron.CallbackResponse | void | Promise<Electron.CallbackResponse | void>;

export type HeadersReceivedHandler = (
  details: Electron.OnHeadersReceivedListenerDetails,
) => Electron.HeadersReceivedResponse | void | Promise<Electron.HeadersReceivedResponse | void>;

export type CompletedHandler = (
  details: Electron.OnCompletedListenerDetails,
) => void | Promise<void>;

export type ErrorOccurredHandler = (
  details: Electron.OnErrorOccurredListenerDetails,
) => void | Promise<void>;

type WebRequestLike = Pick<
  Electron.WebRequest,
  'onBeforeRequest' | 'onHeadersReceived' | 'onCompleted' | 'onErrorOccurred'
>;

const beforeRequestHandlers = new Map<string, BeforeRequestHandler>();
const headersReceivedHandlers = new Map<string, HeadersReceivedHandler>();
const completedHandlers = new Map<string, CompletedHandler>();
const errorOccurredHandlers = new Map<string, ErrorOccurredHandler>();

/**
 * The sessions this multiplexer has already been attached to.
 *
 * Deliberately a set and not a boolean. Phase 5 gives a tunnel-bound tab its OWN session partition, and
 * Electron's webRequest listeners are per-session — a one-shot `initialized` flag meant the first session
 * to arrive got the entire filtering plane (adblock, Shield, header rewriting) and every later one got
 * nothing, silently, while still loading pages perfectly. The handler maps below stay process-wide, so
 * every attached session runs the SAME pipeline; only the Electron-side listener registration is per
 * session. Attaching twice to one session would double-run every filter, hence the guard.
 */
const attachedTo = new WeakSet<WebRequestLike>();

function isDecisiveBeforeResponse(
  response: Electron.CallbackResponse | void,
): response is Electron.CallbackResponse {
  return response !== undefined && (response.cancel === true || response.redirectURL !== undefined);
}

function hasHeadersResponse(response: Electron.HeadersReceivedResponse): boolean {
  return (
    response.cancel === true ||
    response.responseHeaders !== undefined ||
    response.statusLine !== undefined
  );
}

function mergeResponseHeaders(
  base: Electron.HeadersReceivedResponse['responseHeaders'],
  next: Electron.HeadersReceivedResponse['responseHeaders'],
): Electron.HeadersReceivedResponse['responseHeaders'] {
  if (base === undefined) return next;
  if (next === undefined) return base;
  return { ...base, ...next };
}

async function runBeforeRequest(
  details: Electron.OnBeforeRequestListenerDetails,
): Promise<Electron.CallbackResponse> {
  for (const [id, handler] of beforeRequestHandlers) {
    try {
      const response = await handler(details);
      if (isDecisiveBeforeResponse(response)) return response;
    } catch (err) {
      Logger.warn('webRequest onBeforeRequest handler failed open', { id, err: String(err) });
    }
  }
  return {};
}

async function runHeadersReceived(
  details: Electron.OnHeadersReceivedListenerDetails,
): Promise<Electron.HeadersReceivedResponse> {
  let response: Electron.HeadersReceivedResponse = {};
  for (const [id, handler] of headersReceivedHandlers) {
    try {
      const next = await handler(details);
      if (next === undefined) continue;
      if (next.cancel === true) return { cancel: true };
      if (!hasHeadersResponse(next)) continue;
      const mergedHeaders = mergeResponseHeaders(
        response.responseHeaders ?? details.responseHeaders,
        next.responseHeaders,
      );
      response = {
        ...response,
        ...(mergedHeaders !== undefined ? { responseHeaders: mergedHeaders } : {}),
        ...(next.statusLine !== undefined ? { statusLine: next.statusLine } : {}),
      };
    } catch (err) {
      Logger.warn('webRequest onHeadersReceived handler failed open', { id, err: String(err) });
    }
  }
  return response.responseHeaders !== undefined || response.statusLine !== undefined
    ? response
    : {};
}

function runObservers<T>(
  handlers: Map<string, (details: T) => void | Promise<void>>,
  details: T,
): void {
  for (const [id, handler] of handlers) {
    try {
      void Promise.resolve(handler(details)).catch((err: unknown) => {
        Logger.warn('webRequest observer failed open', { id, err: String(err) });
      });
    } catch (err) {
      Logger.warn('webRequest observer failed open', { id, err: String(err) });
    }
  }
}

/**
 * Merge a per-session response-header stamp into whatever the handler pipeline decided.
 *
 * Used for `X-DNS-Prefetch-Control: off` on tunnel-bound partitions. Chromium's DNS pre-resolution runs
 * through the host resolver directly, NOT through the session's SOCKS proxy — so a page inside a tunnel
 * can still cause the machine's own resolver to look up every hostname it links to, handing the user's
 * ISP the browsing list the tunnel exists to hide. This header is the per-document control Chromium
 * honours for exactly that, which makes it the only mitigation available at session granularity.
 *
 * Not applied to Direct partitions: prefetching is a real speed win, and nothing is being hidden there.
 */
function withStamp(
  details: Electron.OnHeadersReceivedListenerDetails,
  response: Electron.HeadersReceivedResponse,
  stamp: Record<string, string>,
): Electron.HeadersReceivedResponse {
  if (response.cancel === true) return response;
  const base = response.responseHeaders ?? details.responseHeaders ?? {};
  const merged: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(base)) {
    merged[name] = Array.isArray(value) ? value : [value];
  }
  for (const [name, value] of Object.entries(stamp)) merged[name] = [value];
  return { ...response, responseHeaders: merged };
}

const BrowsingWebRequestService = {
  /**
   * Own the Electron webRequest listener set for ONE browsing session. Called once per browsing session
   * (via `BrowsingSessions.register`), not once per process — see {@link attachedTo}.
   */
  attach(webRequest: WebRequestLike, opts?: { stampResponseHeaders?: Record<string, string> }): void {
    if (attachedTo.has(webRequest)) return;
    attachedTo.add(webRequest);
    const stamp = opts?.stampResponseHeaders;

    webRequest.onBeforeRequest((details, callback) => {
      void runBeforeRequest(details).then(callback, (err: unknown) => {
        Logger.warn('webRequest onBeforeRequest pipeline failed open', { err: String(err) });
        callback({});
      });
    });

    webRequest.onHeadersReceived((details, callback) => {
      void runHeadersReceived(details).then(
        (response) => callback(stamp === undefined ? response : withStamp(details, response, stamp)),
        (err: unknown) => {
          Logger.warn('webRequest onHeadersReceived pipeline failed open', { err: String(err) });
          // Even on a pipeline failure the stamp is applied: it is a per-SESSION privacy header, not a
          // feature handler, and dropping it because some unrelated filter threw would silently
          // re-enable the very behaviour it exists to suppress.
          callback(stamp === undefined ? {} : withStamp(details, {}, stamp));
        },
      );
    });

    webRequest.onCompleted((details) => {
      runObservers(completedHandlers, details);
    });

    webRequest.onErrorOccurred((details) => {
      runObservers(errorOccurredHandlers, details);
    });
  },

  onBeforeRequest(id: string, handler: BeforeRequestHandler): () => void {
    beforeRequestHandlers.set(id, handler);
    return () => {
      beforeRequestHandlers.delete(id);
    };
  },

  onHeadersReceived(id: string, handler: HeadersReceivedHandler): () => void {
    headersReceivedHandlers.set(id, handler);
    return () => {
      headersReceivedHandlers.delete(id);
    };
  },

  onCompleted(id: string, handler: CompletedHandler): () => void {
    completedHandlers.set(id, handler);
    return () => {
      completedHandlers.delete(id);
    };
  },

  onErrorOccurred(id: string, handler: ErrorOccurredHandler): () => void {
    errorOccurredHandlers.set(id, handler);
    return () => {
      errorOccurredHandlers.delete(id);
    };
  },

  resetForTests(): void {
    beforeRequestHandlers.clear();
    headersReceivedHandlers.clear();
    completedHandlers.clear();
    errorOccurredHandlers.clear();
    // `attachedTo` is intentionally NOT reset: it is keyed by the session's own webRequest object, so a
    // test that wants a fresh attachment makes a fresh fake — there is no process-wide flag to unstick.
  },
};

export default BrowsingWebRequestService;

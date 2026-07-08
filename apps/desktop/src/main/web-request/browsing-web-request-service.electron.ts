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

let initialized = false;

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

const BrowsingWebRequestService = {
  init(webRequest: WebRequestLike): void {
    if (initialized) return;
    initialized = true;

    webRequest.onBeforeRequest((details, callback) => {
      void runBeforeRequest(details).then(callback, (err: unknown) => {
        Logger.warn('webRequest onBeforeRequest pipeline failed open', { err: String(err) });
        callback({});
      });
    });

    webRequest.onHeadersReceived((details, callback) => {
      void runHeadersReceived(details).then(callback, (err: unknown) => {
        Logger.warn('webRequest onHeadersReceived pipeline failed open', { err: String(err) });
        callback({});
      });
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
    initialized = false;
  },
};

export default BrowsingWebRequestService;

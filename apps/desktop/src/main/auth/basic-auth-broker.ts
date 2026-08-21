import { Logger } from '@tepegoz/libs';
import { IpcChannels, type BasicAuthResponse } from '@tepegoz/desktop-ipc';
import TabManager from '../tabs';

/**
 * HTTP basic/digest authentication (401, and 407 for proxies) — Phase 2c.
 *
 * Without a handler Electron cancels the request outright, so 401-protected sites simply fail to load
 * with no way to sign in. This broker prompts in the TRUSTED chrome and hands the answer to Chromium.
 *
 * Credentials pass straight through to Chromium's callback: nothing here writes them to preferences,
 * the Event Journal, or the log. Every log line below carries the origin only, on purpose.
 */

const PROMPT_TIMEOUT_MS = 120_000;
/** Server-supplied text, shown to the user; capped before it ever reaches the renderer. */
const MAX_REALM_LENGTH = 256;

interface Pending {
  settle: (answer: { username: string; password: string } | null) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, Pending>();
let seq = 0;

/** Resolve a pending challenge exactly once, whoever gets there first (user, timeout, window death). */
function settle(requestId: string, answer: { username: string; password: string } | null): void {
  const entry = pending.get(requestId);
  if (entry === undefined) return;
  pending.delete(requestId);
  clearTimeout(entry.timer);
  entry.settle(answer);
}

/**
 * Ask the user for credentials for `origin`. Resolves null on cancel, timeout, or when there is no
 * window to ask in — every one of which must mean "do not authenticate", never "retry silently".
 */
function prompt(
  origin: string,
  realm: string,
  isProxy: boolean,
): Promise<{ username: string; password: string } | null> {
  const target = TabManager.focusedWindow();
  if (target === null || target.isDestroyed()) return Promise.resolve(null);

  seq += 1;
  const requestId = `auth-${String(seq)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      Logger.info('Auth prompt timed out', { origin });
      settle(requestId, null);
    }, PROMPT_TIMEOUT_MS);
    pending.set(requestId, { settle: resolve, timer });

    target.webContents.send(IpcChannels.authBasicRequest, {
      requestId,
      origin,
      realm: realm.slice(0, MAX_REALM_LENGTH),
      isProxy,
    });
  });
}

/** Renderer → main answer. Validated by the IPC layer before it reaches here. */
export function resolveBasicAuth(response: BasicAuthResponse): void {
  if (response.cancelled) {
    settle(response.requestId, null);
    return;
  }
  settle(response.requestId, { username: response.username, password: response.password });
}

/**
 * Wire Chromium's `login` event. Registered once at startup.
 *
 * `webContents` is undefined for a proxy challenge that belongs to no page; the prompt still goes to
 * the focused window, but it is labelled as a proxy so the user is not told a website asked.
 */
export function registerBasicAuthHandler(app: Electron.App): void {
  app.on('login', (event, _webContents, details, authInfo, callback) => {
    event.preventDefault();
    const origin = authInfo.isProxy
      ? `${authInfo.host}:${String(authInfo.port)}`
      : originOfUrl(details.url);

    void prompt(origin, authInfo.realm, authInfo.isProxy).then(
      (answer) => {
        if (answer === null) {
          Logger.info('Auth challenge cancelled', { origin });
          callback();
          return;
        }
        Logger.info('Auth challenge answered', { origin });
        callback(answer.username, answer.password);
      },
      (err: unknown) => {
        Logger.warn('Auth prompt failed', { origin, err: String(err) });
        callback();
      },
    );
  });
}

function originOfUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.slice(0, 256);
  }
}

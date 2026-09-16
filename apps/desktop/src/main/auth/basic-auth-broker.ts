import { Logger } from '@tepegoz/libs';
import { IpcChannels, type BasicAuthResponse } from '@tepegoz/desktop-ipc';
import { PasswordProviderRegistry } from '@tepegoz/password-core';
import type { PasswordVault } from '@tepegoz/password-vault';
import TabManager from '../tabs';

/**
 * HTTP basic/digest authentication (401, and 407 for proxies) — Phase 2c.
 *
 * Without a handler Electron cancels the request outright, so 401-protected sites simply fail to load
 * with no way to sign in. This broker prompts in the TRUSTED chrome and hands the answer to Chromium.
 *
 * Credentials pass straight through to Chromium's callback: nothing here writes them to preferences,
 * the Event Journal, or the log. Every log line below carries the origin only, on purpose.
 *
 * Password-vault autofill offers a saved credential the same origin-locked way `AutofillHost` fills a
 * page form: main sends only the USERNAME to the renderer as a suggestion, and "use saved password"
 * tells main to re-derive + decrypt the credential itself — the plaintext password never crosses into
 * the renderer. A proxy challenge's `host:port` origin never parses as a URL, so `findByUrl` matches
 * nothing for it and no suggestion is offered — a proxy credential and a website credential are not the
 * same trust question.
 */

const PROMPT_TIMEOUT_MS = 120_000;
/** Server-supplied text, shown to the user; capped before it ever reaches the renderer. */
const MAX_REALM_LENGTH = 256;

let vault: PasswordVault | null = null;

interface Pending {
  origin: string;
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
 *
 * The prompt is pushed to the renderer SYNCHRONOUSLY, unchanged from before password-vault autofill
 * existed — the user should see the dialog immediately, not wait on a vault lookup first. The saved-
 * credential suggestion (if any) follows as a separate, best-effort push once the lookup resolves.
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
    pending.set(requestId, { origin, settle: resolve, timer });

    target.webContents.send(IpcChannels.authBasicRequest, {
      requestId,
      origin,
      realm: realm.slice(0, MAX_REALM_LENGTH),
      isProxy,
    });

    // Fire-and-forget: only worth sending if the challenge is still open and there is something to
    // suggest. A stale push (answered/timed out/window gone before the lookup resolved) is silently
    // dropped rather than reopening or resurrecting anything.
    void findSavedUsername(origin).then((suggestedUsername) => {
      if (suggestedUsername === undefined) return;
      if (!pending.has(requestId) || target.isDestroyed()) return;
      target.webContents.send(IpcChannels.authBasicRequest, {
        requestId,
        origin,
        realm: realm.slice(0, MAX_REALM_LENGTH),
        isProxy,
        suggestedUsername,
      });
    });
  });
}

/** The username to suggest for `origin`, or `undefined` when nothing is stored for it. Deliberately
 *  does NOT decrypt — a suggestion the user never acts on should not have decrypted a password for
 *  nothing. The password is only ever decrypted by {@link decryptSavedCredential}, at the moment a
 *  "use saved password" click actually asks for it. */
async function findSavedUsername(origin: string): Promise<string | undefined> {
  try {
    const matches = await PasswordProviderRegistry.findByUrl(origin);
    return matches[0]?.username;
  } catch (err) {
    Logger.warn('Saved-credential lookup failed', { origin, err: String(err) });
    return undefined;
  }
}

/** Re-derive and decrypt the credential a "use saved password" click answers with. Re-looks-up from
 *  the origin rather than trusting a renderer-supplied id — the same authorization shape
 *  `AutofillHost.fill` uses: the origin is the only thing that gets to decide which secret is released. */
async function decryptSavedCredential(
  origin: string,
): Promise<{ username: string; password: string } | null> {
  if (vault === null) return null;
  try {
    const matches = await PasswordProviderRegistry.findByUrl(origin);
    const credential = matches[0];
    if (credential === undefined) return null;
    return { username: credential.username, password: vault.decrypt(credential) };
  } catch (err) {
    Logger.warn('Saved-credential decrypt failed', { origin, err: String(err) });
    return null;
  }
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
 * Renderer → main: answer the pending challenge with the vault credential offered on it. A no-op (the
 * dialog stays open) when the challenge is unknown/already settled, or when nothing is stored for its
 * origin any more — a credential deleted between the prompt and the click must not resurrect it.
 */
export async function useSavedBasicAuth(requestId: string): Promise<void> {
  const entry = pending.get(requestId);
  if (entry === undefined) return;
  const credential = await decryptSavedCredential(entry.origin);
  if (credential === null) return;
  settle(requestId, credential);
}

/**
 * Wire Chromium's `login` event. Registered once at startup. `passwordVault` is optional so tests and
 * any build without the vault initialized still get a working (suggestion-free) auth broker.
 *
 * `webContents` is undefined for a proxy challenge that belongs to no page; the prompt still goes to
 * the focused window, but it is labelled as a proxy so the user is not told a website asked.
 */
export function registerBasicAuthHandler(app: Electron.App, passwordVault?: PasswordVault): void {
  vault = passwordVault ?? null;
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

import { Logger } from '@tepegoz/libs';
import { isSensitiveSite } from '@tepegoz/security-policy';
import { IpcChannels, type CertificateErrorResponse } from '@tepegoz/desktop-ipc';
import TabManager from '../tabs';

/**
 * TLS certificate errors (Phase 2c). Electron's default is to reject the connection outright, which
 * is safe but leaves the user with a blank failure and no explanation — and no way onto a self-signed
 * intranet host they legitimately need.
 *
 * This broker explains the error and lets the user proceed, under three constraints:
 *  - **Sensitive sites can never proceed.** Banking/crypto/health/password origins are hard-blocked
 *    regardless of what the user clicks; a bad certificate there is the exact case the lockout exists for.
 *  - **Exceptions are in-memory only.** They die with the process. A persisted exception is a permanent
 *    downgrade of that origin's transport security, written once and forgotten forever.
 *  - **Anything other than an explicit "proceed" rejects**: cancel, timeout, and no-window-to-ask-in.
 */

const PROMPT_TIMEOUT_MS = 120_000;

/** Origins the user chose to proceed on THIS run. Deliberately not persisted. */
const sessionExceptions = new Set<string>();

interface Pending {
  settle: (proceed: boolean) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, Pending>();
let seq = 0;

function settle(requestId: string, proceed: boolean): void {
  const entry = pending.get(requestId);
  if (entry === undefined) return;
  pending.delete(requestId);
  clearTimeout(entry.timer);
  entry.settle(proceed);
}

/** Renderer → main answer. Validated by the IPC layer before it reaches here. */
export function resolveCertificateError(response: CertificateErrorResponse): void {
  settle(response.requestId, response.proceed);
}

function originOfUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.slice(0, 256);
  }
}

function prompt(origin: string, errorCode: string, issuer: string, expiry: string): Promise<boolean> {
  const target = TabManager.focusedWindow();
  if (target === null || target.isDestroyed()) return Promise.resolve(false);

  seq += 1;
  const requestId = `cert-${String(seq)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      Logger.info('Certificate warning timed out; connection refused', { origin, errorCode });
      settle(requestId, false);
    }, PROMPT_TIMEOUT_MS);
    pending.set(requestId, { settle: resolve, timer });

    target.webContents.send(IpcChannels.certificateErrorRequest, {
      requestId,
      origin,
      errorCode,
      issuer,
      expiry,
    });
  });
}

/**
 * Decide one certificate error. Split from the Electron handler so the policy is testable without an
 * app object: it returns what should happen, and the caller feeds Chromium's callback.
 */
export async function decideCertificateError(input: {
  url: string;
  errorCode: string;
  issuer: string;
  expiry: string;
}): Promise<boolean> {
  const origin = originOfUrl(input.url);

  if (isSensitiveSite(input.url)) {
    // No prompt at all: offering a "proceed anyway" button here would teach the habit this lockout
    // exists to prevent.
    Logger.warn('Certificate error on a sensitive site; hard-blocked', {
      origin,
      errorCode: input.errorCode,
    });
    return false;
  }

  if (sessionExceptions.has(origin)) return true;

  const proceed = await prompt(origin, input.errorCode, input.issuer, input.expiry);
  if (proceed) {
    sessionExceptions.add(origin);
    Logger.warn('User proceeded past a certificate error', { origin, errorCode: input.errorCode });
  } else {
    Logger.info('Certificate error; connection refused', { origin, errorCode: input.errorCode });
  }
  return proceed;
}

/** Wire Chromium's `certificate-error` event. Registered once at startup. */
export function registerCertificateHandler(app: Electron.App): void {
  app.on('certificate-error', (event, _webContents, url, error, certificate, callback) => {
    event.preventDefault();
    void decideCertificateError({
      url,
      errorCode: error,
      issuer: certificate.issuerName,
      expiry: new Date(certificate.validExpiry * 1000).toISOString(),
    }).then(
      (proceed) => {
        callback(proceed);
      },
      (err: unknown) => {
        Logger.warn('Certificate decision failed; refusing', { err: String(err) });
        callback(false);
      },
    );
  });
}

/** Test seam: drop the session's accumulated exceptions. */
export function clearCertificateExceptions(): void {
  sessionExceptions.clear();
}

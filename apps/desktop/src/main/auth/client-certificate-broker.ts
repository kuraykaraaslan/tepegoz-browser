import { Logger } from '@tepegoz/libs';
import { IpcChannels, type ClientCertificateResponse } from '@tepegoz/desktop-ipc';
import type { Certificate } from 'electron';
import TabManager from '../tabs';

/**
 * CLIENT certificates — the certificate the USER sends to identify themselves to a site.
 *
 * This is the mirror image of `certificate-broker.ts`, which handles the certificate a SITE sends to
 * us, and the two defaults are opposite. Electron's default for a bad server certificate is to reject,
 * which is safe. Its default here is stated in Electron's own typings, shipped in this repo:
 *
 *     "Using `event.preventDefault()` prevents the application from using the first certificate
 *      from the store."
 *
 * That is: with no handler, **Electron silently sends the first client certificate in the OS store to
 * any site that asks for one.** No prompt, no choice, no record. This app had no handler.
 *
 * What that means concretely: a client certificate is a private-key-backed assertion of identity. In
 * this product's primary market they are ordinary — e-Devlet and corporate VPN/intranet enrolments put
 * one in the Windows store — and a page that merely requests client authentication would have received
 * a signed proof of who the user is, on first contact, with the user never told. Chrome prompts. So
 * does every other browser. We were sending.
 *
 * The fix is the `preventDefault()` on the first line of the handler. Everything after it is the part
 * that makes the browser still usable:
 *
 *  - **Nothing is sent unless the user picks it.** Cancel, timeout, no window to ask in, and an empty
 *    offer list all send NOTHING. `callback()` with no argument is the "no certificate" answer.
 *  - **The choice is remembered for the origin, for this run only.** TLS client auth is re-negotiated
 *    per connection, so a browser that asked every time would be unusable on exactly the sites that
 *    need it. Not persisted, for the same reason `certificate-broker` does not persist exceptions: a
 *    stored answer is a standing instruction to identify yourself to an origin, written once and
 *    forgotten. It dies with the process.
 *  - **The certificate never crosses to the renderer.** The prompt is sent a list of display strings
 *    and answers with an INDEX; main keeps the certificates. The renderer is untrusted, and the worst a
 *    lying one can do is name a different entry from the list the user was shown.
 */

const PROMPT_TIMEOUT_MS = 120_000;
/** Certificate fields are shown to the user; the site's CA chain controls them, so they are capped. */
const MAX_FIELD = 256;
/** More than this and the prompt is unreadable anyway; the store realistically holds a handful. */
const MAX_OPTIONS = 32;

/** Per-origin choice for THIS run: the chosen certificate, or null for "the user said no". */
const sessionChoices = new Map<string, Certificate | null>();

interface Pending {
  settle: (index: number | null) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, Pending>();
let seq = 0;

function settle(requestId: string, index: number | null): void {
  const entry = pending.get(requestId);
  if (entry === undefined) return;
  pending.delete(requestId);
  clearTimeout(entry.timer);
  entry.settle(index);
}

/** Renderer → main answer. Validated by the IPC layer before it reaches here. */
export function resolveClientCertificate(response: ClientCertificateResponse): void {
  settle(response.requestId, response.index);
}

function originOfUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.slice(0, MAX_FIELD);
  }
}

function cap(value: string | undefined): string {
  return (value ?? '').slice(0, MAX_FIELD);
}

/**
 * Ask which certificate to send. Resolves null on cancel, timeout, or when there is no window to ask
 * in — each of which must mean "send nothing", never "send the first one", which is the whole defect.
 */
function prompt(origin: string, certificates: Certificate[]): Promise<number | null> {
  const target = TabManager.focusedWindow();
  if (target === null || target.isDestroyed()) return Promise.resolve(null);

  seq += 1;
  const requestId = `clientcert-${String(seq)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      Logger.info('Client-certificate prompt timed out; sent nothing', { origin });
      settle(requestId, null);
    }, PROMPT_TIMEOUT_MS);
    pending.set(requestId, { settle: resolve, timer });

    target.webContents.send(IpcChannels.clientCertificateRequest, {
      requestId,
      origin,
      options: certificates.map((certificate, index) => ({
        index,
        subject: cap(certificate.subjectName),
        issuer: cap(certificate.issuerName),
        expiry: new Date(certificate.validExpiry * 1000).toISOString(),
      })),
    });
  });
}

/**
 * Decide one client-certificate request. Split from the Electron handler so the policy is testable
 * without an app object: it returns the certificate to send (or null), and the caller feeds Chromium.
 */
export async function decideClientCertificate(
  url: string,
  certificateList: Certificate[],
): Promise<Certificate | null> {
  const origin = originOfUrl(url);

  // Nothing on offer: answer "none" rather than leaving Chromium's callback unfired, which would hang
  // the connection instead of failing it.
  if (certificateList.length === 0) return null;

  const remembered = sessionChoices.get(origin);
  if (remembered !== undefined) return remembered;

  const offered = certificateList.slice(0, MAX_OPTIONS);
  const index = await prompt(origin, offered);
  const chosen = index === null ? null : (offered[index] ?? null);
  sessionChoices.set(origin, chosen);

  if (chosen === null) {
    Logger.info('No client certificate sent', { origin });
  } else {
    // The origin and the fact of a choice — never the subject, which names the user.
    Logger.info('User chose a client certificate', { origin });
  }
  return chosen;
}

/** Wire Chromium's `select-client-certificate` event. Registered once at startup. */
export function registerClientCertificateHandler(app: Electron.App): void {
  app.on('select-client-certificate', (event, _webContents, url, certificateList, callback) => {
    // FIRST, and unconditionally. Without this line Electron sends certificateList[0] on its own, and
    // every branch below would be decorating a decision that had already been made.
    event.preventDefault();
    void decideClientCertificate(url, certificateList).then(
      (certificate) => {
        if (certificate === null) callback();
        else callback(certificate);
      },
      (err: unknown) => {
        Logger.warn('Client-certificate decision failed; sent nothing', { err: String(err) });
        callback();
      },
    );
  });
}

/** Test seam: drop this run's remembered per-origin choices. */
export function clearClientCertificateChoices(): void {
  sessionChoices.clear();
}

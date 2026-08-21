import { BrowserWindow, session, type Session } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import { EXTRACTION_TIMEOUT_MS } from '@tepegoz/tool-executor';

/**
 * The sandbox a model-authored extraction script runs in (S5).
 *
 * **This is not the page.** The phase originally proposed running such scripts in an isolated world on
 * the live page, on the reasoning that a world sharing the DOM but not the page's JS principal cannot
 * exfiltrate. The go/no-go spike (`e2e/spike-code-exec-sandbox.spec.ts`) measured that directly and it
 * is false: a world shares the frame, so it shares the frame's network access, and the canary server
 * was hit on the first attempt. That design is a **NO-GO**, recorded rather than quietly patched.
 *
 * What replaced it is a hidden window whose *session* refuses the network, holding a **copy** of the
 * page's HTML:
 *
 * 1. **Session-level request cancellation.** Everything but `about:` and `data:` is cancelled — no
 *    network, no `file:`, nothing off-process. It is a property of the session, not a window around the
 *    call, so a `setTimeout` that fires after the script returns is just as dead.
 * 2. **`default-src 'none'` CSP**, delivered in the sandbox document's markup so it applies from parse
 *    time. This layer exists because the spike found that Electron's `webRequest` does **not** intercept
 *    the WebSocket handshake: with the session filter alone, `ws://` walked straight out.
 * 3. **HTML copied in, never loaded.** `innerHTML` does not execute scripts, so the page's own
 *    JavaScript never runs here either. The sandbox holds data, not a live origin — which also means no
 *    cookies, no `localStorage`, no session storage, and no same-origin credentials to steal.
 *
 * Both enforcement layers sit **below the JS engine**. Deleting `fetch` or shadowing `XMLHttpRequest`
 * would not be a boundary at all: `globalThis`, `Function('return this')()`, and a fresh iframe's
 * `contentWindow` all hand the property straight back.
 *
 * The cost of this design, stated plainly: the script sees a **snapshot**, not the live page. Values
 * computed by page JS after the snapshot are absent, and nothing the script does can affect the real
 * page — which in v1 is the point (`code_exec_write` is a reserved, denied class).
 */

const PARTITION = 'tepegoz-extraction-sandbox';

/** Schemes the sandbox document itself needs. Neither leaves the process. */
const LOCAL_SCHEMES = ['about:', 'data:'];

const SANDBOX_DOCUMENT = `data:text/html,${encodeURIComponent(
  '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" ' +
    'content="default-src \'none\'"></head><body></body></html>',
)}`;

let configured: Session | null = null;

/** The locked-down session, configured once. Idempotent: a second call re-uses the same partition. */
function sandboxSession(): Session {
  if (configured !== null) return configured;
  const ses = session.fromPartition(PARTITION);
  ses.webRequest.onBeforeRequest((details, callback) => {
    const local = LOCAL_SCHEMES.some((s) => details.url.startsWith(s));
    if (!local) {
      // Worth a log line: inside the sandbox this is either a page's own asset reference riding along
      // in the copied HTML, or a script trying to leave. Both are things an operator wants to see.
      Logger.info('Extraction sandbox cancelled a request', { url: details.url.slice(0, 200) });
    }
    callback({ cancel: !local });
  });
  configured = ses;
  return ses;
}

export interface ExtractionInput {
  /** The page HTML to make available to the script. Copied in, never loaded. */
  html: string;
  /** The model-authored script. Already length-checked by the caller. */
  script: string;
}

/**
 * Run one extraction. Resolves with the script's return value, or throws an {@link AppError}.
 *
 * A fresh window per call: state cannot carry from one script to the next, and a script that wedges its
 * own document takes nothing with it. The window is destroyed in `finally`, so a timeout does not leak
 * a renderer process.
 */
export async function runExtraction(input: ExtractionInput): Promise<unknown> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      session: sandboxSession(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      // The window is never shown, and Chromium throttles timers in unshown windows to roughly once a
      // second. A script that awaits anything would then hit the extraction timeout for a reason that
      // has nothing to do with the script. Same switch the tab views use, for the same reason.
      backgroundThrottling: false,
    },
  });
  try {
    await win.loadURL(SANDBOX_DOCUMENT);
    await win.webContents.executeJavaScript(
      `document.body.innerHTML = ${JSON.stringify(input.html)}; 'ok'`,
    );
    // World 999, not the sandbox document's own main world: even inside a sandbox with nothing to steal,
    // there is no reason for model-authored code to share a principal with anything.
    const run = win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: input.script }]);
    return await withTimeout(run);
  } catch (err) {
    throw new AppError(
      `Extraction script failed: ${err instanceof Error ? err.message : String(err)}`,
      422,
    );
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function withTimeout(run: Promise<unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new AppError('Extraction script timed out', 408));
        }, EXTRACTION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
